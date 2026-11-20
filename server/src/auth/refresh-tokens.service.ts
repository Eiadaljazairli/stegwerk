import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';

import { getRequestContext } from '../observability/request-context';

import { gemeldeteEingabe, zuLangeUntaetig } from './leerlauf';
import { RefreshTokenEntity } from './refresh-token.entity';

const DAY_MS = 24 * 60 * 60 * 1000;

export const SCHONFRIST_MS = 20_000;

export const KURZE_SITZUNG_STUNDEN = 12;

export type IssuedRefreshToken = {
  token: string;
  record: RefreshTokenEntity;
};

@Injectable()
export class RefreshTokensService {
  private readonly logger = new Logger(RefreshTokensService.name);

  constructor(
    @InjectRepository(RefreshTokenEntity)
    private readonly repository: Repository<RefreshTokenEntity>,
    private readonly configService: ConfigService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issue(
    userId: string,
    workspaceId: string,
    familie?: {
      familyId: string;
      angemeldetAm: Date;
      letzteEingabeAm?: Date;
    },
    dauerhaft = true,
  ): Promise<IssuedRefreshToken> {
    const token = randomBytes(48).toString('base64url');
    const days = this.configService.get<number>('refreshTokenDays') ?? 30;
    const kontext = getRequestContext();
    const gueltigMs = dauerhaft
      ? days * DAY_MS
      : KURZE_SITZUNG_STUNDEN * 60 * 60 * 1000;

    const record = await this.repository.save(
      this.repository.create({
        userId,
        workspaceId,
        tokenHash: this.hash(token),
        expiresAt: new Date(Date.now() + gueltigMs),
        dauerhaft,
        familyId: familie?.familyId ?? null,
        angemeldetAm: familie?.angemeldetAm ?? new Date(),
        letzteEingabeAm: familie?.letzteEingabeAm ?? new Date(),
        geraet: kontext?.geraet?.slice(0, 80) ?? null,
        ipGekuerzt: kontext?.ipGekuerzt?.slice(0, 45) ?? null,
      }),
    );

    if (record.familyId === null) {
      record.familyId = record.id;
      await this.repository.update(record.id, { familyId: record.id });
    }

    return { token, record };
  }

  aktive(userId: string): Promise<RefreshTokenEntity[]> {
    return this.repository.find({
      where: { userId, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async sitzungVon(token: string | null | undefined): Promise<string | null> {
    if (token === null || token === undefined || token === '') {
      return null;
    }

    const zeile = await this.repository.findOne({
      where: { tokenHash: this.hash(token) },
      select: { id: true, familyId: true },
    });

    return zeile === null ? null : (zeile.familyId ?? zeile.id);
  }

  async istDauerhaft(token: string | null | undefined): Promise<boolean> {
    if (token === null || token === undefined || token === '') {
      return true;
    }

    const zeile = await this.repository.findOne({
      where: { tokenHash: this.hash(token) },
      select: { id: true, dauerhaft: true },
    });

    return zeile?.dauerhaft ?? true;
  }

  async beenden(userId: string, sitzungId: string): Promise<boolean> {
    const ergebnis = await this.repository
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where('"userId" = :userId', { userId })
      .andWhere('"revokedAt" IS NULL')
      .andWhere('("familyId" = :sitzungId OR "id" = :sitzungId)', { sitzungId })
      .execute();

    return (ergebnis.affected ?? 0) > 0;
  }

  async andereBeenden(
    userId: string,
    behaltenId: string | null,
  ): Promise<number> {
    const abfrage = this.repository
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where('"userId" = :userId', { userId })
      .andWhere('"revokedAt" IS NULL');

    if (behaltenId !== null) {
      abfrage.andWhere('"familyId" IS DISTINCT FROM :behaltenId', {
        behaltenId,
      });
    }

    return (await abfrage.execute()).affected ?? 0;
  }

  async rotate(
    token: string,
    letzteEingabe?: number | null,
  ): Promise<IssuedRefreshToken> {
    const presented = await this.repository.findOne({
      where: { tokenHash: this.hash(token) },
    });

    if (presented === null) {
      throw new UnauthorizedException('Diese Sitzung ist ungültig');
    }

    if (presented.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException(
        'Die Sitzung ist abgelaufen. Bitte melden Sie sich neu an.',
      );
    }

    if (presented.revokedAt !== null && presented.replacedById === null) {
      throw new UnauthorizedException(
        'Diese Sitzung wurde beendet. Bitte melden Sie sich neu an.',
      );
    }

    const eingabe = gemeldeteEingabe(
      presented.letzteEingabeAm ?? presented.createdAt,
      letzteEingabe,
      Date.now(),
    );
    const [bereich] = (await this.repository.manager.query(
      `SELECT "leerlaufMinuten" FROM "workspaces" WHERE "id" = $1`,
      [presented.workspaceId],
    )) as { leerlaufMinuten: number | null }[];

    if (
      presented.revokedAt === null &&
      zuLangeUntaetig(eingabe, bereich?.leerlaufMinuten ?? null, Date.now())
    ) {
      await this.beenden(presented.userId, presented.familyId ?? presented.id);

      throw new UnauthorizedException(
        'Sie wurden nach längerer Inaktivität abgemeldet. Bitte melden Sie sich neu an.',
      );
    }

    const replacement = await this.issue(
      presented.userId,
      presented.workspaceId,
      {
        familyId: presented.familyId ?? presented.id,
        angemeldetAm: presented.angemeldetAm ?? presented.createdAt,
        letzteEingabeAm: eingabe,
      },
      presented.dauerhaft,
    );
    const abgegeben = await this.repository.update(
      { id: presented.id, revokedAt: IsNull() },
      { revokedAt: new Date(), replacedById: replacement.record.id },
    );

    if ((abgegeben.affected ?? 0) === 0) {
      const jetzt = await this.repository.findOneByOrFail({
        id: presented.id,
      });

      const nachfolger =
        jetzt.replacedById === null
          ? null
          : await this.repository.findOneBy({ id: jetzt.replacedById });
      const sitzungLebt =
        nachfolger !== null &&
        (nachfolger.revokedAt === null || nachfolger.replacedById !== null);

      if (
        sitzungLebt &&
        jetzt.revokedAt !== null &&
        Date.now() - jetzt.revokedAt.getTime() < SCHONFRIST_MS
      ) {
        return replacement;
      }

      if (!sitzungLebt && jetzt.replacedById !== null) {
        await this.repository.delete(replacement.record.id);

        throw new UnauthorizedException(
          'Diese Sitzung wurde beendet. Bitte melden Sie sich neu an.',
        );
      }

      await this.repository.delete(replacement.record.id);

      this.logger.warn(
        `Refresh token reuse for user ${presented.userId}; revoking all sessions`,
      );

      await this.revokeAllForUser(presented.userId);

      throw new UnauthorizedException(
        'Die Sitzung ist abgelaufen. Bitte melden Sie sich neu an.',
      );
    }

    return replacement;
  }

  async abmelden(token: string): Promise<void> {
    const zeile = await this.repository.findOne({
      where: { tokenHash: this.hash(token) },
      select: { id: true, userId: true, familyId: true },
    });

    if (zeile === null) {
      return;
    }

    await this.beenden(zeile.userId, zeile.familyId ?? zeile.id);
  }

  async revoke(token: string): Promise<void> {
    await this.repository.update(
      { tokenHash: this.hash(token), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.repository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async purgeExpired(): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .where('"expiresAt" < now()')
      .execute();

    return result.affected ?? 0;
  }
}
