import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { type DataSource } from 'typeorm';

import { NurMenschWache } from '../api-keys/api-key.guard';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { type BillingService } from '../billing/billing.service';
import { CompanyEntity } from '../crm/entities/company.entity';
import { type InvoiceDocumentsService } from '../invoices/invoice-documents.service';
import { InvoiceLineEntity } from '../invoices/invoice-line.entity';
import { InvoiceEntity } from '../invoices/invoice.entity';
import { InvoiceStatus } from '../invoices/invoice.types';
import { InvoicesService } from '../invoices/invoices.service';
import { LetterheadEntity } from '../quotes/letterhead.entity';
import { QuoteEntity } from '../quotes/quote.entity';
import { open } from '../mailboxes/secret-box';
import { runWithRequestContext } from '../observability/request-context';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { RoleEntity } from '../workspaces/role.entity';
import { setzeSichtfeld } from '../workspaces/sichtbarkeit';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { type HttpAnfrage, type HttpAntwort, Taktgeber } from './anbieter/http';
import {
  BuchhaltungKontaktEntity,
  BuchhaltungUebertragungEntity,
  BuchhaltungVerbindungEntity,
} from './buchhaltung.entities';
import { BuchhaltungResolver } from './buchhaltung.resolver';
import { BuchhaltungService, MAX_VERSUCHE } from './buchhaltung.service';

const SUITE = 'buchhaltung';

jest.setTimeout(60_000);

const MAIL_SCHLUESSEL = Buffer.alloc(32, 9).toString('base64');
const LEX_SCHLUESSEL = 'lx-Schluessel-des-Kunden-0815';

class LexwareAttrappe {
  anfragen: HttpAnfrage[] = [];
  gueltigerSchluessel = LEX_SCHLUESSEL;
  kontakte: { id: string; company?: { name: string } }[] = [];
  belege: {
    id: string;
    voucherNumber: string;
    voucherType: string;
    rumpf: Record<string, unknown>;
  }[] = [];
  dateien: string[] = [];
  zahlungen = new Map<string, Record<string, unknown>>();
  stoerungen: { muster: string; antwort: HttpAntwort }[] = [];
  bremse: Promise<void> | null = null;

  http = async (anfrage: HttpAnfrage): Promise<HttpAntwort> => {
    this.anfragen.push(anfrage);

    if (this.bremse !== null) {
      await this.bremse;
    }

    const url = new URL(anfrage.url);
    const pfad = `${anfrage.methode} ${url.pathname}`;
    const stoerung = this.stoerungen.findIndex((s) =>
      pfad.startsWith(s.muster),
    );

    if (stoerung >= 0) {
      return this.stoerungen.splice(stoerung, 1)[0].antwort;
    }

    if (
      anfrage.headers.Authorization !== `Bearer ${this.gueltigerSchluessel}`
    ) {
      return antwort(401, { message: 'Unauthorized' });
    }

    if (pfad === 'GET /v1/profile') {
      return antwort(200, {
        companyName: 'Testfirma GmbH',
        organizationId: 'org-1',
      });
    }

    if (pfad === 'GET /v1/contacts') {
      const name = url.searchParams.get('name') ?? '';

      return antwort(200, {
        content: this.kontakte.filter((k) =>
          (k.company?.name ?? '').toLowerCase().includes(name.toLowerCase()),
        ),
      });
    }

    if (pfad === 'POST /v1/contacts') {
      const rumpf = JSON.parse(String(anfrage.rumpf)) as {
        company?: { name: string };
      };
      const id = `kontakt-${String(this.kontakte.length + 1)}`;

      this.kontakte.push({ id, company: rumpf.company });

      return antwort(200, { id, version: 1 });
    }

    if (pfad === 'GET /v1/voucherlist') {
      const nummer = url.searchParams.get('voucherNumber');

      return antwort(200, {
        content: this.belege
          .filter((b) => b.voucherNumber === nummer)
          .map(({ id, voucherNumber, voucherType }) => ({
            id,
            voucherNumber,
            voucherType,
          })),
      });
    }

    if (pfad === 'POST /v1/vouchers') {
      const rumpf = JSON.parse(String(anfrage.rumpf)) as Record<
        string,
        unknown
      >;
      const id = `beleg-${String(this.belege.length + 1)}`;

      this.belege.push({
        id,
        voucherNumber: String(rumpf.voucherNumber),
        voucherType: String(rumpf.type),
        rumpf,
      });

      return antwort(200, { id, version: 1 });
    }

    const datei = /^POST \/v1\/vouchers\/([^/]+)\/files$/u.exec(pfad);

    if (datei !== null) {
      this.dateien.push(datei[1]);

      return antwort(202, { id: `datei-${datei[1]}` });
    }

    const zahlung = /^GET \/v1\/payments\/(.+)$/u.exec(pfad);

    if (zahlung !== null) {
      return antwort(
        200,
        this.zahlungen.get(zahlung[1]) ?? {
          paymentStatus: 'openRevenue',
          voucherStatus: 'open',
        },
      );
    }

    return antwort(404, { message: 'nicht gefunden' });
  };
}

