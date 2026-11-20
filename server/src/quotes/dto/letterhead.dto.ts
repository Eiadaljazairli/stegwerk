import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

@ObjectType('LetterheadGap')
export class LetterheadGapView {
  @Field()
  field: string;

  @Field()
  label: string;
}

@InputType()
export class UpdateLetterheadInput {
  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(200)
  companyName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(200)
  street?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(20)
  postalCode?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(120)
  city?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(120)
  country?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(120)
  phone?: string;

  @Field({ nullable: true })
  @ValidateIf((input: UpdateLetterheadInput) => (input.email ?? '') !== '')
  @IsEmail({}, { message: 'Bitte eine gültige E-Mail-Adresse angeben' })
  @MaxLength(200)
  email?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(200)
  website?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(200)
  representative?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(200)
  registerEntry?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(60)
  taxNumber?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(30)
  vatId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(120)
  bankName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(40)
  iban?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(20)
  bic?: string;

  @Field({ nullable: true })
  @IsOptional()
  @Matches(/^(\d{4,7})?$/u, {
    message: 'Die Beraternummer hat 4 bis 7 Ziffern.',
  })
  datevBeraternummer?: string;

  @Field({ nullable: true })
  @IsOptional()
  @Matches(/^(\d{1,5})?$/u, {
    message: 'Die Mandantennummer hat 1 bis 5 Ziffern.',
  })
  datevMandantennummer?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsIn(['SKR03', 'SKR04'], { message: 'Kontenrahmen SKR03 oder SKR04.' })
  datevKontenrahmen?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  smallBusiness?: boolean;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  defaultValidityDays?: number;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(5000)
  defaultIntroText?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(5000)
  defaultClosingText?: string;
}
