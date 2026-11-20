import { type DataSource } from 'typeorm';

import { runWithRequestContext } from '../observability/request-context';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { meldeSicherheit } from './melden';
import { AUFBEWAHRUNG_TAGE, SicherheitService } from './sicherheit.service';

const SUITE = 'sicherheit';

jest.setTimeout(60_000);

let dataSource: DataSource;
let dienst: SicherheitService;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  dienst = new SicherheitService(dataSource);
  dienst.onModuleInit();
});

afterAll(async () => {
  dienst.onModuleDestroy();
  await dropTestDatabase(dataSource, SUITE);
});

const warte = () => new Promise((r) => setTimeout(r, 150));

it('schreibt Meldungen mit Gerät aus dem Kontext und trennt die Sichten', async () => {
  const m = dataSource.manager;
  const bereich = await m.save(
    m.create(WorkspaceEntity, { name: 'S', slug: 's' }),
  );
  const fremd = await m.save(
    m.create(WorkspaceEntity, { name: 'F', slug: 'f' }),
  );
  const anna = await m.save(
    m.create(UserEntity, {
      email: 'anna@s.test',
      passwordHash: 'x',
      firstName: 'Anna',
      lastName: 'S',
    }),
  );
  const ben = await m.save(
    m.create(UserEntity, {
      email: 'ben@s.test',
      passwordHash: 'x',
      firstName: 'Ben',
      lastName: 'S',
    }),
  );

  runWithRequestContext(
    {
      requestId: 'r',
      userId: anna.id,
      geraet: 'Chrome auf Windows',
      ipGekuerzt: '203.0.113.0',
    },
    () => {
      meldeSicherheit({
        art: 'anmeldung',
        userId: anna.id,
        workspaceId: bereich.id,
      });
      meldeSicherheit({
        art: 'rolle_geaendert',
        userId: ben.id,
        workspaceId: bereich.id,
        details: { rolle: 'Admin' },
      });
    },
  );
  meldeSicherheit({ art: 'anmeldung', userId: ben.id, workspaceId: fremd.id });
  await warte();

  const imBereich = await dienst.bereich(bereich.id);

  expect(imBereich.map((e) => e.art).sort()).toEqual([
    'anmeldung',
    'rolle_geaendert',
  ]);
  expect(imBereich.find((e) => e.art === 'rolle_geaendert')).toMatchObject({
    person: 'Ben S',
    handelnd: 'Anna S',
    geraet: 'Chrome auf Windows',
    ipGekuerzt: '203.0.113.0',
  });

  expect((await dienst.meinVerlauf(ben.id)).map((e) => e.art).sort()).toEqual([
    'anmeldung',
    'rolle_geaendert',
  ]);
});

it('löscht nach der Frist', async () => {
  meldeSicherheit({ art: 'export' });
  await warte();

  const spaeter = new Date(Date.now() + (AUFBEWAHRUNG_TAGE + 1) * 86_400_000);

  expect(await dienst.aufraeumen(spaeter)).toBeGreaterThan(0);
});
