import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Verknuepfungsfelder1792700040000 implements MigrationInterface {
  name = 'Verknuepfungsfelder1792700040000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "custom_fields" ADD "zielEntity" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "custom_fields" ADD "mehrere" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "custom_fields" ADD "gegenseite" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "custom_fields" ADD "gegenfeldId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "custom_fields" ADD CONSTRAINT "FK_custom_fields_gegenfeld"
        FOREIGN KEY ("gegenfeldId") REFERENCES "custom_fields"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_custom_fields_gegenfeld" ON "custom_fields" ("gegenfeldId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_custom_fields_gegenfeld"`);
    await queryRunner.query(
      `ALTER TABLE "custom_fields" DROP CONSTRAINT "FK_custom_fields_gegenfeld"`,
    );
    await queryRunner.query(
      `ALTER TABLE "custom_fields" DROP COLUMN "gegenfeldId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "custom_fields" DROP COLUMN "gegenseite"`,
    );
    await queryRunner.query(
      `ALTER TABLE "custom_fields" DROP COLUMN "mehrere"`,
    );
    await queryRunner.query(
      `ALTER TABLE "custom_fields" DROP COLUMN "zielEntity"`,
    );
  }
}
