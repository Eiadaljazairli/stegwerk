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

import { WorkspaceEntity } from '../workspaces/workspace.entity';

@ObjectType('AvvAnnahme')
@Entity({ name: 'avv_annahmen' })
@Index(['workspaceId', 'angenommenAm'])
export class AvvAnnahmeEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Field()
  @Column({ type: 'varchar', length: 200 })
  angenommenVon: string;

  @Field()
  @Column({ type: 'varchar', length: 500 })
  auftraggeber: string;

  @Field()
  @Column({ type: 'varchar', length: 64 })
  fassung: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 64, nullable: true })
  ipGekuerzt: string | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  angenommenAm: Date;
}
