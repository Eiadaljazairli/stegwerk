import {
  ArgsType,
  Field,
  InputType,
  Int,
  registerEnumType,
} from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { CustomFieldFilterOperator } from '../../custom-fields/custom-field.types';

export enum SortDirection {
  ASC = 'ASC',
  DESC = 'DESC',
}

registerEnumType(SortDirection, { name: 'SortDirection' });

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;

export const EXPORT_CHUNK = 500;

export const EXPORT_CEILING = 10_000;

export const MAX_CUSTOM_FILTERS = 10;

export const MAX_FILTER_GRUPPEN = 5;

export enum FilterVerknuepfung {
  UND = 'UND',
  ODER = 'ODER',
}

registerEnumType(FilterVerknuepfung, { name: 'FilterVerknuepfung' });

@InputType()
export class CustomFieldFilterInput {
  @Field()
  @IsNotEmpty()
  @MaxLength(60)
  key: string;

  @Field(() => CustomFieldFilterOperator)
  @IsEnum(CustomFieldFilterOperator)
  operator: CustomFieldFilterOperator;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(200)
  value?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_FILTER_GRUPPEN)
  gruppe?: number;
}

@InputType()
export class ListenGruppeInput {
  @Field()
  @IsNotEmpty()
  @MaxLength(80)
  feld: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(200)
  wert?: string | null;
}

@InputType()
export class ListenZeitraumInput {
  @Field()
  @IsNotEmpty()
  @MaxLength(80)
  @Matches(/^(std|custom):[A-Za-z0-9_]{1,70}$/u)
  feld: string;

  @Field()
  @Matches(/^\d{4}-\d{2}-\d{2}$/u)
  von: string;

  @Field()
  @Matches(/^\d{4}-\d{2}-\d{2}$/u)
  bis: string;
}

export const MAX_ZEITRAUM_TAGE = 366;

@ArgsType()
export class ListArgs {
  @Field(() => [CustomFieldFilterInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CUSTOM_FILTERS)
  @ValidateNested({ each: true })
  @Type(() => CustomFieldFilterInput)
  customFilters?: CustomFieldFilterInput[];

  @Field(() => FilterVerknuepfung, { nullable: true })
  @IsOptional()
  @IsEnum(FilterVerknuepfung)
  filterVerknuepfung?: FilterVerknuepfung;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(80)
  gruppierung?: string;

  @Field(() => ListenGruppeInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => ListenGruppeInput)
  gruppe?: ListenGruppeInput;

  @Field(() => ListenZeitraumInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => ListenZeitraumInput)
  zeitraum?: ListenZeitraumInput;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(200)
  search?: string;

  @Field(() => Int, { nullable: true, defaultValue: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(70)
  sortField?: string;

  @Field(() => SortDirection, { nullable: true })
  @IsOptional()
  @IsIn(Object.values(SortDirection))
  sortDirection?: SortDirection;
}
