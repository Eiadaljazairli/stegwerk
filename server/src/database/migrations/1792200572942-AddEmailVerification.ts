import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddEmailVerification1792200572942 implements MigrationInterface {
  name = 'AddEmailVerification1792200572942';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD "emailVerifiedAt" TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      UPDATE "users" SET "emailVerifiedAt" = "createdAt"
    `);

    await queryRunner.query(`
      CREATE TABLE "email_verifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "tokenHash" character varying(64) NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "usedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_c1ea2921e767f83cd44c0af203f" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_ce0a8d27a7e9e49d49865e3e1a"
        ON "email_verifications" ("tokenHash")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_f0b6e93eee38c1917047a993d8"
        ON "email_verifications" ("userId", "usedAt")
    `);

    await queryRunner.query(`
      ALTER TABLE "email_verifications"
        ADD CONSTRAINT "FK_4e63a91e0a684b31496bd50733e"
        FOREIGN KEY ("userId") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email_verifications"
        DROP CONSTRAINT "FK_4e63a91e0a684b31496bd50733e"
    `);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f0b6e93eee38c1917047a993d8"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ce0a8d27a7e9e49d49865e3e1a"`,
    );
    await queryRunner.query(`DROP TABLE "email_verifications"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "emailVerifiedAt"`,
    );
  }
}
