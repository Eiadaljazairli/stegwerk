import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Sicherheitsprotokoll1792301700000 implements MigrationInterface {
  name = 'Sicherheitsprotokoll1792301700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "sicherheits_ereignisse" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceId" uuid, "userId" uuid, "actorId" uuid, "art" character varying(40) NOT NULL, "geraet" character varying(80), "ipGekuerzt" character varying(45), "details" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_sicherheits_ereignisse" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_sicherheit_bereich" ON "sicherheits_ereignisse" ("workspaceId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_sicherheit_person" ON "sicherheits_ereignisse" ("userId", "createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "sicherheits_ereignisse" ADD CONSTRAINT "FK_sicherheit_workspace" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "sicherheits_ereignisse" ADD CONSTRAINT "FK_sicherheit_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "sicherheits_ereignisse"`);
  }
}
