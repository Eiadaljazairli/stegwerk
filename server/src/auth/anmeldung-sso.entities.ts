import { Field, ObjectType } from '@nestjs/graphql';
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

import { type OAuthAnbieter } from '../oauth/oauth-anbieter';
import { UserEntity } from '../users/user.entity';

export const SSO_ZWECKE = ['anmelden', 'registrieren', 'verknuepfen'] as const;

export type SsoZweck = (typeof SSO_ZWECKE)[number];

@ObjectType('AnmeldeVerknuepfung')
@Entity({ name: 'anmelde_verknuepfungen' })
@Index(['anbieter', 'subjekt'], { unique: true })
@Index(['userId', 'anbieter'], { unique: true })
export class AnmeldeVerknuepfungEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Field(() => String)
  @Column({ type: 'varchar', length: 20 })
  anbieter: OAuthAnbieter;

  @Column({ type: 'varchar', length: 255 })
  subjekt: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 320, nullable: true })
  email: string | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  zuletztAm: Date | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

@Entity({ name: 'anmelde_vorgaenge' })
export class AnmeldeVorgangEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  stateHash: string;

  @Column({ type: 'varchar', length: 64 })
  bindungHash: string;

  @Column({ type: 'varchar', length: 64 })
  nonceHash: string;

  @Column({ type: 'varchar', length: 20 })
  anbieter: OAuthAnbieter;

  @Column({ type: 'varchar', length: 20 })
  zweck: SsoZweck;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  arbeitsbereich: string | null;

  @Column({ type: 'boolean', default: true })
  angemeldetBleiben: boolean;

  @Column({ type: 'text' })
  verifierVersiegelt: string;

  @Column({ type: 'timestamptz' })
  gueltigBis: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

@Entity({ name: 'anmelde_einloesungen' })
export class AnmeldeEinloesungEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ type: 'varchar', length: 64 })
  bindungHash: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 20 })
  anbieter: OAuthAnbieter;

  @Column({ type: 'boolean', default: true })
  angemeldetBleiben: boolean;

  @Column({ type: 'timestamptz' })
  gueltigBis: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
