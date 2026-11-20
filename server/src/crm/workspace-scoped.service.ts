import { AsyncLocalStorage } from 'node:async_hooks';

import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  type DeepPartial,
  type EntityManager,
  type FindOptionsOrder,
  type FindOptionsRelations,
  type FindOptionsWhere,
  type ObjectLiteral,
  type Repository,
  type SelectQueryBuilder,
} from 'typeorm';

import {
  comparableExpression,
  FIRMA_REL,
  type FilterKontext,
  filterFragment,
  type SqlFragment,
} from '../custom-fields/custom-field-query';
import { type CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import {
  CUSTOM_SORT_PREFIX,
  CustomFieldFilterOperator,
  type CustomFieldEntity,
  type CustomFieldValues,
} from '../custom-fields/custom-field.types';
import { type CustomFieldsService } from '../custom-fields/custom-fields.service';
import {
  STANDARD_PREFIX,
  standardFeld,
} from '../custom-fields/standard-felder';
import { CustomFieldType } from '../custom-fields/custom-field.types';
import {
  assertFelderSchreibbar,
  eigenesSchluessel,
  type FeldArt,
  FELDART_DER_ENTITAET,
  feldrechteJetzt,
  STANDARD_FELDRECHTE,
  standardSchluessel,
} from '../workspaces/feldrechte';
import { assertVerweiseImBereich, type Verweise } from '../workspaces/verweise';
import {
  alsRohesSql,
  ART_DER_ENTITAET,
  assertSchreibbar,
  assertVerantwortungAenderbar,
  istSichtbar,
  sichtbarkeitsBedingung,
} from '../workspaces/sichtbarkeit';
import { meldeAenderung } from './datensatz-ereignisse';
import {
  normSpalte,
  normWoertlich,
  suchBedingung,
  suchWoerter,
  UNSCHARF_SCHWELLE,
} from './suche';
import { mitInDenPapierkorb } from './papierkorb-folgen';
import { type ListenGruppe } from './dto/page.dto';
import {
  DEFAULT_PAGE_SIZE,
  EXPORT_CEILING,
  EXPORT_CHUNK,
  FilterVerknuepfung,
  type ListArgs,
  MAX_PAGE_SIZE,
  MAX_ZEITRAUM_TAGE,
  SortDirection,
} from './dto/pagination.dto';
import {
  aenderungen,
  melde,
  meldungenZurueckhalten,
  type WebhookAktion,
  type WebhookEreignis,
  type WebhookObjekt,
} from '../webhooks/ereignisse';

const WEBHOOK_OBJEKT: Record<string, WebhookObjekt | undefined> = {
  CompanyEntity: 'company',
  ContactEntity: 'contact',
  DealEntity: 'deal',
  NoteEntity: 'note',
  TaskEntity: 'task',
};

const ereignis = (
  entitaet: string,
  aktion: WebhookAktion,
): WebhookEreignis | undefined => {
  const objekt = WEBHOOK_OBJEKT[entitaet];

  return objekt === undefined ? undefined : `${objekt}.${aktion}`;
};

export const webhookDaten = (record: object): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(record).filter(
      ([key, value]) =>
        key !== 'workspaceId' &&
        key !== 'workspace' &&
        (key === 'customFields' ||
          value === null ||
          typeof value !== 'object' ||
          value instanceof Date),
    ),
  );

const schreibTransaktion = new AsyncLocalStorage<EntityManager>();

export const inSchreibTransaktion = <T>(
  manager: EntityManager,
  meldungen: (() => void)[],
  arbeit: () => Promise<T>,
): Promise<T> =>
  schreibTransaktion.run(manager, () =>
    meldungenZurueckhalten(meldungen, arbeit),
  );

const ZEITRAUM_INDEX = 900;

const gueltigerTag = (tag: string): Date | null => {
  const datum = new Date(`${tag}T00:00:00Z`);

  return Number.isNaN(datum.getTime()) ||
    datum.toISOString().slice(0, 10) !== tag
    ? null
    : datum;
};

const tagVersetzt = (datum: Date, tage: number): string =>
  new Date(datum.getTime() + tage * 86_400_000).toISOString().slice(0, 10);

export const MAX_GRUPPEN = 100;

type WorkspaceScoped = ObjectLiteral & {
  id: string;
  workspaceId: string;
  customFields?: CustomFieldValues;
};

export type Page<TEntity> = {
  items: TEntity[];
  totalCount: number;
  hasMore: boolean;
};

export abstract class WorkspaceScopedService<TEntity extends WorkspaceScoped> {
  protected constructor(
    protected readonly repository: Repository<TEntity>,
    private readonly entityLabel: string,
    private readonly customFieldsService: CustomFieldsService,
    private readonly customFieldEntity: CustomFieldEntity | null,
  ) {}

  protected get repo(): Repository<TEntity> {
    const manager = schreibTransaktion.getStore();

    return manager === undefined
      ? this.repository
      : manager.getRepository<TEntity>(this.repository.target);
  }

