import { ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  InputType,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { IsBoolean, IsDate, IsNotEmpty, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

import { NurMenschWache } from '../api-keys/api-key.guard';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { AnkuendigungEntity } from './ankuendigung.entity';
import {
  BetriebKontoDetail,
  BetriebsHinweis,
  BetriebsUebersicht,
  BetriebsZustand,
} from './betrieb.dto';
import { BetriebService } from './betrieb.service';
import { WartungService } from './wartung.service';
import { ZustandService } from './zustand.service';

@InputType()
export class AnkuendigungInput {
  @Field()
  @IsNotEmpty()
  @MaxLength(500)
  text: string;

  @Field()
  @Type(() => Date)
  @IsDate()
  von: Date;

  @Field()
  @Type(() => Date)
  @IsDate()
  bis: Date;

  @Field()
  @IsBoolean()
  wartung: boolean;
}

@Resolver()
@UseGuards(GqlAuthGuard, NurMenschWache)
export class BetriebResolver {
  constructor(
    private readonly betrieb: BetriebService,
    private readonly wartung: WartungService,
    private readonly zustandService: ZustandService,
  ) {}

  @Query(() => Boolean)
  ichBinBetreiber(@CurrentUser() user: RequestUser): boolean {
    return this.betrieb.istBetreiber(user.email);
  }

  @Query(() => BetriebsUebersicht)
  betriebsUebersicht(
    @CurrentUser() user: RequestUser,
  ): Promise<BetriebsUebersicht> {
    return this.betrieb.uebersicht(user.userId);
  }

  @Query(() => BetriebKontoDetail)
  betriebKonto(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
  ): Promise<BetriebKontoDetail> {
    return this.betrieb.konto(user.userId, id);
  }

  @Query(() => BetriebsZustand)
  async betriebsZustand(
    @CurrentUser() user: RequestUser,
  ): Promise<BetriebsZustand> {
    await this.betrieb.pruefeBetreiber(user.userId);

    return this.zustandService.zustand();
  }

  @Query(() => BetriebsHinweis, { nullable: true })
  betriebsHinweis(): Promise<BetriebsHinweis | null> {
    return this.wartung.aktuell();
  }

  @Query(() => [AnkuendigungEntity])
  async ankuendigungen(
    @CurrentUser() user: RequestUser,
  ): Promise<AnkuendigungEntity[]> {
    await this.betrieb.pruefeBetreiber(user.userId);

    return this.wartung.liste();
  }

  @Mutation(() => AnkuendigungEntity)
  async ankuendigungSetzen(
    @CurrentUser() user: RequestUser,
    @Args('input') input: AnkuendigungInput,
  ): Promise<AnkuendigungEntity> {
    await this.betrieb.pruefeBetreiber(user.userId);

    return this.wartung.setzen(user.userId, input);
  }

  @Mutation(() => Boolean)
  async ankuendigungBeenden(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
  ): Promise<boolean> {
    await this.betrieb.pruefeBetreiber(user.userId);

    return this.wartung.beenden(id);
  }
}
