import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AufgabenTermineAnhaenge1792304300000 implements MigrationInterface {
  name = 'AufgabenTermineAnhaenge1792304300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD "inArbeitSeit" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD "dueTime" character varying(5)`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "CHK_tasks_dueTime" CHECK ("dueTime" IS NULL OR "dueTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')`,
    );
    await queryRunner.query(`ALTER TABLE "attachments" ADD "taskId" uuid`);
    await queryRunner.query(`ALTER TABLE "attachments" ADD "noteId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "attachments" ADD CONSTRAINT "FK_attachments_task" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" ADD CONSTRAINT "FK_attachments_note" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_attachments_task" ON "attachments" ("taskId") WHERE "taskId" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_attachments_note" ON "attachments" ("noteId") WHERE "noteId" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD "videoLink" character varying(500)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP COLUMN "videoLink"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_attachments_note"`);
    await queryRunner.query(`DROP INDEX "IDX_attachments_task"`);
    await queryRunner.query(`ALTER TABLE "attachments" DROP COLUMN "noteId"`);
    await queryRunner.query(`ALTER TABLE "attachments" DROP COLUMN "taskId"`);
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "CHK_tasks_dueTime"`,
    );
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "dueTime"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "inArbeitSeit"`);
  }
}
