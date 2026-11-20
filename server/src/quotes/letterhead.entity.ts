import { Field, ID, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { WorkspaceEntity } from '../workspaces/workspace.entity';

@ObjectType('Letterhead')
@Entity({ name: 'workspace_letterheads' })
export class LetterheadEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Column({ type: 'uuid', unique: true })
  workspaceId: string;

  @OneToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 200, nullable: true })
  companyName: string | null;

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

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 120, nullable: true })
  phone: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 200, nullable: true })
  email: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 200, nullable: true })
  website: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 200, nullable: true })
  representative: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 200, nullable: true })
  registerEntry: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 60, nullable: true })
  taxNumber: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 30, nullable: true })
  vatId: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 120, nullable: true })
  bankName: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 40, nullable: true })
  iban: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 20, nullable: true })
  bic: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 7, nullable: true })
  datevBeraternummer: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 5, nullable: true })
  datevMandantennummer: string | null;

  @Field()
  @Column({ type: 'varchar', length: 5, default: 'SKR03' })
  datevKontenrahmen: string;

  @Field()
  @Column({ type: 'boolean', default: false })
  smallBusiness: boolean;

  @Field()
  @Column({ type: 'integer', default: 30 })
  defaultValidityDays: number;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  defaultIntroText: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  defaultClosingText: string | null;

  @Column({ type: 'bytea', nullable: true })
  logo: Buffer | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  logoMime: string | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
