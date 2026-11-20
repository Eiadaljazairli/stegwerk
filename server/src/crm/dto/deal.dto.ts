import {
  Field,
  ID,
  InputType,
  Int,
  OmitType,
  PartialType,
} from '@nestjs/graphql';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  IsIn,
} from 'class-validator';

import { HERKUNFT_AUS_OBERFLAECHE } from '../herkunft';

import { CustomFieldValuesScalar } from '../../custom-fields/custom-field-values.scalar';
import { type CustomFieldValues } from '../../custom-fields/custom-field.types';

import { DealStage } from '../entities/deal.entity';
import { Getrimmt } from './getrimmt';
import { Betrag, NichtNurLeerzeichen } from './grenzen';

@InputType()
export class CreateDealInput {
  @Field()
  @Getrimmt()
  @NichtNurLeerzeichen('Der Name')
  @MaxLength(200)
  name: string;

  @Field({ nullable: true })
  @IsOptional()
  @Betrag('Der Betrag')
  amount?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt({ message: 'Die Wahrscheinlichkeit ist eine ganze Zahl.' })
  @Min(0, { message: 'Die Wahrscheinlichkeit liegt zwischen 0 und 100 %.' })
  @Max(100, { message: 'Die Wahrscheinlichkeit liegt zwischen 0 und 100 %.' })
  probability?: number | null;

  @Field({ nullable: true })
  @IsOptional()
  @Length(3, 3, { message: 'Currency must be a 3-letter ISO 4217 code' })
  currency?: string;

  @Field(() => DealStage, { nullable: true })
  @IsOptional()
  @IsEnum(DealStage)
  stage?: DealStage;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString(
    { strict: true },
    { message: 'Dieses Abschlussdatum gibt es nicht.' },
  )
  closeDate?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  primaryContactId?: string;

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
  @MaxLength(200)
  lostReason?: string | null;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  pipelineId?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn([...HERKUNFT_AUS_OBERFLAECHE])
  herkunft?: string;
}

@InputType()
export class UpdateDealInput extends PartialType(
  OmitType(CreateDealInput, ['herkunft'] as const),
) {
  @Field(() => ID)
  @IsUUID()
  id: string;
}
