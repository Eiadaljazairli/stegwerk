import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { UserEntity } from '../users/user.entity';
import { RoleEntity } from './role.entity';
import { WorkspaceEntity } from './workspace.entity';

export enum MembershipRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
}

registerEnumType(MembershipRole, { name: 'MembershipRole' });

@ObjectType('Membership')
@Entity({ name: 'memberships' })
@Index(['userId', 'workspaceId'], { unique: true })
export class MembershipEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  userId: string;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  workspaceId: string;

  @Field(() => ID, { nullable: true })
  @Index()
  @Column({ type: 'uuid', nullable: true })
  roleId: string | null;

  @Field(() => RoleEntity, { nullable: true })
  @ManyToOne(() => RoleEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'roleId' })
  roleRef: RoleEntity | null;

  @Field(() => MembershipRole)
  @Column({
    type: 'enum',
    enum: MembershipRole,
    default: MembershipRole.MEMBER,
  })
  role: MembershipRole;

  @Field()
  @Column({ type: 'boolean', default: true })
  taskDigest: boolean;

  @Field()
  @Column({ type: 'boolean', default: true })
  erwaehnungMail: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true })
  calendarFeedNonce: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'date', nullable: true })
  lastDigestOn: string | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field(() => UserEntity)
  @ManyToOne(() => UserEntity, (user) => user.memberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Field(() => WorkspaceEntity)
  @ManyToOne(() => WorkspaceEntity, (workspace) => workspace.memberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;
}
