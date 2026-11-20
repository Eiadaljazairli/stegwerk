import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
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

export enum AutomationAusloeser {
  GESCHAEFT_ANGELEGT = 'GESCHAEFT_ANGELEGT',
  PHASE_GEAENDERT = 'PHASE_GEAENDERT',
  KONTAKT_ANGELEGT = 'KONTAKT_ANGELEGT',
  FIRMA_ANGELEGT = 'FIRMA_ANGELEGT',
  WEBFORMULAR_EINGANG = 'WEBFORMULAR_EINGANG',
  GESCHAEFT_GEAENDERT = 'GESCHAEFT_GEAENDERT',
  KONTAKT_GEAENDERT = 'KONTAKT_GEAENDERT',
  FIRMA_GEAENDERT = 'FIRMA_GEAENDERT',
  GESCHAEFT_RUHEND = 'GESCHAEFT_RUHEND',
  MANUELL = 'MANUELL',
  ZEITPLAN = 'ZEITPLAN',
  WEBHOOK_EINGANG = 'WEBHOOK_EINGANG',
}

export enum AutomationAktion {
  AUFGABE_ANLEGEN = 'AUFGABE_ANLEGEN',
  NOTIZ_ANLEGEN = 'NOTIZ_ANLEGEN',
  VERANTWORTLICH_REIHUM = 'VERANTWORTLICH_REIHUM',
  FELD_SETZEN = 'FELD_SETZEN',
  MAIL_SENDEN = 'MAIL_SENDEN',
  DATENSAETZE_SUCHEN = 'DATENSAETZE_SUCHEN',
  ANLEGEN_ODER_AKTUALISIEREN = 'ANLEGEN_ODER_AKTUALISIEREN',
  TERMIN_ANLEGEN = 'TERMIN_ANLEGEN',
  HTTP_ANFRAGE = 'HTTP_ANFRAGE',
  KANAL_NACHRICHT = 'KANAL_NACHRICHT',
}

export enum AutomationRhythmus {
  TAEGLICH = 'TAEGLICH',
  WOECHENTLICH = 'WOECHENTLICH',
  MONATLICH = 'MONATLICH',
}

export type AutomationArt = 'deal' | 'contact' | 'company';

export enum AutomationMailAn {
  VERANTWORTLICH = 'VERANTWORTLICH',
  HAUPTKONTAKT = 'HAUPTKONTAKT',
}

registerEnumType(AutomationAusloeser, { name: 'AutomationAusloeser' });
registerEnumType(AutomationAktion, { name: 'AutomationAktion' });
registerEnumType(AutomationMailAn, { name: 'AutomationMailAn' });
registerEnumType(AutomationRhythmus, { name: 'AutomationRhythmus' });

export type AutomationZeitplan = {
  rhythmus: AutomationRhythmus;
  uhrzeit: string;
  wochentag?: number | null;
  monatstag?: number | null;
};

export type AutomationFilter = {
  key: string;
  operator: string;
  value?: string | null;
};

export type AutomationBedingung = {
  phase?: string | null;
  filter?: AutomationFilter[];
  ruhendTage?: number | null;
  art?: AutomationArt | null;
  zeitplan?: AutomationZeitplan | null;
};

export type AutomationHeader = { name: string; wertSealed: string };

export type AutomationAktionDaten = {
  titel?: string | null;
  faelligInTagen?: number | null;
  zustaendigUserId?: string | null;
  reihumUserIds?: string[];
  feldKey?: string | null;
  feldWert?: string | null;
  mailAn?: AutomationMailAn | null;
  mailText?: string | null;
  vorlageId?: string | null;
  mailAlsEntwurf?: boolean | null;
  zielSchritt?: number | null;
  suchArt?: AutomationArt | null;
  suchFeld?: string | null;
  suchVergleich?: string | null;
  suchWert?: string | null;
  upsertArt?: AutomationArt | null;
  upsertWerte?: Record<string, string>;
  terminInTagen?: number | null;
  terminUhrzeit?: string | null;
  terminDauer?: number | null;
  terminOrt?: string | null;
  httpMethode?: string | null;
  httpUrl?: string | null;
  httpHeader?: AutomationHeader[];
  httpRumpf?: string | null;
  kanalDienst?: 'slack' | 'teams' | null;
  kanalUrlSealed?: string | null;
  kanalUrlAnzeige?: string | null;
  kanalText?: string | null;
  kanalLink?: boolean | null;
};

export type AutomationSchritt = {
  aktion: AutomationAktion;
  daten: AutomationAktionDaten;
};

@ObjectType('Automation')
@Entity({ name: 'automationen' })
@Index('IDX_automationen_ausloeser', ['workspaceId', 'ausloeser'])
export class AutomationEntity {
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
  @Column({ type: 'boolean', default: true })
  aktiv: boolean;

  @Field(() => AutomationAusloeser)
  @Column({ type: 'varchar', length: 40 })
  ausloeser: AutomationAusloeser;

  @Column({ type: 'jsonb', default: {} })
  bedingung: AutomationBedingung;

  @Field(() => AutomationAktion)
  @Column({ type: 'varchar', length: 40 })
  aktion: AutomationAktion;

  @Column({ type: 'jsonb', default: {} })
  aktionDaten: AutomationAktionDaten;

  @Field(() => Int)
  @Column({ type: 'integer', default: 0 })
  verzoegerungTage: number;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  schritte: AutomationSchritt[];

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  naechsterLauf: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true, unique: true })
  eingangTokenHash: string | null;

  @Column({ type: 'text', nullable: true })
  eingangGeheimnisSealed: string | null;

  @Column({ type: 'integer', default: 0 })
  reihumZeiger: number;

  @Column({ type: 'uuid' })
  erstelltVon: string;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
