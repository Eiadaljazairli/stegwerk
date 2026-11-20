import { Field, ID, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { MembershipEntity } from '../workspaces/membership.entity';

@ObjectType('User')
@Entity({ name: 'users' })
export class UserEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  @Field()
  @Column({ type: 'boolean', default: true })
  passwortGesetzt: boolean;

  @Field()
  @Column({ type: 'varchar', length: 100 })
  firstName: string;

  @Field()
  @Column({ type: 'varchar', length: 100 })
  lastName: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  funktion: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 50, nullable: true })
  durchwahl: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  mailSignatur: string | null;

  @Column({ type: 'text', nullable: true })
  totpSecret: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  totpEnabledAt: Date | null;

  @Column({ type: 'bigint', nullable: true })
  totpLastCounter: string | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  zuletztGesehenAt: Date | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => MembershipEntity, (membership) => membership.user)
  memberships: MembershipEntity[];
}
