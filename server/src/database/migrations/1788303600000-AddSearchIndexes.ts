import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddSearchIndexes1788303600000 implements MigrationInterface {
  name = 'AddSearchIndexes1788303600000';

  private readonly indexes: { table: string; columns: string[] }[] = [
    {
      table: 'companies',
      columns: ['name', 'domain', 'industry', 'city', 'country'],
    },
    {
      table: 'contacts',
      columns: ['firstName', 'lastName', 'email', 'phone', 'jobTitle'],
    },
    { table: 'deals', columns: ['name'] },
  ];

  private indexName(table: string, column: string): string {
    return `IDX_trgm_${table}_${column.toLowerCase()}`;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');

    for (const { table, columns } of this.indexes) {
      for (const column of columns) {
        await queryRunner.query(
          `CREATE INDEX IF NOT EXISTS "${this.indexName(table, column)}" ` +
            `ON "${table}" USING gin ("${column}" gin_trgm_ops)`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { table, columns } of this.indexes) {
      for (const column of columns) {
        await queryRunner.query(
          `DROP INDEX IF EXISTS "${this.indexName(table, column)}"`,
        );
      }
    }
  }
}
