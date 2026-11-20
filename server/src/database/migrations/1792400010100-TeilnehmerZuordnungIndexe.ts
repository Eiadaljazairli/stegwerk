import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class TeilnehmerZuordnungIndexe1792400010100 implements MigrationInterface {
  name = 'TeilnehmerZuordnungIndexe1792400010100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_contacts_email_klein"
         ON "contacts" ("workspaceId", lower("email"))
         WHERE "deletedAt" IS NULL AND "email" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_appointment_attendees_offen"
         ON "appointment_attendees" ("workspaceId", lower("email"))
         WHERE "contactId" IS NULL AND "userId" IS NULL AND "email" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_appointment_attendees_offen"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_contacts_email_klein"`);
  }
}
