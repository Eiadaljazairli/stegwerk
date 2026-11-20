import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class MailSperrliste1792302100000 implements MigrationInterface {
  name = 'MailSperrliste1792302100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "mail_sperren" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceId" uuid NOT NULL, "eintrag" character varying(320) NOT NULL, "createdById" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_mail_sperren" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_mail_sperren_eintrag" ON "mail_sperren" ("workspaceId", "eintrag")`,
    );
    await queryRunner.query(
      `ALTER TABLE "mail_sperren" ADD CONSTRAINT "FK_mail_sperren_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "mail_sperren" ADD CONSTRAINT "FK_mail_sperren_user" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "mailboxes" ADD "gelesenBis" bigint NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "mailboxes" DROP COLUMN "gelesenBis"`);
    await queryRunner.query(`DROP TABLE "mail_sperren"`);
  }
}