  protected relations(): FindOptionsRelations<TEntity> | undefined {
    return undefined;
  }

  protected verweise(_input: DeepPartial<TEntity>): Verweise {
    return {};
  }

  protected async vorDemSpeichern(
    _workspaceId: string,
    _record: TEntity,
    _phaseVorher: unknown,
  ): Promise<void> {}

  protected abstract defaultOrder(): FindOptionsOrder<TEntity>;

  protected abstract searchableColumns(): string[];

  protected suchAusdruecke(verborgen: Set<string>): string[] {
    return this.searchableColumns()
      .filter((column) => !verborgen.has(column))
      .map((column) =>
        normSpalte(
          this.alias,
          column,
          this.repository.metadata.findColumnWithPropertyName(column)?.type ===
            'jsonb',
        ),
      );
  }

  protected abstract sortableColumns(): string[];

  protected filterFelder(): Record<string, string> {
    return {};
  }

  protected gruppierbareSpalten(): string[] {
    return [];
  }

  protected gruppenSumme(): { spalte: string; je?: string } | null {
    return null;
  }

  protected applyFilters(
    _queryBuilder: SelectQueryBuilder<TEntity>,
    _filters: Record<string, unknown>,
  ): void {}

  protected get alias(): string {
    return 'record';
  }

  private get sichtbarkeitsArt() {
    return ART_DER_ENTITAET[this.repository.metadata.name];
  }

  protected async sichtbarkeitsFilter(
    alias: string,
  ): Promise<{ where: string; parameters: Record<string, unknown> } | null> {
    const art = this.sichtbarkeitsArt;

    return art === undefined ? null : sichtbarkeitsBedingung(art, alias);
  }

  protected async nurSichtbare(
    queryBuilder: SelectQueryBuilder<TEntity>,
    alias: string = this.alias,
  ): Promise<SelectQueryBuilder<TEntity>> {
    const bedingung = await this.sichtbarkeitsFilter(alias);

    if (bedingung !== null) {
      queryBuilder.andWhere(bedingung.where, bedingung.parameters);
    }

    return queryBuilder;
  }

  protected async sichtbarkeitsSql(
    alias: string,
    naechsterParameter: number,
  ): Promise<{ sql: string; werte: unknown[] }> {
    const bedingung = await this.sichtbarkeitsFilter(alias);

    if (bedingung === null) {
      return { sql: '', werte: [] };
    }

    const { sql, werte } = alsRohesSql(bedingung, naechsterParameter);

    return { sql: ` AND ${sql}`, werte };
  }

  protected async sichtbar(record: TEntity): Promise<boolean> {
    const art = this.sichtbarkeitsArt;

    return (
      art === undefined ||
      istSichtbar(
        art,
        (record as { ownerId?: string | null }).ownerId,
        record.id,
      )
    );
  }

  protected async assertSchreibbar(record: TEntity): Promise<void> {
    const art = this.sichtbarkeitsArt;

    if (art !== undefined) {
      await assertSchreibbar(
        art,
        (record as { ownerId?: string | null }).ownerId,
        record.id,
      );
    }
  }

  private definitionsFor(
    workspaceId: string,
  ): Promise<CustomFieldDefinition[]> {
    return this.customFieldEntity === null
      ? Promise.resolve([])
      : this.customFieldsService.list(workspaceId, this.customFieldEntity);
  }

  private get feldArt(): FeldArt | undefined {
    return FELDART_DER_ENTITAET[this.repository.metadata.name];
  }

  private async verborgeneSpalten(
    args: ListArgs,
    filters: Record<string, unknown>,
  ): Promise<Set<string>> {
    const art = this.feldArt;

    if (art === undefined) {
      return new Set();
    }

    const rechte = await feldrechteJetzt();

    if (Object.keys(rechte).length === 0) {
      return new Set();
    }

    const verborgen = (schluessel: string) =>
      rechte[schluessel] === 'verborgen';
    const name = (schluessel: string, roh: string) =>
      STANDARD_FELDRECHTE.find((eintrag) => eintrag.schluessel === schluessel)
        ?.label ?? roh;
    const ablehnen = (schluessel: string, roh: string) => {
      throw new BadRequestException(
        `Nach „${name(schluessel, roh)}“ kann Ihre Rolle nicht filtern oder sortieren.`,
      );
    };

    for (const filter of args.customFilters ?? []) {
      const firma = filter.key.startsWith(`${STANDARD_PREFIX}firma.`);
      const schluessel = firma
        ? standardSchluessel(
            'company',
            filter.key.slice(`${STANDARD_PREFIX}firma.`.length),
          )
        : filter.key.startsWith(STANDARD_PREFIX)
          ? standardSchluessel(art, filter.key.slice(STANDARD_PREFIX.length))
          : eigenesSchluessel(art, filter.key);

      if (verborgen(schluessel)) {
        ablehnen(schluessel, filter.key);
      }
    }

    for (const gruppierung of [
      args.gruppierung,
      args.gruppe?.feld,
      args.zeitraum?.feld,
    ]) {
      if (gruppierung === undefined || gruppierung === null) {
        continue;
      }

      const schluessel = gruppierung.startsWith(CUSTOM_SORT_PREFIX)
        ? eigenesSchluessel(art, gruppierung.slice(CUSTOM_SORT_PREFIX.length))
        : standardSchluessel(art, gruppierung.slice(STANDARD_PREFIX.length));

      if (verborgen(schluessel)) {
        ablehnen(schluessel, gruppierung);
      }
    }

    for (const [filter, feld] of Object.entries(this.filterFelder())) {
      const wert = filters[filter];
      const schluessel = standardSchluessel(art, feld);

      if (wert !== undefined && wert !== null && verborgen(schluessel)) {
        ablehnen(schluessel, feld);
      }
    }

    const sortierung = args.sortField;

    if (sortierung !== undefined) {
      const schluessel = sortierung.startsWith(CUSTOM_SORT_PREFIX)
        ? eigenesSchluessel(art, sortierung.slice(CUSTOM_SORT_PREFIX.length))
        : standardSchluessel(art, sortierung);

      if (verborgen(schluessel)) {
        ablehnen(schluessel, sortierung);
      }
    }

    return new Set(
      STANDARD_FELDRECHTE.filter(
        (eintrag) => eintrag.art === art && verborgen(eintrag.schluessel),
      ).flatMap((eintrag) => [eintrag.feld, ...(eintrag.auch ?? [])]),
    );
  }

