import { type FilterFeld } from '../custom-fields/custom-field-query';
import {
  STANDARD_FELDER,
  standardFeld,
} from '../custom-fields/standard-felder';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';

import { operatorPasst } from '../custom-fields/custom-field-query';
import {
  CustomFieldEntity,
  CustomFieldFilterOperator,
  CUSTOM_SORT_PREFIX,
} from '../custom-fields/custom-field.types';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import {
  BOARD_STANDARDFELDER,
  DARSTELLUNGEN,
  EIGENER_TYP,
  KALENDER_STANDARDFELDER,
} from './darstellung';
import { SavedViewDefaultEntity } from './saved-view-default.entity';
import { SavedViewEntity } from './saved-view.entity';

const BUILT_IN_FILTERS: Record<CustomFieldEntity, string[]> = {
  [CustomFieldEntity.COMPANY]: ['industry', 'country', 'verantwortlich'],
  [CustomFieldEntity.CONTACT]: ['companyId', 'verantwortlich'],
  [CustomFieldEntity.DEAL]: [
    'stage',
    'verantwortlich',
    'companyId',
    'openOnly',
    'minAmount',
    'closeBefore',
    'pipelineId',
  ],
  [CustomFieldEntity.TASK]: ['assigneeId', 'openOnly', 'ansicht', 'nurMeine'],
};

export type SavedViewInput = {
  entity: CustomFieldEntity;
  name: string;
  search?: string | null;
  sortField?: string | null;
  sortDirection?: string | null;
  customFilters?: unknown[];
  columns?: string[];
  filters?: Record<string, string | number | boolean | null>;
  privat?: boolean;
  gruppierung?: string | null;
  filterVerknuepfung?: string | null;
  darstellung?: string | null;
  gruppenFeld?: string | null;
  datumFeld?: string | null;
};

type StoredFilter = {
  key: string;
  operator: string;
  value?: string | null;
  gruppe?: number | null;
};

const OPERATOR_NAMES = new Map<string, string>(
  Object.entries(CustomFieldFilterOperator).flatMap(([name, value]) => [
    [name, name],
    [value, name],
  ]),
);

@Injectable()
export class SavedViewsService {
  constructor(
    @InjectRepository(SavedViewEntity)
    private readonly repository: Repository<SavedViewEntity>,
    @InjectRepository(SavedViewDefaultEntity)
    private readonly defaultRepository: Repository<SavedViewDefaultEntity>,
    @InjectRepository(MembershipEntity)
    private readonly membershipRepository: Repository<MembershipEntity>,
    private readonly customFieldsService: CustomFieldsService,
  ) {}

  async list(
    workspaceId: string,
    userId: string,
    entity: CustomFieldEntity,
  ): Promise<SavedViewEntity[]> {
    const [views, definitions, preference] = await Promise.all([
      this.repository.find({
        where: [
          { workspaceId, entity, privat: false },
          { workspaceId, entity, privat: true, createdById: userId },
        ],
        order: { name: 'ASC' },
      }),
      this.customFieldsService.list(workspaceId, entity),
      this.defaultRepository.findOne({
        where: { userId, workspaceId, entity },
      }),
    ]);

    const liveKeys = new Set(definitions.map((field) => field.key));
    const filterKeys = new Set([
      ...liveKeys,
      ...STANDARD_FELDER[entity].map((feld) => feld.key),
    ]);

    for (const view of views) {
      view.isDefault = view.id === preference?.savedViewId;
      view.customFilters = (view.customFilters as StoredFilter[]).filter(
        (filter) => filterKeys.has(filter.key),
      );

      if (
        view.sortField !== null &&
        view.sortField.startsWith(CUSTOM_SORT_PREFIX) &&
        !liveKeys.has(view.sortField.slice(CUSTOM_SORT_PREFIX.length))
      ) {
        view.sortField = null;
        view.sortDirection = null;
      }

      if (
        view.gruppierung !== null &&
        view.gruppierung.startsWith(CUSTOM_SORT_PREFIX) &&
        !liveKeys.has(view.gruppierung.slice(CUSTOM_SORT_PREFIX.length))
      ) {
        view.gruppierung = null;
      }

      if (
        view.gruppenFeld !== null &&
        view.gruppenFeld.startsWith(CUSTOM_SORT_PREFIX) &&
        !liveKeys.has(view.gruppenFeld.slice(CUSTOM_SORT_PREFIX.length))
      ) {
        view.gruppenFeld = null;
      }

      if (
        view.datumFeld !== null &&
        view.datumFeld.startsWith(CUSTOM_SORT_PREFIX) &&
        !liveKeys.has(view.datumFeld.slice(CUSTOM_SORT_PREFIX.length))
      ) {
        view.datumFeld = null;
      }
    }

    return views;
  }

