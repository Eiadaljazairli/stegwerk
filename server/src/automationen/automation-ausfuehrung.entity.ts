import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { AutomationEntity } from './automation.entity';

export enum AusfuehrungStatus {
  GEPLANT = 'GEPLANT',
  LAEUFT = 'LAEUFT',
  OK = 'OK',
  UEBERSPRUNGEN = 'UEBERSPRUNGEN',
  FEHLER = 'FEHLER',
  ABGEBROCHEN = 'ABGEBROCHEN',
}

export type SchrittProtokoll = {
  nr: number;
  aktion: string;
  status: AusfuehrungStatus;
  grund: string | null;
  eingabe: Record<string, unknown>;
  ausgabe: unknown;
};

registerEnumType(AusfuehrungStatus, { name: 'AusfuehrungStatus' });

@ObjectType('AutomationAusfuehrung')
@Entity({ name: 'automation_ausfuehrungen' })
@Index('IDX_automation_ausfuehrungen_faellig', ['status', 'faelligAm'])
@Index('IDX_automation_ausfuehrungen_regel', ['automationId', 'createdAt'])
export class AutomationAusfuehrungEntity {
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
  automationId: string;

  @ManyToOne(() => AutomationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'automationId' })
  automation: AutomationEntity;

  @Field()
  @Column({ type: 'varchar', length: 10 })
  zielArt: string;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  zielId: string | null;

  @Field()
  @Column({ type: 'boolean', default: false })
  testlauf: boolean;

  @Column({ type: 'jsonb', nullable: true })
  ausloeserDaten: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  schritte: SchrittProtokoll[] | null;

  @Field(() => AusfuehrungStatus)
  @Column({ type: 'varchar', length: 20 })
  status: AusfuehrungStatus;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 300, nullable: true })
  grund: string | null;

  @Field()
  @Column({ type: 'timestamptz' })
  faelligAm: Date;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  erledigtAm: Date | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

@Entity({ name: 'automation_ruhend' })
export class AutomationRuhendEntity {
  @PrimaryColumn({ type: 'uuid' })
  automationId: string;

  @ManyToOne(() => AutomationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'automationId' })
  automation: AutomationEntity;

  @PrimaryColumn({ type: 'uuid' })
  dealId: string;

  @Column({ type: 'timestamptz' })
  letzteAktivitaet: Date;
}
