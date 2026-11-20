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

import { InvoiceEntity } from '../invoices/invoice.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { DunningLevel } from './dunning';

@ObjectType('InvoiceReminder')
@Entity({ name: 'invoice_reminders' })
@Index(['workspaceId', 'invoiceId', 'sentOn'])
export class InvoiceReminderEntity {
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
  invoiceId: string;

  @ManyToOne(() => InvoiceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoiceId' })
  invoice: InvoiceEntity;

  @Field(() => DunningLevel)
  @Column({ type: 'varchar', length: 20 })
  level: DunningLevel;

  @Field()
  @Column({ type: 'date' })
  sentOn: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 320, nullable: true })
  sentTo: string | null;

  @Field(() => Int)
  @Column({ type: 'integer', default: 0 })
  daysOverdue: number;

  @Field(() => Int)
  @Column({ type: 'integer', default: 0 })
  interestCents: number;

  @Field(() => Int)
  @Column({ type: 'integer', default: 0 })
  lateFeeCents: number;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
