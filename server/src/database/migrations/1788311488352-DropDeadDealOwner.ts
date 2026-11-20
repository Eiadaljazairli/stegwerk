import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropDeadDealOwner1788311488352 implements MigrationInterface {
  name = 'DropDeadDealOwner1788311488352';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "deals" DROP COLUMN "ownerId"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "deals" ADD "ownerId" uuid`);
  }
}
