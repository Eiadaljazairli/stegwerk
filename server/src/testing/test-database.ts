import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { DATABASE_ENTITIES } from '../database/entities';

loadEnv();

const connectionString = (): string =>
  process.env.DATABASE_URL ??
  'postgres://weitblick:weitblick@localhost:5433/weitblick';

const databaseName = (suite: string): string =>
  `weitblick_test_${suite.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${process.pid}`;

const urlFor = (database: string): string => {
  const url = new URL(connectionString());

  url.pathname = `/${database}`;

  return url.toString();
};

const adminUrl = (): string => urlFor('postgres');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const DROP_ATTEMPTS = 10;
const DROP_BACKOFF_MS = 250;

const dropDatabase = async (admin: DataSource, name: string): Promise<void> => {
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid()
        AND usename = current_user`,
    [name],
  );

  for (let attempt = 1; ; attempt += 1) {
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);

      return;
    } catch (error) {
      if (attempt === DROP_ATTEMPTS) {
        throw error;
      }

      await sleep(DROP_BACKOFF_MS);
    }
  }
};

export const createTestDatabase = async (
  suite: string,
): Promise<DataSource> => {
  const name = databaseName(suite);
  const admin = new DataSource({ type: 'postgres', url: adminUrl() });

  await admin.initialize();

  await dropDatabase(admin, name);
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.destroy();

  const dataSource = new DataSource({
    type: 'postgres',
    url: urlFor(name),
    entities: DATABASE_ENTITIES,
    migrations: [`${__dirname}/../database/migrations/*.ts`],
    synchronize: false,
    poolSize: 3,
  });

  await dataSource.initialize();
  await dataSource.runMigrations();

  return dataSource;
};

export const dropTestDatabase = async (
  dataSource: DataSource,
  suite: string,
): Promise<void> => {
  const name = databaseName(suite);

  await dataSource.destroy();

  const admin = new DataSource({ type: 'postgres', url: adminUrl() });

  await admin.initialize();

  try {
    await dropDatabase(admin, name);
  } finally {
    await admin.destroy();
  }
};
