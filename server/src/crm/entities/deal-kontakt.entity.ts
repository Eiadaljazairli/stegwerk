import { Field, ID, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { WorkspaceEntity } from '../../workspaces/workspace.entity';
import { ContactEntity } from './contact.entity';
import { DealEntity } from './deal.entity';

@ObjectType('DealKontakt')
@Entity({ name: 'deal_kontakte' })
@Unique('UQ_deal_kontakte_deal_kontakt', ['dealId', 'contactId'])
@Index('IDX_deal_kontakte_workspace_kontakt', ['workspaceId', 'contactId'])
export class DealKontaktEntity {
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
  dealId: string;

  @ManyToOne(() => DealEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dealId' })
  deal: DealEntity;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  contactId: string;

  @Field(() => ContactEntity, { nullable: true })
  @ManyToOne(() => ContactEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contactId' })
  contact: ContactEntity | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 60, nullable: true })
  rolle: string | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
