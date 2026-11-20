import {
  Field,
  Float,
  ID,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import {
  verbirgEigeneFelder,
  verbirgFeld,
} from '../../workspaces/feld-middleware';
import { CustomFieldValuesScalar } from '../../custom-fields/custom-field-values.scalar';
import { type CustomFieldValues } from '../../custom-fields/custom-field.types';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { UserEntity } from '../../users/user.entity';
import { WorkspaceEntity } from '../../workspaces/workspace.entity';

import { numericTransformer } from '../numeric.transformer';
import { CompanyEntity } from './company.entity';
import { ContactEntity } from './contact.entity';

export enum DealStage {
  LEAD = 'lead',
  QUALIFIED = 'qualified',
  PROPOSAL = 'proposal',
  NEGOTIATION = 'negotiation',
  WON = 'won',
  LOST = 'lost',
}

registerEnumType(DealStage, { name: 'DealStage' });

export const OPEN_DEAL_STAGES: readonly DealStage[] = [
  DealStage.LEAD,
  DealStage.QUALIFIED,
  DealStage.PROPOSAL,
  DealStage.NEGOTIATION,
];

@ObjectType('Deal')
@Entity({ name: 'deals' })
@Index(['workspaceId', 'stage'])
@Index('IDX_deals_workspace_owner', ['workspaceId', 'ownerId'])
export class DealEntity {
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
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Field(() => Float, {
    nullable: true,
    middleware: [verbirgFeld('deal.amount')],
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  amount: number | null;

  @Field()
  @Column({ type: 'varchar', length: 3, default: 'EUR' })
  currency: string;

  @Field(() => DealStage)
  @Column({ type: 'enum', enum: DealStage, default: DealStage.LEAD })
  stage: DealStage;

  @Field(() => String, { nullable: true })
  @Column({ type: 'date', nullable: true })
  closeDate: string | null;

  @Field(() => Int, {
    nullable: true,
    middleware: [verbirgFeld('deal.probability')],
  })
  @Column({ type: 'smallint', nullable: true })
  probability: number | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  pipelineId: string | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  companyId: string | null;

  @Field(() => CompanyEntity, { nullable: true })
  @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'companyId' })
  company: CompanyEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  primaryContactId: string | null;

  @Field(() => ContactEntity, { nullable: true })
  @ManyToOne(() => ContactEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'primaryContactId' })
  primaryContact: ContactEntity | null;

  @Field(() => CustomFieldValuesScalar, {
    middleware: [verbirgEigeneFelder('deal')],
  })
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  customFields: CustomFieldValues;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 20, nullable: true })
  herkunft: string | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  ownerId: string | null;

  @Field(() => UserEntity, { nullable: true })
  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ownerId' })
  owner: UserEntity | null;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  deletedById: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 200, nullable: true })
  lostReason: string | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
