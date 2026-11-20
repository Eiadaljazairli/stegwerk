import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { BillingService } from '../billing/billing.service';
import { InvoiceDocumentsService } from '../invoices/invoice-documents.service';
import { InvoiceStatus } from '../invoices/invoice.types';
import { InvoicesService } from '../invoices/invoices.service';
import { fehlerArtVon } from '../mailboxes/abruf-fehler';
import {
  mailSchluessel,
  open,
  type Schluesselbund,
  seal,
} from '../mailboxes/secret-box';
import { meldeSicherheit } from '../sicherheit/melden';
import { hoereAuf, type Meldung } from '../webhooks/ereignisse';
import { zielBedingungRoh } from '../workspaces/ziel-sichtbarkeit';
import {
  type BelegDatei,
  type Buchhaltungsprogramm,
  type Zugang,
} from './anbieter/anbieter';
import {
  AnbieterFehler,
  BUCHHALTUNG_HTTP,
  type HttpTransport,
  Taktgeber,
} from './anbieter/http';
import { Lexware } from './anbieter/lexware';
import { Sevdesk } from './anbieter/sevdesk';
import { belegDaten, KeinBeleg } from './beleg';
import {
  ANBIETER_NAME,
  BUCHHALTUNGS_ANBIETER,
  type BuchhaltungsAnbieter,
  BuchhaltungKontaktEntity,
  BuchhaltungUebertragungEntity,
  BuchhaltungVerbindungEntity,
} from './buchhaltung.entities';

const MINUTE_MS = 60_000;

export const MAX_VERSUCHE = 8;

const ERSTER_ABSTAND_MS = MINUTE_MS;

const LAENGSTER_ABSTAND_MS = 6 * 60 * MINUTE_MS;

const SPERRE_MS = 10 * MINUTE_MS;

const JE_RUNDE = 20;

const ZAHLUNG_ALLE_MS = 6 * 60 * MINUTE_MS;

const ANMELDUNG_ALLE_MS = 60 * MINUTE_MS;

export const abstandNachVersuchen = (versuche: number): number =>
  Math.min(
    ERSTER_ABSTAND_MS * 2 ** Math.min(Math.max(versuche, 1) - 1, 20),
    LAENGSTER_ABSTAND_MS,
  );

export type VerbindenEingabe = {
  anbieter: BuchhaltungsAnbieter;
  schluessel: string;
  automatisch?: boolean | null;
};

export type Einstellungen = {
  automatisch?: boolean | null;
  zahlungenAbgleichen?: boolean | null;
};