  async create(
    workspaceId: string,
    userId: string,
    input: SavedViewInput,
  ): Promise<SavedViewEntity> {
    const name = input.name.trim();

    if (name === '') {
      throw new BadRequestException('Eine Ansicht braucht einen Namen.');
    }

    const privat = input.privat === true;

    await this.pruefeName(workspaceId, userId, input.entity, name, privat);

    const neu = await this.repository.save(
      this.repository.create({
        workspaceId,
        createdById: userId,
        entity: input.entity,
        name,
        privat,
        search: input.search?.trim() === '' ? null : (input.search ?? null),
        sortField: await this.checkSortField(
          workspaceId,
          input.entity,
          input.sortField ?? null,
        ),
        sortDirection: input.sortDirection ?? null,
        customFilters: await this.checkCustomFilters(
          workspaceId,
          input.entity,
          input.customFilters ?? [],
        ),
        filters: this.checkFilters(input.entity, input.filters ?? {}),
        columns: input.columns ?? [],
        gruppierung: input.gruppierung ?? null,
        filterVerknuepfung: input.filterVerknuepfung === 'ODER' ? 'ODER' : null,
        darstellung: this.checkDarstellung(input.darstellung ?? null),
        gruppenFeld: await this.checkDarstellungsFeld(
          workspaceId,
          input.entity,
          'board',
          input.gruppenFeld ?? null,
        ),
        datumFeld: await this.checkDarstellungsFeld(
          workspaceId,
          input.entity,
          'kalender',
          input.datumFeld ?? null,
        ),
      }),
    );

    neu.isDefault = false;

    return neu;
  }

  private async pruefeName(
    workspaceId: string,
    userId: string,
    entity: CustomFieldEntity,
    name: string,
    privat: boolean,
    ausser?: string,
  ): Promise<void> {
    const clash = await this.repository.findOne({
      where: privat
        ? { workspaceId, entity, name, privat, createdById: userId }
        : { workspaceId, entity, name, privat },
    });

    if (clash !== null && clash.id !== ausser) {
      throw new BadRequestException(
        `Eine Ansicht mit dem Namen "${name}" gibt es schon.`,
      );
    }
  }

