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

import { type FehlerArt } from '../mailboxes/abruf-fehler';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';

export type KalenderSichtbarkeit = 'alles' | 'belegt';

export const KALENDER_SICHTBARKEITEN: readonly KalenderSichtbarkeit[] = [
  'alles',
  'belegt',
];

@ObjectType('KalenderVerbindung')
@Entity({ name: 'kalender_verbindungen' })
@Index(['workspaceId', 'userId'], { unique: true })
export class KalenderVerbindungEntity {
  @Field(() => ID)
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

  @Field()
  @Column({ type: 'varchar', length: 20, default: 'caldav' })
  anbieter: string;

  @Column({ type: 'uuid', nullable: true })
  oauthZugangId: string | null;

  @Field()
  @Column({ type: 'varchar', length: 500 })
  serverUrl: string;

  @Field()
  @Column({ type: 'varchar', length: 200 })
  benutzer: string;

  @Column({ type: 'text' })
  passwortVersiegelt: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 1000, nullable: true })
  kalenderUrl: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 200, nullable: true })
  kalenderName: string | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  letzterSyncAm: Date | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  letzterFehler: string | null;

  @Field(() => String)
  @Column({ type: 'varchar', length: 10, default: 'belegt' })
  sichtbarkeit: KalenderSichtbarkeit;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 20, nullable: true })
  fehlerArt: FehlerArt | null;

  @Field(() => Int)
  @Column({ type: 'integer', default: 0 })
  fehlversuche: number;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  fehlerSeit: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  fehlerMailAm: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  letzterVersuchAm: Date | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
