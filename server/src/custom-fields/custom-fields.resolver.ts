import {
  BadRequestException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import {
  eigenesSchluessel,
  type FeldArt,
  feldrechteJetzt,
} from '../workspaces/feldrechte';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import {
  type SichtbarkeitsArt,
  sichtbarkeitsBedingung,
} from '../workspaces/sichtbarkeit';
import { WorkspaceRolesService } from '../workspaces/workspace-roles.service';
import { CustomFieldGroupEntity } from './custom-field-group.entity';
import { CustomFieldDefinition } from './custom-field.entity';
import { CustomFieldEntity, VERWEIS_ARTEN } from './custom-field.types';
import { CustomFieldsService } from './custom-fields.service';
import {
  CreateCustomFieldGroupInput,
  CreateCustomFieldInput,
  FeldFuellgrad,
  GegenfeldWert,
  UpdateCustomFieldGroupInput,
  UpdateCustomFieldInput,
  VerweisTitel,
} from './dto/custom-field.dto';
import {
  gegenfelderVon,
  gegenfeldLesen,
  VERWEIS_TABELLE,
  verweiseLaden,
} from './verknuepfung';

const MANAGE = 'die Felder eines Datensatzes zu ändern';

const SEHEN: Record<CustomFieldEntity, Permission> = {
  [CustomFieldEntity.COMPANY]: Permission.COMPANY_VIEW,
  [CustomFieldEntity.CONTACT]: Permission.CONTACT_VIEW,
  [CustomFieldEntity.DEAL]: Permission.DEAL_VIEW,
  [CustomFieldEntity.TASK]: Permission.TASK_VIEW,
};

const MAX_VERWEIS_TITEL = 500;

@Resolver()
@UseGuards(GqlAuthGuard)
export class CustomFieldsResolver {
  constructor(
    private readonly customFieldsService: CustomFieldsService,
    private readonly rolesService: WorkspaceRolesService,
    private readonly permissions: PermissionsService,
  ) {}

  @Query(() => [VerweisTitel])
  async verweisTitel(
    @CurrentUser() user: RequestUser,
    @Args('ziel', { type: () => CustomFieldEntity }) ziel: CustomFieldEntity,
    @Args('ids', { type: () => [ID] }) ids: string[],
  ): Promise<VerweisTitel[]> {
    if (!VERWEIS_ARTEN.includes(ziel)) {
      throw new BadRequestException(
        'Verweise gibt es auf Firmen, Kontakte und Geschäfte.',
      );
    }

    if (ids.length > MAX_VERWEIS_TITEL) {
      throw new BadRequestException(
        `Höchstens ${String(MAX_VERWEIS_TITEL)} Verweise auf einmal.`,
      );
    }

    const info = await verweiseLaden(
      this.customFieldsService.manager,
      user.workspaceId,
      ziel,
      ids,
    );
    const darf = await this.permissions.can(user, SEHEN[ziel]);

    return [...info.entries()].map(([id, eintrag]) => {
      const sichtbar = darf && eintrag.sichtbar;

      return { id, titel: sichtbar ? eintrag.titel : null, sichtbar };
    });
  }

  @Query(() => [GegenfeldWert])
  async gegenfeldWerte(
    @CurrentUser() user: RequestUser,
    @Args('entity', { type: () => CustomFieldEntity })
    entity: CustomFieldEntity,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<GegenfeldWert[]> {
    if (!VERWEIS_ARTEN.includes(entity)) {
      return [];
    }

    await this.permissions.assert(
      user,
      SEHEN[entity],
      'diesen Datensatz zu sehen',
    );

    const manager = this.customFieldsService.manager;
    const sicht = await sichtbarkeitsBedingung(
      entity as SichtbarkeitsArt,
      'akte',
    );
    const abfrage = manager
      .createQueryBuilder()
      .from(VERWEIS_TABELLE[entity], 'akte')
      .where('akte."id" = :akteId', { akteId: id })
      .andWhere('akte."workspaceId" = :akteBereich', {
        akteBereich: user.workspaceId,
      })
      .andWhere('akte."deletedAt" IS NULL');

    if (sicht !== null) {
      abfrage.andWhere(sicht.where, sicht.parameters);
    }

    if ((await abfrage.getCount()) === 0) {
      throw new NotFoundException('Diesen Datensatz gibt es nicht.');
    }

    const rechte = await feldrechteJetzt();
    const verborgen = (art: CustomFieldEntity, key: string) =>
      rechte[eigenesSchluessel(art as FeldArt, key)] === 'verborgen';
    const ergebnis: GegenfeldWert[] = [];

    for (const { gegenfeld, quelle } of await gegenfelderVon(
      manager,
      user.workspaceId,
      entity,
    )) {
      if (
        verborgen(gegenfeld.entity, gegenfeld.key) ||
        verborgen(quelle.entity, quelle.key)
      ) {
        continue;
      }

      const inhalt = await gegenfeldLesen(
        manager,
        user.workspaceId,
        quelle,
        id,
        await this.permissions.can(user, SEHEN[quelle.entity]),
      );

      ergebnis.push({
        feldId: gegenfeld.id,
        quelle: quelle.entity,
        ...inhalt,
      });
    }

    return ergebnis;
  }

  @Query(() => [CustomFieldDefinition])
  async customFields(
    @CurrentUser() user: RequestUser,
    @Args('entity', { type: () => CustomFieldEntity, nullable: true })
    entity?: CustomFieldEntity,
  ): Promise<CustomFieldDefinition[]> {
    const definitionen =
      entity === undefined
        ? await this.customFieldsService.listAll(user.workspaceId)
        : await this.customFieldsService.list(user.workspaceId, entity);
    const rechte = await feldrechteJetzt();

    return definitionen.map((definition) =>
      rechte[eigenesSchluessel(definition.entity, definition.key)] ===
        'verborgen' && definition.standardwertWert !== null
        ? Object.assign(
            Object.create(
              Object.getPrototypeOf(definition) as object,
            ) as CustomFieldDefinition,
            definition,
            { standardwertWert: null },
          )
        : definition,
    );
  }

  @Mutation(() => CustomFieldDefinition)
  @UseGuards(BillingWriteGuard)
  async createCustomField(
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateCustomFieldInput,
  ): Promise<CustomFieldDefinition> {
    await this.rolesService.assertCanAdminister(user, MANAGE);

    return this.customFieldsService.create(user.workspaceId, input);
  }

  @Mutation(() => CustomFieldDefinition)
  @UseGuards(BillingWriteGuard)
  async updateCustomField(
    @CurrentUser() user: RequestUser,
    @Args('input') input: UpdateCustomFieldInput,
  ): Promise<CustomFieldDefinition> {
    await this.rolesService.assertCanAdminister(user, MANAGE);

    return this.customFieldsService.update(user.workspaceId, input.id, input);
  }

  @Mutation(() => CustomFieldDefinition)
  async archiveCustomField(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<CustomFieldDefinition> {
    await this.rolesService.assertCanAdminister(user, MANAGE);

    return this.customFieldsService.archive(user.workspaceId, id);
  }

  @Mutation(() => CustomFieldDefinition)
  @UseGuards(BillingWriteGuard)
  async restoreCustomField(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<CustomFieldDefinition> {
    await this.rolesService.assertCanAdminister(user, MANAGE);

    return this.customFieldsService.restore(user.workspaceId, id);
  }

  @Query(() => [CustomFieldGroupEntity])
  customFieldGroups(
    @CurrentUser() user: RequestUser,
    @Args('entity', { type: () => CustomFieldEntity, nullable: true })
    entity?: CustomFieldEntity,
  ): Promise<CustomFieldGroupEntity[]> {
    return this.customFieldsService.listGruppen(
      user.workspaceId,
      entity ?? undefined,
    );
  }

  @Mutation(() => CustomFieldGroupEntity)
  @UseGuards(BillingWriteGuard)
  async createCustomFieldGroup(
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateCustomFieldGroupInput,
  ): Promise<CustomFieldGroupEntity> {
    await this.rolesService.assertCanAdminister(user, MANAGE);

    return this.customFieldsService.createGruppe(user.workspaceId, input);
  }

  @Mutation(() => CustomFieldGroupEntity)
  @UseGuards(BillingWriteGuard)
  async updateCustomFieldGroup(
    @CurrentUser() user: RequestUser,
    @Args('input') input: UpdateCustomFieldGroupInput,
  ): Promise<CustomFieldGroupEntity> {
    await this.rolesService.assertCanAdminister(user, MANAGE);

    return this.customFieldsService.updateGruppe(user.workspaceId, input);
  }

  @Mutation(() => Boolean)
  @UseGuards(BillingWriteGuard)
  async deleteCustomFieldGroup(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.rolesService.assertCanAdminister(user, MANAGE);

    return this.customFieldsService.deleteGruppe(user.workspaceId, id);
  }

  @Query(() => [FeldFuellgrad])
  async feldFuellgrad(
    @CurrentUser() user: RequestUser,
    @Args('entity', { type: () => CustomFieldEntity })
    entity: CustomFieldEntity,
  ): Promise<FeldFuellgrad[]> {
    await this.rolesService.assertCanAdminister(user, MANAGE);

    return this.customFieldsService.fuellgrad(user.workspaceId, entity);
  }
}
