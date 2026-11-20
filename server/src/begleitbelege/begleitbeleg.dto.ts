import { Field, Float, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { BegleitbelegArt } from './begleitbeleg.types';

@InputType()
export class BegleitbelegFilterInput {
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  angebotId?: string | null;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  dealId?: string | null;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  companyId?: string | null;

  @Field(() => BegleitbelegArt, { nullable: true })
  @IsOptional()
  @IsEnum(BegleitbelegArt)
  art?: BegleitbelegArt | null;
}

@InputType()
export class AuftragsbestaetigungInput {
  @Field(() => ID)
  @IsUUID()
  angebotId: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsDateString({ strict: true })
  liefertermin?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(5000)
  introText?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(5000)
  closingText?: string | null;
}

@InputType()
export class LieferPositionInput {
  @Field(() => ID)
  @IsUUID()
  angebotsPositionId: string;

  @Field(() => Float)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001, { message: 'Die gelieferte Menge muss größer als 0 sein.' })
  @Max(999_999_999)
  menge: number;
}

@InputType()
export class LieferscheinInput {
  @Field(() => ID)
  @IsUUID()
  angebotId: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  auftragsbestaetigungId?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(1000)
  lieferadresse?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsDateString({ strict: true })
  liefertermin?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(5000)
  introText?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(5000)
  closingText?: string | null;

  @Field(() => [LieferPositionInput])
  @ArrayMinSize(1, {
    message: 'Ein Lieferschein braucht mindestens eine Position mit Menge.',
  })
  @ArrayMaxSize(500, {
    message: 'Ein Lieferschein hat höchstens 500 Positionen.',
  })
  @ValidateNested({ each: true })
  @Type(() => LieferPositionInput)
  positionen: LieferPositionInput[];
}

@ObjectType('LieferstandPosition')
export class LieferstandPosition {
  @Field(() => ID)
  angebotsPositionId: string;

  @Field(() => Int)
  position: number;

  @Field()
  name: string;

  @Field(() => String, { nullable: true })
  articleNumber: string | null;

  @Field()
  unit: string;

  @Field(() => Float)
  bestellt: number;

  @Field(() => Float)
  geliefert: number;

  @Field(() => Float)
  offen: number;
}
