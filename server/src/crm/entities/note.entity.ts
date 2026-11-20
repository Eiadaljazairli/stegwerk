import { Field, ID, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { WorkspaceEntity } from '../../workspaces/workspace.entity';

import { CompanyEntity } from './company.entity';
import { ContactEntity } from './contact.entity';
import { DealEntity } from './deal.entity';

@ObjectType('Note')
@Entity({ name: 'notes' })
@Index(['workspaceId', 'createdAt'])
export class NoteEntity {
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
  @Column({ type: 'text' })
  body: string;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  companyId: string | null;

  @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: CompanyEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  contactId: string | null;

  @ManyToOne(() => ContactEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contactId' })
  contact: ContactEntity | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  dealId: string | null;

  @ManyToOne(() => DealEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dealId' })
  deal: DealEntity | null;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  authorId: string;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  bearbeitetAm: Date | null;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  bearbeitetVonId: string | null;
}
