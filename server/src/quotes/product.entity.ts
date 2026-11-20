import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { DEFAULT_UNIT } from './quote.types';

@ObjectType('Product')
@Entity({ name: 'products' })
@Index(['workspaceId', 'name'])
export class ProductEntity {
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
  @Column({ type: 'varchar', length: 60, nullable: true })
  articleNumber: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Field(() => Int)
  @Column({ type: 'integer', default: 0 })
  unitPriceCents: number;

  @Field()
  @Column({ type: 'varchar', length: 20, default: DEFAULT_UNIT })
  unit: string;

  @Field(() => Int)
  @Column({ type: 'integer', default: 19 })
  taxRatePercent: number;

  @Field()
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
