import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { ContactEntity } from '../crm/entities/contact.entity';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';

@ObjectType('Verteiler')
@Entity({ name: 'verteiler' })
export class VerteilerEntity {
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

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  beschreibung: string | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy: UserEntity | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Field(() => Int)
  anzahl: number;
}

@Entity({ name: 'verteiler_mitglieder' })
export class VerteilerMitgliedEntity {
  @PrimaryColumn({ type: 'uuid' })
  verteilerId: string;

  @ManyToOne(() => VerteilerEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'verteilerId' })
  verteiler: VerteilerEntity;

  @PrimaryColumn({ type: 'uuid' })
  contactId: string;

  @ManyToOne(() => ContactEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contactId' })
  contact: ContactEntity;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @CreateDateColumn({ type: 'timestamptz' })
  hinzugefuegtAm: Date;
}

@ObjectType('VerteilerMitglied')
export class VerteilerMitgliedView {
  @Field(() => ContactEntity)
  contact: ContactEntity;

  @Field()
  hinzugefuegtAm: Date;

  @Field()
  abgemeldet: boolean;
}
