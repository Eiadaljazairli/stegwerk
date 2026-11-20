import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class EmailAenderung1792303800000 implements MigrationInterface {
  name = 'EmailAenderung1792303800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "email_aenderungen" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "neueEmail" character varying(320) NOT NULL,
        "tokenHash" character varying(64) NOT NULL,
        "gueltigBis" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_aenderungen" PRIMARY KEY ("id"),
        CONSTRAINT "FK_email_aenderungen_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_email_aenderungen_user" ON "email_aenderungen" ("userId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_email_aenderungen_token" ON "email_aenderungen" ("tokenHash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "email_aenderungen"`);
  }
}
