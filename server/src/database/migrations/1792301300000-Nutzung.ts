import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Nutzung1792301300000 implements MigrationInterface {
  name = 'Nutzung1792301300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "nutzung" ("userId" uuid NOT NULL, "tag" date NOT NULL, "bereich" character varying(40) NOT NULL, "art" character varying(10) NOT NULL, "anzahl" integer NOT NULL DEFAULT 0, CONSTRAINT "PK_nutzung" PRIMARY KEY ("userId", "tag", "bereich", "art"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "nutzung" ADD CONSTRAINT "FK_nutzung_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "zuletztGesehenAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "zuletztGesehenAt"`,
    );
    await queryRunner.query(`DROP TABLE "nutzung"`);
  }
}
