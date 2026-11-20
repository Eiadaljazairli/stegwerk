import { Field, ID, ObjectType } from '@nestjs/graphql';
import {
  verbirgEigeneFelder,
  verbirgFeld,
  verbirgListe,
} from '../../workspaces/feld-middleware';
import { CustomFieldValuesScalar } from '../../custom-fields/custom-field-values.scalar';
import { type CustomFieldValues } from '../../custom-fields/custom-field.types';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { UserEntity } from '../../users/user.entity';
import { WorkspaceEntity } from '../../workspaces/workspace.entity';

import { KontaktEmail, KontaktTelefon } from '../kontaktwege';
import { CompanyEntity } from './company.entity';

@ObjectType('Contact')
@Entity({ name: 'contacts' })
@Index(['workspaceId', 'lastName'])
@Index('IDX_contacts_workspace_owner', ['workspaceId', 'ownerId'])
export class ContactEntity {
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

  @Field()
  @Column({ type: 'varchar', length: 100 })
  firstName: string;

  @Field()
  @Column({ type: 'varchar', length: 100 })
  lastName: string;

  @Field(() => String, {
    nullable: true,
    middleware: [verbirgFeld('contact.email')],
  })
  @Column({ type: 'varchar', length: 320, nullable: true })
  email: string | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  unzustellbarSeit: Date | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 300, nullable: true })
  unzustellbarGrund: string | null;

  @Field(() => String, {
    nullable: true,
    middleware: [verbirgFeld('contact.phone')],
  })
  @Column({ type: 'varchar', length: 40, nullable: true })
  phone: string | null;

  @Field(() => [KontaktEmail], {
    middleware: [verbirgListe('contact.email')],
  })
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  weitereEmails: KontaktEmail[];

  @Field(() => [KontaktTelefon], {
    middleware: [verbirgListe('contact.phone')],
  })
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  weitereTelefone: KontaktTelefon[];

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 150, nullable: true })
  jobTitle: string | null;

  @Field(() => String, {
    nullable: true,
    middleware: [verbirgFeld('contact.street')],
  })
  @Column({ type: 'varchar', length: 200, nullable: true })
  street: string | null;

  @Field(() => String, {
    nullable: true,
    middleware: [verbirgFeld('contact.street')],
  })
  @Column({ type: 'varchar', length: 20, nullable: true })
  postalCode: string | null;

  @Field(() => String, {
    nullable: true,
    middleware: [verbirgFeld('contact.street')],
  })
  @Column({ type: 'varchar', length: 120, nullable: true })
  city: string | null;

  @Field(() => String, {
    nullable: true,
    middleware: [verbirgFeld('contact.street')],
  })
  @Column({ type: 'varchar', length: 120, nullable: true })
  country: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  linkedin: string | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  companyId: string | null;

  @Field(() => CompanyEntity, { nullable: true })
  @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'companyId' })
  company: CompanyEntity | null;

  @Field(() => CustomFieldValuesScalar, {
    middleware: [verbirgEigeneFelder('contact')],
  })
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  customFields: CustomFieldValues;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 20, nullable: true })
  herkunft: string | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  ownerId: string | null;

  @Field(() => UserEntity, { nullable: true })
  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ownerId' })
  owner: UserEntity | null;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  deletedById: string | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
