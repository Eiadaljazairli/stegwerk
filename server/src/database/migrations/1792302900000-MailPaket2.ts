import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class MailPaket21792302900000 implements MigrationInterface {
  name = 'MailPaket21792302900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mailboxes" ADD "sichtbarkeit" character varying(10) NOT NULL DEFAULT 'alles'`,
    );
    await queryRunner.query(
      `ALTER TABLE "mailboxes" ADD "gesendetOrdner" character varying(200)`,
    );
    await queryRunner.query(
      `ALTER TABLE "mailboxes" ADD "gesendetUidValidity" bigint NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "mailboxes" ADD "gesendetGelesenBis" bigint NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "mailboxes" ADD "getrenntAm" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "mail_messages" ADD "ordner" character varying(10) NOT NULL DEFAULT 'eingang'`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD "unzustellbarSeit" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD "unzustellbarGrund" character varying(300)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contacts" DROP COLUMN "unzustellbarGrund"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" DROP COLUMN "unzustellbarSeit"`,
    );
    await queryRunner.query(`ALTER TABLE "mail_messages" DROP COLUMN "ordner"`);
    await queryRunner.query(`ALTER TABLE "mailboxes" DROP COLUMN "getrenntAm"`);
    await queryRunner.query(
      `ALTER TABLE "mailboxes" DROP COLUMN "gesendetGelesenBis"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mailboxes" DROP COLUMN "gesendetUidValidity"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mailboxes" DROP COLUMN "gesendetOrdner"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mailboxes" DROP COLUMN "sichtbarkeit"`,
    );
  }
}
