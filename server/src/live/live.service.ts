import {
  ForbiddenException,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { getRequestContext } from '../observability/request-context';
import { hoereAuf, type Meldung } from '../webhooks/ereignisse';
import { PermissionsService } from '../workspaces/permissions.service';
import { type Sichtfeld } from '../workspaces/sichtbarkeit';
import {
  ausMeldung,
  buendeln,
  darfErfahren,
  type LiveAusgabe,
  type LiveMeldung,
  liesLiveMeldung,
} from './live-ereignis';

export const LIVE_KANAL = 'stegwerk_live';

const MAX_NUTZLAST = 7_500;

const TICKET_SEKUNDEN = 60;

const TICKET_FORM = /^[A-Za-z0-9_-]{43}$/u;

const RECHTE_MS = 20_000;

export const SAMMELN_MS = 300;

const MAX_JE_PERSON = 8;

const NAMEN_MS = 5 * 60_000;

export type Abonnent = {
  userId: string;
  workspaceId: string;
  senden: (aenderungen: LiveAusgabe[]) => void;
  nachladen: () => void;
  schliessen: (grund?: 'verdraengt') => void;
};

type Zustand = {
  abonnent: Abonnent;
  puffer: LiveAusgabe[];
  zeitgeber: ReturnType<typeof setTimeout> | null;
  rechte: Promise<Rechte | null> | null;
  rechteBis: number;
};

type Rechte = {
  rolle: { everything: boolean; permissions: string[] };
  sicht: Sichtfeld;
};

type PgClient = {
  connect: () => Promise<void>;
  query: (sql: string) => Promise<unknown>;
  end: () => Promise<void>;
  on: (
    ereignis: 'notification' | 'error' | 'end',
    zuhoerer: (nachricht?: { channel: string; payload?: string }) => void,
  ) => void;
};

const hash = (ticket: string): string =>
  createHash('sha256').update(ticket).digest('hex');

export const kuerzen = (meldung: LiveMeldung): string | null => {
  let nutzlast = JSON.stringify(meldung);

  if (nutzlast.length <= MAX_NUTZLAST) {
    return nutzlast;
  }

  const felder = [...(meldung.felder ?? [])];

  while (felder.length > 0) {
    felder.pop();
    nutzlast = JSON.stringify({ ...meldung, felder });

    if (nutzlast.length <= MAX_NUTZLAST) {
      return nutzlast;
    }
  }

  return null;
};

@Injectable()
export class LiveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiveService.name);
  private readonly zustaende = new Map<string, Set<Zustand>>();
  private readonly namen = new Map<
    string,
    { name: string | null; bis: number }
  >();
  private abmelden: (() => void) | null = null;
  private hoerer: PgClient | null = null;
  private beendet = false;
  private versuche = 0;
  private schonVerbunden = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly permissions: PermissionsService,
  ) {}

  onModuleInit(): void {
    this.abmelden = hoereAuf((meldung) => {
      void this.melden(meldung);
    });
    void this.zuhoeren();
  }

  async onModuleDestroy(): Promise<void> {
    this.beendet = true;
    this.abmelden?.();

    for (const zustaende of this.zustaende.values()) {
      for (const zustand of zustaende) {
        zustand.abonnent.schliessen();
      }
    }

    this.zustaende.clear();
    await this.hoerer?.end().catch(() => undefined);
    this.hoerer = null;
  }

  async ticketAusstellen(user: RequestUser): Promise<string> {
    if (user.apiKey !== undefined) {
      throw new ForbiddenException(
        'Die Live-Aktualisierung ist für die Oberfläche da, nicht für Schlüssel.',
      );
    }

    const ticket = randomBytes(32).toString('base64url');

    await this.dataSource.query(
      `DELETE FROM "live_tickets" WHERE "expiresAt" < now()`,
    );
    await this.dataSource.query(
      `INSERT INTO "live_tickets" ("tokenHash", "userId", "workspaceId", "expiresAt")
       VALUES ($1, $2, $3, now() + make_interval(secs => $4))`,
      [hash(ticket), user.userId, user.workspaceId, TICKET_SEKUNDEN],
    );

    return ticket;
  }

  async ticketEinloesen(
    ticket: string,
  ): Promise<{ userId: string; workspaceId: string } | null> {
    if (!TICKET_FORM.test(ticket)) {
      return null;
    }

    const [zeilen] = (await this.dataSource.query(
      `DELETE FROM "live_tickets" WHERE "tokenHash" = $1
       RETURNING "userId", "workspaceId", "expiresAt" > now() AS "gueltig"`,
      [hash(ticket)],
    )) as [{ userId: string; workspaceId: string; gueltig: boolean }[], number];
    const zeile = zeilen[0];

    if (zeile === undefined || !zeile.gueltig) {
      return null;
    }

    if (!(await this.istMitglied(zeile.userId, zeile.workspaceId))) {
      return null;
    }

    return { userId: zeile.userId, workspaceId: zeile.workspaceId };
  }

  abonnieren(abonnent: Abonnent): () => void {
    const zustand: Zustand = {
      abonnent,
      puffer: [],
      zeitgeber: null,
      rechte: null,
      rechteBis: 0,
    };
    const imBereich =
      this.zustaende.get(abonnent.workspaceId) ?? new Set<Zustand>();
    const eigene = [...imBereich].filter(
      (anderer) => anderer.abonnent.userId === abonnent.userId,
    );

    if (eigene.length >= MAX_JE_PERSON) {
      eigene[0].abonnent.schliessen('verdraengt');
      this.entfernen(eigene[0]);
    }

    imBereich.add(zustand);
    this.zustaende.set(abonnent.workspaceId, imBereich);

    return () => this.entfernen(zustand);
  }

  offen(workspaceId: string): number {
    return this.zustaende.get(workspaceId)?.size ?? 0;
  }

  private entfernen(zustand: Zustand): void {
    if (zustand.zeitgeber !== null) {
      clearTimeout(zustand.zeitgeber);
      zustand.zeitgeber = null;
    }

    const imBereich = this.zustaende.get(zustand.abonnent.workspaceId);

    imBereich?.delete(zustand);

    if (imBereich?.size === 0) {
      this.zustaende.delete(zustand.abonnent.workspaceId);
    }
  }

  async melden(meldung: Meldung): Promise<void> {
    const kontext = getRequestContext();
    const durchAutomation = kontext?.automationId !== undefined;
    const live = ausMeldung(
      meldung,
      durchAutomation ? null : (kontext?.userId ?? null),
      durchAutomation ? null : (kontext?.tab ?? null),
    );

    if (live === null) {
      return;
    }

    await this.veroeffentlichen(live);
  }

  async veroeffentlichen(meldung: LiveMeldung): Promise<void> {
    const nutzlast = kuerzen(meldung);

    if (nutzlast === null) {
      return;
    }

    try {
      await this.dataSource.query(`SELECT pg_notify($1, $2)`, [
        LIVE_KANAL,
        nutzlast,
      ]);
    } catch (fehler) {
      this.logger.warn(`Live-Meldung nicht verschickt: ${String(fehler)}`);
    }
  }

  async verteilen(meldung: LiveMeldung): Promise<void> {
    const imBereich = this.zustaende.get(meldung.workspaceId);

    if (imBereich === undefined || imBereich.size === 0) {
      return;
    }

    const name = await this.nameVon(meldung.von, meldung.workspaceId);

    await Promise.all(
      [...imBereich].map(async (zustand) => {
        try {
          const rechte = await this.rechteVon(zustand);

          if (
            rechte === null ||
            !(await darfErfahren(
              this.dataSource.manager,
              meldung,
              rechte.rolle,
              rechte.sicht,
            ))
          ) {
            return;
          }

          const eigene = meldung.von === zustand.abonnent.userId;

          this.puffern(zustand, {
            objekt: meldung.objekt,
            id: meldung.id,
            aktion: meldung.aktion,
            von:
              meldung.von === null || name === null
                ? null
                : { id: meldung.von, name },
            tab: eigene ? meldung.tab : null,
          });
        } catch (fehler) {
          this.logger.warn(`Live-Meldung nicht zugestellt: ${String(fehler)}`);
        }
      }),
    );
  }

  private puffern(zustand: Zustand, ausgabe: LiveAusgabe): void {
    zustand.puffer.push(ausgabe);

    if (zustand.zeitgeber !== null) {
      return;
    }

    zustand.zeitgeber = setTimeout(() => {
      zustand.zeitgeber = null;

      const aenderungen = buendeln(zustand.puffer);

      zustand.puffer = [];

      if (aenderungen.length > 0) {
        zustand.abonnent.senden(aenderungen);
      }
    }, SAMMELN_MS);
  }

  private rechteVon(zustand: Zustand): Promise<Rechte | null> {
    if (zustand.rechte !== null && Date.now() < zustand.rechteBis) {
      return zustand.rechte;
    }

    const { userId, workspaceId } = zustand.abonnent;

    zustand.rechteBis = Date.now() + RECHTE_MS;
    zustand.rechte = (async () => {
      if (!(await this.istMitglied(userId, workspaceId))) {
        zustand.abonnent.schliessen();
        this.entfernen(zustand);

        return null;
      }

      const caller = { userId, workspaceId, email: '' };

      return {
        rolle: await this.permissions.permissionsOf(caller),
        sicht: await this.permissions.sichtfeldFuer(caller),
      };
    })();

    return zustand.rechte;
  }

  private async istMitglied(
    userId: string,
    workspaceId: string,
  ): Promise<boolean> {
    const [zeile] = (await this.dataSource.query(
      `SELECT 1 FROM "memberships" WHERE "userId" = $1 AND "workspaceId" = $2`,
      [userId, workspaceId],
    )) as unknown[];

    return zeile !== undefined;
  }

  private async nameVon(
    userId: string | null,
    workspaceId: string,
  ): Promise<string | null> {
    if (userId === null) {
      return null;
    }

    const schluessel = `${workspaceId}:${userId}`;
    const gemerkt = this.namen.get(schluessel);

    if (gemerkt !== undefined && Date.now() < gemerkt.bis) {
      return gemerkt.name;
    }

    const [zeile] = (await this.dataSource.query(
      `SELECT u."firstName", u."lastName" FROM "users" u
         JOIN "memberships" m ON m."userId" = u."id" AND m."workspaceId" = $2
        WHERE u."id" = $1`,
      [userId, workspaceId],
    )) as { firstName: string | null; lastName: string | null }[];
    const name =
      zeile === undefined
        ? null
        : `${zeile.firstName ?? ''} ${zeile.lastName ?? ''}`.trim() || null;

    if (this.namen.size > 1_000) {
      this.namen.clear();
    }

    this.namen.set(schluessel, { name, bis: Date.now() + NAMEN_MS });

    return name;
  }

  private async zuhoeren(): Promise<void> {
    if (this.beendet) {
      return;
    }

    const treiber = this.dataSource.driver as unknown as {
      postgres: { Client: new (optionen: object) => PgClient };
    };
    const optionen = this.dataSource.options as {
      url?: string;
      host?: string;
      port?: number;
      username?: string;
      password?: string;
      database?: string;
      ssl?: unknown;
    };
    const client = new treiber.postgres.Client(
      optionen.url !== undefined
        ? { connectionString: optionen.url, ssl: optionen.ssl }
        : {
            host: optionen.host,
            port: optionen.port,
            user: optionen.username,
            password: optionen.password,
            database: optionen.database,
            ssl: optionen.ssl,
          },
    );
    let erledigt = false;
    const abgebrochen = () => {
      if (erledigt) {
        return;
      }

      erledigt = true;

      if (this.hoerer === client) {
        this.hoerer = null;
      }

      void client.end().catch(() => undefined);

      if (this.beendet) {
        return;
      }

      const warten = Math.min(30_000, 1_000 * 2 ** this.versuche);

      this.versuche += 1;
      setTimeout(() => void this.zuhoeren(), warten).unref();
    };

    client.on('notification', (nachricht) => {
      if (
        nachricht?.channel !== LIVE_KANAL ||
        nachricht.payload === undefined
      ) {
        return;
      }

      const meldung = liesLiveMeldung(nachricht.payload);

      if (meldung !== null) {
        void this.verteilen(meldung);
      }
    });
    client.on('error', abgebrochen);
    client.on('end', abgebrochen);

    try {
      await client.connect();
      await client.query(`LISTEN ${LIVE_KANAL}`);
    } catch (fehler) {
      this.logger.warn(`Live-Kanal nicht erreichbar: ${String(fehler)}`);
      abgebrochen();

      return;
    }

    if (this.beendet) {
      await client.end().catch(() => undefined);

      return;
    }

    this.hoerer = client;
    this.versuche = 0;

    if (this.schonVerbunden) {
      for (const zustaende of this.zustaende.values()) {
        for (const zustand of zustaende) {
          zustand.abonnent.nachladen();
        }
      }
    }

    this.schonVerbunden = true;
  }

  hoertZu(): boolean {
    return this.hoerer !== null;
  }
}
