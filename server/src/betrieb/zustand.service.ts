import { statfs } from 'node:fs/promises';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { LaeufeService, zustandVon } from '../ueberwachung/laeufe.service';
import { fristen } from '../ueberwachung/protokoll-aufbewahrung';
import { type BetriebsZustand } from './betrieb.dto';
import { sicherungLesen } from './sicherung-stand';

const GESTARTET = new Date();

@Injectable()
export class ZustandService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly laeufe: LaeufeService,
  ) {}

  async zustand(jetzt = new Date()): Promise<BetriebsZustand> {
    const anfang = Date.now();
    let datenbankOk = true;

    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      datenbankOk = false;
    }

    const datenbankMs = Date.now() - anfang;

    const [offeneMigrationen, laeufe, zahlen, speicher, sicherung] =
      await Promise.all([
        this.offeneMigrationen(),
        this.laeufe.alle(),
        this.zahlen(),
        this.speicher(),
        sicherungLesen(this.config.get<string>('sicherungStand') ?? '', jetzt),
      ]);
    const frist = fristen(
      this.config.get<{ aenderungenMonate: number; sicherheitMonate: number }>(
        'protokolle',
      ),
    );
    const host = this.config.get<string>('mail.host') ?? '';

    return {
      version: this.config.get<string>('appVersion') || 'unbekannt',
      gestartetAm: GESTARTET,
      datenbankOk,
      datenbankMs,
      offeneMigrationen,
      mailVersand: host === '' ? 'datei' : 'smtp',
      laeufe: laeufe.map((lauf) => ({
        name: lauf.name,
        zustand: zustandVon(lauf, jetzt),
        intervallSek: lauf.intervallSek,
        letzterStart: lauf.letzterStart,
        letzterErfolg: lauf.letzterErfolg,
        letzterFehlerAm: lauf.letzterFehlerAm,
        letzterFehler: lauf.letzterFehler,
        letzteDauerMs: lauf.letzteDauerMs,
        laeufe: lauf.laeufe,
        fehlerInFolge: lauf.fehlerInFolge,
      })),
      ...zahlen,
      ...speicher,
      protokollAenderungenMonate: frist.aenderungen,
      protokollSicherheitMonate: frist.sicherheit,
      sicherung,
    };
  }

  private async offeneMigrationen(): Promise<string[]> {
    try {
      const bekannt = this.dataSource.migrations.map(
        (migration) => migration.name ?? migration.constructor.name,
      );
      const gelaufen = new Set(
        (
          (await this.dataSource.query('SELECT "name" FROM "migrations"')) as {
            name: string;
          }[]
        ).map((zeile) => zeile.name),
      );

      return bekannt.filter((name) => !gelaufen.has(name)).sort();
    } catch {
      return [];
    }
  }

  private async zahlen() {
    const [zeile] = (await this.dataSource.query(
      `SELECT
         (SELECT count(*) FROM "mailboxes" WHERE "active")::int AS "postfaecher",
         (SELECT count(*) FROM "mailboxes" WHERE "active" AND "lastError" IS NOT NULL)::int AS "postfaecherMitFehler",
         (SELECT count(*) FROM "kalender_verbindungen")::int AS "kalender",
         (SELECT count(*) FROM "kalender_verbindungen" WHERE "letzterFehler" IS NOT NULL)::int AS "kalenderMitFehler",
         (SELECT count(*) FROM "oauth_zugaenge" WHERE "widerrufenAm" IS NOT NULL)::int AS "oauthWiderrufen"`,
    )) as {
      postfaecher: number;
      postfaecherMitFehler: number;
      kalender: number;
      kalenderMitFehler: number;
      oauthWiderrufen: number;
    }[];

    return zeile;
  }

  private async speicher(): Promise<{
    speicherFreiBytes: number | null;
    speicherGesamtBytes: number | null;
  }> {
    try {
      const fs = await statfs(process.cwd());

      return {
        speicherFreiBytes: fs.bavail * fs.bsize,
        speicherGesamtBytes: fs.blocks * fs.bsize,
      };
    } catch {
      return { speicherFreiBytes: null, speicherGesamtBytes: null };
    }
  }
}
