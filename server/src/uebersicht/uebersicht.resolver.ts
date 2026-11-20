import {
  BadRequestException,
  HttpException,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import * as Sentry from '@sentry/nestjs';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import {
  type KachelObjekt,
  MAX_KACHELN,
  objektDerKachel,
  pruefeKachel,
} from './kacheln';
import { KachelErgebnis, KachelInput, KachelView } from './uebersicht.dto';
import { leer, UebersichtService } from './uebersicht.service';

const LESERECHT: Record<KachelObjekt, Permission> = {
  deal: Permission.DEAL_VIEW,
  company: Permission.COMPANY_VIEW,
  contact: Permission.CONTACT_VIEW,
  task: Permission.TASK_VIEW,
  invoice: Permission.INVOICE_VIEW,
};

@Resolver()
@UseGuards(GqlAuthGuard)
export class UebersichtResolver {
  private readonly logger = new Logger(UebersichtResolver.name);

  constructor(
    private readonly permissions: PermissionsService,
    private readonly dienst: UebersichtService,
  ) {}

  @Query(() => [KachelView])
  meineUebersicht(@CurrentUser() user: RequestUser): Promise<KachelView[]> {
    return this.dienst.laden(user.userId, user.workspaceId);
  }

  @Mutation(() => [KachelView])
  uebersichtSpeichern(
    @CurrentUser() user: RequestUser,
    @Args('kacheln', { type: () => [KachelInput] }) kacheln: KachelInput[],
  ): Promise<KachelView[]> {
    return this.dienst.speichern(
      user.userId,
      user.workspaceId,
      kacheln as unknown as Record<string, unknown>[],
    );
  }

  @Mutation(() => [KachelView])
  uebersichtZuruecksetzen(
    @CurrentUser() user: RequestUser,
  ): Promise<KachelView[]> {
    return this.dienst.zuruecksetzen(user.userId, user.workspaceId);
  }

  @Query(() => KachelErgebnis)
  async kachelWerte(
    @CurrentUser() user: RequestUser,
    @Args('kachel') eingabe: KachelInput,
  ): Promise<KachelErgebnis> {
    const kachel = pruefeKachel(eingabe as unknown as Record<string, unknown>);

    if (
      !(await this.permissions.can(user, LESERECHT[objektDerKachel(kachel)]))
    ) {
      return leer({
        gesperrt: true,
        hinweis: 'Ihre Rolle darf das nicht sehen.',
      });
    }

    return this.dienst.werte(user.workspaceId, user.userId, kachel);
  }

  @Query(() => [KachelErgebnis])
  async kachelnWerte(
    @CurrentUser() user: RequestUser,
    @Args('kacheln', { type: () => [KachelInput] }) eingaben: KachelInput[],
  ): Promise<KachelErgebnis[]> {
    if (eingaben.length > MAX_KACHELN) {
      throw new BadRequestException(
        `Höchstens ${String(MAX_KACHELN)} Kacheln je Übersicht.`,
      );
    }

    return Promise.all(
      eingaben.map((eingabe) =>
        this.kachelWerte(user, eingabe).catch((fehler: unknown) => {
          if (fehler instanceof HttpException) {
            return leer({ gesperrt: true, hinweis: fehler.message });
          }

          this.logger.error(fehler);
          Sentry.captureException(fehler, {
            tags: { graphqlPath: 'kachelnWerte' },
          });

          return leer({
            gesperrt: true,
            hinweis: 'Die Kachel ließ sich gerade nicht berechnen.',
          });
        }),
      ),
    );
  }
}
