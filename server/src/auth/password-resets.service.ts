import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { IsNull, LessThan, Repository } from 'typeorm';

import { MailService } from '../mail/mail.service';
import { passwordChangedMail, passwordResetMail } from '../mail/templates';
import { UserEntity } from '../users/user.entity';
import {
  AnmeldeEinloesungEntity,
  AnmeldeVerknuepfungEntity,
  AnmeldeVorgangEntity,
} from './anmeldung-sso.entities';
import { PasswordResetEntity } from './password-reset.entity';
import { RefreshTokensService } from './refresh-tokens.service';
import { meldeSicherheit } from '../sicherheit/melden';
import { pruefePasswort } from './passwort-regeln';

const TOKEN_TTL_MS = 60 * 60 * 1000;
const PASSWORD_SALT_ROUNDS = 12;

@Injectable()
export class PasswordResetsService {
  private readonly logger = new Logger(PasswordResetsService.name);

  constructor(
    @InjectRepository(PasswordResetEntity)
    private readonly resets: Repository<PasswordResetEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly refreshTokens: RefreshTokensService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async request(email: string): Promise<void> {
    const normalised = email.trim().toLowerCase();

    const user = await this.users.findOne({
      where: { email: normalised },
      select: ['id', 'email'],
    });

    if (user === null) {
      this.logger.log(`Password reset requested for unknown address`);

      return;
    }

    await this.resets.update(
      { userId: user.id, usedAt: IsNull() },
      { usedAt: new Date() },
    );

    const token = randomBytes(32).toString('base64url');

    await this.resets.save(
      this.resets.create({
        userId: user.id,
        tokenHash: this.hash(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      }),
    );

    const webOrigin = this.configService.getOrThrow<string>('webOrigin');

    void this.mailService
      .send(passwordResetMail(user.email, `${webOrigin}/passwort-neu/${token}`))
      .catch((problem: unknown) => {
        this.logger.warn(
          `Password reset mail failed: ${problem instanceof Error ? problem.message : String(problem)}`,
        );
      });
  }

  async complete(token: string, password: string): Promise<void> {
    const record = await this.resets.findOne({
      where: { tokenHash: this.hash(token), usedAt: IsNull() },
    });

    if (record === null || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Dieser Link ist abgelaufen oder wurde bereits verwendet',
      );
    }

    const user = await this.users.findOne({ where: { id: record.userId } });

    if (user === null) {
      throw new BadRequestException('Dieser Link ist nicht mehr gültig');
    }

    pruefePasswort(password, {
      email: user.email,
      namen: [user.firstName, user.lastName],
    });

    user.passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
    user.passwortGesetzt = true;

    const warUnbestaetigt = user.emailVerifiedAt === null;

    user.emailVerifiedAt ??= new Date();

    await this.users.save(user);

    if (warUnbestaetigt) {
      const verknuepfungen = this.users.manager.getRepository(
        AnmeldeVerknuepfungEntity,
      );
      const entfernt = await verknuepfungen.find({
        where: { userId: user.id },
      });

      if (entfernt.length > 0) {
        await verknuepfungen.delete({ userId: user.id });

        for (const v of entfernt) {
          meldeSicherheit({
            art: 'sso_getrennt',
            userId: user.id,
            actorId: user.id,
            details: { anbieter: v.anbieter },
          });
        }
      }
    }

    record.usedAt = new Date();
    await this.resets.save(record);

    await this.refreshTokens.revokeAllForUser(user.id);
    await this.users.manager
      .getRepository(AnmeldeEinloesungEntity)
      .delete({ userId: user.id });
    await this.users.manager
      .getRepository(AnmeldeVorgangEntity)
      .delete({ userId: user.id });
    meldeSicherheit({
      art: 'passwort_zurueckgesetzt',
      userId: user.id,
      actorId: user.id,
    });

    await this.mailService.send(passwordChangedMail(user.email));

    this.logger.log(`Password reset completed for user ${user.id}`);
  }

  async purgeExpired(): Promise<number> {
    const result = await this.resets.delete({
      expiresAt: LessThan(new Date(Date.now() - TOKEN_TTL_MS)),
    });

    return result.affected ?? 0;
  }
}
