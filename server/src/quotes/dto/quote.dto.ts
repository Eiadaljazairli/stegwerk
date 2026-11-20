import { Field, ID, InputType, Int, ObjectType, Float } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsEnum,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { TAX_RATES, UNITS } from '../quote.types';
import { Steuerbefreiung } from '../steuerbefreiung';

@ObjectType('QuoteTaxGroup')
export class QuoteTaxGroup {
  @Field(() => Int)
  ratePercent: number;

  @Field(() => Int)
  netCents: number;

  @Field(() => Int)
  taxCents: number;
}

@ObjectType('QuoteTotals')
export class QuoteTotals {
  @Field(() => Int)
  netCents: number;

  @Field(() => Int)
  taxCents: number;

  @Field(() => Int)
  grossCents: number;

  @Field(() => [QuoteTaxGroup])
  taxGroups: QuoteTaxGroup[];
}

@InputType()
export class CreateQuoteInput {
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

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(5000)
  introText?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(5000)
  closingText?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  smallBusiness?: boolean;

  @Field(() => Steuerbefreiung, { nullable: true })
  @IsOptional()
  @IsEnum(Steuerbefreiung)
  taxExemption?: Steuerbefreiung | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(300)
  taxExemptionNote?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(30)
  recipientVatId?: string | null;
}

@InputType()
export class UpdateQuoteInput {
  @Field(() => ID)
  @IsUUID()
  id: string;

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

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(5000)
  introText?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(5000)
  closingText?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(500)
  recipientAddress?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  smallBusiness?: boolean;

  @Field(() => Steuerbefreiung, { nullable: true })
  @IsOptional()
  @IsEnum(Steuerbefreiung)
  taxExemption?: Steuerbefreiung | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(300)
  taxExemptionNote?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(30)
  recipientVatId?: string | null;
}

@InputType()
export class QuoteLineInput {
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  productId?: string;

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

  @Field(() => Float)
  @IsPositive()
  @Max(1_000_000)
  quantity: number;

  @Field()
  @IsIn([...UNITS])
  unit: string;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  @Max(10_000_000_000)
  unitPriceCents: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @Field(() => Int)
  @IsIn([...TAX_RATES])
  taxRatePercent: number;
}

@InputType()
export class SetQuoteLinesInput {
  @Field(() => ID)
  @IsUUID()
  quoteId: string;

  @Field(() => [QuoteLineInput])
  @ValidateNested({ each: true })
  @Type(() => QuoteLineInput)
  @ArrayMaxSize(200)
  lines: QuoteLineInput[];
}

@InputType()
export class QuoteLineTextInput {
  @Field(() => ID)
  @IsUUID()
  id: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(2000)
  description?: string | null;
}

@InputType()
export class SetQuoteTextsInput {
  @Field(() => ID)
  @IsUUID()
  id: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(5000)
  introText?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(5000)
  closingText?: string | null;

  @Field(() => [QuoteLineTextInput], { nullable: true })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => QuoteLineTextInput)
  @ArrayMaxSize(200)
  lines?: QuoteLineTextInput[];
}
