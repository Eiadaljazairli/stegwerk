import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { MailboxEntity } from './mailbox.entity';

export type MailAnhangInfo = {
  teil: string;
  name: string;
  mimeType: string;
  groesse: number;
  gespeichertId?: string | null;
  ausstehend?: boolean;
};

@ObjectType('MailAnhang')
export class MailAnhangView {
  @Field(() => Int)
  index: number;

  @Field()
  name: string;

  @Field()
  mimeType: string;

  @Field(() => Int)
  groesse: number;

  @Field(() => ID, { nullable: true })
  gespeichertId: string | null;
}

@ObjectType('MailMessage')
@Entity({ name: 'mail_messages' })
@Index(['workspaceId', 'contactId', 'sentAt'])
@Index(['workspaceId', 'companyId', 'sentAt'])
@Index(['workspaceId', 'threadKey', 'sentAt'])
@Index(['mailboxId', 'messageId'], { unique: true })
@Index(['mailboxId', 'threadKey'])
export class MailMessageEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  mailboxId: string;

  @ManyToOne(() => MailboxEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mailboxId' })
  mailbox: MailboxEntity;

  @Field()
  @Column({ type: 'varchar', length: 500 })
  messageId: string;

  @Column({ type: 'integer', default: 0 })
  uid: number;

  @Field()
  @Column({ type: 'boolean', default: false })
  outgoing: boolean;

  @Column({ type: 'varchar', length: 10, default: 'eingang' })
  ordner: 'eingang' | 'gesendet';

  @Field()
  @Column({ type: 'varchar', length: 320 })
  fromAddress: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 200, nullable: true })
  fromName: string | null;

  @Field()
  @Column({ type: 'text' })
  toAddresses: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  subject: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  snippet: string | null;

  @Column({ type: 'text', nullable: true })
  inhalt: string | null;

  @Column({ type: 'text', nullable: true })
  zitat: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  anhaenge: MailAnhangInfo[];

  @Column({ type: 'varchar', length: 500, nullable: true })
  inReplyTo: string | null;

  @Column({ type: 'text', nullable: true })
  references: string | null;

  @Field()
  @Column({ type: 'varchar', length: 500, default: '' })
  threadKey: string;

  @Field()
  @Column({ type: 'timestamptz' })
  sentAt: Date;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  contactId: string | null;

  @ManyToOne(() => ContactEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contactId' })
  contact: ContactEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  companyId: string | null;

  @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'companyId' })
  company: CompanyEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  zugewiesenAnId: string | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  erledigtAm: Date | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field(() => Boolean, { nullable: true })
  inhaltVerborgen?: boolean;

  @Field(() => Int, { nullable: true })
  anhangAnzahl?: number;
}
