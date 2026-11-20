import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { databaseSsl, databaseUrl } from './database-ssl';

type Bestand = {
  tabellen: Map<string, number>;
  wanderungen: string[];
};

const verbinde = async (url: string, caCert?: string): Promise<DataSource> => {
  const quelle = new DataSource({
    type: 'postgres',
    url: databaseUrl(url, caCert),
    ssl: databaseSsl(caCert),
    entities: [],
    synchronize: false,
  });

  await quelle.initialize();

  return quelle;
};

const lies = async (quelle: DataSource): Promise<Bestand> => {
  const namen = await quelle.query<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename`,
  );

  const tabellen = new Map<string, number>();

  for (const { tablename } of namen) {
    const [{ anzahl }] = await quelle.query<{ anzahl: string }[]>(
      `SELECT count(*)::text AS anzahl FROM "${tablename}"`,
    );

    tabellen.set(tablename, Number(anzahl));
  }

  const wanderungen = tabellen.has('migrations')
    ? (
        await quelle.query<{ name: string }[]>(
          'SELECT name FROM migrations ORDER BY timestamp',
        )
      ).map((z) => z.name)
    : [];

  return { tabellen, wanderungen };
};

const run = async (): Promise<void> => {
  loadEnv();

  const vonUrl = process.env.VON;
  const nachUrl = process.env.NACH;

  if (vonUrl === undefined || nachUrl === undefined) {
    // oxlint-disable-next-line no-console
    console.error(
      'VON und NACH müssen gesetzt sein:\n' +
        "  VON='postgres://…' NACH='postgres://…' node dist/database/compare.js",
    );
    process.exitCode = 2;

    return;
  }

  const von = await verbinde(vonUrl, process.env.VON_CA_CERT);
  const nach = await verbinde(nachUrl, process.env.NACH_CA_CERT);

  try {
    const a = await lies(von);
    const b = await lies(nach);

    const alle = [
      ...new Set([...a.tabellen.keys(), ...b.tabellen.keys()]),
    ].sort();
    const abweichungen: string[] = [];

    // oxlint-disable-next-line no-console
    console.log('Tabelle'.padEnd(34) + 'von'.padStart(9) + 'nach'.padStart(9));
    // oxlint-disable-next-line no-console
    console.log('-'.repeat(52));

    for (const name of alle) {
      const links = a.tabellen.get(name);
      const rechts = b.tabellen.get(name);

      const zeigeLinks = links === undefined ? 'fehlt' : String(links);
      const zeigeRechts = rechts === undefined ? 'FEHLT' : String(rechts);
      const gleich = links === rechts;

      // oxlint-disable-next-line no-console
      console.log(
        name.padEnd(34) +
          zeigeLinks.padStart(9) +
          zeigeRechts.padStart(9) +
          (gleich ? '' : '   <-- weicht ab'),
      );

      if (!gleich) {
        abweichungen.push(`${name}: ${zeigeLinks} gegen ${zeigeRechts}`);
      }
    }

    const wanderungenGleich =
      a.wanderungen.length === b.wanderungen.length &&
      a.wanderungen.every((n, i) => n === b.wanderungen[i]);

    // oxlint-disable-next-line no-console
    console.log();
    // oxlint-disable-next-line no-console
    console.log(
      `Wanderungen: ${String(a.wanderungen.length)} gegen ${String(b.wanderungen.length)}` +
        (wanderungenGleich ? ' — gleich' : ' — WEICHEN AB'),
    );

    if (!wanderungenGleich) {
      const nurLinks = a.wanderungen.filter((n) => !b.wanderungen.includes(n));
      const nurRechts = b.wanderungen.filter((n) => !a.wanderungen.includes(n));

      for (const n of nurLinks) {
        // oxlint-disable-next-line no-console
        console.log(`  nur in VON:  ${n}`);
      }

      for (const n of nurRechts) {
        // oxlint-disable-next-line no-console
        console.log(`  nur in NACH: ${n}`);
      }

      abweichungen.push('die Wanderungen stimmen nicht überein');
    }

    // oxlint-disable-next-line no-console
    console.log();

    if (abweichungen.length === 0) {
      // oxlint-disable-next-line no-console
      console.log(
        `Gleich: ${String(alle.length)} Tabellen, ` +
          `${String([...a.tabellen.values()].reduce((s, n) => s + n, 0))} Zeilen.`,
      );
      // oxlint-disable-next-line no-console
      console.log('Der alte Bestand darf weg — nachdem eine Sicherung liegt.');

      return;
    }

    // oxlint-disable-next-line no-console
    console.error(`${String(abweichungen.length)} Abweichungen:`);

    for (const a2 of abweichungen) {
      // oxlint-disable-next-line no-console
      console.error(`  ${a2}`);
    }

    // oxlint-disable-next-line no-console
    console.error('\nNICHTS LÖSCHEN. Die Wiederherstellung ist unvollständig.');
    process.exitCode = 1;
  } finally {
    await von.destroy();
    await nach.destroy();
  }
};

run().catch((fehler: unknown) => {
  // oxlint-disable-next-line no-console
  console.error(
    `
Der Vergleich ist nicht zustande gekommen: ${
      fehler instanceof Error ? fehler.message : String(fehler)
    }`,
  );
  // oxlint-disable-next-line no-console
  console.error('NICHTS LÖSCHEN. Es wurde nichts verglichen.');
  process.exit(1);
});
