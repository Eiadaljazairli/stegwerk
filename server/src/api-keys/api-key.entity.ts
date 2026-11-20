import { Field, ID, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { UserEntity } from '../users/user.entity';
import { type Schreibmodus } from './schreibmodus';
import { WorkspaceEntity } from '../workspaces/workspace.entity';

@ObjectType('ApiKey')
@Entity({ name: 'api_keys' })
@Index(['kennung'], { unique: true })
@Index(['workspaceId', 'revokedAt'])
export class ApiKeyEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Field()
  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Field()
  @Column({ type: 'varchar', length: 64 })
  kennung: string;

  @Column({ type: 'varchar', length: 64 })
  hash: string;

  @Field(() => [String])
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  permissions: string[];

  @Field(() => String)
  @Column({ type: 'varchar', length: 12, default: 'direkt' })
  schreibmodus: Schreibmodus;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy: UserEntity | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