const antwort = (
  status: number,
  json: unknown,
  retryAfter: string | null = null,
): HttpAntwort => ({
  status,
  rumpf: JSON.stringify(json),
  retryAfter,
});

let dataSource: DataSource;
let lexware: LexwareAttrappe;
let rechnungen: InvoicesService;
let dienst: BuchhaltungService;
let aboGesperrt = false;
let workspaceId: string;
let andererBereich: string;
let inhaberin: RequestUser;
let buchhalter: RequestUser;
let fremde: RequestUser;
let firmaId: string;

const konfiguration = {
  get: (key: string) =>
    key === 'mailEncryptionKey' ? MAIL_SCHLUESSEL : undefined,
} as never;

const billing = {
  assertCanWrite: () =>
    aboGesperrt
      ? Promise.reject(new ForbiddenException('gesperrt'))
      : Promise.resolve(),
} as unknown as BillingService;

const dokumente = {
  pdf: (_workspace: string, id: string) =>
    Promise.resolve({
      fileName: `Rechnung-${id}.pdf`,
      content: Buffer.from('%PDF-1.7 Beleg'),
    }),
} as unknown as InvoiceDocumentsService;

const neuerDienst = () =>
  new BuchhaltungService(
    dataSource.getRepository(BuchhaltungVerbindungEntity),
    dataSource.getRepository(BuchhaltungUebertragungEntity),
    dataSource.getRepository(BuchhaltungKontaktEntity),
    dataSource,
    konfiguration,
    rechnungen,
    dokumente,
    billing,
    lexware.http,
    new Taktgeber(0, () => Promise.resolve()),
  );

const uebertragung = (invoiceId: string) =>
  dataSource
    .getRepository(BuchhaltungUebertragungEntity)
    .findOneByOrFail({ invoiceId });

const warteAufZeile = async (invoiceId: string): Promise<void> => {
  for (let i = 0; i < 100; i += 1) {
    if (
      (await dataSource
        .getRepository(BuchhaltungUebertragungEntity)
        .countBy({ invoiceId })) > 0
    ) {
      return;
    }

    await new Promise((fertig) => setTimeout(fertig, 20));
  }

  throw new Error('nicht eingereiht');
};

const gestellteRechnung = async (cents = 100_000): Promise<InvoiceEntity> => {
  const entwurf = await rechnungen.create(workspaceId, {
    companyId: firmaId,
    recipientAddress: 'Nordwind Logistik GmbH\nKaiserkai 1\n20457 Hamburg',
    serviceDate: '2026-10-15',
  });

  await rechnungen.setLines(workspaceId, entwurf.id, [
    {
      name: 'Beratung',
      quantity: 1,
      unit: 'Pauschal',
      unitPriceCents: cents,
      taxRatePercent: 19,
    },
  ]);

  return rechnungen.issue(workspaceId, entwurf.id);
};

const verbinden = () =>
  dienst.verbinden(inhaberin, {
    anbieter: 'lexware',
    schluessel: LEX_SCHLUESSEL,
  });

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  rechnungen = new InvoicesService(
    dataSource.getRepository(InvoiceEntity),
    dataSource.getRepository(InvoiceLineEntity),
    dataSource.getRepository(QuoteEntity),
    dataSource.getRepository(LetterheadEntity),
    dataSource,
  );
});