  private async pruefeFeldrechte(
    input: DeepPartial<TEntity>,
    neu: boolean,
  ): Promise<void> {
    const art = this.feldArt;

    if (art === undefined) {
      return;
    }

    const gesetzt = (wert: unknown) =>
      neu
        ? wert !== undefined &&
          wert !== null &&
          wert !== '' &&
          !(Array.isArray(wert) && wert.length === 0)
        : wert !== undefined;
    const eingabe = input as Record<string, unknown>;
    const eigene = (eingabe.customFields ?? {}) as Record<string, unknown>;

    await assertFelderSchreibbar(
      art,
      STANDARD_FELDRECHTE.filter(
        (eintrag) =>
          eintrag.art === art &&
          [eintrag.feld, ...(eintrag.auch ?? [])].some((feld) =>
            gesetzt(eingabe[feld]),
          ),
      ).map((eintrag) => eintrag.feld),
      Object.keys(eigene).filter((key) => gesetzt(eigene[key])),
    );

    if (!neu) {
      return;
    }

    const rechte = await feldrechteJetzt();
    const gesperrt = Object.keys(eigene).filter(
      (key) => rechte[eigenesSchluessel(art, key)] !== undefined,
    );

    if (gesperrt.length > 0) {
      eingabe.customFields = Object.fromEntries(
        Object.entries(eigene).filter(([key]) => !gesperrt.includes(key)),
      );
    }
  }

  private async filterKontext(args: ListArgs): Promise<FilterKontext> {
    const ueberFirma = (args.customFilters ?? []).some((filter) =>
      filter.key.startsWith(`${STANDARD_PREFIX}firma.`),
    );

    return ueberFirma
      ? { firmaSichtbar: await sichtbarkeitsBedingung('company', FIRMA_REL) }
      : {};
  }

  private applyCustomFilters(
    queryBuilder: SelectQueryBuilder<TEntity>,
    args: ListArgs,
    definitions: CustomFieldDefinition[],
    kontext: FilterKontext,
  ): void {
    const byKey = new Map(definitions.map((d) => [d.key, d]));
    const oben: SqlFragment[] = [];
    const gruppen = new Map<number, SqlFragment[]>();

    (args.customFilters ?? []).forEach((filter, index) => {
      const definition =
        byKey.get(filter.key) ??
        (this.customFieldEntity === null
          ? undefined
          : standardFeld(this.customFieldEntity, filter.key));

      if (definition === undefined) {
        throw new BadRequestException(
          `Unbekanntes eigenes Feld "${filter.key}".`,
        );
      }

      const fragment = filterFragment(
        this.alias,
        definition,
        filter.operator,
        filter.value,
        index,
        kontext,
      );

      if (filter.gruppe === undefined || filter.gruppe === null) {
        oben.push(fragment);
      } else {
        gruppen.set(filter.gruppe, [
          ...(gruppen.get(filter.gruppe) ?? []),
          fragment,
        ]);
      }
    });

    const oder = args.filterVerknuepfung === FilterVerknuepfung.ODER;
    const innen = oder ? ' AND ' : ' OR ';
    const teile: SqlFragment[] = [
      ...oben,
      ...[...gruppen.values()].map((gruppe) => ({
        where: `(${gruppe.map((f) => `(${f.where})`).join(innen)})`,
        parameters: Object.assign(
          {},
          ...gruppe.map((f) => f.parameters),
        ) as Record<string, unknown>,
      })),
    ];

    if (teile.length === 0) {
      return;
    }

    queryBuilder.andWhere(
      `(${teile.map((t) => `(${t.where})`).join(oder ? ' OR ' : ' AND ')})`,
      Object.assign({}, ...teile.map((t) => t.parameters)) as Record<
        string,
        unknown
      >,
    );
  }

