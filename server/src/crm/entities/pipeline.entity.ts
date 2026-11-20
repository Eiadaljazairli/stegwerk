import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { WorkspaceEntity } from '../../workspaces/workspace.entity';

@ObjectType('Pipeline')
@Entity({ name: 'pipelines' })
@Index(['workspaceId', 'position'])
export class PipelineEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Field()
  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Field(() => Int)
  @Column({ type: 'integer', default: 0 })
  position: number;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
