import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddMailboxes1788430000000 implements MigrationInterface {
  name = 'AddMailboxes1788430000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "mailboxes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "host" character varying(200) NOT NULL,
        "port" integer NOT NULL DEFAULT 993,
        "secure" boolean NOT NULL DEFAULT true,
        "username" character varying(200) NOT NULL,
        "passwordSealed" text NOT NULL,
        "folder" character varying(200) NOT NULL DEFAULT 'INBOX',
        "active" boolean NOT NULL DEFAULT true,
        "uidValidity" bigint NOT NULL DEFAULT 0,
        "lastSyncedAt" TIMESTAMP WITH TIME ZONE,
        "lastError" character varying(300),
        "messageCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mailboxes" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_mailboxes_workspace_user"
        ON "mailboxes" ("workspaceId", "userId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "mailboxes" ADD CONSTRAINT "FK_mailboxes_workspace"
        FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "mailboxes" ADD CONSTRAINT "FK_mailboxes_user"
        FOREIGN KEY ("userId") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "mail_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "mailboxId" uuid NOT NULL,
        "messageId" character varying(500) NOT NULL,
        "uid" integer NOT NULL DEFAULT 0,
        "outgoing" boolean NOT NULL DEFAULT false,
        "fromAddress" character varying(320) NOT NULL,
        "fromName" character varying(200),
        "toAddresses" text NOT NULL,
        "subject" character varying(500),
        "snippet" text,
        "sentAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "contactId" uuid,
        "companyId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mail_messages" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_mail_messages_mailbox_message"
        ON "mail_messages" ("mailboxId", "messageId")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_mail_messages_contact"
        ON "mail_messages" ("workspaceId", "contactId", "sentAt" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_mail_messages_company"
        ON "mail_messages" ("workspaceId", "companyId", "sentAt" DESC)`,
    );

    await queryRunner.query(
      `ALTER TABLE "mail_messages" ADD CONSTRAINT "FK_mail_messages_workspace"
        FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "mail_messages" ADD CONSTRAINT "FK_mail_messages_mailbox"
        FOREIGN KEY ("mailboxId") REFERENCES "mailboxes"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "mail_messages" ADD CONSTRAINT "FK_mail_messages_contact"
        FOREIGN KEY ("contactId") REFERENCES "contacts"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "mail_messages" ADD CONSTRAINT "FK_mail_messages_company"
        FOREIGN KEY ("companyId") REFERENCES "companies"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "mail_messages"`);
    await queryRunner.query(`DROP TABLE "mailboxes"`);
  }
}
