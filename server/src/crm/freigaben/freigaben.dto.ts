import { Field, ID, InputType, ObjectType } from '@nestjs/graphql';
import { IsIn, IsUUID } from 'class-validator';

import {
  FREIGABE_STUFEN,
  type FreigabeStufe,
  SICHTBARKEITS_ARTEN,
  type SichtbarkeitsArt,
} from '../../workspaces/sichtbarkeit';

@ObjectType('FreigabeEintrag')
export class FreigabeEintrag {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  userId: string;

  @Field()
  name: string;

  @Field(() => String)
  stufe: FreigabeStufe;

  @Field(() => String, { nullable: true })
  erteiltVon: string | null;

  @Field(() => Date)
  createdAt: Date;
}

@ObjectType('FreigabeStand')
export class FreigabeStand {
  @Field(() => [FreigabeEintrag])
  freigaben: FreigabeEintrag[];

  @Field()
  darfVerwalten: boolean;

  @Field(() => ID, { nullable: true })
  verantwortlichId: string | null;
}

@ObjectType('ZugriffZeile')
export class ZugriffZeile {
  @Field(() => ID)
  userId: string;

  @Field()
  name: string;

  @Field()
  rolle: string;

  @Field()
  sieht: boolean;

  @Field()
  bearbeitet: boolean;

  @Field()
  grund: string;
}

@InputType()
export class FreigebenInput {
  @Field()
  @IsIn(SICHTBARKEITS_ARTEN)
  art: SichtbarkeitsArt;

  @Field(() => ID)
  @IsUUID()
  datensatzId: string;

  @Field(() => ID)
  @IsUUID()
  userId: string;

  @Field()
  @IsIn(FREIGABE_STUFEN)
  stufe: FreigabeStufe;
}
