import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { MailAnhangView } from '../mail-message.entity';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

@InputType()
export class ConnectMailboxInput {
  @Field()
  @IsNotEmpty()
  @MaxLength(200)
  host: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @IsIn([143, 993], { message: 'IMAP läuft auf Port 993 (oder 143).' })
  port?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @Field()
  @IsNotEmpty()
  @MaxLength(200)
  username: string;

  @Field()
  @IsNotEmpty()
  @MaxLength(300)
  password: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(200)
  folder?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(200)
  smtpHost?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @IsIn([25, 465, 587, 2525], {
    message: 'SMTP läuft auf Port 587 oder 465 (selten 25 oder 2525).',
  })
  smtpPort?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(200)
  gesendetOrdner?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  mailboxId?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(['persoenlich', 'gemeinsam'], {
    message: 'Ein Postfach ist persönlich oder gemeinsam.',
  })
  neu?: 'persoenlich' | 'gemeinsam';

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bezeichnung?: string;
}

@ObjectType()
export class PostfachGespraechView {
  @Field()
  threadKey: string;

  @Field(() => ID)
  nachrichtId: string;

  @Field(() => String, { nullable: true })
  betreff: string | null;

  @Field()
  vonAdresse: string;

  @Field(() => String, { nullable: true })
  vonName: string | null;

  @Field(() => String, { nullable: true })
  ausschnitt: string | null;

  @Field()
  ausgehend: boolean;

  @Field()
  zuletzt: Date;

  @Field(() => Int)
  anzahl: number;

  @Field()
  offen: boolean;

  @Field(() => ID, { nullable: true })
  zugewiesenAnId: string | null;

  @Field(() => ID, { nullable: true })
  contactId: string | null;

  @Field(() => ID, { nullable: true })
  companyId: string | null;
}

@ObjectType()
export class MailboxSyncResult {
  @Field(() => Int)
  stored: number;

  @Field(() => Int)
  matched: number;

  @Field(() => Int)
  unfiled: number;
}

@InputType()
export class SendMailInput {
  @Field(() => [String])
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(320, { each: true })
  to: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(320, { each: true })
  cc?: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(320, { each: true })
  bcc?: string[];

  @Field(() => [ID], { nullable: true })
  @IsOptional()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  attachmentIds?: string[];

  @Field()
  @MaxLength(200)
  subject: string;

  @Field()
  @IsNotEmpty()
  @MaxLength(100_000)
  body: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  inReplyToId?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  from?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  mailboxId?: string;
}

@InputType()
export class PostfachEinstellungenInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bezeichnung?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  ausschlussIntern?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  ausschlussMassenpost?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  ausschlussGruppen?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  ausschlussFreemail?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  ausschlussGmailKategorien?: boolean;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(320, { each: true })
  aliase?: string[];

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  anhaengeAutomatisch?: boolean;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  anhaengeBisMb?: number;
}

@ObjectType()
export class MailInhaltView {
  @Field(() => ID)
  id: string;

  @Field(() => String, { nullable: true })
  inhalt: string | null;

  @Field(() => String, { nullable: true })
  zitat: string | null;

  @Field()
  inhaltVerborgen: boolean;

  @Field(() => [MailAnhangView])
  anhaenge: MailAnhangView[];
}

@InputType()
export class AddMailSperreInput {
  @Field()
  @IsNotEmpty()
  @MaxLength(320)
  eintrag: string;
}

@ObjectType()
export class KontaktVorschlag {
  @Field()
  adresse: string;

  @Field()
  vorname: string;

  @Field()
  nachname: string;

  @Field(() => ID, { nullable: true })
  firmaId: string | null;

  @Field(() => String, { nullable: true })
  firmaVorschlag: string | null;

  @Field(() => String, { nullable: true })
  domain: string | null;

  @Field(() => Int)
  anzahl: number;

  @Field()
  zuletzt: Date;
}
