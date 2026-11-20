import {
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export const GUELTIG_MS = 10 * 60 * 1000;

export const SCHWIERIGKEIT = 50_000;

export const MINDESTZEIT_MS = 3_000;

export type Aufgabe = {
  algorithm: 'SHA-256';
  challenge: string;
  maxnumber: number;
  salt: string;
  signature: string;
};

export type Pruefung =
  | { ergebnis: 'ok'; signatur: string; ablauf: Date; ausgestellt: Date }
  | { ergebnis: 'fehlt' | 'ungueltig' | 'abgelaufen' };

const sha256 = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

const hmac = (schluessel: Buffer, text: string): string =>
  createHmac('sha256', schluessel).update(text, 'utf8').digest('hex');

const unterschrift = (
  schluessel: Buffer,
  challenge: string,
  salt: string,
): string => hmac(schluessel, `${challenge}|${salt}`);

const gleich = (a: string, b: string): boolean => {
  const links = Buffer.from(a, 'utf8');
  const rechts = Buffer.from(b, 'utf8');

  return links.length === rechts.length && timingSafeEqual(links, rechts);
};

export const nachweisSchluessel = (
  eigener: string | undefined,
  jwtSecret: string,
): Buffer =>
  eigener !== undefined && eigener !== ''
    ? Buffer.from(eigener, 'utf8')
    : Buffer.from(
        hkdfSync(
          'sha256',
          jwtSecret,
          'stegwerk',
          'arbeitsnachweis',
          32,
        ) as ArrayBuffer,
      );

export const erstelleAufgabe = (
  schluessel: Buffer,
  jetzt = new Date(),
  schwierigkeit = SCHWIERIGKEIT,
): Aufgabe => {
  const salt = `${randomBytes(12).toString('hex')}?expires=${String(
    Math.floor((jetzt.getTime() + GUELTIG_MS) / 1000),
  )}&issued=${String(jetzt.getTime())}`;
  const zahl = randomInt(0, schwierigkeit + 1);
  const challenge = sha256(`${salt}${String(zahl)}`);

  return {
    algorithm: 'SHA-256',
    challenge,
    maxnumber: schwierigkeit,
    salt,
    signature: unterschrift(schluessel, challenge, salt),
  };
};

const lies = (
  roh: string,
): {
  algorithm: unknown;
  challenge: unknown;
  number: unknown;
  salt: unknown;
  signature: unknown;
} | null => {
  try {
    const wert = JSON.parse(
      Buffer.from(roh, 'base64').toString('utf8'),
    ) as unknown;

    return typeof wert === 'object' && wert !== null
      ? (wert as {
          algorithm: unknown;
          challenge: unknown;
          number: unknown;
          salt: unknown;
          signature: unknown;
        })
      : null;
  } catch {
    return null;
  }
};

export const pruefeLoesung = (
  schluessel: Buffer,
  roh: string | undefined | null,
  jetzt = new Date(),
): Pruefung => {
  if (roh === undefined || roh === null || roh.trim() === '') {
    return { ergebnis: 'fehlt' };
  }

  if (roh.length > 2000) {
    return { ergebnis: 'ungueltig' };
  }

  const loesung = lies(roh.trim());

  if (
    loesung === null ||
    loesung.algorithm !== 'SHA-256' ||
    typeof loesung.challenge !== 'string' ||
    typeof loesung.salt !== 'string' ||
    typeof loesung.signature !== 'string' ||
    typeof loesung.number !== 'number' ||
    !Number.isInteger(loesung.number) ||
    loesung.number < 0 ||
    loesung.number > SCHWIERIGKEIT
  ) {
    return { ergebnis: 'ungueltig' };
  }

  if (
    !gleich(
      unterschrift(schluessel, loesung.challenge, loesung.salt),
      loesung.signature,
    ) ||
    !gleich(
      sha256(`${loesung.salt}${String(loesung.number)}`),
      loesung.challenge,
    )
  ) {
    return { ergebnis: 'ungueltig' };
  }

  const parameter = new URLSearchParams(loesung.salt.split('?')[1] ?? '');
  const ablauf = Number(parameter.get('expires')) * 1000;
  const ausgestellt = Number(parameter.get('issued'));

  if (!Number.isFinite(ablauf) || !Number.isFinite(ausgestellt)) {
    return { ergebnis: 'ungueltig' };
  }

  if (ablauf <= jetzt.getTime()) {
    return { ergebnis: 'abgelaufen' };
  }

  return {
    ergebnis: 'ok',
    signatur: loesung.signature,
    ablauf: new Date(ablauf),
    ausgestellt: new Date(ausgestellt),
  };
};

export type Einloesung =
  | { ergebnis: 'ok'; ausgestellt: Date }
  | { ergebnis: 'fehlt' | 'ungueltig' | 'abgelaufen' | 'verbraucht' };

@Injectable()
export class ArbeitsnachweisService {
  private readonly logger = new Logger(ArbeitsnachweisService.name);
  private readonly schluessel: Buffer;
  private eingeloest = 0;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.schluessel = nachweisSchluessel(
      config.get<string>('arbeitsnachweisSchluessel'),
      config.getOrThrow<string>('jwtSecret'),
    );
  }

  aufgabe(jetzt = new Date()): Aufgabe {
    return erstelleAufgabe(this.schluessel, jetzt);
  }

  async einloesen(
    roh: string | undefined | null,
    jetzt = new Date(),
  ): Promise<Einloesung> {
    const pruefung = pruefeLoesung(this.schluessel, roh, jetzt);

    if (pruefung.ergebnis !== 'ok') {
      return pruefung;
    }

    const eingetragen = (await this.dataSource.query(
      `INSERT INTO "arbeitsnachweise" ("signatur", "ablauf") VALUES ($1, $2)
       ON CONFLICT ("signatur") DO NOTHING RETURNING "signatur"`,
      [pruefung.signatur, pruefung.ablauf],
    )) as unknown[];

    this.eingeloest += 1;

    if (this.eingeloest % 50 === 0) {
      await this.dataSource
        .query(`DELETE FROM "arbeitsnachweise" WHERE "ablauf" < $1`, [jetzt])
        .catch((fehler: unknown) =>
          this.logger.warn(
            `Abgelaufene Arbeitsnachweise nicht gelöscht: ${String(fehler)}`,
          ),
        );
    }

    return eingetragen.length === 0
      ? { ergebnis: 'verbraucht' }
      : { ergebnis: 'ok', ausgestellt: pruefung.ausgestellt };
  }
}
