import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class NotizBearbeitet1792301900000 implements MigrationInterface {
  name = 'NotizBearbeitet1792301900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notes" ADD "bearbeitetAm" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`ALTER TABLE "notes" ADD "bearbeitetVonId" uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notes" DROP COLUMN "bearbeitetVonId"`,
    );
    await queryRunner.query(`ALTER TABLE "notes" DROP COLUMN "bearbeitetAm"`);
  }
}
