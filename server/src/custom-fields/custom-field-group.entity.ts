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

import { CustomFieldEntity } from './custom-field.types';

@ObjectType('CustomFieldGroup')
@Entity({ name: 'custom_field_groups' })
@Index(['workspaceId', 'entity', 'name'], { unique: true })
export class CustomFieldGroupEntity {
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

  @Field(() => CustomFieldEntity)
  @Column({ type: 'varchar', length: 20 })
  entity: CustomFieldEntity;

  @Field()
  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Field(() => Int)
  @Column({ type: 'integer', default: 0 })
  position: number;

  @Field()
  @Column({ type: 'boolean', default: false })
  eingeklappt: boolean;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
