import {
  type CallHandler,
  type ExecutionContext,
  ServiceUnavailableException,
} from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { lastValueFrom, of } from 'rxjs';
import { type DataSource } from 'typeorm';

import { AuditAction, AuditLogEntity } from '../audit/audit-log.entity';
import { AnkuendigungEntity } from '../betrieb/ankuendigung.entity';
import { type BetriebService } from '../betrieb/betrieb.service';
import { WartungInterceptor } from '../betrieb/wartung.interceptor';
import {
  WARTUNG_OHNE_ANKUENDIGUNG,
  WartungService,
} from '../betrieb/wartung.service';
import { ZustandService } from '../betrieb/zustand.service';
import { SicherheitsEreignisEntity } from '../sicherheit/sicherheits-ereignis.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { GeplanterLaufEntity } from './geplanter-lauf.entity';
import {
  einplanen,
  LaeufeService,
  ueberwacht,
  zustandVon,
} from './laeufe.service';
import { fristen, ProtokollAufbewahrung } from './protokoll-aufbewahrung';

const SUITE = 'ueberwachung';
const STUNDE = 60 * 60 * 1000;

jest.setTimeout(60_000);

let dataSource: DataSource;
let laeufe: LaeufeService;

const konfig = (werte: Record<string, unknown>) =>
  ({
    get: (schluessel: string) => werte[schluessel],
  }) as unknown as ConfigService;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  laeufe = new LaeufeService(dataSource);
});

afterAll(async () => {
  laeufe.onModuleDestroy();
  await dropTestDatabase(dataSource, SUITE);
});

const lauf = (name: string) =>
  dataSource.getRepository(GeplanterLaufEntity).findOneByOrFail({ name });

const warte = () => new Promise((r) => setTimeout(r, 100));

describe('geplante Läufe', () => {
  it('vermerkt Erfolg und Dauer', async () => {
    einplanen('probe', STUNDE);
    await warte();
    expect(zustandVon(await lauf('probe'))).toBe('wartet');

    expect(await ueberwacht('probe', STUNDE, () => Promise.resolve(7))).toBe(7);

    const zeile = await lauf('probe');

    expect(zeile.laeufe).toBe(1);
    expect(zeile.letzterErfolg).not.toBeNull();
    expect(zeile.letzteDauerMs).not.toBeNull();
    expect(zustandVon(zeile)).toBe('ok');
  });

  it('vermerkt einen Fehler, reicht ihn weiter und zählt ihn in Folge', async () => {
    const kaputt = () => Promise.reject(new Error('Postfach nicht erreichbar'));

    await expect(ueberwacht('fehlerhaft', STUNDE, kaputt)).rejects.toThrow(
      'Postfach nicht erreichbar',
    );
    await expect(ueberwacht('fehlerhaft', STUNDE, kaputt)).rejects.toThrow();

    const zeile = await lauf('fehlerhaft');

    expect(zeile.fehlerInFolge).toBe(2);
    expect(zeile.letzterFehler).toBe('Postfach nicht erreichbar');
    expect(zustandVon(zeile)).toBe('fehler');

    await ueberwacht('fehlerhaft', STUNDE, () => Promise.resolve());
    expect((await lauf('fehlerhaft')).fehlerInFolge).toBe(0);
  });

  it('erkennt einen ausgebliebenen und einen abgeschalteten Lauf', async () => {
    await ueberwacht('alt', STUNDE, () => Promise.resolve());

    const zeile = await lauf('alt');
    const spaeter = new Date(Date.now() + 3 * STUNDE);

    expect(zustandVon(zeile, spaeter)).toBe('ausgeblieben');
    expect(zustandVon({ ...zeile, aktiv: false }, spaeter)).toBe('aus');
  });

  it('hält die Arbeit nicht auf, wenn das Vermerken scheitert', async () => {
    const ohneTabelle = new LaeufeService({
      getRepository: () => {
        throw new Error('keine Datenbank');
      },
    } as unknown as DataSource);

    await expect(
      ohneTabelle.lauf('x', STUNDE, () => Promise.resolve('fertig')),
    ).resolves.toBe('fertig');
    ohneTabelle.onModuleDestroy();
  });
});

