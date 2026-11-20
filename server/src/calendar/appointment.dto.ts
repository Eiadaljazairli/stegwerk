import {
  ArgsType,
  Field,
  ID,
  InputType,
  Int,
  PartialType,
  registerEnumType,
} from '@nestjs/graphql';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { AttendeeStatus } from './attendees';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const TIME_PATTERN = /^\d{1,2}:\d{2}$/;

@InputType()
export class AppointmentAttendeeInput {
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsEmail({}, { message: 'Das sieht nicht nach einer E-Mail-Adresse aus.' })
  @MaxLength(320)
  email?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @Field(() => AttendeeStatus, { nullable: true })
  @IsOptional()
  @IsEnum(AttendeeStatus)
  status?: AttendeeStatus;
}

@InputType()
export class CreateAppointmentInput {
  @Field()
  @IsNotEmpty({ message: 'Ein Termin braucht einen Titel.' })
  @MaxLength(200)
  title: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(10000)
  description?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(300)
  location?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(500)
  videoLink?: string;

  @Field()
  @Matches(DATE_PATTERN, { message: 'Das Datum muss als 2026-03-15 kommen.' })
  startDate: string;

  @Field()
  @Matches(TIME_PATTERN, { message: 'Die Uhrzeit muss als 09:00 kommen.' })
  startTime: string;

  @Field()
  @Matches(DATE_PATTERN, { message: 'Das Datum muss als 2026-03-15 kommen.' })
  endDate: string;

  @Field()
  @Matches(TIME_PATTERN, { message: 'Die Uhrzeit muss als 09:00 kommen.' })
  endTime: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  privat?: boolean;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10080)
  remindMinutesBefore?: number;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(300)
  recurrence?: string;

  @Field(() => [AppointmentAttendeeInput], { nullable: true })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AppointmentAttendeeInput)
  attendees?: AppointmentAttendeeInput[];

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

export enum AppointmentScope {
  ONE = 'ONE',
  FOLLOWING = 'FOLLOWING',
  SERIES = 'SERIES',
}

registerEnumType(AppointmentScope, { name: 'AppointmentScope' });

@InputType()
export class UpdateAppointmentInput extends PartialType(
  CreateAppointmentInput,
) {
  @Field(() => ID)
  @Matches(/^[0-9a-f-]{36}(:\d{4}-\d{2}-\d{2})?$/, {
    message: 'Das ist keine Terminkennung.',
  })
  id: string;

  @Field(() => AppointmentScope, { nullable: true })
  @IsOptional()
  @IsEnum(AppointmentScope)
  scope?: AppointmentScope;
}

@ArgsType()
export class AppointmentRangeArgs {
  @Field()
  @Matches(DATE_PATTERN, { message: 'Das Datum muss als 2026-03-15 kommen.' })
  from: string;

  @Field()
  @Matches(DATE_PATTERN, { message: 'Das Datum muss als 2026-03-15 kommen.' })
  to: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  includeCancelled?: boolean;
}
