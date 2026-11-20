import { Field, ID, ObjectType } from '@nestjs/graphql';
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
import { type KiAnbieter } from './ki-modelle';

export type KiNutzung = 'alle' | 'ki_recht';

export const KI_NUTZUNG: readonly KiNutzung[] = ['alle', 'ki_recht'];

@ObjectType('KiEinstellung')
@Entity({ name: 'ki_einstellungen' })
export class KiEinstellungEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Field()
  @Column({ type: 'varchar', length: 20 })
  anbieter: KiAnbieter;

  @Field()
  @Column({ type: 'varchar', length: 80 })
  modell: string;

  @Column({ type: 'text' })
  schluesselVersiegelt: string;

  @Field()
  @Column({ type: 'varchar', length: 10, default: 'alle' })
  nutzung: KiNutzung;

  @Column({ type: 'uuid', nullable: true })
  eingerichtetVonId: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'eingerichtetVonId' })
  eingerichtetVon: UserEntity | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  geprueftAm: Date | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
