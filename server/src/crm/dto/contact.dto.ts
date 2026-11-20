import { Field, ID, InputType, OmitType, PartialType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsUUID,
  MaxLength,
  ValidateNested,
  IsIn,
} from 'class-validator';

import { HERKUNFT_AUS_OBERFLAECHE } from '../herkunft';

import { CustomFieldValuesScalar } from '../../custom-fields/custom-field-values.scalar';
import { type CustomFieldValues } from '../../custom-fields/custom-field.types';
import {
  KontaktEmailInput,
  KontaktTelefonInput,
  MAX_WEITERE,
  Telefonnummer,
} from '../kontaktwege';
import { NichtNurLeerzeichen } from './grenzen';

@InputType()
export class CreateContactInput {
  @Field()
  @IsNotEmpty()
  @NichtNurLeerzeichen('Der Vorname')
  @MaxLength(100)
  firstName: string;

  @Field()
  @IsNotEmpty()
  @NichtNurLeerzeichen('Der Nachname')
  @MaxLength(100)
  lastName: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @Field({ nullable: true })
  @IsOptional()
  @Telefonnummer()
  @MaxLength(40)
  phone?: string;

  @Field(() => [KontaktEmailInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_WEITERE)
  @ValidateNested({ each: true })
  @Type(() => KontaktEmailInput)
  weitereEmails?: KontaktEmailInput[];

  @Field(() => [KontaktTelefonInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_WEITERE)
  @ValidateNested({ each: true })
  @Type(() => KontaktTelefonInput)
  weitereTelefone?: KontaktTelefonInput[];

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(150)
  jobTitle?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(200)
  street?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(20)
  postalCode?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(120)
  city?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(120)
  country?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(500)
  linkedin?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @Field(() => CustomFieldValuesScalar, { nullable: true })
  @IsOptional()
  @IsObject()
  customFields?: CustomFieldValues;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  ownerId?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn([...HERKUNFT_AUS_OBERFLAECHE])
  herkunft?: string;
}

@InputType()
export class UpdateContactInput extends PartialType(
  OmitType(CreateContactInput, ['herkunft'] as const),
) {
  @Field(() => ID)
  @IsUUID()
  id: string;
}
