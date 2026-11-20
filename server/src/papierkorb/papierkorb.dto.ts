import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum PapierkorbArt {
  FIRMA = 'firma',
  KONTAKT = 'kontakt',
  GESCHAEFT = 'geschaeft',
  AUFGABE = 'aufgabe',
}

registerEnumType(PapierkorbArt, { name: 'PapierkorbArt' });

@ObjectType('PapierkorbEintrag')
export class PapierkorbEintrag {
  @Field(() => PapierkorbArt)
  art: PapierkorbArt;

  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field()
  geloeschtAm: Date;

  @Field()
  endgueltigAm: Date;

  @Field(() => String, { nullable: true })
  geloeschtVon: string | null;
}
