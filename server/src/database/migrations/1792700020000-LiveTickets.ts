import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class LiveTickets1792700020000 implements MigrationInterface {
  name = 'LiveTickets1792700020000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "live_tickets" (
        "tokenHash" character varying(64) NOT NULL,
        "userId" uuid NOT NULL,
        "workspaceId" uuid NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_live_tickets" PRIMARY KEY ("tokenHash"),
        CONSTRAINT "FK_live_tickets_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_live_tickets_workspace" FOREIGN KEY ("workspaceId")
          REFERENCES "workspaces"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_live_tickets_ablauf" ON "live_tickets" ("expiresAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "live_tickets"`);
  }
}
