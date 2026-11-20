import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { QuoteEntity } from '../quotes/quote.entity';
import { Steuerbefreiung } from '../quotes/steuerbefreiung';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { InvoiceLineEntity } from './invoice-line.entity';
import { InvoiceStatus } from './invoice.types';

@ObjectType('Invoice')
@Entity({ name: 'invoices' })
@Index(['workspaceId', 'number'], { unique: true })
export class InvoiceEntity {
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

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 30, nullable: true })
  number: string | null;

  @Field(() => InvoiceStatus)
  @Column({ type: 'varchar', length: 20, default: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  quoteId: string | null;

  @Field(() => QuoteEntity, { nullable: true })
  @ManyToOne(() => QuoteEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'quoteId' })
  quote: QuoteEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  correctsInvoiceId: string | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  companyId: string | null;

  @Field(() => CompanyEntity, { nullable: true })
  @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'companyId' })
  company: CompanyEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  contactId: string | null;

  @Field(() => ContactEntity, { nullable: true })
  @ManyToOne(() => ContactEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contactId' })
  contact: ContactEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  dealId: string | null;

  @Field(() => DealEntity, { nullable: true })
  @ManyToOne(() => DealEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'dealId' })
  deal: DealEntity | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  recipientAddress: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  buyerReference: string | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  seriesId: string | null;

  @Field()
  @Column({ type: 'date' })
  issuedOn: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'date', nullable: true })
  serviceDate: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'date', nullable: true })
  dueOn: string | null;

  @Field(() => Int)
  @Column({ type: 'integer', default: 14 })
  paymentTermDays: number;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  introText: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  closingText: string | null;

  @Field()
  @Column({ type: 'varchar', length: 3, default: 'EUR' })
  currency: string;

  @Field()
  @Column({ type: 'boolean', default: false })
  smallBusiness: boolean;

  @Field(() => Steuerbefreiung, { nullable: true })
  @Column({ type: 'varchar', length: 30, nullable: true })
  taxExemption: Steuerbefreiung | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 300, nullable: true })
  taxExemptionNote: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 20, nullable: true })
  recipientVatId: string | null;

  @Field()
  @Column({ type: 'boolean', default: false })
  consumer: boolean;

  @Field(() => [InvoiceLineEntity])
  @OneToMany(() => InvoiceLineEntity, (line) => line.invoice, {
    cascade: false,
  })
  lines: InvoiceLineEntity[];

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  issuedAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  issuerSnapshot: Record<string, unknown> | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