  private applyZeitraum(
    queryBuilder: SelectQueryBuilder<TEntity>,
    args: ListArgs,
    definitions: CustomFieldDefinition[],
  ): void {
    const zeitraum = args.zeitraum;

    if (zeitraum === undefined || zeitraum === null) {
      return;
    }

    const definition = zeitraum.feld.startsWith(CUSTOM_SORT_PREFIX)
      ? definitions.find(
          (d) => d.key === zeitraum.feld.slice(CUSTOM_SORT_PREFIX.length),
        )
      : this.customFieldEntity === null
        ? undefined
        : standardFeld(this.customFieldEntity, zeitraum.feld);

    if (definition === undefined || definition.type !== CustomFieldType.DATE) {
      throw new BadRequestException(
        `Nach „${zeitraum.feld}“ lässt sich kein Kalender zeigen: dafür braucht es ein Datumsfeld.`,
      );
    }

    const von = gueltigerTag(zeitraum.von);
    const bis = gueltigerTag(zeitraum.bis);

    if (von === null || bis === null || bis < von) {
      throw new BadRequestException('Der Zeitraum ist kein gültiger.');
    }

    if ((bis.getTime() - von.getTime()) / 86_400_000 >= MAX_ZEITRAUM_TAGE) {
      throw new BadRequestException(
        `Ein Kalender zeigt höchstens ${String(MAX_ZEITRAUM_TAGE)} Tage.`,
      );
    }

    const ab = filterFragment(
      this.alias,
      definition,
      CustomFieldFilterOperator.GREATER_THAN,
      tagVersetzt(von, -1),
      ZEITRAUM_INDEX,
    );
    const bisVor = filterFragment(
      this.alias,
      definition,
      CustomFieldFilterOperator.LESS_THAN,
      tagVersetzt(bis, 1),
      ZEITRAUM_INDEX + 1,
    );

    queryBuilder.andWhere(`((${ab.where}) AND (${bisVor.where}))`, {
      ...ab.parameters,
      ...bisVor.parameters,
    });
  }

  private gruppenAusdruck(
    feld: string,
    definitions: CustomFieldDefinition[],
  ): {
    ausdruck: string;
    parameters: Record<string, unknown>;
    spalte?: string;
  } {
    if (feld.startsWith(STANDARD_PREFIX)) {
      const spalte = feld.slice(STANDARD_PREFIX.length);

      if (this.gruppierbareSpalten().includes(spalte)) {
        return {
          ausdruck: `NULLIF(CAST(${this.alias}."${spalte}" AS text), '')`,
          parameters: {},
          spalte,
        };
      }
    }

    if (feld.startsWith(CUSTOM_SORT_PREFIX)) {
      const key = feld.slice(CUSTOM_SORT_PREFIX.length);
      const definition = definitions.find((d) => d.key === key);

      if (definition?.type === CustomFieldType.SELECT) {
        return {
          ausdruck: `NULLIF(${this.alias}."customFields" ->> :gruppenKey, '')`,
          parameters: { gruppenKey: key },
        };
      }
    }

    throw new BadRequestException(
      `Nach "${feld}" lässt sich diese Liste nicht gruppieren.`,
    );
  }

  private buildListQuery(
    workspaceId: string,
    args: ListArgs,
    filters: Record<string, unknown>,
    definitions: CustomFieldDefinition[],
    verborgen: Set<string>,
    kontext: FilterKontext,
  ): SelectQueryBuilder<TEntity> {
    const queryBuilder = this.repository
      .createQueryBuilder(this.alias)
      .where(`${this.alias}.workspaceId = :workspaceId`, { workspaceId });

    const relations = this.relations();

    if (relations !== undefined) {
      for (const relation of Object.keys(relations)) {
        queryBuilder.leftJoinAndSelect(`${this.alias}.${relation}`, relation);
      }
    }

    const woerter = suchWoerter(args.search);

    if (woerter.length > 0) {
      const bedingung = suchBedingung(
        this.suchAusdruecke(verborgen),
        woerter,
        'suche',
      );

      if (bedingung !== null) {
        queryBuilder.andWhere(bedingung.where, bedingung.parameters);
      }
    }

    this.applyFilters(queryBuilder, filters);

    if (
      typeof filters.ownerId === 'string' &&
      this.repository.metadata.findColumnWithPropertyName('ownerId') !==
        undefined
    ) {
      queryBuilder.andWhere(`${this.alias}.ownerId = :ownerId`, {
        ownerId: filters.ownerId,
      });
    }

    if (Array.isArray(filters.ids)) {
      queryBuilder.andWhere(`${this.alias}.id IN (:...nurIds)`, {
        nurIds: filters.ids.length === 0 ? [null] : filters.ids,
      });
    }
    this.applyCustomFilters(queryBuilder, args, definitions, kontext);
    this.applyZeitraum(queryBuilder, args, definitions);

    if (args.gruppe !== undefined && args.gruppe !== null) {
      const { ausdruck, parameters } = this.gruppenAusdruck(
        args.gruppe.feld,
        definitions,
      );
      const wert = args.gruppe.wert ?? null;

      queryBuilder.andWhere(
        wert === null ? `${ausdruck} IS NULL` : `${ausdruck} = :gruppenWert`,
        { ...parameters, ...(wert === null ? {} : { gruppenWert: wert }) },
      );
    }

    return queryBuilder;
  }

