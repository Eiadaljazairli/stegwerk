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

import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { type OAuthAnbieter, type OAuthZweck } from './oauth-anbieter';

@Entity({ name: 'oauth_zugaenge' })
@Index(['workspaceId', 'userId', 'zweck'], { unique: true })
export class OAuthZugangEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ type: 'varchar', length: 20 })
  anbieter: OAuthAnbieter;

  @Column({ type: 'varchar', length: 20 })
  zweck: OAuthZweck;

  @Column({ type: 'varchar', length: 320 })
  konto: string;

  @Column({ type: 'text' })
  erneuerungVersiegelt: string;

  @Column({ type: 'text', nullable: true })
  zugriffVersiegelt: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  zugriffBis: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  widerrufenAm: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
