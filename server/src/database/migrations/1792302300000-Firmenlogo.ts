import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Firmenlogo1792302300000 implements MigrationInterface {
  name = 'Firmenlogo1792302300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workspace_letterheads" ADD "logo" bytea`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_letterheads" ADD "logoMime" character varying(20)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workspace_letterheads" DROP COLUMN "logoMime"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_letterheads" DROP COLUMN "logo"`,
    );
  }
}
