import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Verlustgrund1792301800000 implements MigrationInterface {
  name = 'Verlustgrund1792301800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "deals" ADD "lostReason" character varying(200)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "deals" DROP COLUMN "lostReason"`);
  }
}
