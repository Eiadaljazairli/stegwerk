import { Field, ID, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsUUID, MaxLength } from 'class-validator';

import { SichererText } from './sicherer-text';

@InputType()
export class CreateNoteInput {
  @Field()
  @IsNotEmpty()
  @MaxLength(10000)
  @SichererText()
  body: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  dealId?: string;
}

@InputType()
export class UpdateNoteInput {
  @Field(() => ID)
  @IsUUID()
  id: string;

  @Field()
  @IsNotEmpty()
  @MaxLength(10000)
  @SichererText()
  body: string;
}

@InputType()
export class NotizZieleInput {
  @Field(() => ID)
  @IsUUID()
  id: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  companyId?: string | null;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  contactId?: string | null;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  dealId?: string | null;
}
