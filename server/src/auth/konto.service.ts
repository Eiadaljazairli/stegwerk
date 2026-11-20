import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { type DataSource, IsNull, MoreThan } from 'typeorm';

import { belegtFesthalten } from '../calendar/termin-sichtbarkeit';
import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { TaskEntity } from '../crm/entities/task.entity';
import { MailService } from '../mail/mail.service';
import {
  emailAendernMail,
  emailGeaendertMail,
  kontoGeloeschtMail,
  zweiFaktorZurueckgesetztMail,
} from '../mail/templates';
import { KalenderVerbindungEntity } from '../kalender-sync/kalender-verbindung.entity';
import { MailboxEntity } from '../mailboxes/mailbox.entity';
import { OAuthVorgangEntity } from '../oauth/oauth-vorgang.entity';
import { OAuthZugangEntity } from '../oauth/oauth-zugang.entity';
import { meldeSicherheit } from '../sicherheit/melden';
import { UserEntity } from '../users/user.entity';
import { MembershipEntity } from '../workspaces/membership.entity';
import { type RequestUser } from './decorators/current-user.decorator';
import { EmailAenderungEntity } from './email-aenderung.entity';
import {
  AnmeldeEinloesungEntity,
  AnmeldeVerknuepfungEntity,
  AnmeldeVorgangEntity,
} from './anmeldung-sso.entities';
import { RecoveryCodeEntity } from './recovery-code.entity';
import { RefreshTokensService } from './refresh-tokens.service';
import { PermissionsService } from '../workspaces/permissions.service';
import { Permission } from '../workspaces/permissions';
import { sperreInhaberschaft } from '../workspaces/inhaber-sperre';
import { MailboxMitgliedEntity } from '../mailboxes/mailbox-mitglied.entity';
import { gemeinsamePostfaecherUebergeben } from '../mailboxes/postfach-uebergabe';

const STUNDEN_GUELTIG = 24;