describe('Aufbewahrung der Protokolle', () => {
  it('nimmt Fristen aus der Umgebung, aber nie unter das Minimum', () => {
    expect(fristen(undefined)).toEqual({ aenderungen: 24, sicherheit: 12 });
    expect(fristen({ aenderungenMonate: '36', sicherheitMonate: 1 })).toEqual({
      aenderungen: 36,
      sicherheit: 3,
    });
    expect(fristen({ aenderungenMonate: 'quatsch' }).aenderungen).toBe(24);
  });

  it('löscht Altes, behält beim Anlegen wer und wann', async () => {
    const m = dataSource.manager;
    const bereich = await m.save(
      m.create(WorkspaceEntity, { name: 'P', slug: 'p' }),
    );
    const alt = new Date(Date.now() - 30 * 31 * 24 * STUNDE);
    const zeile = (action: AuditAction, createdAt: Date) =>
      m.save(
        m.create(AuditLogEntity, {
          workspaceId: bereich.id,
          actorId: null,
          action,
          entityType: 'Company',
          entityId: bereich.id,
          summary: 'Nordwind',
          changes: { name: [null, 'Nordwind'] },
          requestId: null,
          createdAt,
        }),
      );

    const angelegt = await zeile(AuditAction.CREATED, alt);

    await zeile(AuditAction.UPDATED, alt);
    await zeile(AuditAction.UPDATED, new Date());
    await m.insert(SicherheitsEreignisEntity, [
      { art: 'anmeldung', createdAt: alt },
      { art: 'anmeldung', createdAt: new Date() },
    ] as never);

    const dienst = new ProtokollAufbewahrung(
      dataSource,
      konfig({ protokolle: { aenderungenMonate: 24, sicherheitMonate: 12 } }),
    );

    expect(await dienst.aufraeumen()).toEqual({
      aenderungenGeloescht: 1,
      anlagenGekuerzt: 1,
      sicherheitGeloescht: 1,
    });

    const rest = await m.find(AuditLogEntity, { order: { createdAt: 'ASC' } });

    expect(rest.map((r) => r.action)).toEqual([
      AuditAction.CREATED,
      AuditAction.UPDATED,
    ]);
    expect(rest[0].id).toBe(angelegt.id);
    expect(rest[0].changes).toBeNull();
    expect(rest[0].summary).toBe('Nordwind');
    expect(await m.count(SicherheitsEreignisEntity)).toBe(1);
  });
});

