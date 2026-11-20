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

import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';

export const ENTWURF_QUELLEN = ['automation', 'ki', 'hand'] as const;
export type EntwurfQuelle = (typeof ENTWURF_QUELLEN)[number];

export const ENTWURF_STATUS = [
  'entwurf',
  'sendet',
  'gesendet',
  'verworfen',
] as const;
export type EntwurfStatus = (typeof ENTWURF_STATUS)[number];

@ObjectType('MailEntwurf')
@Entity({ name: 'mail_entwuerfe' })
@Index('IDX_mail_entwuerfe_owner', ['workspaceId', 'ownerId', 'status'])
export class MailEntwurfEntity {
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

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  owner: UserEntity;

  @Field(() => [String])
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  an: string[];

  @Field(() => [String])
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  cc: string[];

  @Field()
  @Column({ type: 'varchar', length: 200 })
  betreff: string;

  @Field()
  @Column({ type: 'text' })
  rumpf: string;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  companyId: string | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  contactId: string | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  dealId: string | null;

  @Field(() => String)
  @Column({ type: 'varchar', length: 12 })
  quelle: EntwurfQuelle;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  automationId: string | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  kiVorschlagId: string | null;

  @Field(() => String)
  @Column({ type: 'varchar', length: 12, default: 'entwurf' })
  status: EntwurfStatus;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  gesendetAm: Date | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  nachrichtId: string | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
