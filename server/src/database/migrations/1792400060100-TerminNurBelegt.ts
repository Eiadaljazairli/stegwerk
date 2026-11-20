import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class TerminNurBelegt1792400060100 implements MigrationInterface {
  name = 'TerminNurBelegt1792400060100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "nurBelegt" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `UPDATE "appointment_attendees" t
          SET "name" = left(COALESCE(
                NULLIF(trim(concat_ws(' ', k."firstName", k."lastName")), ''),
                k."email"), 200)
         FROM "contacts" k
        WHERE k."id" = t."contactId"
          AND (t."name" IS NULL OR t."name" = '')
          AND (t."email" IS NULL OR t."email" = '')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP COLUMN "nurBelegt"`,
    );
  }
}