describe('Wartung', () => {
  const betrieb = {
    istBetreiber: (email: string) => email === 'chef@stegwerk.test',
  } as unknown as BetriebService;

  const http = (
    method: string,
    path: string,
    email?: string,
  ): ExecutionContext =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          path,
          user: email === undefined ? undefined : { email },
        }),
      }),
    }) as unknown as ExecutionContext;

  const gql = (
    operation: 'query' | 'mutation',
    fieldName: string,
    email?: string,
  ): ExecutionContext =>
    ({
      getType: () => 'graphql',
      getArgs: () => [
        {},
        {},
        { req: { user: email === undefined ? undefined : { email } } },
        { operation: { operation }, fieldName, path: { prev: undefined } },
      ],
      getHandler: () => undefined,
      getClass: () => undefined,
    }) as unknown as ExecutionContext;

  const weiter: CallHandler = { handle: () => of('gespeichert') };

  const durch = (i: WartungInterceptor, ctx: ExecutionContext) =>
    lastValueFrom(i.intercept(ctx, weiter));

  beforeEach(async () => {
    await dataSource.getRepository(AnkuendigungEntity).clear();
  });

  it('zeigt einen Hinweis, sperrt aber nichts ohne Wartung', async () => {
    const dienst = new WartungService(dataSource, konfig({}));

    await dienst.setzen('00000000-0000-4000-8000-000000000001', {
      text: 'Donnerstag ab 22 Uhr kurz nicht erreichbar.',
      von: new Date(Date.now() - 1000),
      bis: new Date(Date.now() + STUNDE),
      wartung: false,
    });

    expect((await dienst.aktuell())?.wartung).toBe(false);

    const i = new WartungInterceptor(dienst, betrieb);

    await expect(
      durch(i, gql('mutation', 'createCompany', 'a@x.test')),
    ).resolves.toBe('gespeichert');
  });

  it('lässt in der Wartung lesen und anmelden, aber nicht ändern', async () => {
    const dienst = new WartungService(dataSource, konfig({}));

    await dienst.setzen('00000000-0000-4000-8000-000000000001', {
      text: 'Umstellung läuft.',
      von: new Date(Date.now() - 1000),
      bis: new Date(Date.now() + STUNDE),
      wartung: true,
    });

    const i = new WartungInterceptor(dienst, betrieb);

    await expect(
      durch(i, gql('mutation', 'createCompany', 'a@x.test')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      durch(i, http('POST', '/attachments', 'a@x.test')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    await expect(durch(i, gql('query', 'companies', 'a@x.test'))).resolves.toBe(
      'gespeichert',
    );
    await expect(durch(i, gql('mutation', 'signIn'))).resolves.toBe(
      'gespeichert',
    );
    await expect(durch(i, http('POST', '/public/forms/abc'))).resolves.toBe(
      'gespeichert',
    );
    await expect(
      durch(i, gql('mutation', 'createCompany', 'chef@stegwerk.test')),
    ).resolves.toBe('gespeichert');
  });

  it('beendet sofort, und von Hand geht es auch ohne Ankündigung', async () => {
    const dienst = new WartungService(dataSource, konfig({}));
    const a = await dienst.setzen('00000000-0000-4000-8000-000000000001', {
      text: 'Wartung',
      von: new Date(Date.now() - 1000),
      bis: new Date(Date.now() + STUNDE),
      wartung: true,
    });

    expect(await dienst.beenden(a.id)).toBe(true);
    expect(await dienst.aktuell()).toBeNull();

    const vonHand = new WartungService(
      dataSource,
      konfig({ protokolle: { wartungsmodus: true } }),
    );

    expect(await vonHand.wartungLaeuft()).toMatchObject({
      text: WARTUNG_OHNE_ANKUENDIGUNG,
      wartung: true,
    });
  });

  it('verweigert unsinnige Zeiträume', async () => {
    const dienst = new WartungService(dataSource, konfig({}));
    const jetzt = Date.now();

    await expect(
      dienst.setzen('00000000-0000-4000-8000-000000000001', {
        text: 'x',
        von: new Date(jetzt + STUNDE),
        bis: new Date(jetzt),
        wartung: false,
      }),
    ).rejects.toThrow('nach');
    await expect(
      dienst.setzen('00000000-0000-4000-8000-000000000001', {
        text: 'x',
        von: new Date(jetzt),
        bis: new Date(jetzt + 40 * 24 * STUNDE),
        wartung: false,
      }),
    ).rejects.toThrow('vier Wochen');
  });
});

describe('Systemzustand', () => {
  it('nennt Datenbank, Migrationen, Mail, Läufe und Zahlen', async () => {
    const dienst = new ZustandService(
      dataSource,
      konfig({ appVersion: 'abc123', 'mail.host': '' }),
      laeufe,
    );
    const zustand = await dienst.zustand();

    expect(zustand.version).toBe('abc123');
    expect(zustand.datenbankOk).toBe(true);
    expect(zustand.mailVersand).toBe('datei');
    expect(zustand.offeneMigrationen).toEqual([]);
    expect(zustand.laeufe.map((l) => l.name)).toContain('probe');
    expect(zustand.postfaecher).toBe(0);
    expect(zustand.protokollAenderungenMonate).toBe(24);
  });
});
