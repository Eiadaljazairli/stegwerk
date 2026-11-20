import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class SicherheitInfo {
  @Field(() => [String])
  massnahmen: string[];

  @Field(() => String, { nullable: true })
  hosting: string | null;

  @Field(() => String, { nullable: true })
  sicherung: string | null;

  @Field(() => [String])
  unterauftragsverarbeiter: string[];

  @Field()
  unterauftragStand: string;

  @Field(() => Int)
  loeschfristTage: number;

  @Field()
  loeschfristAktiv: boolean;

  @Field()
  vertragGeprueft: boolean;
}
