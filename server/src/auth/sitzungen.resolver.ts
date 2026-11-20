import { ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
  Args,
  Context,
  Field,
  ID,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { type Request } from 'express';

import { NurMenschWache } from '../api-keys/api-key.guard';
import {
  CurrentUser,
  type RequestUser,
} from './decorators/current-user.decorator';
import { GqlAuthGuard } from './guards/gql-auth.guard';
import { RefreshTokensService } from './refresh-tokens.service';
import { liesSitzung } from './sitzungs-cookie';
import { meldeSicherheit } from '../sicherheit/melden';

@ObjectType('Sitzung')
export class SitzungView {
  @Field(() => ID)
  id: string;

  @Field(() => String, { nullable: true })
  geraet: string | null;

  @Field(() => String, { nullable: true })
  ipGekuerzt: string | null;

  @Field()
  angemeldetAm: Date;

  @Field()
  zuletztAktiv: Date;

  @Field()
  dieses: boolean;

  @Field()
  angemeldetBleiben: boolean;
}

@Resolver()
@UseGuards(GqlAuthGuard, NurMenschWache)
export class SitzungenResolver {
  constructor(private readonly tokens: RefreshTokensService) {}

  @Query(() => [SitzungView])
  async meineSitzungen(
    @CurrentUser() user: RequestUser,
    @Context() kontext: { req: Request },
  ): Promise<SitzungView[]> {
    const dieses = await this.tokens.sitzungVon(liesSitzung(kontext.req));
    const gesehen = new Map<string, SitzungView>();

    for (const token of await this.tokens.aktive(user.userId)) {
      const id = token.familyId ?? token.id;

      if (gesehen.has(id)) {
        continue;
      }

      gesehen.set(id, {
        id,
        geraet: token.geraet,
        ipGekuerzt: token.ipGekuerzt,
        angemeldetAm: token.angemeldetAm ?? token.createdAt,
        zuletztAktiv: token.createdAt,
        dieses: id === dieses,
        angemeldetBleiben: token.dauerhaft,
      });
    }

    return [...gesehen.values()];
  }

  @Mutation(() => Boolean)
  async sitzungBeenden(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
  ): Promise<boolean> {
    const beendet = await this.tokens.beenden(user.userId, id);

    if (beendet) {
      meldeSicherheit({ art: 'sitzung_beendet', userId: user.userId });
    }

    return beendet;
  }

  @Mutation(() => Int)
  async andereSitzungenBeenden(
    @CurrentUser() user: RequestUser,
    @Context() kontext: { req: Request },
  ): Promise<number> {
    const anzahl = await this.tokens.andereBeenden(
      user.userId,
      await this.tokens.sitzungVon(liesSitzung(kontext.req)),
    );

    meldeSicherheit({
      art: 'andere_sitzungen_beendet',
      userId: user.userId,
      details: { anzahl },
    });

    return anzahl;
  }
}