afterAll(async () => {
  dienst?.onModuleDestroy();
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  dienst?.onModuleDestroy();
  await dataSource.query(
    'TRUNCATE TABLE buchhaltung_kontakte, buchhaltung_uebertragungen, buchhaltung_verbindungen, invoice_lines, invoices, invoice_counters, workspace_letterheads, companies, memberships, roles, users, workspaces CASCADE',
  );
  aboGesperrt = false;
  lexware = new LexwareAttrappe();
  dienst = neuerDienst();
  dienst.onModuleInit();

  const m = dataSource.manager;

  workspaceId = (
    await m.save(m.create(WorkspaceEntity, { name: 'Wir', slug: 'wir' }))
  ).id;
  andererBereich = (
    await m.save(m.create(WorkspaceEntity, { name: 'Andere', slug: 'andere' }))
  ).id;

  const person = async (email: string) =>
    (
      await m.save(
        m.create(UserEntity, {
          email,
          passwordHash: 'x',
          firstName: 'A',
          lastName: 'B',
        }),
      )
    ).id;

  const inhaberinId = await person('inhaberin@wir.test');
  const buchhalterId = await person('buchhalter@wir.test');
  const fremdeId = await person('fremde@andere.test');
  const nurRechnungen = await m.save(
    m.create(RoleEntity, {
      workspaceId,
      name: 'Buchhaltung',
      permissions: [Permission.INVOICE_VIEW],
    }),
  );

  await m.save([
    m.create(MembershipEntity, {
      workspaceId,
      userId: inhaberinId,
      role: MembershipRole.OWNER,
    }),
    m.create(MembershipEntity, {
      workspaceId,
      userId: buchhalterId,
      role: MembershipRole.MEMBER,
      roleId: nurRechnungen.id,
    }),
    m.create(MembershipEntity, {
      workspaceId: andererBereich,
      userId: fremdeId,
      role: MembershipRole.OWNER,
    }),
  ]);

  inhaberin = {
    userId: inhaberinId,
    workspaceId,
    email: 'inhaberin@wir.test',
  } as RequestUser;
  buchhalter = {
    userId: buchhalterId,
    workspaceId,
    email: 'buchhalter@wir.test',
  } as RequestUser;
  fremde = {
    userId: fremdeId,
    workspaceId: andererBereich,
    email: 'fremde@andere.test',
  } as RequestUser;

  await m.save(
    m.create(LetterheadEntity, {
      workspaceId,
      companyName: 'Wir GmbH',
      street: 'Werdauer Weg 35',
      postalCode: '10829',
      city: 'Berlin',
      taxNumber: '29/123/45678',
      vatId: 'DE123456789',
    }),
  );
  firmaId = (
    await m.save(
      m.create(CompanyEntity, {
        workspaceId,
        name: 'Nordwind Logistik GmbH',
        street: 'Kaiserkai 1',
        postalCode: '20457',
        city: 'Hamburg',
      }),
    )
  ).id;
});

describe('verbinden', () => {
  it('prüft den Schlüssel sofort und speichert ihn nur versiegelt', async () => {
    const verbindung = await verbinden();

    expect(verbindung.kontoName).toBe('Testfirma GmbH');

    const [zeile] = (await dataSource.query(
      'SELECT "schluesselVersiegelt" FROM buchhaltung_verbindungen',
    )) as { schluesselVersiegelt: string }[];

    expect(zeile.schluesselVersiegelt.startsWith('v2:')).toBe(true);
    expect(zeile.schluesselVersiegelt).not.toContain(LEX_SCHLUESSEL);
    expect(
      open(zeile.schluesselVersiegelt, Buffer.from(MAIL_SCHLUESSEL, 'base64')),
    ).toBe(LEX_SCHLUESSEL);
  });

  it('speichert einen abgelehnten Schlüssel nicht', async () => {
    await expect(
      dienst.verbinden(inhaberin, {
        anbieter: 'lexware',
        schluessel: 'falsch',
      }),
    ).rejects.toThrow(/abgelehnt/u);
    expect(
      await dataSource.getRepository(BuchhaltungVerbindungEntity).count(),
    ).toBe(0);
  });

  it('erlaubt je Bereich nur eine Buchhaltung', async () => {
    await verbinden();

    await expect(
      dienst.verbinden(inhaberin, {
        anbieter: 'sevdesk',
        schluessel: '0123456789abcdef0123456789abcdef',
      }),
    ).rejects.toThrow(/erst trennen/u);
  });

  it('vergisst beim Wechsel auf ein anderes Konto Kunden und unfertige Belege', async () => {
    await verbinden();

    const rechnung = await gestellteRechnung();

    await warteAufZeile(rechnung.id);
    lexware.stoerungen.push({
      muster: 'POST /v1/vouchers/beleg-1/files',
      antwort: antwort(406, { message: 'kaputt' }),
    });
    await dienst.verarbeiten();
    expect(await uebertragung(rechnung.id)).toMatchObject({
      status: 'fehler',
      externeBelegId: 'beleg-1',
    });
    expect(
      await dataSource.getRepository(BuchhaltungKontaktEntity).count(),
    ).toBe(1);

    await verbinden();
    expect(
      await dataSource.getRepository(BuchhaltungKontaktEntity).count(),
    ).toBe(1);
    expect((await uebertragung(rechnung.id)).externeBelegId).toBe('beleg-1');

    const profil = lexware.http;

    lexware.http = (anfrage) =>
      new URL(anfrage.url).pathname === '/v1/profile'
        ? Promise.resolve(
            antwort(200, {
              companyName: 'Andere GmbH',
              organizationId: 'org-2',
            }),
          )
        : profil(anfrage);
    dienst.onModuleDestroy();
    dienst = neuerDienst();
    dienst.onModuleInit();
    await verbinden();

    expect(
      await dataSource.getRepository(BuchhaltungKontaktEntity).count(),
    ).toBe(0);
    expect(await uebertragung(rechnung.id)).toMatchObject({
      status: 'fehler',
      externeBelegId: null,
      dateiAngehaengt: false,
    });
  });

  it('vergisst die Kunden auch, wenn der Anbieter keine Kontokennung nennt', async () => {
    await verbinden();

    const rechnung = await gestellteRechnung();

    await warteAufZeile(rechnung.id);
    await dienst.verarbeiten();
    await dataSource.query(
      'UPDATE buchhaltung_verbindungen SET "kontoKennung" = NULL',
    );
    await verbinden();

    expect(
      await dataSource.getRepository(BuchhaltungKontaktEntity).count(),
    ).toBe(0);
    expect(await uebertragung(rechnung.id)).toMatchObject({
      status: 'uebertragen',
      externeBelegId: 'beleg-1',
    });
  });

  it('gibt den Schlüssel in keinem Feld des Schemas heraus', () => {
    const schema = readFileSync(
      join(__dirname, '..', '..', 'schema.gql'),
      'utf8',
    );
    const typ =
      /type BuchhaltungVerbindung \{([^}]*)\}/u.exec(schema)?.[1] ?? '';

    expect(typ).toContain('kontoName');
    expect(typ.toLowerCase()).not.toContain('schluessel');
    expect(typ.toLowerCase()).not.toContain('versiegelt');
  });
});

