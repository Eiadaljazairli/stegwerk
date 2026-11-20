import { BadRequestException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { lineNetCents } from '../quotes/quote-totals';
import { runWithRequestContext } from '../observability/request-context';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { MembershipRole } from '../workspaces/membership.entity';
import { MembershipEntity } from '../workspaces/membership.entity';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { RoleEntity } from '../workspaces/role.entity';
import { setzeSichtfeld } from '../workspaces/sichtbarkeit';
import { type Kachel, pruefeKachel } from './kacheln';
import { type KachelInput } from './uebersicht.dto';
import { UebersichtResolver } from './uebersicht.resolver';
import { UebersichtService } from './uebersicht.service';

const SUITE = 'rechnungs_kacheln';

jest.setTimeout(60_000);

let dataSource: DataSource;
let permissions: PermissionsService;
let resolver: UebersichtResolver;
let dienst: UebersichtService;
let workspaceId: string;
let fremderBereich: string;
const leute = {} as Record<
  'inhaber' | 'ohneRechnungen' | 'eigeneFirmen',
  RequestUser
>;

const als = <T>(wer: RequestUser, tun: () => Promise<T>): Promise<T> =>
  runWithRequestContext({ requestId: 'test' }, () => {
    setzeSichtfeld(() => permissions.sichtfeldFuer(wer));

    return tun();
  });

const k = (teil: Record<string, unknown>): Kachel =>
  pruefeKachel({ id: 'k', ...teil });

const rechne = (wer: RequestUser, teil: Record<string, unknown>) =>
  als(wer, () => dienst.werte(wer.workspaceId, wer.userId, k(teil)));

const sql = (text: string, werte: unknown[] = []) =>
  dataSource.query(text, werte) as Promise<{ id: string }[]>;

const rechnung = async (
  bereich: string,
  status: string,
  companyId: string | null,
  positionen: { menge: number; preis: number; rabatt?: number }[],
  extra: { korrigiert?: string; am?: string } = {},
): Promise<string> => {
  const id = (
    await sql(
      `INSERT INTO "invoices" ("workspaceId", "status", "companyId", "issuedOn", "correctsInvoiceId")
       VALUES ($1, $2, $3, $4, $5) RETURNING "id"`,
      [
        bereich,
        status,
        companyId,
        extra.am ?? new Date().toISOString().slice(0, 10),
        extra.korrigiert ?? null,
      ],
    )
  )[0].id;

  for (const [stelle, p] of positionen.entries()) {
    await sql(
      `INSERT INTO "invoice_lines" ("invoiceId", "position", "name", "quantity", "unit", "unitPriceCents", "discountPercent", "taxRatePercent")
       VALUES ($1, $2, 'Leistung', $3, 'Stk', $4, $5, 19)`,
      [id, stelle, p.menge, p.preis, p.rabatt ?? 0],
    );
  }

  return id;
};

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  permissions = new PermissionsService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(RoleEntity),
  );
  dienst = new UebersichtService(dataSource);
  resolver = new UebersichtResolver(permissions, dienst);

  const bereich = async (name: string) =>
    (
      await sql(
        `INSERT INTO "workspaces" ("name", "slug") VALUES ($1, $1) RETURNING "id"`,
        [name],
      )
    )[0].id;

  workspaceId = await bereich('umsatz');
  fremderBereich = await bereich('umsatz-fremd');

  const rolle = async (
    name: string,
    everything: boolean,
    rechte: Permission[],
    sichtbarkeit: Record<string, string> = {},
  ) =>
    (
      await sql(
        `INSERT INTO "roles" ("workspaceId", "name", "everything", "permissions", "sichtbarkeit")
         VALUES ($1, $2, $3, $4, $5) RETURNING "id"`,
        [
          workspaceId,
          name,
          everything,
          JSON.stringify(rechte),
          JSON.stringify({
            company: 'alle',
            contact: 'alle',
            deal: 'alle',
            ...sichtbarkeit,
          }),
        ],
      )
    )[0].id;
  const person = async (email: string, roleId: string, art: MembershipRole) => {
    const id = (
      await sql(
        `INSERT INTO "users" ("email", "passwordHash", "firstName", "lastName")
         VALUES ($1, 'x', 'A', 'B') RETURNING "id"`,
        [email],
      )
    )[0].id;

    await sql(
      `INSERT INTO "memberships" ("userId", "workspaceId", "role", "roleId") VALUES ($1, $2, $3, $4)`,
      [id, workspaceId, art, roleId],
    );

    return { userId: id, workspaceId, email } as RequestUser;
  };

  leute.inhaber = await person(
    'chef@umsatz.test',
    await rolle('Inhaber', true, []),
    MembershipRole.OWNER,
  );
  leute.ohneRechnungen = await person(
    'vertrieb@umsatz.test',
    await rolle('Vertrieb', false, [Permission.DEAL_VIEW]),
    MembershipRole.MEMBER,
  );
  leute.eigeneFirmen = await person(
    'buchhaltung@umsatz.test',
    await rolle(
      'Buchhaltung',
      false,
      [Permission.INVOICE_VIEW, Permission.COMPANY_VIEW],
      { company: 'eigene' },
    ),
    MembershipRole.MEMBER,
  );

  const firma = async (
    name: string,
    industry: string | null,
    herkunft: string | null,
    ownerId: string | null,
    bereichId = workspaceId,
  ) =>
    (
      await sql(
        `INSERT INTO "companies" ("workspaceId", "name", "industry", "herkunft", "ownerId")
         VALUES ($1, $2, $3, $4, $5) RETURNING "id"`,
        [bereichId, name, industry, herkunft, ownerId],
      )
    )[0].id;

  const bau = await firma(
    'Bau AG',
    'Bau',
    'webformular',
    leute.eigeneFirmen.userId,
  );
  const handel = await firma('Handel KG', 'Handel', null, leute.inhaber.userId);
  const fremd = await firma('Fremd GmbH', 'Bau', null, null, fremderBereich);

  await rechnung(workspaceId, 'paid', bau, [{ menge: 2, preis: 50_000 }]);
  await rechnung(workspaceId, 'issued', bau, [{ menge: 1, preis: 50_000 }]);
  const storniert = await rechnung(workspaceId, 'cancelled', handel, [
    { menge: 1, preis: 80_000 },
  ]);

  await rechnung(
    workspaceId,
    'issued',
    handel,
    [{ menge: -1, preis: 80_000 }],
    {
      korrigiert: storniert,
    },
  );
  await rechnung(workspaceId, 'paid', handel, [
    { menge: 3, preis: 10_000, rabatt: 10 },
  ]);
  await rechnung(workspaceId, 'draft', bau, [{ menge: 10, preis: 100_000 }]);
  await rechnung(workspaceId, 'paid', null, [{ menge: 1, preis: 12_345 }]);
  await rechnung(workspaceId, 'paid', bau, [{ menge: 1, preis: 99_900 }], {
    am: `${String(new Date().getFullYear() - 1)}-06-15`,
  });
  await rechnung(fremderBereich, 'paid', fremd, [
    { menge: 1, preis: 1_000_000 },
  ]);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

