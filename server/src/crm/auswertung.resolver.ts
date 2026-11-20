import { UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  Float,
  ID,
  Int,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { istVerborgen } from '../workspaces/feldrechte';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { AuswertungService } from './auswertung.service';

@ObjectType()
export class AuswertungMonat {
  @Field()
  monat: string;

  @Field(() => Int)
  gewonnenAnzahl: number;

  @Field(() => Float)
  gewonnenSumme: number;

  @Field(() => Int)
  verlorenAnzahl: number;

  @Field(() => Float)
  verlorenSumme: number;
}

@ObjectType()
export class AuswertungVerkaeufer {
  @Field(() => ID, { nullable: true })
  ownerId: string | null;

  @Field()
  name: string;

  @Field(() => Int)
  offenAnzahl: number;

  @Field(() => Float)
  offenSumme: number;

  @Field(() => Int)
  gewonnenAnzahl: number;

  @Field(() => Float)
  gewonnenSumme: number;

  @Field(() => Int)
  verlorenAnzahl: number;

  @Field(() => Float, { nullable: true })
  quote: number | null;
}

@ObjectType()
export class AuswertungGrund {
  @Field()
  grund: string;

  @Field(() => Int)
  anzahl: number;

  @Field(() => Float)
  summe: number;
}

@ObjectType()
export class AuswertungVerweildauer {
  @Field()
  phase: string;

  @Field(() => Int)
  anzahl: number;

  @Field(() => Float)
  tage: number;
}

@ObjectType()
export class Auswertung {
  @Field()
  von: string;

  @Field()
  bis: string;

  @Field(() => Int)
  gewonnenAnzahl: number;

  @Field(() => Float)
  gewonnenSumme: number;

  @Field(() => Int)
  verlorenAnzahl: number;

  @Field(() => Float)
  verlorenSumme: number;

  @Field(() => Float, { nullable: true })
  abschlussquote: number | null;

  @Field(() => Float, { nullable: true })
  durchschnittWert: number | null;

  @Field(() => Float, { nullable: true })
  durchschnittTage: number | null;

  @Field(() => Int)
  neueGeschaefte: number;

  @Field(() => [AuswertungMonat])
  monate: AuswertungMonat[];

  @Field(() => [AuswertungVerkaeufer])
  verkaeufer: AuswertungVerkaeufer[];

  @Field(() => [AuswertungGrund])
  verlustgruende: AuswertungGrund[];

  @Field(() => [AuswertungVerweildauer])
  verweildauer: AuswertungVerweildauer[];

  @Field()
  betraegeVerborgen: boolean;
}

@Resolver()
@UseGuards(GqlAuthGuard)
export class AuswertungResolver {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly auswertungService: AuswertungService,
  ) {}

  @Query(() => Auswertung)
  async auswertung(
    @CurrentUser() user: RequestUser,
    @Args('von') von: string,
    @Args('bis') bis: string,
    @Args('ownerId', { type: () => ID, nullable: true }) ownerId?: string,
    @Args('pipelineId', { type: () => ID, nullable: true })
    pipelineId?: string,
  ): Promise<Auswertung> {
    await this.permissions.assert(
      user,
      Permission.DEAL_VIEW,
      'Auswertungen zu sehen',
    );

    const a = await this.auswertungService.berechne(
      user.workspaceId,
      von,
      bis,
      ownerId ?? null,
      pipelineId ?? null,
    );

    if (!(await istVerborgen('deal.amount'))) {
      return { ...a, betraegeVerborgen: false };
    }

    return {
      ...a,
      gewonnenSumme: 0,
      verlorenSumme: 0,
      durchschnittWert: null,
      monate: a.monate.map((m) => ({
        ...m,
        gewonnenSumme: 0,
        verlorenSumme: 0,
      })),
      verkaeufer: a.verkaeufer.map((v) => ({
        ...v,
        offenSumme: 0,
        gewonnenSumme: 0,
      })),
      verlustgruende: a.verlustgruende.map((g) => ({ ...g, summe: 0 })),
      betraegeVerborgen: true,
    };
  }
}