describe('übertragen', () => {
  it('reiht eine gestellte Rechnung von selbst ein und überträgt Kunde, Beleg und PDF', async () => {
    await verbinden();

    const rechnung = await gestellteRechnung();

    await warteAufZeile(rechnung.id);
    expect(await dienst.verarbeiten()).toBe(1);

    const stand = await uebertragung(rechnung.id);

    expect(stand).toMatchObject({
      status: 'uebertragen',
      externeBelegId: 'beleg-1',
      dateiAngehaengt: true,
      zuPruefen: false,
      letzterFehler: null,
    });
    expect(lexware.kontakte).toEqual([
      { id: 'kontakt-1', company: { name: 'Nordwind Logistik GmbH' } },
    ]);
    expect(lexware.belege[0].rumpf).toMatchObject({
      type: 'salesinvoice',
      voucherNumber: rechnung.number,
      contactId: 'kontakt-1',
      totalGrossAmount: 1190,
      totalTaxAmount: 190,
    });
    expect(lexware.dateien).toEqual(['beleg-1']);
    expect(
      lexware.anfragen.some(
        (a) =>
          a.url.includes(LEX_SCHLUESSEL) ||
          String(a.rumpf ?? '').includes(LEX_SCHLUESSEL),
      ),
    ).toBe(false);
  });

  it('überträgt nie doppelt: ein zweiter Klick und ein zweiter Lauf legen nichts an', async () => {
    await verbinden();

    const rechnung = await gestellteRechnung();

    await warteAufZeile(rechnung.id);
    await dienst.verarbeiten();
    await dienst.einreihen(workspaceId, rechnung.id);
    await dienst.verarbeiten();
    await dienst.alleEinreihen(workspaceId);
    await dienst.verarbeiten();

    expect(lexware.belege).toHaveLength(1);
    expect((await uebertragung(rechnung.id)).status).toBe('uebertragen');
  });

  it('lässt eine Zeile liegen, die ein anderer Lauf nach Ablauf der Sperre übernommen hat', async () => {
    await verbinden();

    const erste = await gestellteRechnung();

    await warteAufZeile(erste.id);

    const zweite = await gestellteRechnung(5000);

    await warteAufZeile(zweite.id);

    let weiter: () => void = () => undefined;

    lexware.bremse = new Promise((fertig) => {
      weiter = fertig;
    });

    const vorher = lexware.anfragen.length;
    const lauf = dienst.verarbeiten();

    for (let i = 0; i < 200 && lexware.anfragen.length === vorher; i += 1) {
      await new Promise((fertig) => setTimeout(fertig, 10));
    }

    await dataSource.query(
      `UPDATE buchhaltung_uebertragungen SET "gesperrtBis" = now() + interval '1 hour' WHERE "invoiceId" = $1`,
      [zweite.id],
    );
    lexware.bremse = null;
    weiter();

    expect(await lauf).toBe(1);
    expect((await uebertragung(erste.id)).status).toBe('uebertragen');
    expect((await uebertragung(zweite.id)).status).toBe('laeuft');
    expect(lexware.belege).toHaveLength(1);
  });

  it('nimmt eine Rechnung bei zwei gleichzeitigen Läufen nur einmal', async () => {
    await verbinden();

    const rechnung = await gestellteRechnung();

    await warteAufZeile(rechnung.id);

    let weiter: () => void = () => undefined;

    lexware.bremse = new Promise((fertig) => {
      weiter = fertig;
    });

    const zweiter = neuerDienst();
    const laeufe = Promise.all([dienst.verarbeiten(), zweiter.verarbeiten()]);

    await new Promise((fertig) => setTimeout(fertig, 100));
    lexware.bremse = null;
    weiter();

    expect((await laeufe).reduce((a, b) => a + b, 0)).toBe(1);
    expect(lexware.belege).toHaveLength(1);
  });

  it('legt nach einem Abbruch beim PDF keinen zweiten Beleg an', async () => {
    await verbinden();

    const rechnung = await gestellteRechnung();
    const jetzt = new Date();

    await warteAufZeile(rechnung.id);
    lexware.stoerungen.push({
      muster: 'POST /v1/vouchers/beleg-1/files',
      antwort: antwort(503, { message: 'Service Unavailable' }),
    });

    expect(await dienst.verarbeiten(jetzt)).toBe(0);

    const nachFehler = await uebertragung(rechnung.id);

    expect(nachFehler).toMatchObject({
      status: 'wartet',
      externeBelegId: 'beleg-1',
      dateiAngehaengt: false,
      versuche: 1,
      fehlerArt: 'voruebergehend',
    });
    expect(nachFehler.letzterFehler).toMatch(/nicht erreichbar/u);
    expect(nachFehler.naechsterVersuchAm?.getTime()).toBe(
      jetzt.getTime() + 60_000,
    );

    expect(await dienst.verarbeiten(new Date(jetzt.getTime() + 30_000))).toBe(
      0,
    );
    expect(await dienst.verarbeiten(new Date(jetzt.getTime() + 61_000))).toBe(
      1,
    );
    expect(lexware.belege).toHaveLength(1);
    expect(lexware.dateien).toEqual(['beleg-1']);
  });

  it('findet nach einem Absturz den schon angelegten Beleg über die Nummer', async () => {
    await verbinden();

    const rechnung = await gestellteRechnung();

    await warteAufZeile(rechnung.id);
    lexware.belege.push({
      id: 'beleg-vorher',
      voucherNumber: rechnung.number ?? '',
      voucherType: 'salesinvoice',
      rumpf: {},
    });

    await dienst.verarbeiten();

    expect((await uebertragung(rechnung.id)).externeBelegId).toBe(
      'beleg-vorher',
    );
    expect(lexware.belege).toHaveLength(1);
    expect(lexware.dateien).toEqual(['beleg-vorher']);
  });

  it('wartet bei 429 so lange, wie Retry-After verlangt', async () => {
    await verbinden();

    const rechnung = await gestellteRechnung();
    const jetzt = new Date();

    await warteAufZeile(rechnung.id);
    lexware.stoerungen.push({
      muster: 'POST /v1/vouchers',
      antwort: antwort(429, { message: 'Too Many Requests' }, '120'),
    });
    await dienst.verarbeiten(jetzt);

    const stand = await uebertragung(rechnung.id);

    expect(stand.status).toBe('wartet');
    expect(stand.letzterFehler).toMatch(/überlastet/u);
    const wartezeit =
      (stand.naechsterVersuchAm?.getTime() ?? 0) - jetzt.getTime();

    expect(wartezeit).toBeGreaterThanOrEqual(120_000);
    expect(wartezeit).toBeLessThan(125_000);
  });

  it('gibt nach zu vielen vorübergehenden Fehlern auf', async () => {
    await verbinden();

    const rechnung = await gestellteRechnung();

    await warteAufZeile(rechnung.id);
    await dataSource.query(
      `UPDATE buchhaltung_uebertragungen SET versuche = $1 WHERE "invoiceId" = $2`,
      [MAX_VERSUCHE - 1, rechnung.id],
    );
    lexware.stoerungen.push({
      muster: 'GET /v1/contacts',
      antwort: antwort(500, {}),
    });
    await dienst.verarbeiten();

    expect((await uebertragung(rechnung.id)).status).toBe('fehler');
  });

  it('hält bei abgelehntem Inhalt an und versucht es auf Knopfdruck neu', async () => {
    await verbinden();

    const rechnung = await gestellteRechnung();

    await warteAufZeile(rechnung.id);
    lexware.stoerungen.push({
      muster: 'POST /v1/vouchers',
      antwort: antwort(406, {
        IssueList: [
          {
            i18nKey: 'missing_entity',
            source: 'voucherDate',
            type: 'validation_failure',
          },
        ],
      }),
    });
    await dienst.verarbeiten();

    const fehler = await uebertragung(rechnung.id);

    expect(fehler.status).toBe('fehler');
    expect(fehler.letzterFehler).toContain('voucherDate: missing_entity');

    await dienst.einreihen(workspaceId, rechnung.id);
    expect((await uebertragung(rechnung.id)).status).toBe('wartet');
    await dienst.verarbeiten();
    expect((await uebertragung(rechnung.id)).status).toBe('uebertragen');
  });

  it('stellt bei widerrufenem Schlüssel alles still, bis neu verbunden wird', async () => {
    await verbinden();
    lexware.gueltigerSchluessel = 'neuer-schluessel-nach-widerruf';

    const rechnung = await gestellteRechnung();

    await warteAufZeile(rechnung.id);
    await dienst.verarbeiten();

    const verbindung = await dienst.stand(workspaceId);

    expect(verbindung?.anmeldungFehler).toMatch(/neu verbinden/u);
    expect(await uebertragung(rechnung.id)).toMatchObject({
      status: 'wartet',
      versuche: 0,
      fehlerArt: 'anmeldung',
    });

    const vorher = lexware.anfragen.length;

    expect(await dienst.verarbeiten()).toBe(0);
    expect(lexware.anfragen).toHaveLength(vorher);

    await dienst.verbinden(inhaberin, {
      anbieter: 'lexware',
      schluessel: 'neuer-schluessel-nach-widerruf',
    });
    expect((await dienst.stand(workspaceId))?.anmeldungFehler).toBeNull();
    expect(await dienst.verarbeiten()).toBe(1);
  });

  it('nimmt einen wieder angenommenen Schlüssel stündlich von selbst wieder auf', async () => {
    await verbinden();
    await dataSource.query(
      `UPDATE buchhaltung_verbindungen SET "anmeldungFehlerAm" = now(), "anmeldungFehler" = 'x', "anmeldungGeprueftAm" = now() - interval '2 hours'`,
    );

    expect(await dienst.anmeldungPruefen()).toBe(1);
    expect((await dienst.stand(workspaceId))?.anmeldungFehler).toBeNull();
  });

  it('überträgt ohne laufendes Abo nichts', async () => {
    await verbinden();

    const rechnung = await gestellteRechnung();

    await warteAufZeile(rechnung.id);
    aboGesperrt = true;
    await dienst.verarbeiten();

    expect((await uebertragung(rechnung.id)).status).toBe('wartet');
    expect(lexware.belege).toHaveLength(0);
  });

  it('überträgt ein Storno als salescreditnote zur ursprünglichen Rechnung', async () => {
    await verbinden();

    const rechnung = await gestellteRechnung();

    await warteAufZeile(rechnung.id);
    await dienst.verarbeiten();

    const korrektur = await rechnungen.cancel(workspaceId, rechnung.id);

    await warteAufZeile(korrektur.id);
    await dienst.verarbeiten();

    expect((await uebertragung(korrektur.id)).status).toBe('uebertragen');
    expect(lexware.belege[1].rumpf).toMatchObject({
      type: 'salescreditnote',
      voucherNumber: korrektur.number,
      totalGrossAmount: 1190,
      contactId: 'kontakt-1',
    });
    expect(String(lexware.belege[1].rumpf.remark)).toContain(
      String(rechnung.number),
    );
    expect(lexware.kontakte).toHaveLength(1);
  });

  it('reiht nicht von selbst ein, wenn das abgeschaltet ist; die Sammelaktion schon', async () => {
    await verbinden();
    await dienst.einstellen(inhaberin, { automatisch: false });

    const rechnung = await gestellteRechnung();

    await new Promise((fertig) => setTimeout(fertig, 100));
    expect(
      await dataSource.getRepository(BuchhaltungUebertragungEntity).count(),
    ).toBe(0);
    expect(await dienst.zaehlen(workspaceId)).toMatchObject({
      nichtUebertragen: 1,
    });

    expect(await dienst.alleEinreihen(workspaceId)).toBe(1);
    await dienst.verarbeiten();
    expect((await uebertragung(rechnung.id)).status).toBe('uebertragen');
  });
});

