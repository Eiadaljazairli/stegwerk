import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import { IsNotEmpty, MaxLength } from 'class-validator';

@InputType()
export class DeleteWorkspaceInput {
  @Field()
  @IsNotEmpty()
  @MaxLength(120)
  confirmationName: string;

  @Field()
  @IsNotEmpty()
  @MaxLength(200)
  password: string;
}

@ObjectType()
export class LegalEntityInfo {
  @Field()
  configured: boolean;

  @Field(() => String, { nullable: true })
  companyName: string | null;

  @Field(() => String, { nullable: true })
  legalForm: string | null;

  @Field(() => String, { nullable: true })
  street: string | null;

  @Field(() => String, { nullable: true })
  postalCode: string | null;

  @Field(() => String, { nullable: true })
  city: string | null;

  @Field(() => String, { nullable: true })
  country: string | null;

  @Field(() => String, { nullable: true })
  email: string | null;

  @Field(() => String, { nullable: true })
  phone: string | null;

  @Field(() => String, { nullable: true })
  representative: string | null;

  @Field(() => String, { nullable: true })
  registerEntry: string | null;

  @Field(() => String, { nullable: true })
  vatId: string | null;
}

@ObjectType()
export class PrivacyFactsInfo {
  @Field()
  reviewed: boolean;

  @Field(() => String, { nullable: true })
  hosting: string | null;

  @Field(() => String, { nullable: true })
  privacyContact: string | null;

  @Field(() => String, { nullable: true })
  supervisoryAuthority: string | null;

  @Field()
  billing: boolean;

  @Field()
  errorReporting: boolean;

  @Field()
  outgoingMail: boolean;

  @Field()
  mailboxes: boolean;

  @Field()
  retentionDays: number;

  @Field()
  retentionEnabled: boolean;

  @Field(() => Int)
  protokollAenderungenMonate: number;

  @Field(() => Int)
  protokollSicherheitMonate: number;
}
