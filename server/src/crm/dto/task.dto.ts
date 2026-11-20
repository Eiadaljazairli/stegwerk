import { ArgsType, Field, ID, InputType, PartialType } from '@nestjs/graphql';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsIn,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import { CustomFieldValuesScalar } from '../../custom-fields/custom-field-values.scalar';
import { type CustomFieldValues } from '../../custom-fields/custom-field.types';

import { Getrimmt } from './getrimmt';
import { ListArgs } from './pagination.dto';
import { SichererText } from './sicherer-text';

@InputType()
export class CreateTaskInput {
  @Field()
  @Getrimmt()
  @IsNotEmpty({ message: 'Eine Aufgabe braucht einen Titel.' })
  @MaxLength(200)
  title: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(10000)
  @SichererText()
  description?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/u, {
    message: 'Die Uhrzeit hat die Form 09:30.',
  })
  dueTime?: string | null;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

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

  @Field(() => CustomFieldValuesScalar, { nullable: true })
  @IsOptional()
  @IsObject()
  customFields?: CustomFieldValues;
}

@InputType()
export class UpdateTaskInput extends PartialType(CreateTaskInput) {
  @Field(() => ID)
  @IsUUID()
  id: string;
}

@ArgsType()
export class TaskListArgs extends ListArgs {
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  overdue?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsIn(['offen', 'in_arbeit', 'erledigt'])
  status?: string;

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
}
