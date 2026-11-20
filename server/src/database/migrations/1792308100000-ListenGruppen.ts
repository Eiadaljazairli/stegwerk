import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class ListenGruppen1792308100000 implements MigrationInterface {
  name = 'ListenGruppen1792308100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "saved_views" ADD "gruppierung" character varying(80)`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_views" ADD "filterVerknuepfung" character varying(4)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "saved_views" DROP COLUMN "filterVerknuepfung"`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_views" DROP COLUMN "gruppierung"`,
    );
  }
}
