import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
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

@ObjectType('Company')
@Entity({ name: 'companies' })
@Index(['workspaceId', 'name'])
@Index('IDX_companies_workspace_owner', ['workspaceId', 'ownerId'])
export class CompanyEntity {
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

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  domain: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 120, nullable: true })
  industry: string | null;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'integer', nullable: true })
  employeeCount: number | null;

  @Field(() => Float, {
    nullable: true,
    middleware: [verbirgFeld('company.annualRevenue')],
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  annualRevenue: number | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 200, nullable: true })
  street: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 20, nullable: true })
  postalCode: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 120, nullable: true })
  city: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 120, nullable: true })
  country: string | null;

  @Field(() => ID, { nullable: true })
  @Index('IDX_companies_parentCompanyId')
  @Column({ type: 'uuid', nullable: true })
  parentCompanyId: string | null;

  @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parentCompanyId' })
  parentCompany: CompanyEntity | null;

  @Field(() => [String])
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  zweitdomains: string[];

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  website: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  linkedin: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 254, nullable: true })
  invoiceEmail: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 254, nullable: true })
  email: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 120, nullable: true })
  registergericht: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 40, nullable: true })
  registernummer: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 20, nullable: true })
  ustIdNr: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 300, nullable: true })
  vertretung: string | null;

  @Field(() => CustomFieldValuesScalar, {
    middleware: [verbirgEigeneFelder('company')],
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

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
