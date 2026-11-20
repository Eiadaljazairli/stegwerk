import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddTwoFactor1788490000000 implements MigrationInterface {
  name = 'AddTwoFactor1788490000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN "totpSecret" text,
        ADD COLUMN "totpEnabledAt" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "totpLastCounter" bigint
    `);

    await queryRunner.query(`
      CREATE TABLE "two_factor_recovery_codes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "codeHash" text NOT NULL,
        "usedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_two_factor_recovery_codes" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "two_factor_recovery_codes"
        ADD CONSTRAINT "FK_two_factor_recovery_codes_user"
        FOREIGN KEY ("userId") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_two_factor_recovery_codes_user"
        ON "two_factor_recovery_codes" ("userId")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "two_factor_recovery_codes"`);
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN "totpLastCounter",
        DROP COLUMN "totpEnabledAt",
        DROP COLUMN "totpSecret"
    `);
  }
}
