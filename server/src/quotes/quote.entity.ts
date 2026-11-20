import { Field, ID, ObjectType } from '@nestjs/graphql';
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
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { QuoteLineEntity } from './quote-line.entity';
import { QuoteStatus } from './quote.types';
import { Steuerbefreiung } from './steuerbefreiung';

@ObjectType('Quote')
@Entity({ name: 'quotes' })
@Index(['workspaceId', 'number'], { unique: true })
export class QuoteEntity {
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
  @Column({ type: 'varchar', length: 30 })
  number: string;

  @Field(() => QuoteStatus)
  @Column({ type: 'varchar', length: 20, default: QuoteStatus.DRAFT })
  status: QuoteStatus;

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
  bearbeiterId: string | null;

  @Field(() => UserEntity, { nullable: true })
  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'bearbeiterId' })
  bearbeiter: UserEntity | null;

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

  @Field()
  @Column({ type: 'date' })
  issuedOn: string;

  @Field()
  @Column({ type: 'date' })
  validUntil: string;

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

  @Field(() => [QuoteLineEntity])
  @OneToMany(() => QuoteLineEntity, (line) => line.quote, { cascade: false })
  lines: QuoteLineEntity[];

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  publicLinkNonce: string | null;

  @Column({ type: 'uuid', nullable: true })
  linkCreatedById: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 200, nullable: true })
  decidedByName: string | null;

  @Field()
  @Column({ type: 'boolean', default: false })
  decidedOnline: boolean;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
