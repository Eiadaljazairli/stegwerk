import { Field, Float, InputType, ObjectType } from '@nestjs/graphql';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { UserEntity } from '../../users/user.entity';
import { WorkspaceEntity } from '../../workspaces/workspace.entity';

@InputType()
export class SignUpInput {
  @Field()
  @IsEmail()
  @MaxLength(320)
  email: string;

  @Field()
  @MinLength(12, { message: 'Password must be at least 12 characters long' })
  @MaxLength(128)
  password: string;

  @Field()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @Field()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @Field()
  @IsNotEmpty()
  @MaxLength(120)
  workspaceName: string;
}

@InputType()
export class SignInInput {
  @Field()
  @IsEmail()
  email: string;

  @Field()
  @IsNotEmpty()
  password: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(64)
  totpCode?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  angemeldetBleiben?: boolean;
}

@InputType()
export class RefreshInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsNotEmpty()
  refreshToken?: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  letzteEingabe?: number;
}

@ObjectType()
export class AuthPayload {
  @Field()
  token: string;

  @Field()
  refreshToken: string;

  @Field()
  angemeldetBleiben: boolean;

  @Field(() => UserEntity)
  user: UserEntity;

  @Field(() => WorkspaceEntity)
  workspace: WorkspaceEntity;
}

@InputType()
export class RequestPasswordResetInput {
  @Field()
  @IsEmail()
  @MaxLength(320)
  email: string;
}

@InputType()
export class VerifyEmailInput {
  @Field()
  @IsNotEmpty()
  token: string;
}

@InputType()
export class ResetPasswordInput {
  @Field()
  @IsNotEmpty()
  token: string;

  @Field()
  @MinLength(12, { message: 'Password must be at least 12 characters long' })
  @MaxLength(128)
  password: string;
}
