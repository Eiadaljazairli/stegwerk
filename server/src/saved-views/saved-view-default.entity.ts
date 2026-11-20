import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { CustomFieldEntity } from '../custom-fields/custom-field.types';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { SavedViewEntity } from './saved-view.entity';

@Entity({ name: 'saved_view_defaults' })
@Index(['userId', 'workspaceId', 'entity'], { unique: true })
export class SavedViewDefaultEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Column({ type: 'varchar', length: 20 })
  entity: CustomFieldEntity;

  @Column({ type: 'uuid' })
  savedViewId: string;

  @ManyToOne(() => SavedViewEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'savedViewId' })
  savedView: SavedViewEntity;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
