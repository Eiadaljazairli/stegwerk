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

import { WorkspaceEntity } from '../workspaces/workspace.entity';

@ObjectType('WebForm')
@Entity({ name: 'web_forms' })
@Index(['workspaceId'], { unique: true })
export class WebFormEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  ownerId: string;

  @Field()
  @Column({ type: 'varchar', length: 120, default: 'Kontakt aufnehmen' })
  title: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  intro: string | null;

  @Field()
  @Column({
    type: 'varchar',
    length: 500,
    default: 'Danke für Ihre Nachricht. Wir melden uns bald.',
  })
  thankYou: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  privacyUrl: string | null;

  @Field()
  @Column({ type: 'boolean', default: true })
  createDeal: boolean;

  @Field()
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'integer', default: 0 })
  heuteAnzahl: number;

  @Column({ type: 'date', nullable: true })
  heuteDatum: string | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
