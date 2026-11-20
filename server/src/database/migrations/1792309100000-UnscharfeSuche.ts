import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class UnscharfeSuche1792309100000 implements MigrationInterface {
  name = 'UnscharfeSuche1792309100000';

  private readonly spalten: { tabelle: string; spalte: string; json?: true }[] =
    [
      { tabelle: 'companies', spalte: 'name' },
      { tabelle: 'companies', spalte: 'domain' },
      { tabelle: 'companies', spalte: 'zweitdomains', json: true },
      { tabelle: 'companies', spalte: 'industry' },
      { tabelle: 'companies', spalte: 'city' },
      { tabelle: 'companies', spalte: 'country' },
      { tabelle: 'contacts', spalte: 'firstName' },
      { tabelle: 'contacts', spalte: 'lastName' },
      { tabelle: 'contacts', spalte: 'email' },
      { tabelle: 'contacts', spalte: 'phone' },
      { tabelle: 'contacts', spalte: 'jobTitle' },
      { tabelle: 'contacts', spalte: 'weitereEmails', json: true },
      { tabelle: 'contacts', spalte: 'weitereTelefone', json: true },
      { tabelle: 'deals', spalte: 'name' },
      { tabelle: 'tasks', spalte: 'title' },
    ];

  private indexName(tabelle: string, spalte: string): string {
    return `IDX_norm_${tabelle}_${spalte.toLowerCase()}`;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS unaccent');
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION stegwerk_norm(eingabe text) RETURNS text
      LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
        SELECT replace(replace(replace(
          public.unaccent('public.unaccent'::regdictionary, lower(eingabe)),
          'ae', 'a'), 'oe', 'o'), 'ue', 'u')
      $$
    `);

    for (const { tabelle, spalte, json } of this.spalten) {
      const ausdruck = json === true ? `("${spalte}")::text` : `"${spalte}"`;

      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "${this.indexName(tabelle, spalte)}" ` +
          `ON "${tabelle}" USING gin (stegwerk_norm(${ausdruck}) gin_trgm_ops)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { tabelle, spalte } of this.spalten) {
      await queryRunner.query(
        `DROP INDEX IF EXISTS "${this.indexName(tabelle, spalte)}"`,
      );
    }

    await queryRunner.query('DROP FUNCTION IF EXISTS stegwerk_norm(text)');
  }
}