const hash = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class KontoService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mailService: MailService,
    private readonly tokens: RefreshTokensService,
    private readonly config: ConfigService,
    private readonly permissions: PermissionsService,
  ) {}

  private async kontoMitPasswort(
    userId: string,
    passwort: string,
  ): Promise<UserEntity> {
    const konto = await this.dataSource
      .getRepository(UserEntity)
      .findOneOrFail({ where: { id: userId } });

    if (!(await bcrypt.compare(passwort, konto.passwordHash))) {
      throw new BadRequestException('Das Passwort stimmt nicht.');
    }

    return konto;
  }

  async emailAendernAnfragen(
    userId: string,
    neueEmail: string,
    passwort: string,
  ): Promise<void> {
    const konto = await this.kontoMitPasswort(userId, passwort);
    const neu = neueEmail.trim().toLowerCase();

    if (neu === konto.email) {
      throw new BadRequestException('Das ist schon Ihre Anmelde-Adresse.');
    }

    const vergeben = await this.dataSource
      .getRepository(UserEntity)
      .count({ where: { email: neu } });

    if (vergeben > 0) {
      throw new BadRequestException(
        'Mit dieser Adresse gibt es schon ein Konto.',
      );
    }

    const aenderungen = this.dataSource.getRepository(EmailAenderungEntity);

    await aenderungen.delete({ userId });

    const token = randomBytes(32).toString('base64url');

    await aenderungen.save(
      aenderungen.create({
        userId,
        neueEmail: neu,
        tokenHash: hash(token),
        gueltigBis: new Date(Date.now() + STUNDEN_GUELTIG * 3_600_000),
      }),
    );

    const webOrigin = this.config.getOrThrow<string>('webOrigin');

    await this.mailService.send(
      emailAendernMail(neu, `${webOrigin}/email-aendern/${token}`),
    );
  }

  async emailAendernBestaetigen(
    userId: string,
    token: string,
  ): Promise<string> {
    const aenderungen = this.dataSource.getRepository(EmailAenderungEntity);
    const antrag = await aenderungen.findOne({
      where: { tokenHash: hash(token), gueltigBis: MoreThan(new Date()) },
    });

    if (antrag === null || antrag.userId !== userId) {
      throw new BadRequestException(
        'Dieser Link ist abgelaufen, schon benutzt oder gehört zu einem anderen Konto.',
      );
    }

    const benutzer = this.dataSource.getRepository(UserEntity);
    const konto = await benutzer.findOneOrFail({ where: { id: userId } });
    const alt = konto.email;

    if ((await benutzer.count({ where: { email: antrag.neueEmail } })) > 0) {
      await aenderungen.delete({ id: antrag.id });

      throw new BadRequestException(
        'Mit dieser Adresse gibt es inzwischen ein Konto.',
      );
    }

    konto.email = antrag.neueEmail;
    konto.emailVerifiedAt = new Date();
    await benutzer.save(konto);
    await aenderungen.delete({ userId });

    meldeSicherheit({
      art: 'email_geaendert',
      userId,
      details: { neu: antrag.neueEmail },
    });
    await this.mailService.send(emailGeaendertMail(alt, antrag.neueEmail));

    return antrag.neueEmail;
  }

  async kontoLoeschen(userId: string, passwort: string): Promise<void> {
    const konto = await this.kontoMitPasswort(userId, passwort);
    const mitgliedschaften = await this.dataSource
      .getRepository(MembershipEntity)
      .find({ where: { userId }, relations: { workspace: true } });
    const email = konto.email;

    await this.dataSource.transaction(async (manager) => {
      await sperreInhaberschaft(
        manager,
        mitgliedschaften.map((m) => m.workspaceId),
      );

      for (const m of mitgliedschaften) {
        if (
          (await this.permissions.holdsEverything(userId, m.workspaceId)) &&
          (await this.inhaberAusser(m.workspaceId, userId)) === null
        ) {
          throw new BadRequestException(
            `Sie sind einziger Inhaber von „${m.workspace.name}“. Geben Sie die Inhaberschaft zuerst jemandem aus dem Team, oder löschen Sie den Arbeitsbereich.`,
          );
        }
      }

      for (const m of mitgliedschaften) {
        const inhaber = await this.inhaberAusser(m.workspaceId, userId);

        if (inhaber !== null) {
          await manager.update(
            TaskEntity,
            {
              workspaceId: m.workspaceId,
              assigneeId: userId,
              completedAt: IsNull(),
            },
            { assigneeId: inhaber },
          );
        }

        for (const ziel of [CompanyEntity, ContactEntity, DealEntity]) {
          await manager.update(
            ziel,
            { workspaceId: m.workspaceId, ownerId: userId },
            { ownerId: inhaber },
          );
        }

        if (inhaber !== null) {
          await gemeinsamePostfaecherUebergeben(
            manager,
            m.workspaceId,
            userId,
            inhaber,
          );
        }
      }

      await manager.delete(MailboxMitgliedEntity, { userId });

      await manager.delete(MailboxEntity, {
        userId,
        art: 'persoenlich',
        sichtbarkeit: 'privat',
      });
      await manager.update(
        MailboxEntity,
        { userId },
        {
          active: false,
          passwordSealed: '',
          oauthZugangId: null,
          smtpHost: null,
          smtpPort: null,
          getrenntAm: new Date(),
        },
      );
      await belegtFesthalten(manager, userId, null);
      await manager.delete(KalenderVerbindungEntity, { userId });
      await manager.delete(OAuthZugangEntity, { userId });
      await manager.delete(OAuthVorgangEntity, { userId });
      await manager.delete(AnmeldeVerknuepfungEntity, { userId });
      await manager.delete(AnmeldeVorgangEntity, { userId });
      await manager.delete(AnmeldeEinloesungEntity, { userId });

      await manager.delete(MembershipEntity, { userId });
      await manager.delete(RecoveryCodeEntity, { userId });
      await manager.delete(EmailAenderungEntity, { userId });
      await manager.update(UserEntity, userId, {
        email: `geloescht-${userId}@stegwerk.invalid`,
        firstName: 'Gelöschtes',
        lastName: 'Konto',
        passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 12),
        passwortGesetzt: false,
        totpSecret: null,
        totpEnabledAt: null,
        totpLastCounter: null,
        emailVerifiedAt: null,
      });
    });

    await this.tokens.revokeAllForUser(userId);
    meldeSicherheit({ art: 'konto_geloescht', userId });
    await this.mailService.send(kontoGeloeschtMail(email));
  }

  private async inhaberAusser(
    workspaceId: string,
    userId: string,
  ): Promise<string | null> {
    const mitglieder = await this.dataSource
      .getRepository(MembershipEntity)
      .find({ where: { workspaceId }, order: { createdAt: 'ASC' } });

    for (const m of mitglieder) {
      if (
        m.userId !== userId &&
        (await this.permissions.holdsEverything(m.userId, workspaceId))
      ) {
        return m.userId;
      }
    }

    return null;
  }

  async zweiFaktorZuruecksetzen(
    caller: RequestUser,
    zielUserId: string,
  ): Promise<void> {
    await this.permissions.assert(
      caller,
      Permission.MEMBER_MANAGE,
      'die Zwei-Faktor-Anmeldung eines Mitglieds zurückzusetzen',
    );

    if (zielUserId === caller.userId) {
      throw new BadRequestException(
        'Den eigenen zweiten Faktor setzen Sie mit einem Wiederherstellungscode zurück.',
      );
    }

    const mitglied = await this.dataSource
      .getRepository(MembershipEntity)
      .findOne({
        where: { userId: zielUserId, workspaceId: caller.workspaceId },
      });

    if (mitglied === null) {
      throw new NotFoundException(
        'Diese Person gehört nicht zu diesem Bereich.',
      );
    }

    if (
      (await this.permissions.holdsEverything(
        zielUserId,
        caller.workspaceId,
      )) &&
      !(await this.permissions.holdsEverything(
        caller.userId,
        caller.workspaceId,
      ))
    ) {
      throw new ForbiddenException(
        'Den zweiten Faktor eines Inhabers setzt nur ein Inhaber zurück.',
      );
    }

    const benutzer = this.dataSource.getRepository(UserEntity);
    const [ziel, durch] = await Promise.all([
      benutzer.findOneOrFail({ where: { id: zielUserId } }),
      benutzer.findOneOrFail({ where: { id: caller.userId } }),
    ]);

    if (ziel.totpEnabledAt === null) {
      throw new BadRequestException(
        'Bei dieser Person ist keine Zwei-Faktor-Anmeldung eingeschaltet.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(UserEntity, zielUserId, {
        totpSecret: null,
        totpEnabledAt: null,
        totpLastCounter: null,
      });
      await manager.delete(RecoveryCodeEntity, { userId: zielUserId });
    });

    await this.tokens.revokeAllForUser(zielUserId);
    meldeSicherheit({
      art: 'zwei_faktor_zurueckgesetzt',
      userId: zielUserId,
      workspaceId: caller.workspaceId,
      actorId: caller.userId,
    });
    await this.mailService.send(
      zweiFaktorZurueckgesetztMail(
        ziel.email,
        `${durch.firstName} ${durch.lastName}`,
      ),
    );
  }
}
