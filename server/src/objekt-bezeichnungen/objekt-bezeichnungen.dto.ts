import {
  Field,
  InputType,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { IsEnum, IsString, MaxLength } from 'class-validator';

import { Genus, ObjektArt } from './objekt-bezeichnungen';

registerEnumType(ObjektArt, { name: 'ObjektArt' });
registerEnumType(Genus, { name: 'Genus' });

@ObjectType('ObjektBezeichnung')
export class ObjektBezeichnungView {
  @Field(() => ObjektArt)
  art: ObjektArt;

  @Field()
  einzahl: string;

  @Field()
  mehrzahl: string;

  @Field(() => Genus)
  genus: Genus;

  @Field()
  istStandard: boolean;

  @Field()
  standardEinzahl: string;

  @Field()
  standardMehrzahl: string;
}

@InputType()
export class ObjektBezeichnungInput {
  @Field(() => ObjektArt)
  @IsEnum(ObjektArt)
  art: ObjektArt;

  @Field()
  @IsString()
  @MaxLength(200)
  einzahl: string;

  @Field()
  @IsString()
  @MaxLength(200)
  mehrzahl: string;

  @Field(() => Genus)
  @IsEnum(Genus)
  genus: Genus;
}
