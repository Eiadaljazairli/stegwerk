import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { databaseSsl, databaseUrl } from './database-ssl';
import { DATABASE_ENTITIES } from './entities';

loadEnv();

export default new DataSource({
  type: 'postgres',
  url: databaseUrl(process.env.DATABASE_URL, process.env.DATABASE_CA_CERT),
  ssl: databaseSsl(process.env.DATABASE_CA_CERT),
  entities: DATABASE_ENTITIES,
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
