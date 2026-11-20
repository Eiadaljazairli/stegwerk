import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { InvitationEntity } from '../invitation.entity';
import { MembershipRole } from '../membership.entity';

@InputType()
export class InviteMemberInput {
  @Field()
  @IsEmail()
  @MaxLength(320)
  email: string;

  @Field(() => MembershipRole, { nullable: true })
  @IsEnum(MembershipRole)
  role: MembershipRole = MembershipRole.MEMBER;
}

@ObjectType()
export class InvitationCreated {
  @Field(() => InvitationEntity)
  invitation: InvitationEntity;

  @Field()
  inviteUrl: string;

  @Field()
  delivered: boolean;
}

@InputType()
export class AcceptInvitationInput {
  @Field()
  @IsNotEmpty()
  token: string;
}

@ObjectType()
export class MemberRemoved {
  @Field()
  removed: boolean;

  @Field(() => Int)
  reassignedTasks: number;
}

@InputType()
export class RemoveMemberInput {
  @Field(() => ID)
  @IsUUID()
  userId: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  nachfolgerId?: string;
}
