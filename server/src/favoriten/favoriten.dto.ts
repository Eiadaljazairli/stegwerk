import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum FavoritArt {
  FIRMA = 'firma',
  KONTAKT = 'kontakt',
  GESCHAEFT = 'geschaeft',
}

registerEnumType(FavoritArt, { name: 'FavoritArt' });

@ObjectType('Favorit')
export class FavoritView {
  @Field(() => FavoritArt)
  art: FavoritArt;

  @Field(() => ID)
  datensatzId: string;

  @Field()
  titel: string;

  @Field()
  createdAt: Date;
}
