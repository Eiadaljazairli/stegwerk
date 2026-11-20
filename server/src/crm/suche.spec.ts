import { type DataSource } from 'typeorm';

import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { runWithRequestContext } from '../observability/request-context';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { type Feldrechte } from '../workspaces/feldrechte';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { setzeSichtfeld, type Sichtbarkeit } from '../workspaces/sichtbarkeit';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { CompaniesService } from './companies.service';
import { ContactsService } from './contacts.service';
import { DealsService } from './deals.service';
import { CompanyEntity } from './entities/company.entity';
import { ContactEntity } from './entities/contact.entity';
import { DealEntity } from './entities/deal.entity';
import { TaskEntity } from './entities/task.entity';
import { suchBedingung, suchWoerter } from './suche';
import { TasksService } from './tasks.service';

const SUITE = 'suche';

jest.setTimeout(60_000);

let dataSource: DataSource;
let firmen: CompaniesService;
let kontakte: ContactsService;
let geschaefte: DealsService;
let workspaceId: string;
let andererBereich: string;
let annaId: string;
let jonasId: string;

const als = <T>(
  ich: string,
  arten: Partial<Sichtbarkeit>,
  felder: Feldrechte,
  callback: () => Promise<T>,
): Promise<T> =>
  runWithRequestContext({ requestId: 'test' }, () => {
    setzeSichtfeld(() =>
      Promise.resolve({
        ich,
        arten: { company: 'alle', contact: 'alle', deal: 'alle', ...arten },
        felder,
      }),
    );

    return callback();
  });

const namen = (liste: { name: string }[]) => liste.map((f) => f.name).sort();

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);

  const felder = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
  );

  firmen = new CompaniesService(
    dataSource.getRepository(CompanyEntity),
    felder,
  );
  kontakte = new ContactsService(
    dataSource.getRepository(ContactEntity),
    felder,
  );
  geschaefte = new DealsService(dataSource.getRepository(DealEntity), felder);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE deals, contacts, companies, memberships, users, workspaces CASCADE',
  );

  const bereiche = dataSource.getRepository(WorkspaceEntity);
  const nutzer = dataSource.getRepository(UserEntity);

  workspaceId = (await bereiche.save({ name: 'Wir', slug: 'wir' })).id;
  andererBereich = (await bereiche.save({ name: 'Andere', slug: 'andere' })).id;

  const person = async (vorname: string) =>
    (
      await nutzer.save(
        nutzer.create({
          email: `${vorname.toLowerCase()}@wir.de`,
          passwordHash: 'x',
          firstName: vorname,
          lastName: 'Muster',
        }),
      )
    ).id;

  annaId = await person('Anna');
  jonasId = await person('Jonas');

  const mitglieder = dataSource.getRepository(MembershipEntity);

  await mitglieder.save([
    mitglieder.create({
      workspaceId,
      userId: annaId,
      role: MembershipRole.OWNER,
    }),
    mitglieder.create({
      workspaceId,
      userId: jonasId,
      role: MembershipRole.MEMBER,
    }),
  ]);
});

describe('die Wörter', () => {
  it('zerlegt am Leerraum und begrenzt Anzahl und Länge', () => {
    expect(suchWoerter('  Max   Müller ')).toEqual(['Max', 'Müller']);
    expect(suchWoerter('a b c d e f g h')).toHaveLength(6);
    expect(suchWoerter('x'.repeat(300))[0]).toHaveLength(100);
    expect(suchWoerter(null)).toEqual([]);
  });
});

describe('die Liste', () => {
  it('findet Müller als Mueller, Muller und MÜLLER', async () => {
    await firmen.create(workspaceId, { name: 'Müller Bau' });
    await firmen.create(workspaceId, { name: 'Meier Holz' });

    for (const suche of ['Mueller', 'muller', 'MÜLLER', 'müll']) {
      const treffer = await firmen.list(workspaceId, { search: suche });

      expect(namen(treffer.items)).toEqual(['Müller Bau']);
    }
  });

  it('ignoriert Akzente und schreibt ß wie ss', async () => {
    await firmen.create(workspaceId, { name: 'Café Élodie' });
    await firmen.create(workspaceId, { name: 'Großhandel Süd' });

    expect(
      namen((await firmen.list(workspaceId, { search: 'cafe elodie' })).items),
    ).toEqual(['Café Élodie']);
    expect(
      namen((await firmen.list(workspaceId, { search: 'grosshandel' })).items),
    ).toEqual(['Großhandel Süd']);
  });

  it('findet „Max Müller“, obwohl die Namen in zwei Spalten stehen', async () => {
    await kontakte.create(workspaceId, {
      firstName: 'Max',
      lastName: 'Müller',
    });
    await kontakte.create(workspaceId, { firstName: 'Max', lastName: 'Meier' });

    const treffer = await kontakte.list(workspaceId, { search: 'max mueller' });

    expect(treffer.items.map((k) => k.lastName)).toEqual(['Müller']);
  });

  it('nimmt % und _ wörtlich, nicht als Platzhalter', async () => {
    await firmen.create(workspaceId, { name: '100% Bio' });
    await firmen.create(workspaceId, { name: 'Anderes' });

    expect(
      namen((await firmen.list(workspaceId, { search: '%' })).items),
    ).toEqual(['100% Bio']);
    expect((await firmen.list(workspaceId, { search: '_' })).items).toEqual([]);
  });

  it('nimmt auch vollbreite ％ ＿ ＼ wörtlich, die unaccent zu % _ \\ macht', async () => {
    await firmen.create(workspaceId, { name: '100% Bio' });
    await firmen.create(workspaceId, { name: 'abc' });
    await firmen.create(workspaceId, { name: 'a_c Werk' });

    expect(
      namen((await firmen.list(workspaceId, { search: '％' })).items),
    ).toEqual(['100% Bio']);
    expect(
      namen((await firmen.list(workspaceId, { search: 'a＿c' })).items),
    ).toEqual(['a_c Werk']);
    expect((await firmen.list(workspaceId, { search: '＼' })).items).toEqual(
      [],
    );
  });

  it('findet keine Tippfehler — eine Liste zeigt, was dasteht', async () => {
    await kontakte.create(workspaceId, {
      firstName: 'Hans',
      lastName: 'Schmidt',
    });

    expect(
      (await kontakte.list(workspaceId, { search: 'Schmitt' })).items,
    ).toEqual([]);
  });

  it('durchsucht kein verborgenes Feld', async () => {
    await kontakte.create(workspaceId, {
      firstName: 'Eva',
      lastName: 'Kurz',
      email: 'geheim@kunde.de',
    });

    const treffer = await als(
      jonasId,
      {},
      { 'contact.email': 'verborgen' },
      () => kontakte.list(workspaceId, { search: 'geheim' }),
    );

    expect(treffer.items).toEqual([]);
  });
});

