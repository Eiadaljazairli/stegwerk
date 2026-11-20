import { Field, ID, InputType } from '@nestjs/graphql';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  Matches,
  MaxLength,
} from 'class-validator';

import { CustomFieldValuesScalar } from '../../custom-fields/custom-field-values.scalar';
import { CustomFieldEntity } from '../../custom-fields/custom-field.types';
import {
  SavedViewColumnsScalar,
  SavedViewFiltersScalar,
} from '../saved-view-filters.scalar';

@InputType()
export class CreateSavedViewInput {
  @Field(() => CustomFieldEntity)
  @IsEnum(CustomFieldEntity)
  entity: CustomFieldEntity;

  @Field()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(200)
  search?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(70)
  sortField?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortDirection?: string;

  @Field(() => SavedViewFiltersScalar, { nullable: true })
  @IsOptional()
  customFilters?: unknown[];

  @Field(() => SavedViewColumnsScalar, { nullable: true })
  @IsOptional()
  columns?: string[];

  @Field(() => CustomFieldValuesScalar, { nullable: true })
  @IsOptional()
  filters?: Record<string, string | number | boolean | null>;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(80)
  @Matches(/^(std|custom):[A-Za-z0-9_]{1,70}$/u)
  gruppierung?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(['UND', 'ODER'])
  filterVerknuepfung?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(['liste', 'board', 'kalender'])
  darstellung?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(80)
  @Matches(/^(std|custom):[A-Za-z0-9_]{1,70}$/u)
  gruppenFeld?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(80)
  @Matches(/^(std|custom):[A-Za-z0-9_]{1,70}$/u)
  datumFeld?: string | null;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  privat?: boolean;
}

@InputType()
export class UpdateSavedViewInput {
  @Field(() => ID)
  @IsNotEmpty()
  id: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(200)
  search?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(70)
  sortField?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortDirection?: string;

  @Field(() => SavedViewFiltersScalar, { nullable: true })
  @IsOptional()
  customFilters?: unknown[];

  @Field(() => SavedViewColumnsScalar, { nullable: true })
  @IsOptional()
  columns?: string[];

  @Field(() => CustomFieldValuesScalar, { nullable: true })
  @IsOptional()
  filters?: Record<string, string | number | boolean | null>;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(80)
  @Matches(/^(std|custom):[A-Za-z0-9_]{1,70}$/u)
  gruppierung?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(['UND', 'ODER'])
  filterVerknuepfung?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(['liste', 'board', 'kalender'])
  darstellung?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(80)
  @Matches(/^(std|custom):[A-Za-z0-9_]{1,70}$/u)
  gruppenFeld?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(80)
  @Matches(/^(std|custom):[A-Za-z0-9_]{1,70}$/u)
  datumFeld?: string | null;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  privat?: boolean;
}

@InputType()
export class DeleteSavedViewInput {
  @Field(() => ID)
  @IsNotEmpty()
  id: string;
}