describe('Zahlungen', () => {
  it('bucht eine Rechnung bezahlt, sobald Lexware sie bezahlt meldet', async () => {
    await verbinden();

    const rechnung = await gestellteRechnung();

    await warteAufZeile(rechnung.id);
    await dienst.verarbeiten();

    expect(await dienst.zahlungenAbgleichen()).toBe(0);

    lexware.zahlungen.set('beleg-1', {
      paymentStatus: 'balanced',
      voucherStatus: 'paid',
      paidDate: '2026-11-02T10:00:00.000+01:00',
    });
    expect(await dienst.zahlungenAbgleichen()).toBe(0);
    expect(
      await dienst.zahlungenAbgleichen(new Date(Date.now() + 7 * 60 * 60_000)),
    ).toBe(1);

    const bezahlt = await rechnungen.findOne(workspaceId, rechnung.id);

    expect(bezahlt.status).toBe(InvoiceStatus.PAID);
    expect(bezahlt.paidAt?.toISOString().slice(0, 10)).toBe('2026-11-02');
  });
});

describe('trennen', () => {
  it('löscht Schlüssel und Kunden, behält den Nachweis und beendet Wartendes', async () => {
    await verbinden();

    const erste = await gestellteRechnung();

    await warteAufZeile(erste.id);
    await dienst.verarbeiten();

    const zweite = await gestellteRechnung(5000);

    await warteAufZeile(zweite.id);
    expect(await dienst.trennen(inhaberin)).toBe(true);

    expect(
      await dataSource.getRepository(BuchhaltungVerbindungEntity).count(),
    ).toBe(0);
    expect(
      await dataSource.getRepository(BuchhaltungKontaktEntity).count(),
    ).toBe(0);
    expect((await uebertragung(erste.id)).status).toBe('uebertragen');
    expect((await uebertragung(zweite.id)).status).toBe('fehler');
  });
});