describe('die Palette', () => {
  it('findet vertippte Namen ab vier Buchstaben', async () => {
    await kontakte.create(workspaceId, {
      firstName: 'Hans',
      lastName: 'Schmidt',
    });

    const treffer = await kontakte.rangSuche(workspaceId, 'Schmitt', 10);

    expect(treffer.map((t) => t.eintrag.lastName)).toEqual(['Schmidt']);
  });

  it('stellt den genauen Namen vor den Anfang und den Anfang vor den Rest', async () => {
    await firmen.create(workspaceId, { name: 'Nord Logistik' });
    await firmen.create(workspaceId, { name: 'Nord' });
    await firmen.create(workspaceId, { name: 'Hafen Nord' });

    const treffer = await firmen.rangSuche(workspaceId, 'nord', 10);

    expect(treffer.map((t) => t.eintrag.name)).toEqual([
      'Nord',
      'Nord Logistik',
      'Hafen Nord',
    ]);
    expect(treffer[0].rang).toBeGreaterThan(treffer[1].rang);
  });

  it('wertet ％ und ＿ auch in der Rangfolge nicht als Platzhalter', async () => {
    await firmen.create(workspaceId, { name: 'Nord ％ Logistik' });
    await firmen.create(workspaceId, { name: 'Nordxx' });
    await firmen.create(workspaceId, { name: 'Nord_ Bau' });

    const prozent = await firmen.rangSuche(workspaceId, 'nord％', 10);
    const strich = await firmen.rangSuche(workspaceId, 'nord＿', 10);

    expect(prozent.every((t) => t.rang < 2)).toBe(true);
    expect(
      strich.filter((t) => t.rang >= 2).map((t) => t.eintrag.name),
    ).toEqual(['Nord_ Bau']);
  });

  it('zeigt nur sichtbare Datensätze und nichts aus dem Papierkorb', async () => {
    await firmen.create(workspaceId, { name: 'Alpha Eigen', ownerId: jonasId });
    await firmen.create(workspaceId, { name: 'Alpha Fremd', ownerId: annaId });
    const weg = await firmen.create(workspaceId, { name: 'Alpha Weg' });

    await firmen.create(andererBereich, { name: 'Alpha Andere' });
    await firmen.remove(workspaceId, weg.id);

    const treffer = await als(jonasId, { company: 'eigene' }, {}, () =>
      firmen.rangSuche(workspaceId, 'alpha', 10),
    );

    expect(treffer.map((t) => t.eintrag.name)).toEqual(['Alpha Eigen']);
  });

  it('liest bei Geschäften und Aufgaben die Suchindexe, nicht die ganze Tabelle', async () => {
    const aufgaben = new TasksService(
      dataSource.getRepository(TaskEntity),
      new CustomFieldsService(dataSource.getRepository(CustomFieldDefinition)),
    );

    for (const [dienst, tabelle] of [
      [geschaefte, 'deals'],
      [aufgaben, 'tasks'],
    ] as const) {
      const ausdruecke = (
        dienst as unknown as { suchAusdruecke(v: Set<string>): string[] }
      ).suchAusdruecke(new Set());
      const bedingung = suchBedingung(ausdruecke, ['abc'], 'p');
      const sql = `EXPLAIN SELECT record."id" FROM "${tabelle}" record WHERE ${String(
        bedingung?.where,
      ).replace(/:p_w0/gu, '$1')}`;
      const plan = (await dataSource.transaction(async (manager) => {
        await manager.query('SET LOCAL enable_seqscan = off');

        return manager.query(sql, ['abc']);
      })) as { 'QUERY PLAN': string }[];

      expect(plan.map((zeile) => zeile['QUERY PLAN']).join('\n')).not.toMatch(
        /Seq Scan/u,
      );
    }
  });

  it('findet ein Geschäft über seinen Namen', async () => {
    await geschaefte.create(workspaceId, {
      name: 'Wartungsvertrag Düsseldorf',
    });

    const treffer = await geschaefte.rangSuche(workspaceId, 'duesseldorf', 10);

    expect(treffer.map((t) => t.eintrag.name)).toEqual([
      'Wartungsvertrag Düsseldorf',
    ]);
  });
});
