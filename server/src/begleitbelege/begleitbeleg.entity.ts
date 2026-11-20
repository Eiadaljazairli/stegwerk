import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { numericTransformer } from '../crm/numeric.transformer';
import { QuoteEntity } from '../quotes/quote.entity';
import { Steuerbefreiung } from '../quotes/steuerbefreiung';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { BegleitbelegArt, BegleitbelegStatus } from './begleitbeleg.types';

export type BearbeiterKopie = {
  name: string;
  funktion: string | null;
  durchwahl: string | null;
  email: string;
};

@ObjectType('Begleitbeleg')
@Entity({ name: 'begleitbelege' })
@Index(['workspaceId', 'number'], { unique: true })
export class BegleitbelegEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Index()
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Field(() => BegleitbelegArt)
  @Column({ type: 'varchar', length: 30 })
  art: BegleitbelegArt;

  @Field()
  @Column({ type: 'varchar', length: 30 })
  number: string;

  @Field(() => BegleitbelegStatus)
  @Column({ type: 'varchar', length: 20, default: BegleitbelegStatus.GESTELLT })
  status: BegleitbelegStatus;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  stornoVonId: string | null;

  @Field(() => BegleitbelegEntity, { nullable: true })
  @ManyToOne(() => BegleitbelegEntity, {
    nullable: true,
    onDelete: 'NO ACTION',
  })
  @JoinColumn({ name: 'stornoVonId' })
  stornoVon: BegleitbelegEntity | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  stornoGrund: string | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  storniertAm: Date | null;

  @Field(() => ID)
  @Index()
  @Column({ type: 'uuid' })
  angebotId: string;

  @Field(() => QuoteEntity)
  @ManyToOne(() => QuoteEntity, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'angebotId' })
  angebot: QuoteEntity;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  auftragsbestaetigungId: string | null;

  @Field(() => BegleitbelegEntity, { nullable: true })
  @ManyToOne(() => BegleitbelegEntity, {
    nullable: true,
    onDelete: 'NO ACTION',
  })
  @JoinColumn({ name: 'auftragsbestaetigungId' })
  auftragsbestaetigung: BegleitbelegEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  companyId: string | null;

  @Field(() => CompanyEntity, { nullable: true })
  @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'companyId' })
  company: CompanyEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  contactId: string | null;

  @Field(() => ContactEntity, { nullable: true })
  @ManyToOne(() => ContactEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contactId' })
  contact: ContactEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  dealId: string | null;

  @Field(() => DealEntity, { nullable: true })
  @ManyToOne(() => DealEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'dealId' })
  deal: DealEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  bearbeiterId: string | null;

  @Field(() => UserEntity, { nullable: true })
  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'bearbeiterId' })
  bearbeiter: UserEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  recipientAddress: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  lieferadresse: string | null;

  @Field()
  @Column({ type: 'date' })
  issuedOn: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'date', nullable: true })
  liefertermin: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  introText: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  closingText: string | null;

  @Field()
  @Column({ type: 'varchar', length: 3, default: 'EUR' })
  currency: string;

  @Field()
  @Column({ type: 'boolean', default: false })
  smallBusiness: boolean;

  @Field(() => Steuerbefreiung, { nullable: true })
  @Column({ type: 'varchar', length: 30, nullable: true })
  taxExemption: Steuerbefreiung | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 300, nullable: true })
  taxExemptionNote: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 20, nullable: true })
  recipientVatId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  issuerSnapshot: Record<string, unknown> | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 200, nullable: true })
  kontaktName: string | null;

  @Column({ type: 'jsonb', nullable: true })
  bearbeiterSnapshot: BearbeiterKopie | null;

  @Field(() => [BegleitbelegPositionEntity])
  @OneToMany(() => BegleitbelegPositionEntity, (position) => position.beleg)
  positionen: BegleitbelegPositionEntity[];

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

@ObjectType('BegleitbelegPosition')
@Entity({ name: 'begleitbeleg_positionen' })
@Index(['belegId', 'position'])
export class BegleitbelegPositionEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Index()
  @Column({ type: 'uuid' })
  belegId: string;

  @ManyToOne(() => BegleitbelegEntity, (beleg) => beleg.positionen, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'belegId' })
  beleg: BegleitbelegEntity;

  @Field(() => ID, { nullable: true })
  @Index()
  @Column({ type: 'uuid', nullable: true })
  angebotsPositionId: string | null;

  @Field(() => Int)
  @Column({ type: 'integer', default: 0 })
  position: number;

  @Field()
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 60, nullable: true })
  articleNumber: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Field(() => Float)
  @Column({
    type: 'numeric',
    precision: 12,
    scale: 3,
    transformer: numericTransformer,
  })
  quantity: number;

  @Field()
  @Column({ type: 'varchar', length: 20 })
  unit: string;

  @Field(() => Int)
  @Column({ type: 'integer', default: 0 })
  unitPriceCents: number;

  @Field(() => Float)
  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  discountPercent: number;

  @Field(() => Int)
  @Column({ type: 'integer', default: 19 })
  taxRatePercent: number;

  @Field(() => Float, { nullable: true })
  @Column({
    type: 'numeric',
    precision: 12,
    scale: 3,
    nullable: true,
    transformer: numericTransformer,
  })
  restOffen: number | null;
}
