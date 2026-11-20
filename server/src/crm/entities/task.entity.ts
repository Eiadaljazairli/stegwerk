import { Field, ID, ObjectType } from '@nestjs/graphql';
import { verbirgEigeneFelder } from '../../workspaces/feld-middleware';
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

import { WorkspaceEntity } from '../../workspaces/workspace.entity';

import { CompanyEntity } from './company.entity';
import { ContactEntity } from './contact.entity';
import { DealEntity } from './deal.entity';

@ObjectType('Task')
@Entity({ name: 'tasks' })
@Index(['workspaceId', 'assigneeId', 'completedAt', 'dueDate'])
export class TaskEntity {
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
  title: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'date', nullable: true })
  dueDate: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 5, nullable: true })
  dueTime: string | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  inArbeitSeit: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  assigneeId: string;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  createdById: string;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  companyId: string | null;

  @Field(() => CompanyEntity, { nullable: true })
  @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: CompanyEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  contactId: string | null;

  @Field(() => ContactEntity, { nullable: true })
  @ManyToOne(() => ContactEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contactId' })
  contact: ContactEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  dealId: string | null;

  @Field(() => DealEntity, { nullable: true })
  @ManyToOne(() => DealEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dealId' })
  deal: DealEntity | null;

  @Field(() => CustomFieldValuesScalar, {
    middleware: [verbirgEigeneFelder('task')],
  })
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  customFields: CustomFieldValues;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  deletedById: string | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