  private applySort(
    queryBuilder: SelectQueryBuilder<TEntity>,
    args: ListArgs,
    definitions: CustomFieldDefinition[],
  ): void {
    const requested = args.sortField;
    const allowed = this.sortableColumns();

    if (requested !== undefined && requested.startsWith(CUSTOM_SORT_PREFIX)) {
      const key = requested.slice(CUSTOM_SORT_PREFIX.length);
      const definition = definitions.find(
        (d) => d.key === key && d.type !== CustomFieldType.RELATION,
      );

      if (definition !== undefined) {
        const direction = args.sortDirection ?? SortDirection.ASC;
        const expression = comparableExpression(
          this.alias,
          definition,
          'sortKey',
        );

        queryBuilder
          .setParameter('sortKey', definition.key)
          .orderBy(expression, direction, 'NULLS LAST')
          .addOrderBy(`${this.alias}.id`, 'ASC');

        return;
      }
    }

    if (requested !== undefined && allowed.includes(requested)) {
      const direction = args.sortDirection ?? SortDirection.ASC;

      queryBuilder.orderBy(
        `${this.alias}.${requested}`,
        direction,
        'NULLS LAST',
      );
    } else {
      const [field, direction] = Object.entries(this.defaultOrder())[0] as [
        string,
        'ASC' | 'DESC',
      ];

      queryBuilder.orderBy(`${this.alias}.${field}`, direction, 'NULLS LAST');
    }

    queryBuilder.addOrderBy(`${this.alias}.id`, 'ASC');
  }

