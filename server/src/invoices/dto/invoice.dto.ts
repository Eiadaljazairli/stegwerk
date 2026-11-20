import { Field, Float, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { TAX_RATES, UNITS } from '../../quotes/quote.types';
import { Steuerbefreiung } from '../../quotes/steuerbefreiung';
import { PAYMENT_TERM_DAYS } from '../invoice.types';

@InputType()
export class CreateInvoiceInputDto {
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
  @MaxLength(500)
  recipientAddress?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(100)
  buyerReference?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  serviceDate?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsIn([...PAYMENT_TERM_DAYS])
  paymentTermDays?: number;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(2000)
  introText?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(2000)
  closingText?: string;

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
export class UpdateInvoiceInputDto extends CreateInvoiceInputDto {
  @Field(() => ID)
  @IsUUID()
  id: string;
}

@InputType()
export class InvoiceLineInputDto {
  @Field()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(60)
  articleNumber?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @Field(() => Float)
  @Min(-1_000_000)
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
export class SetInvoiceLinesInput {
  @Field(() => ID)
  @IsUUID()
  invoiceId: string;

  @Field(() => [InvoiceLineInputDto])
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineInputDto)
  lines: InvoiceLineInputDto[];
}

@ObjectType('InvoiceGap')
export class InvoiceGapView {
  @Field()
  field: string;

  @Field()
  label: string;
}
