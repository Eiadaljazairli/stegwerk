import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTasks1788304358453 implements MigrationInterface {
  name = 'AddTasks1788304358453';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_trgm_companies_name"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_trgm_companies_domain"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_trgm_companies_industry"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_trgm_companies_city"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_trgm_companies_country"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_trgm_contacts_firstname"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_trgm_contacts_lastname"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_trgm_contacts_email"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_trgm_contacts_phone"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_trgm_contacts_jobtitle"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_trgm_deals_name"`);
    await queryRunner.query(
      `CREATE TABLE "tasks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceId" uuid NOT NULL, "title" character varying(200) NOT NULL, "description" text, "dueDate" date, "completedAt" TIMESTAMP WITH TIME ZONE, "assigneeId" uuid NOT NULL, "createdById" uuid NOT NULL, "companyId" uuid, "contactId" uuid, "dealId" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8d12ff38fcc62aaba2cab748772" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f88dbead7aecbf13a1b40f7c88" ON "tasks" ("workspaceId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3745c74c5dad9849913e7dc8f7" ON "tasks" ("workspaceId", "assigneeId", "completedAt", "dueDate") `,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_683ad3f76f2544e5115afec26d2" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_22e88bf5fa06f3df4f4edb1493f" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_4d5c77e1b081638da5c4248ac4a" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "FK_4d5c77e1b081638da5c4248ac4a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "FK_22e88bf5fa06f3df4f4edb1493f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "FK_683ad3f76f2544e5115afec26d2"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3745c74c5dad9849913e7dc8f7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f88dbead7aecbf13a1b40f7c88"`,
    );
    await queryRunner.query(`DROP TABLE "tasks"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_trgm_deals_name" ON "deals" ("name") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_trgm_contacts_jobtitle" ON "contacts" ("jobTitle") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_trgm_contacts_phone" ON "contacts" ("phone") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_trgm_contacts_email" ON "contacts" ("email") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_trgm_contacts_lastname" ON "contacts" ("lastName") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_trgm_contacts_firstname" ON "contacts" ("firstName") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_trgm_companies_country" ON "companies" ("country") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_trgm_companies_city" ON "companies" ("city") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_trgm_companies_industry" ON "companies" ("industry") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_trgm_companies_domain" ON "companies" ("domain") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_trgm_companies_name" ON "companies" ("name") `,
    );
  }
}
