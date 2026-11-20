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

import { UserEntity } from '../users/user.entity';
import { type FehlerArt } from './abruf-fehler';
import { WorkspaceEntity } from '../workspaces/workspace.entity';

export const MAIL_SICHTBARKEITEN = ['alles', 'kopf', 'privat'] as const;

export type MailSichtbarkeit = (typeof MAIL_SICHTBARKEITEN)[number];

export const POSTFACH_ARTEN = ['persoenlich', 'gemeinsam'] as const;

export type PostfachArt = (typeof POSTFACH_ARTEN)[number];

@ObjectType('Mailbox')
@Entity({ name: 'mailboxes' })
@Index(['workspaceId', 'userId'])
export class MailboxEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Field()
  @Column({ type: 'varchar', length: 12, default: 'persoenlich' })
  art: PostfachArt;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  bezeichnung: string | null;

  @Field()
  @Column({ type: 'boolean', default: true })
  haupt: boolean;

  @Field()
  @Column({ type: 'varchar', length: 200 })
  host: string;

  @Field(() => Int)
  @Column({ type: 'integer', default: 993 })
  port: number;

  @Field()
  @Column({ type: 'boolean', default: true })
  secure: boolean;

  @Field()
  @Column({ type: 'varchar', length: 200 })
  username: string;

  @Column({ type: 'text' })
  passwordSealed: string;

  @Column({ type: 'uuid', nullable: true })
  oauthZugangId: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 20, nullable: true })
  oauthAnbieter: string | null;

  @Field()
  @Column({ type: 'varchar', length: 200, default: 'INBOX' })
  folder: string;

  @Field()
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 200, nullable: true })
  smtpHost: string | null;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'integer', nullable: true })
  smtpPort: number | null;

  @Field()
  @Column({ type: 'boolean', default: false })
  smtpSecure: boolean;

  @Column({ type: 'bigint', default: 0 })
  uidValidity: string;

  @Column({ type: 'bigint', default: 0 })
  gelesenBis: string;

  @Field()
  @Column({ type: 'varchar', length: 10, default: 'alles' })
  sichtbarkeit: MailSichtbarkeit;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 200, nullable: true })
  gesendetOrdner: string | null;

  @Field()
  @Column({ type: 'boolean', default: true })
  ausschlussIntern: boolean;

  @Field()
  @Column({ type: 'boolean', default: true })
  ausschlussMassenpost: boolean;

  @Field()
  @Column({ type: 'boolean', default: false })
  ausschlussGruppen: boolean;

  @Field()
  @Column({ type: 'boolean', default: false })
  ausschlussFreemail: boolean;

  @Field()
  @Column({ type: 'boolean', default: true })
  ausschlussGmailKategorien: boolean;

  @Field(() => [String])
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  aliase: string[];

  @Field()
  @Column({ type: 'boolean', default: false })
  anhaengeAutomatisch: boolean;

  @Field(() => Int)
  @Column({ type: 'integer', default: 5 })
  anhaengeBisMb: number;

  @Column({ type: 'bigint', default: 0 })
  gesendetUidValidity: string;

  @Column({ type: 'bigint', default: 0 })
  gesendetGelesenBis: string;

  @Column({ type: 'timestamptz', nullable: true })
  getrenntAm: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 300, nullable: true })
  lastError: string | null;

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

  @Field(() => Int)
  @Column({ type: 'integer', default: 0 })
  messageCount: number;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