@Injectable()
export class BuchhaltungService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BuchhaltungService.name);
  private readonly programme: Record<
    BuchhaltungsAnbieter,
    Buchhaltungsprogramm
  >;
  private abmelden: (() => void) | undefined;
  private laeuft = false;
  angestossen = false;

  constructor(
    @InjectRepository(BuchhaltungVerbindungEntity)
    private readonly verbindungen: Repository<BuchhaltungVerbindungEntity>,
    @InjectRepository(BuchhaltungUebertragungEntity)
    private readonly uebertragungen: Repository<BuchhaltungUebertragungEntity>,
    @InjectRepository(BuchhaltungKontaktEntity)
    private readonly kontakte: Repository<BuchhaltungKontaktEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly rechnungen: InvoicesService,
    private readonly dokumente: InvoiceDocumentsService,
    private readonly billing: BillingService,
    @Inject(BUCHHALTUNG_HTTP) http: HttpTransport,
    @Optional() takt: Taktgeber = new Taktgeber(),
  ) {
    this.programme = {
      lexware: new Lexware(http, takt),
      sevdesk: new Sevdesk(http, takt),
    };
  }

  onModuleInit(): void {
    this.abmelden = hoereAuf((meldung) => {
      const id = rechnungZumUebertragen(meldung);

      if (id !== null) {
        void this.automatischEinreihen(meldung.workspaceId, id).catch(
          (fehler: unknown) => {
            this.logger.warn(
              `Rechnung nicht eingereiht: ${fehler instanceof Error ? fehler.name : 'Fehler'}`,
            );
          },
        );
      }
    });
  }

  onModuleDestroy(): void {
    this.abmelden?.();
  }

  private bund(): Schluesselbund {
    return mailSchluessel(this.config);
  }

  async stand(
    workspaceId: string,
  ): Promise<BuchhaltungVerbindungEntity | null> {
    return this.verbindungen.findOne({ where: { workspaceId } });
  }

  async verbinden(
    user: RequestUser,
    eingabe: VerbindenEingabe,
  ): Promise<BuchhaltungVerbindungEntity> {
    if (!BUCHHALTUNGS_ANBIETER.includes(eingabe.anbieter)) {
      throw new BadRequestException(
        'Dieses Buchhaltungsprogramm kennt Stegwerk nicht.',
      );
    }

    const schluessel = eingabe.schluessel.trim();

    if (
      schluessel === '' ||
      schluessel.length > 500 ||
      /\s/u.test(schluessel)
    ) {
      throw new BadRequestException(
        'Bitte den API-Schlüssel vollständig und ohne Leerzeichen einfügen.',
      );
    }

    const vorher = await this.stand(user.workspaceId);

    if (vorher !== null && vorher.anbieter !== eingabe.anbieter) {
      throw new BadRequestException(
        `Dieser Bereich ist mit ${ANBIETER_NAME[vorher.anbieter]} verbunden. Bitte erst trennen; je Bereich gibt es eine Buchhaltung.`,
      );
    }

    const programm = this.programme[eingabe.anbieter];
    let profil;

    try {
      profil = await programm.pruefen({
        schluessel,
        verbindungId: vorher?.id ?? `pruefung:${user.workspaceId}`,
      });
    } catch (fehler) {
      if (fehler instanceof AnbieterFehler) {
        throw new BadRequestException(fehler.message);
      }

      throw fehler;
    }

    const versiegelt = seal(schluessel, this.bund());

    if (vorher !== null) {
      const dasselbeKonto =
        vorher.kontoKennung !== null &&
        profil.kontoKennung !== null &&
        vorher.kontoKennung === profil.kontoKennung;

      if (!dasselbeKonto) {
        await this.kontakte.delete({ verbindungId: vorher.id });
        await this.uebertragungen.update(
          {
            workspaceId: user.workspaceId,
            status: In(['wartet', 'fehler']),
            externeBelegId: Not(IsNull()),
          },
          { externeBelegId: null, dateiAngehaengt: false, zuPruefen: false },
        );
      }

      await this.verbindungen.update(vorher.id, {
        schluesselVersiegelt: versiegelt,
        kontoName: profil.kontoName,
        kontoKennung: profil.kontoKennung,
        anmeldungFehlerAm: null,
        anmeldungFehler: null,
        anmeldungGeprueftAm: null,
        anbieterDaten: {} as never,
        verbundenVonId: user.userId,
        ...(eingabe.automatisch === undefined || eingabe.automatisch === null
          ? {}
          : { automatisch: eingabe.automatisch }),
      });
    } else {
      await this.verbindungen.insert({
        workspaceId: user.workspaceId,
        anbieter: eingabe.anbieter,
        schluesselVersiegelt: versiegelt,
        kontoName: profil.kontoName,
        kontoKennung: profil.kontoKennung,
        automatisch: eingabe.automatisch ?? true,
        zahlungenAbgleichen: true,
        verbundenVonId: user.userId,
        anbieterDaten: {},
      });
    }

    meldeSicherheit({
      art: 'buchhaltung_verbunden',
      userId: user.userId,
      workspaceId: user.workspaceId,
      details: {
        anbieter: ANBIETER_NAME[eingabe.anbieter],
        konto: profil.kontoName,
        erneut: vorher !== null,
      },
    });
    this.angestossen = true;

    return (await this.stand(user.workspaceId)) as BuchhaltungVerbindungEntity;
  }

  async einstellen(
    user: RequestUser,
    einstellungen: Einstellungen,
  ): Promise<BuchhaltungVerbindungEntity> {
    const verbindung = await this.stand(user.workspaceId);

    if (verbindung === null) {
      throw new NotFoundException('Es ist keine Buchhaltung verbunden.');
    }

    const neu: { automatisch?: boolean; zahlungenAbgleichen?: boolean } = {};

    if (
      einstellungen.automatisch !== undefined &&
      einstellungen.automatisch !== null
    ) {
      neu.automatisch = einstellungen.automatisch;
    }

    if (
      einstellungen.zahlungenAbgleichen !== undefined &&
      einstellungen.zahlungenAbgleichen !== null
    ) {
      neu.zahlungenAbgleichen = einstellungen.zahlungenAbgleichen;
    }

    if (Object.keys(neu).length > 0) {
      await this.verbindungen.update(verbindung.id, neu);
      meldeSicherheit({
        art: 'buchhaltung_eingestellt',
        userId: user.userId,
        workspaceId: user.workspaceId,
        details: {
          anbieter: ANBIETER_NAME[verbindung.anbieter],
          ...(neu.automatisch === undefined
            ? {}
            : { automatisch: neu.automatisch }),
          ...(neu.zahlungenAbgleichen === undefined
            ? {}
            : { zahlungenAbgleichen: neu.zahlungenAbgleichen }),
        },
      });
    }

    return (await this.stand(user.workspaceId)) as BuchhaltungVerbindungEntity;
  }

  async trennen(user: RequestUser): Promise<boolean> {
    const verbindung = await this.stand(user.workspaceId);

    if (verbindung === null) {
      return false;
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(BuchhaltungVerbindungEntity, { id: verbindung.id });
      await manager.update(
        BuchhaltungUebertragungEntity,
        { workspaceId: user.workspaceId, status: In(['wartet', 'laeuft']) },
        {
          status: 'fehler',
          gesperrtBis: null,
          fehlerArt: 'sonstig',
          letzterFehler:
            'Die Buchhaltung wurde getrennt, bevor diese Rechnung übertragen war.',
        },
      );
    });

    meldeSicherheit({
      art: 'buchhaltung_getrennt',
      userId: user.userId,
      workspaceId: user.workspaceId,
      details: {
        anbieter: ANBIETER_NAME[verbindung.anbieter],
        konto: verbindung.kontoName,
      },
    });

    return true;
  }

  async uebertragungFuer(
    workspaceId: string,
    invoiceId: string,
  ): Promise<BuchhaltungUebertragungEntity | null> {
    return this.uebertragungen.findOne({ where: { workspaceId, invoiceId } });
  }

  async zaehlen(workspaceId: string): Promise<{
    wartend: number;
    fehlerhaft: number;
    nichtUebertragen: number;
  }> {
    const sicht = await zielBedingungRoh('i', 2);
    const [zeile] = (await this.dataSource.query(
      `SELECT
         (SELECT count(*) FROM "buchhaltung_uebertragungen" u JOIN "invoices" i ON i."id" = u."invoiceId"
           WHERE u."workspaceId" = $1 AND u."status" IN ('wartet', 'laeuft')${sicht.sql})::int AS "wartend",
         (SELECT count(*) FROM "buchhaltung_uebertragungen" u JOIN "invoices" i ON i."id" = u."invoiceId"
           WHERE u."workspaceId" = $1 AND u."status" = 'fehler'${sicht.sql})::int AS "fehlerhaft",
         (SELECT count(*) FROM "invoices" i
           WHERE i."workspaceId" = $1 AND i."number" IS NOT NULL AND i."issuedAt" IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM "buchhaltung_uebertragungen" u WHERE u."invoiceId" = i."id")${sicht.sql})::int AS "nichtUebertragen"`,
      [workspaceId, ...sicht.werte],
    )) as { wartend: number; fehlerhaft: number; nichtUebertragen: number }[];

    return zeile;
  }

  async automatischEinreihen(
    workspaceId: string,
    invoiceId: string,
  ): Promise<void> {
    const verbindung = await this.stand(workspaceId);

    if (verbindung === null || !verbindung.automatisch) {
      return;
    }

    await this.dataSource.query(
      `INSERT INTO "buchhaltung_uebertragungen" ("workspaceId", "invoiceId", "anbieter")
       SELECT $1, i."id", $3 FROM "invoices" i
        WHERE i."id" = $2 AND i."workspaceId" = $1 AND i."number" IS NOT NULL
       ON CONFLICT ("invoiceId") DO NOTHING`,
      [workspaceId, invoiceId, verbindung.anbieter],
    );
    this.angestossen = true;
  }

  async einreihen(
    workspaceId: string,
    invoiceId: string,
  ): Promise<BuchhaltungUebertragungEntity> {
    const verbindung = await this.stand(workspaceId);

    if (verbindung === null) {
      throw new BadRequestException(
        'Es ist keine Buchhaltung verbunden. Verbinden Sie sie unter Einstellungen → Buchhaltung.',
      );
    }

    const rechnung = await this.rechnungen.findOne(workspaceId, invoiceId);

    if (rechnung.number === null || rechnung.issuedAt === null) {
      throw new BadRequestException(
        'Nur eine gestellte Rechnung geht in die Buchhaltung; ein Entwurf hat noch keine Nummer.',
      );
    }

    await this.dataSource.query(
      `INSERT INTO "buchhaltung_uebertragungen" ("workspaceId", "invoiceId", "anbieter")
       VALUES ($1, $2, $3)
       ON CONFLICT ("invoiceId") DO UPDATE SET
         "status" = 'wartet',
         "versuche" = 0,
         "naechsterVersuchAm" = NULL,
         "letzterFehler" = NULL,
         "fehlerArt" = NULL,
         "anbieter" = CASE WHEN "buchhaltung_uebertragungen"."externeBelegId" IS NULL
                           THEN EXCLUDED."anbieter"
                           ELSE "buchhaltung_uebertragungen"."anbieter" END,
         "updatedAt" = now()
       WHERE "buchhaltung_uebertragungen"."status" = 'fehler'`,
      [workspaceId, invoiceId, verbindung.anbieter],
    );
    this.angestossen = true;

    return (await this.uebertragungFuer(
      workspaceId,
      invoiceId,
    )) as BuchhaltungUebertragungEntity;
  }

  async alleEinreihen(workspaceId: string): Promise<number> {
    const verbindung = await this.stand(workspaceId);

    if (verbindung === null) {
      throw new BadRequestException(
        'Es ist keine Buchhaltung verbunden. Verbinden Sie sie unter Einstellungen → Buchhaltung.',
      );
    }

    const sicht = await zielBedingungRoh('i', 3);
    const neu = (await this.dataSource.query(
      `INSERT INTO "buchhaltung_uebertragungen" ("workspaceId", "invoiceId", "anbieter")
       SELECT i."workspaceId", i."id", $2 FROM "invoices" i
        WHERE i."workspaceId" = $1 AND i."number" IS NOT NULL AND i."issuedAt" IS NOT NULL${sicht.sql}
       ON CONFLICT ("invoiceId") DO NOTHING
       RETURNING "id"`,
      [workspaceId, verbindung.anbieter, ...sicht.werte],
    )) as unknown;
    const wieder = zeilenVon(
      await this.dataSource.query(
        `UPDATE "buchhaltung_uebertragungen"
          SET "status" = 'wartet', "versuche" = 0, "naechsterVersuchAm" = NULL,
              "letzterFehler" = NULL, "fehlerArt" = NULL, "updatedAt" = now(),
              "anbieter" = CASE WHEN "externeBelegId" IS NULL THEN $2 ELSE "anbieter" END
        WHERE "workspaceId" = $1 AND "status" = 'fehler'${
          sicht.sql === ''
            ? ''
            : `
          AND "invoiceId" IN (SELECT i."id" FROM "invoices" i WHERE i."workspaceId" = $1${sicht.sql})`
        }
       RETURNING "id"`,
        [workspaceId, verbindung.anbieter, ...sicht.werte],
      ),
    );

    this.angestossen = true;

    return zeilenVon(neu).length + wieder.length;
  }

  async verarbeiten(jetzt = new Date()): Promise<number> {
    if (this.laeuft) {
      this.angestossen = true;

      return 0;
    }

    this.laeuft = true;
    this.angestossen = false;
    let erledigt = 0;

    try {
      const genommen = zeilenVon<BuchhaltungUebertragungEntity>(
        await this.dataSource.query(
          `UPDATE "buchhaltung_uebertragungen" SET "status" = 'laeuft', "gesperrtBis" = $2
          WHERE "id" IN (
            SELECT u."id" FROM "buchhaltung_uebertragungen" u
             WHERE ((u."status" = 'wartet' AND (u."naechsterVersuchAm" IS NULL OR u."naechsterVersuchAm" <= $1))
                    OR (u."status" = 'laeuft' AND u."gesperrtBis" < $1))
               AND NOT EXISTS (
                 SELECT 1 FROM "buchhaltung_verbindungen" v
                  WHERE v."workspaceId" = u."workspaceId" AND v."anmeldungFehlerAm" IS NOT NULL)
             ORDER BY u."createdAt"
             LIMIT $3
             FOR UPDATE SKIP LOCKED)
         RETURNING *`,
          [jetzt, new Date(jetzt.getTime() + SPERRE_MS), JE_RUNDE],
        ),
      );

      genommen.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

      for (const zeile of genommen) {
        if (!(await this.sperreErneuern(zeile, jetzt))) {
          continue;
        }

        if (await this.eineUebertragen(zeile, jetzt)) {
          erledigt += 1;
        }
      }
    } catch (fehler) {
      this.logger.error(
        'Buchhaltungs-Warteschlange fehlgeschlagen',
        fehler instanceof Error ? fehler.stack : String(fehler),
      );
    } finally {
      this.laeuft = false;
    }

    return erledigt;
  }

  private async sperreErneuern(
    zeile: BuchhaltungUebertragungEntity,
    jetzt: Date,
  ): Promise<boolean> {
    if (zeile.gesperrtBis === null) {
      return false;
    }

    const bis = new Date(Math.max(jetzt.getTime(), Date.now()) + SPERRE_MS);
    const erneuert = zeilenVon(
      await this.dataSource.query(
        `UPDATE "buchhaltung_uebertragungen" SET "gesperrtBis" = $3
          WHERE "id" = $1 AND "status" = 'laeuft' AND "gesperrtBis" = $2
         RETURNING "id"`,
        [zeile.id, new Date(zeile.gesperrtBis), bis],
      ),
    );

    if (erneuert.length === 0) {
      return false;
    }

    zeile.gesperrtBis = bis;

    return true;
  }

  private zugang(verbindung: BuchhaltungVerbindungEntity): Zugang {
    const daten = { ...(verbindung.anbieterDaten ?? {}) };

    return {
      schluessel: open(verbindung.schluesselVersiegelt, this.bund()),
      verbindungId: verbindung.id,
      daten,
      merke: async (neu) => {
        Object.assign(daten, neu);
        verbindung.anbieterDaten = daten;
        await this.verbindungen.update(verbindung.id, {
          anbieterDaten: daten as never,
        });
      },
    };
  }

  private async eineUebertragen(
    zeile: BuchhaltungUebertragungEntity,
    jetzt: Date,
  ): Promise<boolean> {
    const verbindung = await this.stand(zeile.workspaceId);
    const freigeben = (
      felder: Partial<
        Omit<BuchhaltungUebertragungEntity, 'invoice' | 'workspace'>
      >,
    ): Promise<unknown> =>
      this.uebertragungen.update(zeile.id, { gesperrtBis: null, ...felder });

    if (verbindung === null) {
      await freigeben({
        status: 'fehler',
        fehlerArt: 'sonstig',
        letzterFehler: 'Es ist keine Buchhaltung mehr verbunden.',
      });

      return false;
    }

    if (verbindung.anbieter !== zeile.anbieter) {
      if (zeile.externeBelegId !== null) {
        await freigeben({
          status: 'fehler',
          fehlerArt: 'sonstig',
          letzterFehler: `Diese Rechnung liegt schon bei ${ANBIETER_NAME[zeile.anbieter]}; jetzt ist ${ANBIETER_NAME[verbindung.anbieter]} verbunden.`,
        });

        return false;
      }

      zeile.anbieter = verbindung.anbieter;
      await this.uebertragungen.update(zeile.id, {
        anbieter: verbindung.anbieter,
      });
    }

    try {
      await this.billing.assertCanWrite(zeile.workspaceId);
    } catch {
      await freigeben({
        status: 'wartet',
        naechsterVersuchAm: new Date(jetzt.getTime() + 60 * MINUTE_MS),
      });

      return false;
    }

    const programm = this.programme[verbindung.anbieter];

    try {
      const zugang = this.zugang(verbindung);
      const rechnung = await this.rechnungen.findOne(
        zeile.workspaceId,
        zeile.invoiceId,
      );
      const korrigiert =
        rechnung.correctsInvoiceId === null
          ? null
          : await this.rechnungen
              .findOne(zeile.workspaceId, rechnung.correctsInvoiceId)
              .then((original) => original.number)
              .catch(() => null);
      const daten = belegDaten(rechnung, korrigiert);
      let datei: BelegDatei | null = null;
      const pdf = async (): Promise<BelegDatei> => {
        if (datei === null) {
          const erzeugt = await this.dokumente.pdf(
            zeile.workspaceId,
            zeile.invoiceId,
          );

          datei = { name: erzeugt.fileName, inhalt: erzeugt.content };
        }

        return datei;
      };

      let kontaktId: string | null = null;

      if (daten.empfaenger.art !== 'sammel') {
        const gemerkt = await this.kontakte.findOne({
          where: {
            verbindungId: verbindung.id,
            art: daten.empfaenger.art,
            datensatzId: daten.empfaenger.datensatzId,
          },
        });

        kontaktId =
          gemerkt?.externeId ??
          (await programm.kontakt(zugang, daten.empfaenger));

        if (gemerkt === null) {
          await this.kontakte
            .createQueryBuilder()
            .insert()
            .values({
              verbindungId: verbindung.id,
              art: daten.empfaenger.art,
              datensatzId: daten.empfaenger.datensatzId,
              externeId: kontaktId,
            })
            .orIgnore()
            .execute();
        }
      }

      if (zeile.externeBelegId === null) {
        const vorhanden = await programm.belegFinden(zugang, daten);

        if (vorhanden !== null) {
          zeile.externeBelegId = vorhanden;
          zeile.dateiAngehaengt = false;
        } else {
          const angelegt = await programm.belegAnlegen(
            zugang,
            daten,
            kontaktId,
            await pdf(),
          );

          zeile.externeBelegId = angelegt.id;
          zeile.dateiAngehaengt = angelegt.dateiAngehaengt;
          zeile.zuPruefen = angelegt.zuPruefen;
        }

        await this.uebertragungen.update(zeile.id, {
          externeBelegId: zeile.externeBelegId,
          dateiAngehaengt: zeile.dateiAngehaengt,
          zuPruefen: zeile.zuPruefen,
        });
      }

      if (!zeile.dateiAngehaengt) {
        await programm.dateiAnhaengen(
          zugang,
          zeile.externeBelegId,
          await pdf(),
        );
      }

      await freigeben({
        status: 'uebertragen',
        dateiAngehaengt: true,
        uebertragenAm: jetzt,
        naechsterVersuchAm: null,
        letzterFehler: null,
        fehlerArt: null,
      });

      return true;
    } catch (fehler) {
      await this.fehlschlag(zeile, verbindung, fehler, jetzt);

      return false;
    }
  }

  private async fehlschlag(
    zeile: BuchhaltungUebertragungEntity,
    verbindung: BuchhaltungVerbindungEntity,
    fehler: unknown,
    jetzt: Date,
  ): Promise<void> {
    if (fehler instanceof KeinBeleg) {
      await this.uebertragungen.delete(zeile.id);

      return;
    }

    if (!(fehler instanceof AnbieterFehler)) {
      this.logger.warn(
        `Übertragung ${zeile.id} fehlgeschlagen: ${fehler instanceof Error ? fehler.name : 'Fehler'}`,
      );
    } else {
      this.logger.warn(
        `Übertragung ${zeile.id} an ${verbindung.anbieter} fehlgeschlagen (${fehler.art}, Status ${String(fehler.status ?? '-')})`,
      );
    }

    const anbieterFehler =
      fehler instanceof AnbieterFehler
        ? fehler
        : new AnbieterFehler(
            'Die Übertragung ist an einem Fehler in Stegwerk gescheitert. Stegwerk versucht es später erneut.',
            'voruebergehend',
          );

    if (anbieterFehler.art === 'anmeldung') {
      await this.verbindungen.update(verbindung.id, {
        anmeldungFehlerAm: jetzt,
        anmeldungFehler: anbieterFehler.message,
        anmeldungGeprueftAm: jetzt,
      });
      await this.uebertragungen.update(zeile.id, {
        status: 'wartet',
        gesperrtBis: null,
        letzterFehler: anbieterFehler.message,
        fehlerArt: 'anmeldung',
      });

      return;
    }

    const versuche = zeile.versuche + 1;

    if (anbieterFehler.art === 'sonstig' || versuche >= MAX_VERSUCHE) {
      await this.uebertragungen.update(zeile.id, {
        status: 'fehler',
        versuche,
        gesperrtBis: null,
        naechsterVersuchAm: null,
        letzterFehler: anbieterFehler.message.slice(0, 500),
        fehlerArt: fehlerArtVon(anbieterFehler.message),
      });

      return;
    }

    const regulär = jetzt.getTime() + abstandNachVersuchen(versuche);
    const naechster = Math.max(
      regulär,
      anbieterFehler.wiederAb?.getTime() ?? 0,
    );

    await this.uebertragungen.update(zeile.id, {
      status: 'wartet',
      versuche,
      gesperrtBis: null,
      naechsterVersuchAm: new Date(naechster),
      letzterFehler: anbieterFehler.message.slice(0, 500),
      fehlerArt: 'voruebergehend',
    });
  }

  async anmeldungPruefen(jetzt = new Date()): Promise<number> {
    const gestoert = await this.verbindungen
      .createQueryBuilder('v')
      .where('v."anmeldungFehlerAm" IS NOT NULL')
      .andWhere(
        '(v."anmeldungGeprueftAm" IS NULL OR v."anmeldungGeprueftAm" < :grenze)',
        { grenze: new Date(jetzt.getTime() - ANMELDUNG_ALLE_MS) },
      )
      .take(20)
      .getMany();
    let wieder = 0;

    for (const verbindung of gestoert) {
      try {
        await this.programme[verbindung.anbieter].pruefen(
          this.zugang(verbindung),
        );
        await this.verbindungen.update(verbindung.id, {
          anmeldungFehlerAm: null,
          anmeldungFehler: null,
          anmeldungGeprueftAm: jetzt,
        });
        this.angestossen = true;
        wieder += 1;
      } catch (fehler) {
        const satz =
          fehler instanceof AnbieterFehler && fehler.art !== 'voruebergehend'
            ? { anmeldungFehler: fehler.message.slice(0, 500) }
            : {};

        await this.verbindungen.update(verbindung.id, {
          anmeldungGeprueftAm: jetzt,
          ...satz,
        });
      }
    }

    return wieder;
  }

  async zahlungenAbgleichen(jetzt = new Date()): Promise<number> {
    const offen = (await this.dataSource.query(
      `SELECT u."id", u."workspaceId", u."invoiceId", u."externeBelegId"
         FROM "buchhaltung_uebertragungen" u
         JOIN "invoices" i ON i."id" = u."invoiceId"
         JOIN "buchhaltung_verbindungen" v ON v."workspaceId" = u."workspaceId"
        WHERE u."status" = 'uebertragen' AND u."bezahltGemeldet" = false
          AND u."externeBelegId" IS NOT NULL AND u."anbieter" = v."anbieter"
          AND v."zahlungenAbgleichen" = true AND v."anmeldungFehlerAm" IS NULL
          AND i."status" = $1 AND i."correctsInvoiceId" IS NULL
          AND (u."zahlungGeprueftAm" IS NULL OR u."zahlungGeprueftAm" < $2)
        ORDER BY u."zahlungGeprueftAm" ASC NULLS FIRST
        LIMIT 50`,
      [InvoiceStatus.ISSUED, new Date(jetzt.getTime() - ZAHLUNG_ALLE_MS)],
    )) as {
      id: string;
      workspaceId: string;
      invoiceId: string;
      externeBelegId: string;
    }[];
    let gebucht = 0;

    for (const zeile of offen) {
      const verbindung = await this.stand(zeile.workspaceId);

      if (verbindung === null || verbindung.anmeldungFehlerAm !== null) {
        continue;
      }

      await this.uebertragungen.update(zeile.id, { zahlungGeprueftAm: jetzt });

      try {
        await this.billing.assertCanWrite(zeile.workspaceId);

        const bezahltAm = await this.programme[verbindung.anbieter].bezahltAm(
          this.zugang(verbindung),
          zeile.externeBelegId,
        );

        if (bezahltAm === null) {
          continue;
        }

        await this.rechnungen.markPaid(
          zeile.workspaceId,
          zeile.invoiceId,
          bezahltAm,
        );
        await this.uebertragungen.update(zeile.id, { bezahltGemeldet: true });
        gebucht += 1;
      } catch (fehler) {
        if (fehler instanceof AnbieterFehler && fehler.art === 'anmeldung') {
          await this.verbindungen.update(verbindung.id, {
            anmeldungFehlerAm: jetzt,
            anmeldungFehler: fehler.message,
            anmeldungGeprueftAm: jetzt,
          });
        }
      }
    }

    return gebucht;
  }
}

const zeilenVon = <T = { id: string }>(ergebnis: unknown): T[] => {
  if (!Array.isArray(ergebnis)) {
    return [];
  }

  if (
    ergebnis.length === 2 &&
    Array.isArray(ergebnis[0]) &&
    typeof ergebnis[1] === 'number'
  ) {
    return ergebnis[0] as T[];
  }

  return ergebnis as T[];
};

export const rechnungZumUebertragen = (meldung: Meldung): string | null => {
  const { data } = meldung;
  const id = typeof data.id === 'string' ? data.id : null;

  if (meldung.event === 'invoice.issued') {
    return id;
  }

  if (
    meldung.event === 'invoice.created' &&
    typeof data.correctsInvoiceId === 'string' &&
    data.status === InvoiceStatus.ISSUED &&
    typeof data.number === 'string'
  ) {
    return id;
  }

  return null;
};
