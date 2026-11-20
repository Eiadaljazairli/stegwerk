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

import { WorkspaceEntity } from '../workspaces/workspace.entity';

export type KampagnenStatus = 'entwurf' | 'laeuft' | 'fertig' | 'abgebrochen';

export type EmpfaengerStatus =
  | 'geplant'
  | 'sendet'
  | 'gesendet'
  | 'uebersprungen'
  | 'fehler';

@ObjectType('Kampagne')
@Entity({ name: 'kampagnen' })
@Index(['workspaceId', 'createdAt'])
export class KampagneEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Field()
  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Field()
  @Column({ type: 'varchar', length: 200 })
  betreff: string;

  @Field()
  @Column({ type: 'text' })
  text: string;

  @Field()
  @Column({ type: 'varchar', length: 60, default: 'allgemein' })
  thema: string;

  @Field()
  @Column({ type: 'varchar', length: 20, default: 'entwurf' })
  status: KampagnenStatus;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  erstelltVon: string;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  absenderId: string | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  gestartetAm: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  beendetAm: Date | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field(() => Int)
  geplant: number;

  @Field(() => Int)
  gesendet: number;

  @Field(() => Int)
  uebersprungen: number;

  @Field(() => Int)
  fehler: number;
}

@ObjectType('KampagnenEmpfaenger')
@Entity({ name: 'kampagnen_empfaenger' })
@Index(['kampagneId', 'status'])
export class KampagnenEmpfaengerEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  kampagneId: string;

  @ManyToOne(() => KampagneEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'kampagneId' })
  kampagne: KampagneEntity;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  contactId: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 320, nullable: true })
  email: string | null;

  @Field()
  @Column({ type: 'varchar', length: 100, default: '' })
  vorname: string;

  @Field()
  @Column({ type: 'varchar', length: 100, default: '' })
  nachname: string;

  @Field()
  @Column({ type: 'varchar', length: 200, default: '' })
  firma: string;

  @Field()
  @Column({ type: 'varchar', length: 20 })
  status: EmpfaengerStatus;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 300, nullable: true })
  grund: string | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  gesendetAm: Date | null;
}

@Entity({ name: 'abmeldungen' })
@Index(['workspaceId', 'email', 'thema'], { unique: true })
export class AbmeldungEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Column({ type: 'varchar', length: 60 })
  thema: string;

  @CreateDateColumn({ type: 'timestamptz' })
  zeitpunkt: Date;
}