  private async sichtbare(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<SavedViewEntity> {
    const view = await this.repository.findOne({ where: { id, workspaceId } });

    if (view === null || (view.privat && view.createdById !== userId)) {
      throw new NotFoundException('Diese Ansicht gibt es nicht.');
    }

    return view;
  }

  private async pruefeAenderbar(
    view: SavedViewEntity,
    workspaceId: string,
    userId: string,
    was: string,
  ): Promise<void> {
    if (view.createdById === userId) {
      return;
    }

    const membership = await this.membershipRepository.findOne({
      where: { userId, workspaceId },
    });

    const isAdmin =
      membership !== null &&
      [MembershipRole.OWNER, MembershipRole.ADMIN].includes(membership.role);

    if (!isAdmin) {
      throw new ForbiddenException(
        `Nur wer diese Ansicht angelegt hat, und Administratoren, dürfen sie ${was}.`,
      );
    }
  }

  async update(
    workspaceId: string,
    userId: string,
    input: Omit<Partial<SavedViewInput>, 'entity'> & { id: string },
  ): Promise<SavedViewEntity> {
    const view = await this.sichtbare(workspaceId, userId, input.id);

    await this.pruefeAenderbar(view, workspaceId, userId, 'ändern');

    if (
      input.privat !== undefined &&
      input.privat !== view.privat &&
      view.createdById !== userId
    ) {
      throw new ForbiddenException(
        'Ob eine Ansicht privat ist, entscheidet nur, wer sie angelegt hat.',
      );
    }

    const name = input.name === undefined ? view.name : input.name.trim();

    if (name === '') {
      throw new BadRequestException('Eine Ansicht braucht einen Namen.');
    }

    const privat = input.privat ?? view.privat;

    await this.pruefeName(
      workspaceId,
      view.createdById,
      view.entity,
      name,
      privat,
      view.id,
    );

    view.name = name;
    view.privat = privat;

    if (input.search !== undefined) {
      view.search =
        input.search === null || input.search.trim() === ''
          ? null
          : input.search;
    }

    if (input.sortField !== undefined) {
      view.sortField = await this.checkSortField(
        workspaceId,
        view.entity,
        input.sortField ?? null,
      );
    }

    if (input.sortDirection !== undefined) {
      view.sortDirection = input.sortDirection ?? null;
    }

    if (input.customFilters !== undefined) {
      view.customFilters = await this.checkCustomFilters(
        workspaceId,
        view.entity,
        input.customFilters,
      );
    }

    if (input.filters !== undefined) {
      view.filters = this.checkFilters(view.entity, input.filters);
    }

    if (input.columns !== undefined) {
      view.columns = input.columns;
    }

    if (input.gruppierung !== undefined) {
      view.gruppierung = input.gruppierung;
    }

    if (input.filterVerknuepfung !== undefined) {
      view.filterVerknuepfung =
        input.filterVerknuepfung === 'ODER' ? 'ODER' : null;
    }

    if (input.darstellung !== undefined) {
      view.darstellung = this.checkDarstellung(input.darstellung);
    }

    if (input.gruppenFeld !== undefined) {
      view.gruppenFeld = await this.checkDarstellungsFeld(
        workspaceId,
        view.entity,
        'board',
        input.gruppenFeld,
      );
    }

    if (input.datumFeld !== undefined) {
      view.datumFeld = await this.checkDarstellungsFeld(
        workspaceId,
        view.entity,
        'kalender',
        input.datumFeld,
      );
    }

    const gespeichert = await this.repository.save(view);

    if (privat) {
      await this.defaultRepository.delete({
        savedViewId: view.id,
        userId: Not(view.createdById),
      });
    }

    const [mitStand] = await this.list(workspaceId, userId, view.entity).then(
      (liste) => liste.filter((eintrag) => eintrag.id === gespeichert.id),
    );

    return mitStand ?? gespeichert;
  }

  async setDefault(
    workspaceId: string,
    userId: string,
    entity: CustomFieldEntity,
    savedViewId: string | null,
  ): Promise<boolean> {
    await this.defaultRepository.delete({ userId, workspaceId, entity });

    if (savedViewId === null) {
      return true;
    }

    const view = await this.repository.findOne({
      where: { id: savedViewId, workspaceId, entity },
    });

    if (view === null || (view.privat && view.createdById !== userId)) {
      throw new NotFoundException('Diese Ansicht gibt es nicht.');
    }

    await this.defaultRepository.save(
      this.defaultRepository.create({
        userId,
        workspaceId,
        entity,
        savedViewId,
      }),
    );

    return true;
  }

  async remove(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<boolean> {
    const view = await this.sichtbare(workspaceId, userId, id);

    await this.pruefeAenderbar(view, workspaceId, userId, 'löschen');

    await this.repository.remove(view);

    return true;
  }

  private async checkSortField(
    workspaceId: string,
    entity: CustomFieldEntity,
    sortField: string | null,
  ): Promise<string | null> {
    if (sortField === null || !sortField.startsWith(CUSTOM_SORT_PREFIX)) {
      return sortField;
    }

    const key = sortField.slice(CUSTOM_SORT_PREFIX.length);
    const definitions = await this.customFieldsService.list(
      workspaceId,
      entity,
    );

    if (!definitions.some((field) => field.key === key)) {
      throw new BadRequestException(`Unbekanntes eigenes Feld "${key}".`);
    }

    return sortField;
  }

  private async checkCustomFilters(
    workspaceId: string,
    entity: CustomFieldEntity,
    filters: unknown[],
  ): Promise<StoredFilter[]> {
    if (filters.length === 0) {
      return [];
    }

    const definitions = await this.customFieldsService.list(
      workspaceId,
      entity,
    );
    const byKey = new Map<string, FilterFeld>(
      definitions.map((field) => [field.key, field]),
    );

    return (filters as StoredFilter[]).map((filter) => {
      const definition =
        byKey.get(filter.key) ?? standardFeld(entity, filter.key);

      if (definition === undefined) {
        throw new BadRequestException(
          `Unbekanntes eigenes Feld "${filter.key}".`,
        );
      }

      const operator = OPERATOR_NAMES.get(filter.operator);

      if (operator === undefined) {
        throw new BadRequestException(
          `Unbekannter Vergleich "${filter.operator}".`,
        );
      }

      const value =
        CustomFieldFilterOperator[
          operator as keyof typeof CustomFieldFilterOperator
        ];

      if (!operatorPasst(definition.type, value)) {
        throw new BadRequestException(
          `Dieser Vergleich passt nicht zu "${definition.label}".`,
        );
      }

      return { ...filter, operator };
    });
  }

  private checkDarstellung(darstellung: string | null): string | null {
    if (darstellung === null) {
      return null;
    }

    if (!(DARSTELLUNGEN as readonly string[]).includes(darstellung)) {
      throw new BadRequestException(
        `Diese Liste lässt sich nicht als „${darstellung}“ zeigen.`,
      );
    }

    return darstellung;
  }

  private async checkDarstellungsFeld(
    workspaceId: string,
    entity: CustomFieldEntity,
    art: 'board' | 'kalender',
    feld: string | null,
  ): Promise<string | null> {
    if (feld === null || feld === '') {
      return null;
    }

    const fest =
      art === 'board' ? BOARD_STANDARDFELDER : KALENDER_STANDARDFELDER;

    if (fest[entity].includes(feld)) {
      return feld;
    }

    if (feld.startsWith(CUSTOM_SORT_PREFIX)) {
      const key = feld.slice(CUSTOM_SORT_PREFIX.length);
      const definitions = await this.customFieldsService.list(
        workspaceId,
        entity,
      );
      const definition = definitions.find((field) => field.key === key);

      if (definition === undefined) {
        return null;
      }

      if (definition.type === EIGENER_TYP[art]) {
        return feld;
      }
    }

    throw new BadRequestException(
      art === 'board'
        ? `Nach „${feld}“ lässt sich kein Board bilden: Spalten gibt es für Auswahlfelder.`
        : `Nach „${feld}“ lässt sich kein Kalender zeigen: dafür braucht es ein Datumsfeld.`,
    );
  }

  private checkFilters(
    entity: CustomFieldEntity,
    filters: Record<string, string | number | boolean | null>,
  ): Record<string, string | number | boolean | null> {
    const allowed = BUILT_IN_FILTERS[entity];
    const kept: Record<string, string | number | boolean | null> = {};

    for (const [key, value] of Object.entries(filters)) {
      if (!allowed.includes(key)) {
        throw new BadRequestException(`"${key}" ist kein Filter dieser Liste.`);
      }

      if (Array.isArray(value)) {
        throw new BadRequestException(`"${key}" nimmt einen einzelnen Wert.`);
      }

      if (value !== null && value !== '') {
        kept[key] = value;
      }
    }

    return kept;
  }
}
