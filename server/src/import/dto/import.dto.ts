import {
  Field,
  ID,
  InputType,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const MAX_KOPFZEILE = 20;

export enum ImportEntity {
  COMPANY = 'COMPANY',
  CONTACT = 'CONTACT',
  DEAL = 'DEAL',
  NOTE = 'NOTE',
  TASK = 'TASK',
  PRODUCT = 'PRODUCT',
}

registerEnumType(ImportEntity, { name: 'ImportEntity' });

export const MAX_CSV_LENGTH = 5_000_000;

@InputType()
export class InspectCsvInput {
  @Field()
  @IsNotEmpty()
  @MaxLength(MAX_CSV_LENGTH)
  csv: string;

  @Field(() => Int, { defaultValue: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_KOPFZEILE)
  kopfzeile?: number;
}

@ObjectType()
export class CsvSpaltenWerte {
  @Field()
  spalte: string;

  @Field(() => [String])
  werte: string[];

  @Field()
  mehr: boolean;
}

@ObjectType()
export class CsvInspection {
  @Field(() => [String])
  columns: string[];

  @Field(() => Int)
  rowCount: number;

  @Field(() => [String])
  sampleRow: string[];

  @Field(() => [[String]])
  vorschau: string[][];

  @Field(() => Int)
  kopfzeile: number;

  @Field(() => [CsvSpaltenWerte])
  spaltenWerte: CsvSpaltenWerte[];
}

@InputType()
export class WertZuordnungInput {
  @Field()
  @IsString()
  @MaxLength(500)
  von: string;

  @Field()
  @IsString()
  @MaxLength(500)
  nach: string;
}

@InputType()
export class ZeilenKorrekturInput {
  @Field(() => Int)
  @IsInt()
  @Min(1)
  zeile: number;

  @Field(() => [String])
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(10_000, { each: true })
  zellen: string[];
}

@InputType()
export class ColumnMappingInput {
  @Field()
  @IsNotEmpty()
  column: string;

  @Field()
  @IsNotEmpty()
  field: string;

  @Field(() => [WertZuordnungInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => WertZuordnungInput)
  werte?: WertZuordnungInput[];
}

@InputType()
export class ImportInput {
  @Field(() => ImportEntity)
  @IsEnum(ImportEntity)
  entity: ImportEntity;

  @Field()
  @IsNotEmpty()
  @MaxLength(MAX_CSV_LENGTH)
  csv: string;

  @Field(() => [ColumnMappingInput])
  @ArrayNotEmpty({ message: 'Map at least one column before importing' })
  @ValidateNested({ each: true })
  @Type(() => ColumnMappingInput)
  mapping: ColumnMappingInput[];

  @Field({ defaultValue: true })
  @IsBoolean()
  dryRun: boolean;

  @Field(() => Int, { defaultValue: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_KOPFZEILE)
  kopfzeile?: number;

  @Field(() => [ZeilenKorrekturInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ZeilenKorrekturInput)
  korrekturen?: ZeilenKorrekturInput[];
}

@ObjectType()
export class ImportRejection {
  @Field(() => Int)
  row: number;

  @Field()
  reason: string;

  @Field(() => [String])
  zellen: string[];
}

@ObjectType()
export class ImportReport {
  @Field()
  dryRun: boolean;

  @Field(() => Int)
  created: number;

  @Field(() => Int)
  updated: number;

  @Field(() => Int)
  rejected: number;

  @Field(() => [ImportRejection])
  rejections: ImportRejection[];
}

@ObjectType()
export class ImportOption {
  @Field()
  wert: string;

  @Field()
  label: string;
}

@ObjectType()
export class ImportableField {
  @Field(() => ID)
  name: string;

  @Field()
  label: string;

  @Field()
  required: boolean;

  @Field(() => [ImportOption], { nullable: true })
  optionen?: ImportOption[];
}
