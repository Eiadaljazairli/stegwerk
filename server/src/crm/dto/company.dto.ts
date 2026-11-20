import {
  Field,
  ID,
  InputType,
  Int,
  OmitType,
  PartialType,
} from '@nestjs/graphql';
import { CustomFieldValuesScalar } from '../../custom-fields/custom-field-values.scalar';
import { type CustomFieldValues } from '../../custom-fields/custom-field.types';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  IsIn,
} from 'class-validator';

import { HERKUNFT_AUS_OBERFLAECHE } from '../herkunft';

import { Betrag, NichtNurLeerzeichen } from './grenzen';

@InputType()
export class CreateCompanyInput {
  @Field()
  @IsNotEmpty()
  @NichtNurLeerzeichen('Der Name')
  @MaxLength(200)
  name: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(255)
  domain?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  zweitdomains?: string[];

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(500)
  website?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(500)
  linkedin?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(120)
  industry?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @IsPositive()
  employeeCount?: number;

  @Field({ nullable: true })
  @IsOptional()
  @Betrag('Der Jahresumsatz')
  annualRevenue?: number;

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
  @IsEmail({}, { message: 'Bitte eine gültige E-Mail-Adresse angeben.' })
  @MaxLength(254)
  invoiceEmail?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(50)
  phone?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsEmail({}, { message: 'Bitte eine gültige E-Mail-Adresse angeben.' })
  @MaxLength(254)
  email?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(120)
  registergericht?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(40)
  registernummer?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(20)
  ustIdNr?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(300)
  vertretung?: string;

  @Field(() => CustomFieldValuesScalar, { nullable: true })
  @IsOptional()
  @IsObject()
  customFields?: CustomFieldValues;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  parentCompanyId?: string | null;

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
export class UpdateCompanyInput extends PartialType(
  OmitType(CreateCompanyInput, ['herkunft'] as const),
) {
  @Field(() => ID)
  @IsUUID()
  id: string;
}
