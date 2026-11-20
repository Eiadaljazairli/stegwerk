import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class PostfachAusbau1792308500000 implements MigrationInterface {
  name = 'PostfachAusbau1792308500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mail_messages" ADD "inhalt" text, ADD "zitat" text,
         ADD "anhaenge" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "mailboxes"
         ADD "ausschlussIntern" boolean NOT NULL DEFAULT true,
         ADD "ausschlussMassenpost" boolean NOT NULL DEFAULT true,
         ADD "ausschlussGruppen" boolean NOT NULL DEFAULT false,
         ADD "ausschlussFreemail" boolean NOT NULL DEFAULT false,
         ADD "aliase" text[] NOT NULL DEFAULT '{}',
         ADD "anhaengeAutomatisch" boolean NOT NULL DEFAULT false,
         ADD "anhaengeBisMb" integer NOT NULL DEFAULT 5`,
    );
    await queryRunner.query(
      `ALTER TABLE "mailboxes" ADD CONSTRAINT "CHK_mailboxes_anhaengeBisMb" CHECK ("anhaengeBisMb" BETWEEN 1 AND 20)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mailboxes" DROP CONSTRAINT "CHK_mailboxes_anhaengeBisMb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mailboxes"
         DROP COLUMN "anhaengeBisMb", DROP COLUMN "anhaengeAutomatisch",
         DROP COLUMN "aliase", DROP COLUMN "ausschlussFreemail",
         DROP COLUMN "ausschlussGruppen", DROP COLUMN "ausschlussMassenpost",
         DROP COLUMN "ausschlussIntern"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mail_messages" DROP COLUMN "anhaenge", DROP COLUMN "zitat", DROP COLUMN "inhalt"`,
    );
  }
}
