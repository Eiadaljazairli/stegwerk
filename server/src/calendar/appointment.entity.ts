import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
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

import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';

@ObjectType('Appointment')
@Entity({ name: 'appointments' })
@Index(['workspaceId', 'startsAt'])
@Index(['workspaceId', 'ownerId', 'startsAt'])
export class AppointmentEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Field()
  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 300, nullable: true })
  location: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  videoLink: string | null;

  @Field()
  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Field()
  @Column({ type: 'timestamptz' })
  endsAt: Date;

  @Field()
  @Column({ type: 'boolean', default: false })
  allDay: boolean;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  ownerId: string;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  createdById: string;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'integer', nullable: true })
  remindMinutesBefore: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  remindedAt: Date | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 300, nullable: true })
  recurrence: string | null;

  @Field(() => [String])
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  skippedDates: string[];

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  serieId: string | null;

  @ManyToOne(() => AppointmentEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'serieId' })
  serie?: AppointmentEntity | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 10, nullable: true })
  serieDatum: string | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  companyId: string | null;

  @Field(() => CompanyEntity, { nullable: true })
  @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: CompanyEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  contactId: string | null;

  @Field(() => ContactEntity, { nullable: true })
  @ManyToOne(() => ContactEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contactId' })
  contact: ContactEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  dealId: string | null;

  @Field(() => DealEntity, { nullable: true })
  @ManyToOne(() => DealEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dealId' })
  deal: DealEntity | null;

  @Field()
  @Column({ type: 'boolean', default: false })
  privat: boolean;

  @Column({ type: 'boolean', default: false })
  nurBelegt: boolean;

  geschwaerzt?: boolean;

  @Field()
  @Column({ type: 'varchar', length: 20, default: 'stegwerk' })
  quelle: string;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  eingeladenAm: Date | null;

  @Column({ type: 'integer', default: 0 })
  sequenz: number;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
