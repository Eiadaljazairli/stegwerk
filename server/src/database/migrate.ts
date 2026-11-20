import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { databaseSsl, databaseUrl } from './database-ssl';
import { DATABASE_ENTITIES } from './entities';

const run = async (): Promise<void> => {
  loadEnv();

  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl(process.env.DATABASE_URL, process.env.DATABASE_CA_CERT),
    ssl: databaseSsl(process.env.DATABASE_CA_CERT),
    entities: DATABASE_ENTITIES,
    migrations: [`${__dirname}/migrations/*.js`],
    synchronize: false,
  });

  await dataSource.initialize();

  const applied = await dataSource.runMigrations();

  if (applied.length === 0) {
    // oxlint-disable-next-line no-console
    console.log('Schema already up to date');
  }

  for (const migration of applied) {
    // oxlint-disable-next-line no-console
    console.log(`Applied ${migration.name}`);
  }

  await dataSource.destroy();
};

run().catch((error: unknown) => {
  // oxlint-disable-next-line no-console
  console.error('Migration failed:', error);
  process.exit(1);
});
