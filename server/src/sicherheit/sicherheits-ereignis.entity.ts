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
import { WorkspaceEntity } from '../workspaces/workspace.entity';

@Entity({ name: 'sicherheits_ereignisse' })
@Index(['workspaceId', 'createdAt'])
@Index(['userId', 'createdAt'])
export class SicherheitsEreignisEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  workspaceId: string | null;

  @ManyToOne(() => WorkspaceEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity | null;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity | null;

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar', length: 40 })
  art: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  geraet: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipGekuerzt: string | null;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, string | number | boolean | null> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
