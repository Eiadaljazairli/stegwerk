import { UseGuards } from '@nestjs/common';
import { Field, Mutation, ObjectType, Query, Resolver } from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { NurMenschWache } from '../api-keys/api-key.guard';
import { AvvAnnahmeEntity } from './avv-annahme.entity';
import { AvvService } from './avv.service';

@ObjectType()
export class AvvStand {
  @Field(() => AvvAnnahmeEntity, { nullable: true })
  annahme: AvvAnnahmeEntity | null;

  @Field()
  aktuell: boolean;

  @Field()
  geprueft: boolean;

  @Field()
  auftraggeber: string;
}

@Resolver()
@UseGuards(GqlAuthGuard, NurMenschWache)
export class AvvResolver {
  constructor(private readonly avv: AvvService) {}

  @Query(() => AvvStand)
  async avvStand(@CurrentUser() user: RequestUser): Promise<AvvStand> {
    const [annahme, auftraggeber] = await Promise.all([
      this.avv.letzte(user.workspaceId),
      this.avv.auftraggeber(user.workspaceId),
    ]);

    return {
      annahme,
      geprueft: this.avv.vertrag().reviewed,
      aktuell: annahme !== null && annahme.fassung === this.avv.fassung(),
      auftraggeber,
    };
  }

  @Mutation(() => AvvAnnahmeEntity)
  avvAnnehmen(@CurrentUser() user: RequestUser): Promise<AvvAnnahmeEntity> {
    return this.avv.annehmen(user);
  }
}
