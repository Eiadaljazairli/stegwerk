import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { UserEntity } from '../../users/user.entity';
import { WorkspaceEntity } from '../../workspaces/workspace.entity';

import { NoteEntity } from './note.entity';
import { TaskEntity } from './task.entity';

@Entity({ name: 'benachrichtigungen' })
@Index('IDX_benachrichtigungen_empfaenger', [
  'empfaengerId',
  'workspaceId',
  'createdAt',
])
export class BenachrichtigungEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Column({ type: 'uuid' })
  empfaengerId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empfaengerId' })
  empfaenger: UserEntity;

  @Column({ type: 'uuid', nullable: true })
  vonId: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vonId' })
  von: UserEntity | null;

  @Column({ type: 'varchar', length: 30 })
  art: string;

  @Column({ type: 'uuid', nullable: true })
  noteId: string | null;

  @ManyToOne(() => NoteEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'noteId' })
  note: NoteEntity | null;

  @Column({ type: 'uuid', nullable: true })
  taskId: string | null;

  @ManyToOne(() => TaskEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: TaskEntity | null;

  @Column({ type: 'uuid', nullable: true })
  mailEntwurfId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  gelesenAm: Date | null;
}