describe('Rechte', () => {
  const resolver = () =>
    new BuchhaltungResolver(
      dienst,
      new PermissionsService(
        dataSource.getRepository(MembershipEntity),
        dataSource.getRepository(RoleEntity),
      ),
    );

  const rolle = async (
    name: string,
    permissions: Permission[],
    sichtbarkeit: Record<string, string> = {},
  ): Promise<RequestUser> => {
    const m = dataSource.manager;
    const email = `${name.toLowerCase()}@wir.test`;
    const userId = (
      await m.save(
        m.create(UserEntity, {
          email,
          passwordHash: 'x',
          firstName: name,
          lastName: 'B',
        }),
      )
    ).id;
    const role = await m.save(
      m.create(RoleEntity, {
        workspaceId,
        name,
        permissions,
        sichtbarkeit: sichtbarkeit as never,
      }),
    );

    await m.save(
      m.create(MembershipEntity, {
        workspaceId,
        userId,
        role: MembershipRole.MEMBER,
        roleId: role.id,
      }),
    );

    return { userId, workspaceId, email } as RequestUser;
  };

  it('verbindet nicht, wer zwar Schlüssel verwaltet, aber nicht alle Rechnungen sieht', async () => {
    const nurApi = await rolle('NurApi', [Permission.API_MANAGE]);

    await expect(
      resolver().buchhaltungVerbinden(nurApi, {
        anbieter: 'lexware',
        schluessel: LEX_SCHLUESSEL,
      }),
    ).rejects.toThrow(ForbiddenException);

    const ohneSchreiben = await rolle('OhneSchreiben', [
      Permission.API_MANAGE,
      Permission.INVOICE_VIEW,
    ]);

    await expect(
      resolver().buchhaltungVerbinden(ohneSchreiben, {
        anbieter: 'lexware',
        schluessel: LEX_SCHLUESSEL,
      }),
    ).rejects.toThrow(ForbiddenException);

    const nurEigene = await rolle(
      'NurEigene',
      [
        Permission.API_MANAGE,
        Permission.INVOICE_VIEW,
        Permission.INVOICE_WRITE,
      ],
      { company: 'eigene' },
    );

    await expect(
      resolver().buchhaltungVerbinden(nurEigene, {
        anbieter: 'lexware',
        schluessel: LEX_SCHLUESSEL,
      }),
    ).rejects.toThrow(/alle Firmen, Kontakte und Geschäfte/u);
    expect(
      await dataSource.getRepository(BuchhaltungVerbindungEntity).count(),
    ).toBe(0);
    expect(lexware.anfragen).toHaveLength(0);

    await verbinden();
    await expect(
      resolver().buchhaltungEinstellen(nurApi, { zahlungenAbgleichen: true }),
    ).rejects.toThrow(ForbiddenException);
    await expect(resolver().buchhaltungTrennen(nurApi)).resolves.toBe(true);
  });

  it('sendet und zählt mit der Sammelaktion nur Rechnungen, die die Person sieht', async () => {
    await verbinden();
    await dienst.einstellen(inhaberin, { automatisch: false });

    const m = dataSource.manager;
    const nurEigene = await rolle(
      'Vertrieb',
      [Permission.INVOICE_VIEW, Permission.INVOICE_ISSUE],
      { company: 'eigene' },
    );

    await m.update(CompanyEntity, firmaId, { ownerId: inhaberin.userId });

    const fremd = await gestellteRechnung();
    const eigeneFirma = (
      await m.save(
        m.create(CompanyEntity, {
          workspaceId,
          name: 'Eigene Kundschaft GmbH',
          ownerId: nurEigene.userId,
        }),
      )
    ).id;
    const entwurf = await rechnungen.create(workspaceId, {
      companyId: eigeneFirma,
      recipientAddress: 'Eigene Kundschaft GmbH\nHafenstraße 2\n20457 Hamburg',
      serviceDate: '2026-10-15',
    });

    await rechnungen.setLines(workspaceId, entwurf.id, [
      {
        name: 'Beratung',
        quantity: 1,
        unit: 'Pauschal',
        unitPriceCents: 1000,
        taxRatePercent: 19,
      },
    ]);

    const eigen = await rechnungen.issue(workspaceId, entwurf.id);
    const permissions = new PermissionsService(
      dataSource.getRepository(MembershipEntity),
      dataSource.getRepository(RoleEntity),
    );
    const als = <T>(wer: RequestUser, tun: () => Promise<T>): Promise<T> =>
      runWithRequestContext({ requestId: 'test', userId: wer.userId }, () => {
        setzeSichtfeld(() => permissions.sichtfeldFuer(wer));

        return tun();
      });

    expect(
      await als(nurEigene, () => dienst.zaehlen(workspaceId)),
    ).toMatchObject({ nichtUebertragen: 1 });
    expect(await dienst.zaehlen(workspaceId)).toMatchObject({
      nichtUebertragen: 2,
    });

    expect(
      await als(nurEigene, () => resolver().offeneAnBuchhaltung(nurEigene)),
    ).toBe(1);
    expect((await uebertragung(eigen.id)).status).toBe('wartet');
    expect(
      await dataSource
        .getRepository(BuchhaltungUebertragungEntity)
        .countBy({ invoiceId: fremd.id }),
    ).toBe(0);

    await dataSource.query(
      `INSERT INTO buchhaltung_uebertragungen ("workspaceId", "invoiceId", anbieter, status)
       VALUES ($1, $2, 'lexware', 'fehler')`,
      [workspaceId, fremd.id],
    );
    await als(nurEigene, () => dienst.alleEinreihen(workspaceId));
    expect((await uebertragung(fremd.id)).status).toBe('fehler');
  });

  it('lässt nur verbinden, wer API-Schlüssel und Webhooks verwaltet', async () => {
    await expect(
      resolver().buchhaltungVerbinden(buchhalter, {
        anbieter: 'lexware',
        schluessel: LEX_SCHLUESSEL,
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(resolver().buchhaltungTrennen(buchhalter)).rejects.toThrow(
      ForbiddenException,
    );

    const verbunden = await resolver().buchhaltungVerbinden(inhaberin, {
      anbieter: 'lexware',
      schluessel: LEX_SCHLUESSEL,
    });

    expect(verbunden.anbieter).toBe('lexware');
  });

  it('zeigt den Stand auch, wer nur Rechnungen sieht, aber lässt ihn nicht senden', async () => {
    await verbinden();

    const rechnung = await gestellteRechnung();

    expect(
      (await resolver().buchhaltungVerbindung(buchhalter))?.kontoName,
    ).toBe('Testfirma GmbH');
    await expect(
      resolver().rechnungAnBuchhaltung(buchhalter, rechnung.id),
    ).rejects.toThrow(ForbiddenException);
  });

  it('zeigt einem anderen Bereich nichts und sendet dort keine fremde Rechnung', async () => {
    await verbinden();

    const rechnung = await gestellteRechnung();

    expect(await resolver().buchhaltungVerbindung(fremde)).toBeNull();
    await expect(
      resolver().rechnungAnBuchhaltung(fremde, rechnung.id),
    ).rejects.toThrow(/keine Buchhaltung verbunden/u);

    await dataSource.getRepository(BuchhaltungVerbindungEntity).insert({
      workspaceId: andererBereich,
      anbieter: 'lexware',
      schluesselVersiegelt: (
        (await dataSource.query(
          'SELECT "schluesselVersiegelt" FROM buchhaltung_verbindungen LIMIT 1',
        )) as { schluesselVersiegelt: string }[]
      )[0].schluesselVersiegelt,
      anbieterDaten: {} as never,
    });
    await expect(
      resolver().rechnungAnBuchhaltung(fremde, rechnung.id),
    ).rejects.toThrow(/nicht gefunden/u);
  });

  it('prüft das Abo vor jedem schreibenden Schritt, nicht vor dem Trennen', () => {
    const wachen = (methode: keyof BuchhaltungResolver) =>
      Reflect.getMetadata(
        GUARDS_METADATA,
        BuchhaltungResolver.prototype[methode] as object,
      ) as unknown[] | undefined;

    expect(Reflect.getMetadata(GUARDS_METADATA, BuchhaltungResolver)).toEqual([
      GqlAuthGuard,
      NurMenschWache,
    ]);
    expect(wachen('buchhaltungVerbinden')).toContain(BillingWriteGuard);
    expect(wachen('buchhaltungEinstellen')).toContain(BillingWriteGuard);
    expect(wachen('rechnungAnBuchhaltung')).toContain(BillingWriteGuard);
    expect(wachen('offeneAnBuchhaltung')).toContain(BillingWriteGuard);
    expect(wachen('buchhaltungTrennen') ?? []).not.toContain(BillingWriteGuard);
  });
});
