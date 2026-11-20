import { Field, InputType, ObjectType } from '@nestjs/graphql';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { ApiKeyEntity } from '../api-key.entity';
import { SCHREIBMODI, type Schreibmodus } from '../schreibmodus';

@InputType()
export class CreateApiKeyInput {
  @Field()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @Field(() => [String])
  @IsArray()
  @ArrayNotEmpty({ message: 'Ein Schlüssel ohne Rechte kann nichts.' })
  @IsString({ each: true })
  permissions: string[];

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn([...SCHREIBMODI])
  schreibmodus?: Schreibmodus;
}

@ObjectType()
export class CreatedApiKey {
  @Field(() => ApiKeyEntity)
  apiKey: ApiKeyEntity;

  @Field()
  token: string;
}
