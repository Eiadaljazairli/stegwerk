import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { InvoiceEntity } from '../invoices/invoice.entity';
import { type FehlerArt } from '../mailboxes/abruf-fehler';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';

export type BuchhaltungsAnbieter = 'lexware' | 'sevdesk';

export const BUCHHALTUNGS_ANBIETER: readonly BuchhaltungsAnbieter[] = [
  'lexware',
  'sevdesk',
];

export const ANBIETER_NAME: Record<BuchhaltungsAnbieter, string> = {
  lexware: 'Lexware Office',
  sevdesk: 'sevDesk',
};

@ObjectType('BuchhaltungVerbindung')
@Entity({ name: 'buchhaltung_verbindungen' })
export class BuchhaltungVerbindungEntity {
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
  anbieter: BuchhaltungsAnbieter;

  @Column({ type: 'text' })
  schluesselVersiegelt: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 300, nullable: true })
  kontoName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  kontoKennung: string | null;

  @Field()
  @Column({ type: 'boolean', default: true })
  automatisch: boolean;

  @Field()
  @Column({ type: 'boolean', default: true })
  zahlungenAbgleichen: boolean;

  @Column({ type: 'uuid', nullable: true })
  verbundenVonId: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'verbundenVonId' })
  verbundenVon: UserEntity | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  anmeldungFehlerAm: Date | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  anmeldungFehler: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  anmeldungGeprueftAm: Date | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  anbieterDaten: Record<string, unknown>;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

export type UebertragungsStatus =
  | 'wartet'
  | 'laeuft'
  | 'uebertragen'
  | 'fehler';

@ObjectType('BuchhaltungUebertragung')
@Entity({ name: 'buchhaltung_uebertragungen' })
@Index(['status', 'naechsterVersuchAm'])
export class BuchhaltungUebertragungEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Field(() => ID)
  @Index({ unique: true })
  @Column({ type: 'uuid' })
  invoiceId: string;

  @OneToOne(() => InvoiceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoiceId' })
  invoice: InvoiceEntity;

  @Field()
  @Column({ type: 'varchar', length: 20 })
  anbieter: BuchhaltungsAnbieter;

  @Field()
  @Column({ type: 'varchar', length: 20, default: 'wartet' })
  status: UebertragungsStatus;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  externeBelegId: string | null;

  @Column({ type: 'boolean', default: false })
  dateiAngehaengt: boolean;

  @Field()
  @Column({ type: 'boolean', default: false })
  zuPruefen: boolean;

  @Field(() => Int)
  @Column({ type: 'integer', default: 0 })
  versuche: number;

  @Column({ type: 'timestamptz', nullable: true })
  naechsterVersuchAm: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  gesperrtBis: Date | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  letzterFehler: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 20, nullable: true })
  fehlerArt: FehlerArt | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  uebertragenAm: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  zahlungGeprueftAm: Date | null;

  @Field()
  @Column({ type: 'boolean', default: false })
  bezahltGemeldet: boolean;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

@Entity({ name: 'buchhaltung_kontakte' })
@Index(['verbindungId', 'art', 'datensatzId'], { unique: true })
export class BuchhaltungKontaktEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  verbindungId: string;

  @ManyToOne(() => BuchhaltungVerbindungEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'verbindungId' })
  verbindung: BuchhaltungVerbindungEntity;

  @Column({ type: 'varchar', length: 10 })
  art: 'company' | 'contact';

  @Column({ type: 'uuid' })
  datensatzId: string;

  @Column({ type: 'varchar', length: 100 })
  externeId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
