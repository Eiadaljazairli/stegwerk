import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { WorkspaceEntity } from '../workspaces/workspace.entity';

export enum AuditAction {
  CREATED = 'created',
  UPDATED = 'updated',
  DELETED = 'deleted',
  RESTORED = 'restored',
}

registerEnumType(AuditAction, { name: 'AuditAction' });

@ObjectType('AuditLogEntry')
@Entity({ name: 'audit_log' })
@Index(['workspaceId', 'createdAt'])
@Index(['workspaceId', 'entityType', 'entityId'])
export class AuditLogEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @Field(() => AuditAction)
  @Column({ type: 'enum', enum: AuditAction })
  action: AuditAction;

  @Field()
  @Column({ type: 'varchar', length: 60 })
  entityType: string;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  entityId: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 300, nullable: true })
  summary: string | null;

  @Column({ type: 'jsonb', nullable: true })
  changes: Record<string, [unknown, unknown]> | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 64, nullable: true })
  requestId: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 30, nullable: true })
  herkunft: string | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
