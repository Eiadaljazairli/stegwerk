import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsIn,
  IsUUID,
  Matches,
  MaxLength,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  CustomFieldEntity,
  CustomFieldType,
  DATUMSFORMATE,
  MAX_SELECT_OPTIONS,
  OPTION_FARBEN,
  ZAHLFORMATE,
} from '../custom-field.types';

export const PFLICHT_PHASEN = [
  'qualified',
  'proposal',
  'negotiation',
  'won',
] as const;

@InputType()
export class CustomFieldOptionFarbeInput {
  @Field()
  @IsString()
  @MaxLength(80)
  option: string;

  @Field()
  @IsIn(OPTION_FARBEN)
  farbe: string;
}

@InputType()
export class CreateCustomFieldInput {
  @Field(() => CustomFieldEntity)
  @IsEnum(CustomFieldEntity)
  entity: CustomFieldEntity;

  @Field()
  @IsNotEmpty()
  @MaxLength(100)
  label: string;

  @Field(() => CustomFieldType)
  @IsEnum(CustomFieldType)
  type: CustomFieldType;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @ArrayMaxSize(MAX_SELECT_OPTIONS)
  options?: string[];

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @Field(() => [CustomFieldOptionFarbeInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SELECT_OPTIONS)
  @ValidateNested({ each: true })
  @Type(() => CustomFieldOptionFarbeInput)
  farben?: CustomFieldOptionFarbeInput[];

  @Field(() => String, { nullable: true })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'Die Währung ist ein Code wie EUR.' })
  waehrung?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  nachkommastellen?: number | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn([...ZAHLFORMATE])
  zahlformat?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn([...DATUMSFORMATE])
  datumsformat?: string | null;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  eindeutig?: boolean;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn([...PFLICHT_PHASEN, ''])
  pflichtAbPhase?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  beschreibung?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4100)
  standardwert?: string | null;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  gruppeId?: string | null;

  @Field(() => CustomFieldEntity, { nullable: true })
  @IsOptional()
  @IsEnum(CustomFieldEntity)
  zielEntity?: CustomFieldEntity | null;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  mehrere?: boolean;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  gegenfeldLabel?: string | null;
}

@InputType()
export class UpdateCustomFieldInput {
  @Field(() => ID)
  @IsUUID()
  id: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(100)
  label?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @ArrayMaxSize(MAX_SELECT_OPTIONS)
  options?: string[];

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @Field(() => [CustomFieldOptionFarbeInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SELECT_OPTIONS)
  @ValidateNested({ each: true })
  @Type(() => CustomFieldOptionFarbeInput)
  farben?: CustomFieldOptionFarbeInput[];

  @Field(() => String, { nullable: true })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'Die Währung ist ein Code wie EUR.' })
  waehrung?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  nachkommastellen?: number | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn([...ZAHLFORMATE])
  zahlformat?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn([...DATUMSFORMATE])
  datumsformat?: string | null;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  eindeutig?: boolean;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn([...PFLICHT_PHASEN, ''])
  pflichtAbPhase?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  beschreibung?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4100)
  standardwert?: string | null;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  gruppeId?: string | null;
}

@InputType()
export class CreateCustomFieldGroupInput {
  @Field(() => CustomFieldEntity)
  @IsEnum(CustomFieldEntity)
  entity: CustomFieldEntity;

  @Field()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  eingeklappt?: boolean;
}

@InputType()
export class UpdateCustomFieldGroupInput {
  @Field(() => ID)
  @IsUUID()
  id: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  eingeklappt?: boolean;
}

@ObjectType()
export class VerweisTitel {
  @Field(() => ID)
  id: string;

  @Field(() => String, { nullable: true })
  titel: string | null;

  @Field()
  sichtbar: boolean;
}

@ObjectType()
export class GegenfeldEintrag {
  @Field(() => ID)
  id: string;

  @Field()
  titel: string;
}

@ObjectType()
export class GegenfeldWert {
  @Field(() => ID)
  feldId: string;

  @Field(() => CustomFieldEntity)
  quelle: CustomFieldEntity;

  @Field(() => [GegenfeldEintrag])
  eintraege: GegenfeldEintrag[];

  @Field(() => Int)
  nichtSichtbar: number;
}

@ObjectType()
export class FeldFuellgrad {
  @Field()
  key: string;

  @Field(() => Int)
  gefuellt: number;

  @Field(() => Int)
  gesamt: number;
}
