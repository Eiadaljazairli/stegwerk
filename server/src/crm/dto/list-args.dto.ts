import { ArgsType, Field, Float, ID, Int } from '@nestjs/graphql';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { DealStage } from '../entities/deal.entity';
import { ListArgs } from './pagination.dto';

@ArgsType()
export class CompanyListArgs extends ListArgs {
  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(120)
  industry?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(120)
  country?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  ownerId?: string;
}

@ArgsType()
export class ContactListArgs extends ListArgs {
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  ownerId?: string;
}

@ArgsType()
export class DealListArgs extends ListArgs {
  @Field(() => DealStage, { nullable: true })
  @IsOptional()
  @IsEnum(DealStage)
  stage?: DealStage;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  openOnly?: boolean;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @Min(0)
  minAmount?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  closeBefore?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @Min(1)
  @Max(365)
  ruhendTage?: number;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  pipelineId?: string;
}
