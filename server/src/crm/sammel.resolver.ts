import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { Args, ID, Int, Mutation, Resolver } from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { PapierkorbArt } from '../papierkorb/papierkorb.dto';
import { ARTEN } from '../papierkorb/papierkorb.service';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { CompaniesService } from './companies.service';
import { ContactsService } from './contacts.service';
import { DealsService } from './deals.service';
import { DealStage } from './entities/deal.entity';
import { TasksService } from './tasks.service';
import { type WorkspaceScopedService } from './workspace-scoped.service';

export const SAMMEL_GRENZE = 200;

const SCHREIBRECHT: Partial<Record<PapierkorbArt, Permission>> = {
  [PapierkorbArt.FIRMA]: Permission.COMPANY_WRITE,
  [PapierkorbArt.KONTAKT]: Permission.CONTACT_WRITE,
  [PapierkorbArt.GESCHAEFT]: Permission.DEAL_WRITE,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const pruefeIds = (ids: string[]): string[] => {
  const eindeutig = [...new Set(ids)];

  if (eindeutig.length === 0 || eindeutig.length > SAMMEL_GRENZE) {
    throw new BadRequestException(
      `Bitte zwischen 1 und ${SAMMEL_GRENZE} Einträge auswählen.`,
    );
  }

  if (eindeutig.some((id) => !UUID.test(id))) {
    throw new BadRequestException('Eine der Kennungen ist ungültig.');
  }

  return eindeutig;
};

@Resolver()
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class SammelResolver {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly companies: CompaniesService,
    private readonly contacts: ContactsService,
    private readonly deals: DealsService,
    private readonly tasks: TasksService,
  ) {}

  private dienst(
    art: PapierkorbArt,
  ): WorkspaceScopedService<{ id: string; workspaceId: string }> {
    const dienste: Record<PapierkorbArt, unknown> = {
      [PapierkorbArt.FIRMA]: this.companies,
      [PapierkorbArt.KONTAKT]: this.contacts,
      [PapierkorbArt.GESCHAEFT]: this.deals,
      [PapierkorbArt.AUFGABE]: this.tasks,
    };

    return dienste[art] as WorkspaceScopedService<{
      id: string;
      workspaceId: string;
    }>;
  }

  private async jeEinzeln(
    ids: string[],
    erledigt: string,
    schritt: (id: string) => Promise<unknown>,
  ): Promise<number> {
    let geschafft = 0;
    const abgelehnt: (BadRequestException | ForbiddenException)[] = [];

    for (const id of pruefeIds(ids)) {
      try {
        await schritt(id);
        geschafft += 1;
      } catch (fehler) {
        if (fehler instanceof NotFoundException) {
          continue;
        }

        if (
          fehler instanceof BadRequestException ||
          fehler instanceof ForbiddenException
        ) {
          abgelehnt.push(fehler);
          continue;
        }

        throw fehler;
      }
    }

    if (abgelehnt.length > 0) {
      const gruende = [...new Set(abgelehnt.map((f) => f.message))].join(' ');
      const text = `${String(geschafft)} ${erledigt}, ${String(abgelehnt.length)} nicht: ${gruende}`;

      throw abgelehnt.every((f) => f instanceof ForbiddenException)
        ? new ForbiddenException(text)
        : new BadRequestException(text);
    }

    return geschafft;
  }

  @Mutation(() => Int)
  async sammelLoeschen(
    @CurrentUser() user: RequestUser,
    @Args('art', { type: () => PapierkorbArt }) art: PapierkorbArt,
    @Args('ids', { type: () => [ID] }) ids: string[],
  ): Promise<number> {
    await this.permissions.assert(user, ARTEN[art].recht, 'das zu löschen');

    return this.jeEinzeln(ids, 'gelöscht', (id) =>
      this.dienst(art).remove(user.workspaceId, id, user.userId),
    );
  }

  @Mutation(() => Int)
  async sammelVerantwortlich(
    @CurrentUser() user: RequestUser,
    @Args('art', { type: () => PapierkorbArt }) art: PapierkorbArt,
    @Args('ids', { type: () => [ID] }) ids: string[],
    @Args('ownerId', { type: () => ID, nullable: true }) ownerId: string | null,
  ): Promise<number> {
    const recht = SCHREIBRECHT[art];

    if (recht === undefined) {
      throw new BadRequestException(
        'Aufgaben haben eine Zuständige, keinen Verantwortlichen.',
      );
    }

    await this.permissions.assert(user, recht, 'das zu ändern');

    return this.jeEinzeln(ids, 'zugewiesen', (id) =>
      this.dienst(art).update(user.workspaceId, id, { ownerId } as never),
    );
  }

  @Mutation(() => Int)
  async sammelPhase(
    @CurrentUser() user: RequestUser,
    @Args('ids', { type: () => [ID] }) ids: string[],
    @Args('stage', { type: () => DealStage }) stage: DealStage,
  ): Promise<number> {
    await this.permissions.assert(
      user,
      Permission.DEAL_WRITE,
      'Geschäfte zu ändern',
    );

    const geschafft = await this.jeEinzeln(ids, 'verschoben', (id) =>
      this.deals.update(user.workspaceId, id, { stage }),
    );

    return geschafft;
  }
}
