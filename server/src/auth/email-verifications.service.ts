import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { IsNull, LessThan, Repository } from 'typeorm';

import { MailService } from '../mail/mail.service';
import { emailVerificationMail } from '../mail/templates';
import { UserEntity } from '../users/user.entity';
import { EmailVerificationEntity } from './email-verification.entity';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const RESEND_COOLDOWN_MS = 60 * 1000;

export const EMAIL_VERIFICATION_FOR_OTHER_ACCOUNT =
  'EMAIL_VERIFICATION_FOR_OTHER_ACCOUNT';

@Injectable()
export class EmailVerificationsService {
  private readonly logger = new Logger(EmailVerificationsService.name);

  constructor(
    @InjectRepository(EmailVerificationEntity)
    private readonly verifications: Repository<EmailVerificationEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async send(userId: string): Promise<void> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: ['id', 'email', 'emailVerifiedAt'],
    });

    if (user === null) {
      throw new BadRequestException('Dieses Konto gibt es nicht');
    }

    if (user.emailVerifiedAt !== null) {
      return;
    }

    const letzte = await this.verifications.findOne({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });

    if (
      letzte !== null &&
      Date.now() - letzte.createdAt.getTime() < RESEND_COOLDOWN_MS
    ) {
      throw new BadRequestException(
        'Es wurde gerade eine Bestätigungsmail verschickt. Warten Sie eine Minute, bevor Sie es erneut versuchen.',
      );
    }

    await this.verifications.update(
      { userId: user.id, usedAt: IsNull() },
      { usedAt: new Date() },
    );

    const token = randomBytes(32).toString('base64url');

    await this.verifications.save(
      this.verifications.create({
        userId: user.id,
        tokenHash: this.hash(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      }),
    );

    const webOrigin = this.configService.getOrThrow<string>('webOrigin');

    await this.mailService.send(
      emailVerificationMail(
        user.email,
        `${webOrigin}/adresse-bestaetigen/${token}`,
      ),
    );
  }

  async verify(token: string, userId: string): Promise<void> {
    const record = await this.verifications.findOne({
      where: { tokenHash: this.hash(token), usedAt: IsNull() },
    });

    if (record === null || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Dieser Link ist abgelaufen oder wurde bereits verwendet',
      );
    }

    if (record.userId !== userId) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message:
          'Dieser Link gehört zu einem anderen Konto. Melden Sie sich mit dem Konto an, für das die Adresse bestätigt werden soll.',
        reason: EMAIL_VERIFICATION_FOR_OTHER_ACCOUNT,
      });
    }

    const user = await this.users.findOne({ where: { id: record.userId } });

    if (user === null) {
      throw new BadRequestException('Dieser Link ist nicht mehr gültig');
    }

    if (user.emailVerifiedAt === null) {
      user.emailVerifiedAt = new Date();
      await this.users.save(user);
    }

    record.usedAt = new Date();
    await this.verifications.save(record);

    this.logger.log(`E-Mail-Adresse bestätigt für Konto ${user.id}`);
  }

  async purgeExpired(): Promise<number> {
    const result = await this.verifications.delete({
      expiresAt: LessThan(new Date(Date.now() - TOKEN_TTL_MS)),
    });

    return result.affected ?? 0;
  }
}
