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

import { MembershipRole } from './membership.entity';
import { WorkspaceEntity } from './workspace.entity';

@ObjectType('Invitation')
@Entity({ name: 'invitations' })
@Index(['workspaceId', 'email'])
export class InvitationEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Index()
  @Column({ type: 'uuid' })
  workspaceId: string;

  @Field()
  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Field(() => MembershipRole)
  @Column({
    type: 'enum',
    enum: MembershipRole,
    default: MembershipRole.MEMBER,
  })
  role: MembershipRole;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;

  @Field()
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  invitedById: string;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;
}
