import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';

import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { slugify } from '../workspaces/slug.util';
import { ROLE_TEMPLATES } from '../workspaces/permissions';
import { RoleEntity } from '../workspaces/role.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import {
  type AuthPayload,
  type SignInInput,
  type SignUpInput,
} from './dto/auth.dto';
import { EmailVerificationsService } from './email-verifications.service';
import { Fehlversuche } from './fehlversuche';
import { type JwtPayload } from './jwt.strategy';
import { TwoFactorService } from './two-factor.service';
import { RefreshTokensService } from './refresh-tokens.service';
import { pruefePasswort } from './passwort-regeln';
import { meldeSicherheit } from '../sicherheit/melden';

const PASSWORD_SALT_ROUNDS = 12;

export const TWO_FACTOR_REQUIRED = 'TWO_FACTOR_REQUIRED';

const PLATZHALTER_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), 12);

const fehlversuche = new Fehlversuche();

export type NeuesKonto = {
  email: string;
  passwordHash: string;
  passwortGesetzt: boolean;
  firstName: string;
  lastName: string;
  workspaceName: string;
  emailVerifiedAt: Date | null;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly refreshTokensService: RefreshTokensService,
    private readonly twoFactor: TwoFactorService,
    private readonly emailVerifications: EmailVerificationsService,
  ) {}

  async signUp(input: SignUpInput): Promise<AuthPayload> {
    pruefePasswort(input.password, {
      email: input.email.trim().toLowerCase(),
      namen: [input.firstName, input.lastName, input.workspaceName],
    });

    const { user, workspace } = await this.kontoAnlegen({
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, PASSWORD_SALT_ROUNDS),
      passwortGesetzt: true,
      firstName: input.firstName,
      lastName: input.lastName,
      workspaceName: input.workspaceName,
      emailVerifiedAt: null,
    });

    await this.bestaetigungSenden(user.id);

    return this.buildAuthPayload(user, workspace);
  }

  async kontoAnlegen(daten: NeuesKonto): Promise<{
    user: UserEntity;
    workspace: WorkspaceEntity;
  }> {
    const email = daten.email.trim().toLowerCase();

    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(UserEntity, {
        where: { email },
      });

      if (existing !== null) {
        throw new ConflictException(
          'Zu dieser E-Mail-Adresse gibt es bereits ein Konto',
        );
      }

      const createdUser = await manager.save(
        manager.create(UserEntity, {
          email,
          passwordHash: daten.passwordHash,
          passwortGesetzt: daten.passwortGesetzt,
          firstName: daten.firstName.trim(),
          lastName: daten.lastName.trim(),
          emailVerifiedAt: daten.emailVerifiedAt,
        }),
      );

      const createdWorkspace = await manager.save(
        manager.create(WorkspaceEntity, {
          name: daten.workspaceName.trim(),
          slug: await this.buildAvailableSlug(manager, daten.workspaceName),
        }),
      );

      const roles = await manager.save(
        ROLE_TEMPLATES.map((template) =>
          manager.create(RoleEntity, {
            workspaceId: createdWorkspace.id,
            name: template.name,
            description: template.description,
            templateKey: template.key,
            everything: template.everything,
            permissions: [...template.permissions],
            isSystem: true,
          }),
        ),
      );

      await manager.save(
        manager.create(MembershipEntity, {
          userId: createdUser.id,
          workspaceId: createdWorkspace.id,
          role: MembershipRole.OWNER,
          roleId: roles.find((role) => role.templateKey === 'owner')?.id,
        }),
      );

      return { user: createdUser, workspace: createdWorkspace };
    });
  }

  async bestaetigungSenden(userId: string): Promise<void> {
    await this.emailVerifications.send(userId).catch((error: Error) => {
      this.logger.error(
        `Bestätigungsmail für Konto ${userId} ging nicht hinaus: ${error.message}`,
      );
    });
  }

  async signIn(input: SignInInput): Promise<AuthPayload> {
    const email = input.email.trim().toLowerCase();

    const user = await this.dataSource.manager.findOne(UserEntity, {
      where: { email },
    });

    const konto = `anmeldung:${email}`;

    fehlversuche.pruefe(konto);

    const passwordHash = user?.passwordHash ?? PLATZHALTER_HASH;
    const passwordMatches = await bcrypt.compare(input.password, passwordHash);

    if (user === null || !passwordMatches) {
      const gesperrt = fehlversuche.zaehle(konto);

      if (user !== null) {
        meldeSicherheit({
          art: 'anmeldung_fehlgeschlagen',
          userId: user.id,
          actorId: user.id,
        });

        if (gesperrt) {
          meldeSicherheit({
            art: 'konto_gesperrt',
            userId: user.id,
            actorId: null,
          });
        }
      }

      throw new UnauthorizedException(
        'E-Mail-Adresse oder Passwort stimmen nicht',
      );
    }

    const payload = await this.anmeldungAbschliessen(user, input);

    fehlversuche.vergiss(konto);

    return payload;
  }

  async anmeldungAbschliessen(
    user: UserEntity,
    input: {
      workspaceId?: string;
      totpCode?: string;
      angemeldetBleiben?: boolean;
    },
    weg?: string,
  ): Promise<AuthPayload> {
    const memberships = await this.dataSource.manager.find(MembershipEntity, {
      where: { userId: user.id },
      relations: { workspace: true },
      order: { createdAt: 'ASC' },
    });

    if (memberships.length === 0) {
      throw new UnauthorizedException(
        'Zu diesem Konto gehört kein Arbeitsbereich',
      );
    }

    const membership =
      input.workspaceId === undefined
        ? memberships[0]
        : memberships.find(
            (candidate) => candidate.workspaceId === input.workspaceId,
          );

    if (membership === undefined) {
      throw new UnauthorizedException('Kein Zugriff auf diesen Arbeitsbereich');
    }

    if (user.totpEnabledAt !== null) {
      if (input.totpCode === undefined || input.totpCode.trim() === '') {
        throw new UnauthorizedException({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Zwei-Faktor-Code erforderlich',
          reason: TWO_FACTOR_REQUIRED,
        });
      }

      const zweiter = `zweiter-faktor:${user.id}`;

      fehlversuche.pruefe(zweiter);

      try {
        await this.twoFactor.pruefen(user, input.totpCode);
      } catch (problem) {
        if (fehlversuche.zaehle(zweiter)) {
          meldeSicherheit({
            art: 'konto_gesperrt',
            userId: user.id,
            actorId: null,
            details: { zweiterFaktor: true },
          });
        }

        meldeSicherheit({
          art: 'zweiter_faktor_falsch',
          userId: user.id,
          actorId: user.id,
        });
        throw problem;
      }

      fehlversuche.vergiss(zweiter);
    }

    meldeSicherheit({
      art: 'anmeldung',
      userId: user.id,
      actorId: user.id,
      workspaceId: membership.workspaceId,
      ...(weg === undefined ? {} : { details: { weg } }),
    });

    return this.buildAuthPayload(
      user,
      membership.workspace,
      input.angemeldetBleiben ?? true,
    );
  }

  async refresh(
    refreshToken: string,
    letzteEingabe?: number | null,
  ): Promise<AuthPayload> {
    const rotated = await this.refreshTokensService.rotate(
      refreshToken,
      letzteEingabe,
    );

    const membership = await this.dataSource.manager.findOne(MembershipEntity, {
      where: {
        userId: rotated.record.userId,
        workspaceId: rotated.record.workspaceId,
      },
      relations: { workspace: true, user: true },
    });

    if (membership === null) {
      throw new UnauthorizedException('Kein Zugriff auf diesen Arbeitsbereich');
    }

    const payload: JwtPayload = {
      sub: membership.user.id,
      email: membership.user.email,
      workspaceId: membership.workspace.id,
    };

    return {
      token: await this.jwtService.signAsync(payload),
      refreshToken: rotated.token,
      angemeldetBleiben: rotated.record.dauerhaft,
      user: membership.user,
      workspace: membership.workspace,
    };
  }

  signOut(refreshToken: string): Promise<void> {
    return this.refreshTokensService.abmelden(refreshToken);
  }

  async switchWorkspace(
    userId: string,
    workspaceId: string,
    angemeldetBleiben = true,
  ): Promise<AuthPayload> {
    const membership = await this.dataSource.manager.findOne(MembershipEntity, {
      where: { userId, workspaceId },
      relations: { workspace: true, user: true },
    });

    if (membership === null) {
      throw new UnauthorizedException('Kein Zugriff auf diesen Arbeitsbereich');
    }

    return this.buildAuthPayload(
      membership.user,
      membership.workspace,
      angemeldetBleiben,
    );
  }

  private async buildAuthPayload(
    user: UserEntity,
    workspace: WorkspaceEntity,
    angemeldetBleiben = true,
  ): Promise<AuthPayload> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      workspaceId: workspace.id,
    };

    const refresh = await this.refreshTokensService.issue(
      user.id,
      workspace.id,
      undefined,
      angemeldetBleiben,
    );

    return {
      token: await this.jwtService.signAsync(payload),
      refreshToken: refresh.token,
      angemeldetBleiben,
      user,
      workspace,
    };
  }

  private async buildAvailableSlug(
    manager: DataSource['manager'],
    name: string,
  ): Promise<string> {
    const base = slugify(name) || 'workspace';

    for (let suffix = 0; suffix < 100; suffix++) {
      const candidate = suffix === 0 ? base : `${base}-${suffix}`;
      const taken = await manager.findOne(WorkspaceEntity, {
        where: { slug: candidate },
      });

      if (taken === null) {
        return candidate;
      }
    }

    return `${base}-${Date.now()}`;
  }
}
