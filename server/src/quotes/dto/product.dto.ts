import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { TAX_RATES, UNITS } from '../quote.types';

@InputType()
export class CreateProductInput {
  @Field()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(50)
  articleNumber?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  @Max(10_000_000_000)
  unitPriceCents: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsIn([...UNITS])
  unit?: string;

  @Field(() => Int)
  @IsIn([...TAX_RATES])
  taxRatePercent: number;
}

@InputType()
export class UpdateProductInput {
  @Field(() => ID)
  @IsUUID()
  id: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(50)
  articleNumber?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000_000)
  unitPriceCents?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsIn([...UNITS])
  unit?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsIn([...TAX_RATES])
  taxRatePercent?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
