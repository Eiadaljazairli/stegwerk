import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { numericTransformer } from '../crm/numeric.transformer';
import { type GespeicherteBezeichnungen } from '../objekt-bezeichnungen/objekt-bezeichnungen';
import { MembershipEntity } from './membership.entity';

@ObjectType('Workspace')
@Entity({ name: 'workspaces' })
export class WorkspaceEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Field()
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 60 })
  slug: string;

  @Field(() => Float, { nullable: true })
  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  baseInterestRatePercent: number | null;

  @Field()
  @Column({ type: 'boolean', default: false })
  zweiFaktorPflicht: boolean;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'integer', nullable: true })
  leerlaufMinuten: number | null;

  @Field(() => Int)
  @Column({ type: 'integer', default: 30 })
  papierkorbTage: number;

  @Field(() => [String])
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  einladungsDomains: string[];

  @Column({ type: 'jsonb', default: () => "'{}'" })
  objektBezeichnungen: GespeicherteBezeichnungen;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => MembershipEntity, (membership) => membership.workspace)
  memberships: MembershipEntity[];
}
