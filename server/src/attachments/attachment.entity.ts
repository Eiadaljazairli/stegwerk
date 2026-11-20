import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { NoteEntity } from '../crm/entities/note.entity';
import { TaskEntity } from '../crm/entities/task.entity';
import { InvoiceEntity } from '../invoices/invoice.entity';
import { QuoteEntity } from '../quotes/quote.entity';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';

import { AttachmentBlobEntity } from './attachment-blob.entity';

@ObjectType('Attachment')
@Entity({ name: 'attachments' })
@Index(['workspaceId', 'createdAt'])
export class AttachmentEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Index()
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Field()
  @Column({ type: 'text' })
  name: string;

  @Field()
  @Column({ type: 'text' })
  mimeType: string;

  @Field(() => Int)
  @Column({ type: 'integer' })
  sizeBytes: number;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  uploadedById: string | null;

  @Field(() => UserEntity, { nullable: true })
  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploadedById' })
  uploadedBy: UserEntity | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  companyId: string | null;

  @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: CompanyEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  contactId: string | null;

  @ManyToOne(() => ContactEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contactId' })
  contact: ContactEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  dealId: string | null;

  @ManyToOne(() => DealEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dealId' })
  deal: DealEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  quoteId: string | null;

  @ManyToOne(() => QuoteEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quoteId' })
  quote: QuoteEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  invoiceId: string | null;

  @ManyToOne(() => InvoiceEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoiceId' })
  invoice: InvoiceEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  taskId: string | null;

  @ManyToOne(() => TaskEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: TaskEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  noteId: string | null;

  @ManyToOne(() => NoteEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'noteId' })
  note: NoteEntity | null;

  @OneToOne(() => AttachmentBlobEntity, (blob) => blob.attachment)
  blob: AttachmentBlobEntity | null;
}