describe('Umsatz aus Rechnungen', () => {
  it('summiert gestellte Rechnungen netto; Storno hebt auf, Entwurf zählt nicht', async () => {
    const ergebnis = await rechne(leute.inhaber, {
      typ: 'kennzahl',
      objekt: 'invoice',
      mass: 'summe',
      zeitraum: 'jahr',
    });

    expect(ergebnis.wert).toBeCloseTo(1893.45, 2);
    expect(ergebnis.anzahl).toBe(6);
  });

  it('rundet je Position wie die Rechnung selbst', async () => {
    const zeile = {
      quantity: 3,
      unitPriceCents: 10_000,
      discountPercent: 10,
      taxRatePercent: 19,
    };

    expect(lineNetCents(zeile)).toBe(27_000);
  });

  it('unterscheidet offen und bezahlt', async () => {
    const offen = await rechne(leute.inhaber, {
      typ: 'kennzahl',
      objekt: 'invoice',
      mass: 'summe',
      status: 'offen',
    });
    const bezahlt = await rechne(leute.inhaber, {
      typ: 'kennzahl',
      objekt: 'invoice',
      mass: 'summe',
      status: 'bezahlt',
      zeitraum: 'jahr',
    });

    expect(offen.wert).toBeCloseTo(500, 2);
    expect(bezahlt.wert).toBeCloseTo(1393.45, 2);
  });

  it('wird unter „bezahlt“ nicht negativ, wenn an der Korrektur eine Erstattung gebucht ist', async () => {
    const bereich = (
      await sql(
        `INSERT INTO "workspaces" ("name", "slug") VALUES ('erstattung', 'erstattung') RETURNING "id"`,
      )
    )[0].id;
    const rolle = (
      await sql(
        `INSERT INTO "roles" ("workspaceId", "name", "everything", "permissions", "sichtbarkeit")
         VALUES ($1, 'Inhaber', true, '[]', '{}') RETURNING "id"`,
        [bereich],
      )
    )[0].id;
    const userId = (
      await sql(
        `INSERT INTO "users" ("email", "passwordHash", "firstName", "lastName")
         VALUES ('chef@erstattung.test', 'x', 'A', 'B') RETURNING "id"`,
      )
    )[0].id;

    await sql(
      `INSERT INTO "memberships" ("userId", "workspaceId", "role", "roleId") VALUES ($1, $2, $3, $4)`,
      [userId, bereich, MembershipRole.OWNER, rolle],
    );

    const chef = { userId, workspaceId: bereich } as RequestUser;
    const bezahlt = async () =>
      (
        await rechne(chef, {
          typ: 'kennzahl',
          objekt: 'invoice',
          mass: 'summe',
          status: 'bezahlt',
          zeitraum: 'jahr',
        })
      ).wert;

    const original = await rechnung(bereich, 'cancelled', null, [
      { menge: 1, preis: 100_000 },
    ]);

    await rechnung(bereich, 'paid', null, [{ menge: -1, preis: 100_000 }], {
      korrigiert: original,
    });

    expect(await bezahlt()).toBeCloseTo(0, 2);

    await rechnung(bereich, 'paid', null, [{ menge: 1, preis: 50_000 }]);

    expect(await bezahlt()).toBeCloseTo(500, 2);
  });

  it('gruppiert nach Branche, Herkunft und Kunde über die Firma', async () => {
    const zeilen = async (gruppe: string) =>
      (
        await rechne(leute.inhaber, {
          typ: 'balken',
          objekt: 'invoice',
          mass: 'summe',
          gruppe,
          zeitraum: 'jahr',
        })
      ).balken
        .map((b) => [b.label, Math.round((b.wert ?? 0) * 100) / 100])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

    expect(await zeilen('branche')).toEqual([
      ['Bau', 1500],
      ['Handel', 270],
      ['Ohne Branche', 123.45],
    ]);
    expect(await zeilen('herkunft')).toEqual([
      ['Unbekannt', 393.45],
      ['Webformular', 1500],
    ]);
    expect(await zeilen('kunde')).toEqual([
      ['Bau AG', 1500],
      ['Handel KG', 270],
      ['Ohne Firma', 123.45],
    ]);
  });

  it('nach Monat am Rechnungsdatum', async () => {
    const ergebnis = await rechne(leute.inhaber, {
      typ: 'balken',
      objekt: 'invoice',
      mass: 'summe',
      gruppe: 'monat',
      zeitraum: 'jahr',
    });
    const jetzt = new Date();
    const monat = `${String(jetzt.getFullYear())}-${String(jetzt.getMonth() + 1).padStart(2, '0')}`;

    expect(
      ergebnis.balken.find((b) => b.schluessel === monat)?.wert,
    ).toBeCloseTo(1893.45, 2);
  });

  it('zählt nur Rechnungen an Firmen, die die Rolle sieht', async () => {
    const ergebnis = await rechne(leute.eigeneFirmen, {
      typ: 'balken',
      objekt: 'invoice',
      mass: 'summe',
      gruppe: 'branche',
      zeitraum: 'jahr',
    });

    expect(
      ergebnis.balken
        .map((b) => [b.label, Math.round((b.wert ?? 0) * 100) / 100])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ['Bau', 1500],
      ['Ohne Branche', 123.45],
    ]);
  });

  it('sperrt die Kachel ohne Recht auf Rechnungen', async () => {
    const ergebnis = await als(leute.ohneRechnungen, () =>
      resolver.kachelWerte(leute.ohneRechnungen, {
        id: 'k',
        typ: 'kennzahl',
        objekt: 'invoice',
        mass: 'summe',
      } as KachelInput),
    );

    expect(ergebnis).toMatchObject({ gesperrt: true, wert: null });
  });

  it('nimmt für Rechnungen weder eigene Felder noch „nur meine“', () => {
    expect(() =>
      k({ typ: 'balken', objekt: 'invoice', gruppe: 'feld:quelle' }),
    ).toThrow(BadRequestException);
    expect(
      k({ typ: 'kennzahl', objekt: 'invoice', nurMeine: true }).nurMeine,
    ).toBe(false);
    expect(() =>
      k({ typ: 'kennzahl', objekt: 'invoice', status: 'gewonnen' }),
    ).toThrow(BadRequestException);
  });
});
