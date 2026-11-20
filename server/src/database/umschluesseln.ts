import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { schluesselbund } from '../mailboxes/secret-box';
import { umschluesseln } from '../sicherheit/umschluesseln';
import { databaseSsl, databaseUrl } from './database-ssl';

const bund = (roh: string | undefined, alt: string | undefined) =>
  roh === undefined || roh.trim() === '' ? null : schluesselbund(roh, alt);

const run = async (): Promise<void> => {
  loadEnv();

  const probelauf = process.argv.includes('--probe');
  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl(process.env.DATABASE_URL, process.env.DATABASE_CA_CERT),
    ssl: databaseSsl(process.env.DATABASE_CA_CERT),
    synchronize: false,
  });

  await dataSource.initialize();

  try {
    const berichte = await umschluesseln(
      (sql, werte) => dataSource.query(sql, werte),
      {
        mail: bund(
          process.env.MAIL_ENCRYPTION_KEY,
          process.env.MAIL_ENCRYPTION_KEY_ALT,
        ),
        totp: bund(
          process.env.TOTP_ENCRYPTION_KEY,
          process.env.TOTP_ENCRYPTION_KEY_ALT,
        ),
      },
      { probelauf },
    );

    for (const b of berichte) {
      // oxlint-disable-next-line no-console
      console.log(
        `${b.tabelle}.${b.spalte}: ${String(b.umgeschluesselt)} ${
          probelauf ? 'umzuschlüsseln' : 'umgeschlüsselt'
        }, ${String(b.aktuell)} aktuell, ${String(b.unlesbar)} unlesbar`,
      );
    }

    if (berichte.some((b) => b.unlesbar > 0)) {
      // oxlint-disable-next-line no-console
      console.log(
        'Unlesbare Werte sind unverändert geblieben. Fehlt ein alter Schlüssel in *_ALT?',
      );
      process.exitCode = 2;
    }
  } finally {
    await dataSource.destroy();
  }
};

run().catch((error: unknown) => {
  // oxlint-disable-next-line no-console
  console.error('Umschlüsseln fehlgeschlagen:', error);
  process.exit(1);
});
