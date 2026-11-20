import { Field, ID, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { InvoiceEntity } from './invoice.entity';

@ObjectType('InvoiceSeries')
@Entity({ name: 'invoice_series' })
@Index(['active', 'nextRunOn'])
export class InvoiceSeriesEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  sourceInvoiceId: string;

  @Field(() => InvoiceEntity)
  @ManyToOne(() => InvoiceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sourceInvoiceId' })
  sourceInvoice: InvoiceEntity;

  @Field()
  @Column({ type: 'varchar', length: 10 })
  interval: string;

  @Column({ type: 'smallint' })
  anchorDay: number;

  @Field()
  @Column({ type: 'date' })
  nextRunOn: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'date', nullable: true })
  endOn: string | null;

  @Field()
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  lastInvoiceId: string | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
