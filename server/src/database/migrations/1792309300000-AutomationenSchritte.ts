import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AutomationenSchritte1792309300000 implements MigrationInterface {
  name = 'AutomationenSchritte1792309300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "automationen" ADD "schritte" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "automationen" ADD "naechsterLauf" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "automationen" ADD "eingangTokenHash" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "automationen" ADD CONSTRAINT "UQ_automationen_eingang" UNIQUE ("eingangTokenHash")`,
    );
    await queryRunner.query(
      `ALTER TABLE "automationen" ADD "eingangGeheimnisSealed" text`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_automationen_zeitplan" ON "automationen" ("naechsterLauf") WHERE "ausloeser" = 'ZEITPLAN' AND "aktiv"`,
    );

    await queryRunner.query(
      `ALTER TABLE "automation_ausfuehrungen" ALTER COLUMN "zielId" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_ausfuehrungen" ADD "testlauf" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_ausfuehrungen" ADD "ausloeserDaten" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_ausfuehrungen" ADD "schritte" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "automation_ausfuehrungen" DROP COLUMN "schritte"`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_ausfuehrungen" DROP COLUMN "ausloeserDaten"`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_ausfuehrungen" DROP COLUMN "testlauf"`,
    );
    await queryRunner.query(
      `DELETE FROM "automation_ausfuehrungen" WHERE "zielId" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_ausfuehrungen" ALTER COLUMN "zielId" SET NOT NULL`,
    );
    await queryRunner.query(`DROP INDEX "IDX_automationen_zeitplan"`);
    await queryRunner.query(
      `ALTER TABLE "automationen" DROP COLUMN "eingangGeheimnisSealed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "automationen" DROP CONSTRAINT "UQ_automationen_eingang"`,
    );
    await queryRunner.query(
      `ALTER TABLE "automationen" DROP COLUMN "eingangTokenHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "automationen" DROP COLUMN "naechsterLauf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "automationen" DROP COLUMN "schritte"`,
    );
  }
}
