import { UseGuards } from '@nestjs/common';
import { Args, Field, ObjectType, Query, Resolver } from '@nestjs/graphql';

import { GqlAuthGuard } from '../../auth/guards/gql-auth.guard';
import { meintDeutschland, orteZurPlz } from './plz';

@ObjectType('PlzOrt')
export class PlzOrtDto {
  @Field()
  ort: string;

  @Field(() => String, { nullable: true })
  bundesland: string | null;
}

@Resolver()
@UseGuards(GqlAuthGuard)
export class PlzResolver {
  @Query(() => [PlzOrtDto])
  plzOrte(
    @Args('plz') plz: string,
    @Args('land', { type: () => String, nullable: true }) land?: string | null,
  ): PlzOrtDto[] {
    return meintDeutschland(land) ? orteZurPlz(plz.slice(0, 10)) : [];
  }
}
