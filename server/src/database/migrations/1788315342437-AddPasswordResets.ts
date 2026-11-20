import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordResets1788315342437 implements MigrationInterface {
  name = 'AddPasswordResets1788315342437';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "password_resets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "tokenHash" character varying(64) NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "usedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4816377aa98211c1de34469e742" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7f6aae0fcc807c9e7194ca5cc4" ON "password_resets" ("tokenHash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_34b45526e41d68fbab8b2f8e39" ON "password_resets" ("userId", "usedAt") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_34b45526e41d68fbab8b2f8e39"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7f6aae0fcc807c9e7194ca5cc4"`,
    );
    await queryRunner.query(`DROP TABLE "password_resets"`);
  }
}
