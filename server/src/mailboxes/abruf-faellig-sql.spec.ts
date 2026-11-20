import { type DataSource } from 'typeorm';

import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import {
  type FehlerArt,
  wiederFaellig,
  wiederFaelligSql,
} from './abruf-fehler';

const SUITE = 'abruf_faellig_sql';
const MIN = 60_000;
const JETZT = new Date('2026-10-20T08:00:00Z');

jest.setTimeout(60_000);

let dataSource: DataSource;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

const imSql = async (
  fehlerArt: FehlerArt | null,
  fehlversuche: number,
  letzter: Date | null,
): Promise<boolean> => {
  const bedingung = wiederFaelligSql('t.letzter');
  const [sql, werte] = dataSource.driver.escapeQueryWithParameters(
    `SELECT ${bedingung.sql} AS faellig
       FROM (SELECT :art::text AS "fehlerArt", :versuche::int AS "fehlversuche",
                    :letzter::timestamptz AS letzter) t`,
    {
      ...bedingung.parameter,
      wfJetzt: JETZT,
      art: fehlerArt,
      versuche: fehlversuche,
      letzter,
    },
    {},
  );
  const [zeile] = (await dataSource.query(sql, werte)) as {
    faellig: boolean;
  }[];

  return zeile.faellig;
};

describe('wiederFaelligSql', () => {
  it.each<[FehlerArt | null, number, number | null]>([
    ['voruebergehend', 1, 9],
    ['voruebergehend', 1, 8],
    ['voruebergehend', 2, 15],
    ['voruebergehend', 2, 19],
    ['voruebergehend', 3, 39],
    ['voruebergehend', 3, 30],
    ['voruebergehend', 12, 359],
    ['voruebergehend', 12, 300],
    ['voruebergehend', 40, 359],
    ['anmeldung', 1, 59],
    ['anmeldung', 1, 50],
    ['sonstig', 5, 70],
    [null, 0, 30],
    ['voruebergehend', 3, null],
  ])('%s nach %i Versuchen, vor %s Minuten: wie in JS', async (art, n, vor) => {
    const letzter = vor === null ? null : new Date(JETZT.getTime() - vor * MIN);

    expect(await imSql(art, n, letzter)).toBe(
      wiederFaellig({ fehlerArt: art, fehlversuche: n }, letzter, JETZT),
    );
  });
});
