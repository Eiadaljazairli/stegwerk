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

import { UserEntity } from '../../users/user.entity';
import {
  type FreigabeStufe,
  type SichtbarkeitsArt,
} from '../../workspaces/sichtbarkeit';
import { WorkspaceEntity } from '../../workspaces/workspace.entity';

@ObjectType('Freigabe')
@Entity({ name: 'freigaben' })
@Index(
  'IDX_freigaben_datensatz_person',
  ['workspaceId', 'art', 'datensatzId', 'userId'],
  { unique: true },
)
@Index('IDX_freigaben_person', ['workspaceId', 'userId', 'art'])
export class FreigabeEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Field(() => String)
  @Column({ type: 'varchar', length: 16 })
  art: SichtbarkeitsArt;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  datensatzId: string;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Field(() => String)
  @Column({ type: 'varchar', length: 16 })
  stufe: FreigabeStufe;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  erteiltVonId: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'erteiltVonId' })
  erteiltVon: UserEntity | null;

  @Field(() => Date)
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
