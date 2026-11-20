import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddCustomFieldIndexes1788390000000 implements MigrationInterface {
  name = 'AddCustomFieldIndexes1788390000000';

  private readonly tables = ['companies', 'contacts', 'deals', 'tasks'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(
        `CREATE INDEX "IDX_${table}_custom_fields" ON "${table}" USING gin ("customFields")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(`DROP INDEX "IDX_${table}_custom_fields"`);
    }
  }
}
