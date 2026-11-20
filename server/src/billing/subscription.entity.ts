import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { BillingPlan, SubscriptionStatus } from './plans';

@ObjectType('Subscription')
@Entity({ name: 'subscriptions' })
export class SubscriptionEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Index({ unique: true })
  @Column({ type: 'uuid' })
  workspaceId: string;

  @Field(() => BillingPlan)
  @Column({ type: 'enum', enum: BillingPlan, default: BillingPlan.TRIAL })
  plan: BillingPlan;

  @Field(() => SubscriptionStatus)
  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.TRIALING,
  })
  status: SubscriptionStatus;

  @Field(() => Int)
  @Column({ type: 'integer', default: 3 })
  seats: number;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  trialEndsAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodEnd: Date | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  abrechnungsIntervall: 'month' | 'year' | null;

  @Column({ type: 'timestamptz', nullable: true })
  verlaengerungHinweisFuer: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  testphaseHinweisAm: Date | null;

  @Field()
  @Column({ type: 'boolean', default: false })
  cancelAtPeriodEnd: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  retentionWarnedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  stripeCustomerId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  stripeSubscriptionId: string | null;

  @OneToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