  async list(
    workspaceId: string,
    args: ListArgs = {},
    filters: Record<string, unknown> = {},
  ): Promise<Page<TEntity>> {
    const limit = Math.min(args.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = Math.max(args.offset ?? 0, 0);

    const definitions = await this.definitionsFor(workspaceId);
    const verborgen = await this.verborgeneSpalten(args, filters);
    const queryBuilder = this.buildListQuery(
      workspaceId,
      args,
      filters,
      definitions,
      verborgen,
      await this.filterKontext(args),
    );

    this.applySort(queryBuilder, args, definitions);
    await this.nurSichtbare(queryBuilder);

    const [items, totalCount] = await queryBuilder
      .offset(offset)
      .limit(limit)
      .getManyAndCount();

    return {
      items,
      totalCount,
      hasMore: offset + items.length < totalCount,
    };
  }

  protected titelSpalten(): string[] {
    return ['name'];
  }

  async rangSuche(
    workspaceId: string,
    text: string,
    limit: number,
  ): Promise<{ eintrag: TEntity; rang: number }[]> {
    const woerter = suchWoerter(text);
    const verborgen = await this.verborgeneSpalten({}, {});
    const bedingung = suchBedingung(
      this.suchAusdruecke(verborgen),
      woerter,
      'rang',
      true,
    );

    if (bedingung === null) {
      return [];
    }

    const alias = this.alias;
    const titel = `stegwerk_norm(concat_ws(' ', ${this.titelSpalten()
      .map((spalte) => `${alias}."${spalte}"`)
      .join(', ')}))`;
    const rang = `(CASE WHEN ${titel} = stegwerk_norm(:rangGanz) THEN 3
      WHEN ${titel} LIKE ${normWoertlich('rangAnfang')} || '%' THEN 2 ELSE 0 END
      + word_similarity(stegwerk_norm(:rangGanz), ${titel}))`;
    const ganz = woerter.join(' ');

    return this.repository.manager.transaction(async (manager) => {
      await manager.query(
        `SET LOCAL pg_trgm.word_similarity_threshold = ${String(UNSCHARF_SCHWELLE)}`,
      );

      const queryBuilder = manager
        .getRepository<TEntity>(this.repository.target)
        .createQueryBuilder(alias)
        .where(`${alias}.workspaceId = :workspaceId`, { workspaceId })
        .andWhere(bedingung.where, bedingung.parameters)
        .addSelect(rang, 'suchrang')
        .setParameter('rangGanz', ganz)
        .setParameter('rangAnfang', ganz);

      for (const relation of Object.keys(this.relations() ?? {})) {
        queryBuilder.leftJoinAndSelect(`${alias}.${relation}`, relation);
      }

      await this.nurSichtbare(queryBuilder, alias);

      const { entities, raw } = await queryBuilder
        .orderBy(rang, 'DESC')
        .limit(limit)
        .getRawAndEntities<Record<string, unknown>>();
      const raenge = new Map(
        raw.map((zeile) => [
          String(zeile[`${alias}_id`]),
          Number(zeile.suchrang),
        ]),
      );

      return entities.map((eintrag) => ({
        eintrag,
        rang: raenge.get(String((eintrag as { id: unknown }).id)) ?? 0,
      }));
    });
  }

  async listAll(
    workspaceId: string,
    args: ListArgs = {},
    filters: Record<string, unknown> = {},
    ceiling: number = EXPORT_CEILING,
  ): Promise<TEntity[]> {
    const definitions = await this.definitionsFor(workspaceId);
    const verborgen = await this.verborgeneSpalten(args, filters);
    const bedingung = await this.sichtbarkeitsFilter(this.alias);
    const kontext = await this.filterKontext(args);
    const build = () => {
      const queryBuilder = this.buildListQuery(
        workspaceId,
        args,
        filters,
        definitions,
        verborgen,
        kontext,
      );

      this.applySort(queryBuilder, args, definitions);

      if (bedingung !== null) {
        queryBuilder.andWhere(bedingung.where, bedingung.parameters);
      }

      return queryBuilder;
    };

    const total = await build().getCount();

    if (total > ceiling) {
      throw new BadRequestException(
        `Dieser Export umfasst ${String(total)} Einträge, das Maximum liegt bei ${String(ceiling)}. Bitte grenzen Sie die Liste weiter ein.`,
      );
    }

    const rows: TEntity[] = [];

    for (let offset = 0; offset < total; offset += EXPORT_CHUNK) {
      rows.push(
        ...(await build().offset(offset).limit(EXPORT_CHUNK).getMany()),
      );
    }

    return rows;
  }

  async summen(
    workspaceId: string,
    args: ListArgs,
    filters: Record<string, unknown>,
    spalte: string,
    gruppe?: string,
  ): Promise<{ gruppe: string | null; summe: number }[]> {
    const definitions = await this.definitionsFor(workspaceId);
    const verborgen = await this.verborgeneSpalten(args, filters);

    if (verborgen.has(spalte)) {
      return [];
    }

    const queryBuilder = this.buildListQuery(
      workspaceId,
      args,
      filters,
      definitions,
      verborgen,
      await this.filterKontext(args),
    ).select(`COALESCE(SUM(${this.alias}.${spalte}), 0)`, 'summe');

    if (gruppe !== undefined) {
      queryBuilder
        .addSelect(`${this.alias}.${gruppe}`, 'gruppe')
        .groupBy(`${this.alias}.${gruppe}`)
        .orderBy(`${this.alias}.${gruppe}`, 'ASC');
    }

    await this.nurSichtbare(queryBuilder);

    const zeilen = await queryBuilder.getRawMany<{
      summe: string;
      gruppe?: string | null;
    }>();

    return zeilen
      .map((zeile) => ({
        gruppe: zeile.gruppe ?? null,
        summe: Number(zeile.summe),
      }))
      .filter((zeile) => gruppe === undefined || zeile.summe !== 0);
  }

  async gruppen(
    workspaceId: string,
    args: ListArgs,
    filters: Record<string, unknown>,
  ): Promise<ListenGruppe[]> {
    const feld = args.gruppierung;

    if (feld === undefined || feld === null || feld === '') {
      return [];
    }

    const definitions = await this.definitionsFor(workspaceId);
    const verborgen = await this.verborgeneSpalten(args, filters);
    const kontext = await this.filterKontext(args);
    const { ausdruck, parameters, spalte } = this.gruppenAusdruck(
      feld,
      definitions,
    );
    const ohneGruppe = { ...args, gruppe: undefined };

    const zaehlung = this.buildListQuery(
      workspaceId,
      ohneGruppe,
      filters,
      definitions,
      verborgen,
      kontext,
    )
      .select(ausdruck, 'wert')
      .addSelect('COUNT(*)', 'anzahl')
      .setParameters(parameters)
      .groupBy(ausdruck)
      .orderBy('COUNT(*)', 'DESC')
      .limit(MAX_GRUPPEN);

    await this.nurSichtbare(zaehlung);

    const zeilen = await zaehlung.getRawMany<{
      wert: string | null;
      anzahl: string;
    }>();

    const summe = this.gruppenSumme();
    const summen = new Map<
      string | null,
      { gruppe: string | null; summe: number }[]
    >();

    if (summe !== null && !verborgen.has(summe.spalte) && zeilen.length > 0) {
      const abfrage = this.buildListQuery(
        workspaceId,
        ohneGruppe,
        filters,
        definitions,
        verborgen,
        kontext,
      )
        .select(ausdruck, 'wert')
        .addSelect(`COALESCE(SUM(${this.alias}.${summe.spalte}), 0)`, 'summe')
        .setParameters(parameters)
        .groupBy(ausdruck);

      if (summe.je !== undefined) {
        abfrage
          .addSelect(`${this.alias}.${summe.je}`, 'je')
          .addGroupBy(`${this.alias}.${summe.je}`);
      }

      await this.nurSichtbare(abfrage);

      for (const zeile of await abfrage.getRawMany<{
        wert: string | null;
        summe: string;
        je?: string | null;
      }>()) {
        const betrag = Number(zeile.summe);

        if (betrag === 0) {
          continue;
        }

        summen.set(zeile.wert, [
          ...(summen.get(zeile.wert) ?? []),
          { gruppe: zeile.je ?? null, summe: betrag },
        ]);
      }
    }

    const namen = await this.gruppenNamen(
      workspaceId,
      spalte,
      zeilen.map((zeile) => zeile.wert).filter((wert) => wert !== null),
    );

    return zeilen.map((zeile) => {
      const name = zeile.wert === null ? undefined : namen.get(zeile.wert);

      return {
        wert: zeile.wert,
        label: name?.label ?? null,
        nichtSichtbar: name?.nichtSichtbar ?? false,
        anzahl: Number(zeile.anzahl),
        summen: (summen.get(zeile.wert) ?? []).sort((a, b) =>
          (a.gruppe ?? '').localeCompare(b.gruppe ?? ''),
        ),
      };
    });
  }

  private async gruppenNamen(
    workspaceId: string,
    spalte: string | undefined,
    werte: (string | null)[],
  ): Promise<Map<string, { label: string | null; nichtSichtbar: boolean }>> {
    const namen = new Map<
      string,
      { label: string | null; nichtSichtbar: boolean }
    >();
    const ids = werte.filter((wert): wert is string => wert !== null);

    if (ids.length === 0) {
      return namen;
    }

    if (spalte === 'ownerId') {
      const personen = (await this.repository.manager.query(
        `SELECT u."id", u."firstName", u."lastName" FROM "users" u
           JOIN "memberships" m ON m."userId" = u."id" AND m."workspaceId" = $1
          WHERE u."id"::text = ANY($2)`,
        [workspaceId, ids],
      )) as { id: string; firstName: string; lastName: string }[];

      for (const person of personen) {
        namen.set(person.id, {
          label: `${person.firstName} ${person.lastName}`.trim(),
          nichtSichtbar: false,
        });
      }
    }

    if (spalte === 'companyId') {
      const sichtbar = await sichtbarkeitsBedingung('company', 'c');
      const roh =
        sichtbar === null
          ? { sql: 'true', werte: [] }
          : alsRohesSql(sichtbar, 3);
      const params = roh.werte;
      const bedingung = roh.sql;

      const firmen = (await this.repository.manager.query(
        `SELECT c."id", c."name", (${bedingung}) AS "sichtbar"
           FROM "companies" c
          WHERE c."workspaceId" = $1 AND c."id"::text = ANY($2)`,
        [workspaceId, ids, ...params],
      )) as { id: string; name: string; sichtbar: boolean }[];

      for (const firma of firmen) {
        namen.set(firma.id, {
          label: firma.sichtbar ? firma.name : null,
          nichtSichtbar: !firma.sichtbar,
        });
      }
    }

    return namen;
  }

  async count(workspaceId: string): Promise<number> {
    const queryBuilder = this.repository
      .createQueryBuilder(this.alias)
      .where(`${this.alias}.workspaceId = :workspaceId`, { workspaceId });

    return (await this.nurSichtbare(queryBuilder)).getCount();
  }

  async findOne(
    workspaceId: string,
    id: string,
    trotzZeilenrechten = false,
  ): Promise<TEntity> {
    const record = await this.repo.findOne({
      where: { id, workspaceId } as FindOptionsWhere<TEntity>,
      relations: this.relations(),
    });

    if (
      record === null ||
      (!trotzZeilenrechten && !(await this.sichtbar(record)))
    ) {
      throw new NotFoundException(`${this.entityLabel} nicht gefunden.`);
    }

    return record;
  }

  async findZumAendern(workspaceId: string, id: string): Promise<TEntity> {
    const record = await this.findOne(workspaceId, id);

    await this.assertSchreibbar(record);

    return record;
  }

  private async checkCustomFields(
    workspaceId: string,
    incoming: CustomFieldValues | undefined,
    existing?: CustomFieldValues,
    ausserId?: string,
    neu = false,
  ): Promise<CustomFieldValues | undefined> {
    if (this.customFieldEntity === null) {
      if (incoming !== undefined) {
        throw new BadRequestException(
          `Für diese Art von Datensatz gibt es keine eigenen Felder.`,
        );
      }

      return undefined;
    }

    return this.customFieldsService.validate(
      workspaceId,
      this.customFieldEntity,
      incoming,
      existing,
      { ausserId, manager: schreibTransaktion.getStore(), neu },
    );
  }

  async create(
    workspaceId: string,
    input: DeepPartial<TEntity>,
  ): Promise<TEntity> {
    await this.pruefeFeldrechte(input, true);

    await assertVerweiseImBereich(
      this.repo.manager,
      workspaceId,
      this.verweise(input),
    );

    const customFields = await this.checkCustomFields(
      workspaceId,
      input.customFields as CustomFieldValues | undefined,
      undefined,
      undefined,
      true,
    );

    const record = this.repo.create({
      ...input,
      ...(customFields === undefined ? {} : { customFields }),
      workspaceId,
    } as DeepPartial<TEntity>);

    await this.vorDemSpeichern(workspaceId, record, undefined);

    const saved = await this.repo.save(record);
    const event = ereignis(this.repo.metadata.name, 'created');

    if (event !== undefined) {
      melde({ workspaceId, event, data: webhookDaten(saved) });
    }

    meldeAenderung({
      workspaceId,
      entitaet: this.repo.metadata.name,
      id: saved.id,
      neu: true,
      felder: Object.keys(input),
    });

    return saved;
  }

  async update(
    workspaceId: string,
    id: string,
    input: DeepPartial<TEntity>,
  ): Promise<TEntity> {
    await this.pruefeFeldrechte(input, false);

    const record = await this.findOne(workspaceId, id);

    await this.assertSchreibbar(record);

    const stageVorher = (record as { stage?: unknown }).stage;
    const vorher = webhookDaten(record);

    await assertVerweiseImBereich(
      this.repo.manager,
      workspaceId,
      this.verweise(input),
    );

    const {
      workspaceId: _ignored,
      id: _alsoIgnored,
      customFields: incomingCustomFields,
      ...safeInput
    } = input;

    const art = this.sichtbarkeitsArt;

    if (art !== undefined && 'ownerId' in safeInput) {
      await assertVerantwortungAenderbar(
        art,
        (record as { ownerId?: string | null }).ownerId,
        (safeInput as { ownerId?: string | null }).ownerId,
      );
    }

    this.repo.merge(record, safeInput as DeepPartial<TEntity>);

    for (const relation of this.repo.metadata.manyToOneRelations) {
      const schluessel = relation.joinColumns[0]?.propertyName;

      if (schluessel !== undefined && schluessel in safeInput) {
        delete (record as Record<string, unknown>)[relation.propertyName];
      }
    }

    const customFields = await this.checkCustomFields(
      workspaceId,
      incomingCustomFields as CustomFieldValues | undefined,
      record.customFields,
      record.id,
    );

    if (incomingCustomFields !== undefined && customFields !== undefined) {
      record.customFields = customFields;
    }

    await this.vorDemSpeichern(workspaceId, record, stageVorher);

    const saved = await this.repo.save(record);

    this.meldePhasenwechsel(workspaceId, saved, stageVorher);
    meldeAenderung({
      workspaceId,
      entitaet: this.repo.metadata.name,
      id: saved.id,
      neu: false,
      felder: Object.keys(safeInput),
    });

    this.meldeGeaendert(workspaceId, vorher, saved);

    return this.findOne(workspaceId, saved.id, true);
  }

  protected meldeGeaendert(
    workspaceId: string,
    vorher: Record<string, unknown>,
    saved: TEntity,
  ): void {
    const event = ereignis(this.repository.metadata.name, 'updated');

    if (event === undefined) {
      return;
    }

    const data = webhookDaten(saved);

    melde({ workspaceId, event, data, changes: aenderungen(vorher, data) });
  }

  private meldePhasenwechsel(
    workspaceId: string,
    saved: TEntity,
    vorher: unknown,
  ): void {
    const jetzt = (saved as { stage?: unknown }).stage;

    if (
      this.repository.metadata.name !== 'DealEntity' ||
      jetzt === undefined ||
      jetzt === vorher
    ) {
      return;
    }

    const data = { ...webhookDaten(saved), previousStage: vorher };

    melde({ workspaceId, event: 'deal.stage_changed', data });

    if (jetzt === 'won') {
      melde({ workspaceId, event: 'deal.won', data });
    }

    if (jetzt === 'lost') {
      melde({ workspaceId, event: 'deal.lost', data });
    }
  }

  async remove(
    workspaceId: string,
    id: string,
    vonUserId: string | null = null,
  ): Promise<boolean> {
    const record = await this.findOne(workspaceId, id);

    await this.assertSchreibbar(record);

    const geloescht = ereignis(this.repository.metadata.name, 'deleted');
    const daten = webhookDaten(record);
    const melden = () => {
      if (geloescht !== undefined) {
        melde({ workspaceId, event: geloescht, data: daten });
      }
    };

    if (this.repository.metadata.deleteDateColumn === undefined) {
      await this.repository.remove(record);
      melden();

      return true;
    }

    await this.repository.update(
      { id, workspaceId } as FindOptionsWhere<TEntity>,
      { deletedById: vonUserId } as never,
    );
    await this.repository.softRemove(record);
    await mitInDenPapierkorb(
      this.repository.manager,
      this.repository.metadata.name,
      workspaceId,
      id,
    );
    melden();

    return true;
  }
}
