import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, IsNull, Repository } from 'typeorm';

import { CustomFieldGroupEntity } from './custom-field-group.entity';
import { CustomFieldDefinition } from './custom-field.entity';
import {
  CustomFieldEntity,
  CustomFieldType,
  type CustomFieldValue,
  type CustomFieldValues,
  type Datumsformat,
  EINDEUTIG_MOEGLICH,
  type FeldEinstellungen,
  MAX_FIELDS_PER_ENTITY,
  MAX_SELECT_OPTIONS,
  MAX_TEXT_LENGTH,
  MIT_MOEGLICHKEITEN,
  OPTION_FARBEN,
  type OptionFarbe,
  STANDARD_WAEHRUNG,
  VERWEIS_ARTEN,
  type Zahlformat,
} from './custom-field.types';
import { ART_MEHRZAHL, verweisePruefen, verweisLesen } from './verknuepfung';
import { adresseLesen, linksLesen, WertFehler } from './zusammengesetzt';

const TABELLE: Record<CustomFieldEntity, string> = {
  [CustomFieldEntity.COMPANY]: 'companies',
  [CustomFieldEntity.CONTACT]: 'contacts',
  [CustomFieldEntity.DEAL]: 'deals',
  [CustomFieldEntity.TASK]: 'tasks',
};

const EMAIL_MUSTER = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TELEFON_MUSTER = /^\+?[0-9 ()/.-]+$/;

type FarbenEingabe = { option: string; farbe: string }[];

type EinstellungenEingabe = {
  nachkommastellen?: number | null;
  zahlformat?: string | null;
  datumsformat?: string | null;
};

export type PruefKontext = {
  ausserId?: string | null;
  manager?: EntityManager;
  neu?: boolean;
};

type ZusatzEingabe = {
  beschreibung?: string | null;
  standardwert?: string | null;
  gruppeId?: string | null;
};

export const KAUM_GENUTZT_ANTEIL = 0.1;

export const MAX_GRUPPEN = 15;

const OHNE_STANDARDWERT: CustomFieldType[] = [
  CustomFieldType.ADDRESS,
  CustomFieldType.LINKS,
  CustomFieldType.RELATION,
];

type VerknuepfungEingabe = {
  zielEntity?: CustomFieldEntity | null;
  mehrere?: boolean;
  gegenfeldLabel?: string | null;
};

export const toKey = (label: string): string =>
  label
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);

export const standardwerteLesen = async (
  manager: EntityManager,
  workspaceId: string,
  entity: CustomFieldEntity,
): Promise<CustomFieldValues> => {
  const definitions = await manager.find(CustomFieldDefinition, {
    where: { workspaceId, entity, archivedAt: IsNull() },
  });

  return Object.fromEntries(
    definitions
      .filter((d) => d.standardwertWert !== null)
      .map((d) => [d.key, d.standardwertWert as CustomFieldValue]),
  );
};

@Injectable()
export class CustomFieldsService {
  constructor(
    @InjectRepository(CustomFieldDefinition)
    private readonly repository: Repository<CustomFieldDefinition>,
  ) {}

  get manager(): EntityManager {
    return this.repository.manager;
  }

  list(
    workspaceId: string,
    entity: CustomFieldEntity,
  ): Promise<CustomFieldDefinition[]> {
    return this.repository.find({
      where: { workspaceId, entity, archivedAt: IsNull() },
      order: { position: 'ASC', createdAt: 'ASC' },
    });
  }

  listAll(workspaceId: string): Promise<CustomFieldDefinition[]> {
    return this.repository.find({
      where: { workspaceId },
      order: { entity: 'ASC', position: 'ASC', createdAt: 'ASC' },
    });
  }

  async create(
    workspaceId: string,
    input: {
      entity: CustomFieldEntity;
      label: string;
      type: CustomFieldType;
      options?: string[];
      required?: boolean;
      farben?: FarbenEingabe;
      waehrung?: string;
      eindeutig?: boolean;
      pflichtAbPhase?: string | null;
    } & EinstellungenEingabe &
      ZusatzEingabe &
      VerknuepfungEingabe,
  ): Promise<CustomFieldDefinition> {
    if (input.type === CustomFieldType.RELATION) {
      return this.verknuepfungAnlegen(workspaceId, input);
    }

    const key = toKey(input.label);

    if (key === '') {
      throw new BadRequestException(
        'Der Name braucht mindestens einen Buchstaben oder eine Ziffer.',
      );
    }

    const live = await this.list(workspaceId, input.entity);

    if (live.length >= MAX_FIELDS_PER_ENTITY) {
      throw new BadRequestException(
        `Ein Datensatz kann höchstens ${MAX_FIELDS_PER_ENTITY} eigene Felder haben.`,
      );
    }

    const clash = await this.repository.findOne({
      where: { workspaceId, entity: input.entity, key },
    });

    if (clash !== null) {
      throw new BadRequestException(
        clash.archivedAt === null
          ? `Ein Feld mit dem Namen "${clash.label}" gibt es schon.`
          : `An archived field named "${clash.label}" uses that name. Restore it instead.`,
      );
    }

    const options = this.checkOptions(input.type, input.options ?? []);

    this.checkEindeutig(input.type, input.eindeutig ?? false);

    const definition = this.repository.create({
      workspaceId,
      entity: input.entity,
      key,
      label: input.label.trim(),
      type: input.type,
      options,
      optionFarben: this.checkFarben(options, input.farben ?? []),
      waehrung:
        input.type === CustomFieldType.CURRENCY
          ? (input.waehrung ?? STANDARD_WAEHRUNG)
          : null,
      eindeutig: input.eindeutig ?? false,
      einstellungen: this.einstellungen(input.type, {}, input),
      required: input.required ?? false,
      pflichtAbPhase: this.pflichtPhase(input.entity, input.pflichtAbPhase),
      position: live.length,
      beschreibung: this.beschreibung(input.beschreibung),
      standardwertWert: null,
      gruppeId: await this.gruppeFuer(
        workspaceId,
        input.entity,
        input.gruppeId,
      ),
    });

    definition.standardwertWert = this.standardwertPruefen(
      definition,
      input.standardwert,
    );

    return this.repository.save(definition);
  }

  async update(
    workspaceId: string,
    id: string,
    input: {
      label?: string;
      options?: string[];
      required?: boolean;
      position?: number;
      farben?: FarbenEingabe;
      waehrung?: string;
      eindeutig?: boolean;
      pflichtAbPhase?: string | null;
    } & EinstellungenEingabe &
      ZusatzEingabe,
  ): Promise<CustomFieldDefinition> {
    const definition = await this.findOwn(workspaceId, id);

    if (definition.type === CustomFieldType.RELATION) {
      this.verknuepfungAenderbar(definition, input);
    }

    definition.einstellungen = this.einstellungen(
      definition.type,
      definition.einstellungen ?? {},
      input,
    );

    if (input.label !== undefined) {
      definition.label = input.label.trim();
    }

    if (input.options !== undefined) {
      const options = this.checkOptions(definition.type, input.options);

      const removed = definition.options.filter(
        (option) => !options.includes(option),
      );

      if (removed.length > 0) {
        throw new BadRequestException(
          `Die Möglichkeit "${removed[0]}" lässt sich nicht entfernen. Datensätze verwenden sie womöglich schon.`,
        );
      }

      definition.options = options;
    }

    if (input.farben !== undefined || input.options !== undefined) {
      definition.optionFarben = this.checkFarben(
        definition.options,
        input.farben ??
          Object.entries(definition.optionFarben).map(([option, farbe]) => ({
            option,
            farbe,
          })),
      );
    }

    if (
      input.waehrung !== undefined &&
      definition.type === CustomFieldType.CURRENCY
    ) {
      definition.waehrung = input.waehrung;
    }

    if (input.eindeutig !== undefined) {
      this.checkEindeutig(definition.type, input.eindeutig);

      if (input.eindeutig && !definition.eindeutig) {
        await this.assertKeineDoppelten(definition);
      }

      if (
        input.eindeutig &&
        definition.standardwertWert !== null &&
        (input.standardwert === undefined ||
          (input.standardwert !== null && input.standardwert.trim() !== ''))
      ) {
        throw new BadRequestException(
          'Ein eindeutiges Feld kann keinen Standardwert haben. Nehmen Sie ihn zuerst heraus.',
        );
      }

      definition.eindeutig = input.eindeutig;
    }

    if (input.required !== undefined) {
      definition.required = input.required;
    }

    if (input.pflichtAbPhase !== undefined) {
      definition.pflichtAbPhase = this.pflichtPhase(
        definition.entity,
        input.pflichtAbPhase,
      );
    }

    if (input.position !== undefined) {
      definition.position = input.position;
    }

    if (input.beschreibung !== undefined) {
      definition.beschreibung = this.beschreibung(input.beschreibung);
    }

    if (input.gruppeId !== undefined) {
      definition.gruppeId = await this.gruppeFuer(
        workspaceId,
        definition.entity,
        input.gruppeId,
      );
    }

    if (input.standardwert !== undefined) {
      definition.standardwertWert = this.standardwertPruefen(
        definition,
        input.standardwert,
      );
    } else if (definition.standardwertWert !== null) {
      definition.standardwertWert = this.standardwertMitziehen(definition);
    }

    return this.repository.save(definition);
  }

  async archive(
    workspaceId: string,
    id: string,
  ): Promise<CustomFieldDefinition> {
    const definition = await this.findOwn(workspaceId, id);

    definition.archivedAt = new Date();

    await this.paarMit(workspaceId, definition, {
      archivedAt: definition.archivedAt,
    });

    return this.repository.save(definition);
  }

  async restore(
    workspaceId: string,
    id: string,
  ): Promise<CustomFieldDefinition> {
    const definition = await this.findOwn(workspaceId, id);

    definition.archivedAt = null;
    await this.paarMit(workspaceId, definition, { archivedAt: null });

    return this.repository.save(definition);
  }

  private async paarMit(
    workspaceId: string,
    definition: CustomFieldDefinition,
    aenderung: { archivedAt: Date | null },
  ): Promise<void> {
    if (definition.gegenfeldId !== null) {
      await this.repository.update(
        { id: definition.gegenfeldId, workspaceId },
        aenderung,
      );
    }
  }

  private async verknuepfungAnlegen(
    workspaceId: string,
    input: {
      entity: CustomFieldEntity;
      label: string;
      required?: boolean;
      eindeutig?: boolean;
      pflichtAbPhase?: string | null;
    } & ZusatzEingabe &
      VerknuepfungEingabe,
  ): Promise<CustomFieldDefinition> {
    const ziel = input.zielEntity ?? null;

    if (!VERWEIS_ARTEN.includes(input.entity)) {
      throw new BadRequestException(
        'Verknüpfungen gibt es an Firmen, Kontakten und Geschäften.',
      );
    }

    if (ziel === null || !VERWEIS_ARTEN.includes(ziel)) {
      throw new BadRequestException(
        'Eine Verknüpfung zeigt auf Firmen, Kontakte oder Geschäfte.',
      );
    }

    this.verknuepfungAenderbar(null, input);

    const label = input.label.trim();
    const genannt = (input.gegenfeldLabel ?? '').trim();
    const gegenLabel = (
      genannt === '' ? `${ART_MEHRZAHL[input.entity]} (${label})` : genannt
    ).slice(0, 100);
    const key = toKey(label);
    const gegenKey = toKey(gegenLabel);

    if (key === '' || gegenKey === '') {
      throw new BadRequestException(
        'Der Name braucht mindestens einen Buchstaben oder eine Ziffer.',
      );
    }

    if (ziel === input.entity && key === gegenKey) {
      throw new BadRequestException(
        'Feld und Gegenfeld brauchen verschiedene Namen.',
      );
    }

    const pflichtAbPhase = this.pflichtPhase(
      input.entity,
      input.pflichtAbPhase,
    );
    const gruppeId = await this.gruppeFuer(
      workspaceId,
      input.entity,
      input.gruppeId,
    );

    return this.repository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(CustomFieldDefinition);
      const platz = async (art: CustomFieldEntity, schluessel: string) => {
        const live = await repo.count({
          where: { workspaceId, entity: art, archivedAt: IsNull() },
        });
        const brauche = art === input.entity && art === ziel ? 2 : 1;

        if (live + brauche > MAX_FIELDS_PER_ENTITY) {
          throw new BadRequestException(
            `Ein Datensatz kann höchstens ${MAX_FIELDS_PER_ENTITY} eigene Felder haben (${ART_MEHRZAHL[art]}).`,
          );
        }

        const clash = await repo.findOne({
          where: { workspaceId, entity: art, key: schluessel },
        });

        if (clash !== null) {
          throw new BadRequestException(
            clash.archivedAt === null
              ? `Ein Feld mit dem Namen "${clash.label}" gibt es bei ${ART_MEHRZAHL[art]} schon.`
              : `Ein archiviertes Feld "${clash.label}" bei ${ART_MEHRZAHL[art]} belegt den Namen. Stellen Sie es wieder her oder wählen Sie einen anderen.`,
          );
        }

        return live;
      };

      const position = await platz(input.entity, key);
      const gegenPosition =
        ziel === input.entity ? position + 1 : await platz(ziel, gegenKey);

      if (ziel === input.entity) {
        await platz(ziel, gegenKey);
      }

      const basis = {
        workspaceId,
        type: CustomFieldType.RELATION,
        options: [],
        optionFarben: {},
        waehrung: null,
        einstellungen: {},
        eindeutig: false,
        required: false,
        standardwertWert: null,
      };

      const feld = await repo.save(
        repo.create({
          ...basis,
          entity: input.entity,
          key,
          label,
          zielEntity: ziel,
          mehrere: input.mehrere ?? false,
          gegenseite: false,
          pflichtAbPhase,
          position,
          beschreibung: this.beschreibung(input.beschreibung),
          gruppeId,
        }),
      );
      const gegenfeld = await repo.save(
        repo.create({
          ...basis,
          entity: ziel,
          key: gegenKey,
          label: gegenLabel,
          zielEntity: input.entity,
          mehrere: true,
          gegenseite: true,
          gegenfeldId: feld.id,
          pflichtAbPhase: null,
          position: gegenPosition,
          beschreibung: null,
          gruppeId: null,
        }),
      );

      feld.gegenfeldId = gegenfeld.id;

      return repo.save(feld);
    });
  }

  private verknuepfungAenderbar(
    definition: CustomFieldDefinition | null,
    input: {
      required?: boolean;
      eindeutig?: boolean;
      pflichtAbPhase?: string | null;
      standardwert?: string | null;
    },
  ): void {
    if (input.required === true) {
      throw new BadRequestException(
        'Eine Verknüpfung kann kein Pflichtfeld sein.',
      );
    }

    if (input.eindeutig === true) {
      throw new BadRequestException(
        'Diese Art von Feld kann nicht eindeutig sein.',
      );
    }

    if ((input.standardwert ?? '').trim() !== '') {
      throw new BadRequestException(
        'Für diese Art von Feld gibt es keinen Standardwert.',
      );
    }

    if (
      definition?.gegenseite === true &&
      (input.pflichtAbPhase ?? '') !== ''
    ) {
      throw new BadRequestException(
        'Ein Gegenfeld wird aus den Verweisen gebildet und kann nicht Pflicht sein.',
      );
    }
  }

  listGruppen(
    workspaceId: string,
    entity?: CustomFieldEntity,
  ): Promise<CustomFieldGroupEntity[]> {
    return this.gruppen.find({
      where: entity === undefined ? { workspaceId } : { workspaceId, entity },
      order: { entity: 'ASC', position: 'ASC', createdAt: 'ASC' },
    });
  }

  async createGruppe(
    workspaceId: string,
    input: { entity: CustomFieldEntity; name: string; eingeklappt?: boolean },
  ): Promise<CustomFieldGroupEntity> {
    const name = await this.gruppenName(
      workspaceId,
      input.entity,
      input.name,
      null,
    );
    const vorhanden = await this.gruppen.count({
      where: { workspaceId, entity: input.entity },
    });

    if (vorhanden >= MAX_GRUPPEN) {
      throw new BadRequestException(
        `Eine Akte kann höchstens ${MAX_GRUPPEN} Abschnitte haben.`,
      );
    }

    return this.gruppen.save(
      this.gruppen.create({
        workspaceId,
        entity: input.entity,
        name,
        position: vorhanden,
        eingeklappt: input.eingeklappt ?? false,
      }),
    );
  }

  async updateGruppe(
    workspaceId: string,
    input: {
      id: string;
      name?: string;
      position?: number;
      eingeklappt?: boolean;
    },
  ): Promise<CustomFieldGroupEntity> {
    const gruppe = await this.eigeneGruppe(workspaceId, input.id);

    if (input.name !== undefined) {
      gruppe.name = await this.gruppenName(
        workspaceId,
        gruppe.entity,
        input.name,
        gruppe.id,
      );
    }

    if (input.position !== undefined) {
      gruppe.position = input.position;
    }

    if (input.eingeklappt !== undefined) {
      gruppe.eingeklappt = input.eingeklappt;
    }

    return this.gruppen.save(gruppe);
  }

  async deleteGruppe(workspaceId: string, id: string): Promise<boolean> {
    const gruppe = await this.eigeneGruppe(workspaceId, id);

    await this.repository.update(
      { workspaceId, gruppeId: gruppe.id },
      { gruppeId: null },
    );
    await this.gruppen.delete({ id: gruppe.id, workspaceId });

    return true;
  }

  async fuellgrad(
    workspaceId: string,
    entity: CustomFieldEntity,
  ): Promise<{ key: string; gefuellt: number; gesamt: number }[]> {
    const tabelle = TABELLE[entity];
    const [summe]: { gesamt: string }[] = await this.repository.manager.query(
      `SELECT count(*) AS gesamt FROM "${tabelle}"
        WHERE "workspaceId" = $1 AND "deletedAt" IS NULL`,
      [workspaceId],
    );
    const zeilen: { key: string; anzahl: string }[] =
      await this.repository.manager.query(
        `SELECT k AS key, count(*) AS anzahl
           FROM "${tabelle}", jsonb_object_keys("customFields") AS k
          WHERE "workspaceId" = $1 AND "deletedAt" IS NULL
          GROUP BY k`,
        [workspaceId],
      );
    const gefuellt = new Map(zeilen.map((z) => [z.key, Number(z.anzahl)]));
    const gesamt = Number(summe?.gesamt ?? 0);

    return (await this.list(workspaceId, entity)).map((definition) => ({
      key: definition.key,
      gefuellt: gefuellt.get(definition.key) ?? 0,
      gesamt,
    }));
  }

  standardwerte(
    workspaceId: string,
    entity: CustomFieldEntity,
    manager?: EntityManager,
  ): Promise<CustomFieldValues> {
    return standardwerteLesen(
      manager ?? this.repository.manager,
      workspaceId,
      entity,
    );
  }

  private get gruppen(): Repository<CustomFieldGroupEntity> {
    return this.repository.manager.getRepository(CustomFieldGroupEntity);
  }

  private async eigeneGruppe(
    workspaceId: string,
    id: string,
  ): Promise<CustomFieldGroupEntity> {
    const gruppe = await this.gruppen.findOne({ where: { id, workspaceId } });

    if (gruppe === null) {
      throw new NotFoundException('Diesen Abschnitt gibt es nicht.');
    }

    return gruppe;
  }

  private async gruppenName(
    workspaceId: string,
    entity: CustomFieldEntity,
    roh: string,
    ausserId: string | null,
  ): Promise<string> {
    const name = roh.trim();

    if (name === '') {
      throw new BadRequestException('Ein Abschnitt braucht einen Namen.');
    }

    const gleich = (await this.listGruppen(workspaceId, entity)).find(
      (g) => g.id !== ausserId && g.name.toLowerCase() === name.toLowerCase(),
    );

    if (gleich !== undefined) {
      throw new BadRequestException(
        `Einen Abschnitt „${gleich.name}“ gibt es schon.`,
      );
    }

    return name;
  }

  private async gruppeFuer(
    workspaceId: string,
    entity: CustomFieldEntity,
    gruppeId: string | null | undefined,
  ): Promise<string | null> {
    if (gruppeId === undefined || gruppeId === null || gruppeId === '') {
      return null;
    }

    const gruppe = await this.eigeneGruppe(workspaceId, gruppeId);

    if (gruppe.entity !== entity) {
      throw new BadRequestException(
        'Der Abschnitt gehört zu einer anderen Art von Datensatz.',
      );
    }

    return gruppe.id;
  }

  private beschreibung(text: string | null | undefined): string | null {
    const sauber = (text ?? '').trim();

    return sauber === '' ? null : sauber.slice(0, 300);
  }

  private standardwertPruefen(
    definition: CustomFieldDefinition,
    roh: string | null | undefined,
  ): CustomFieldValue | null {
    if (roh === undefined || roh === null || roh.trim() === '') {
      return null;
    }

    if (OHNE_STANDARDWERT.includes(definition.type)) {
      throw new BadRequestException(
        'Für diese Art von Feld gibt es keinen Standardwert.',
      );
    }

    if (definition.eindeutig) {
      throw new BadRequestException(
        'Ein eindeutiges Feld kann keinen Standardwert haben.',
      );
    }

    return this.coerce(definition, roh);
  }

  private standardwertMitziehen(
    definition: CustomFieldDefinition,
  ): CustomFieldValue | null {
    const wert = definition.standardwertWert;

    if (wert === null || definition.eindeutig) {
      return null;
    }

    if (Array.isArray(wert)) {
      const bleibt = definition.options.filter((o) =>
        (wert as unknown[]).includes(o),
      );

      return bleibt.length === 0 ? null : bleibt;
    }

    if (definition.type === CustomFieldType.SELECT) {
      return definition.options.includes(String(wert)) ? wert : null;
    }

    return wert;
  }

  private async findOwn(
    workspaceId: string,
    id: string,
  ): Promise<CustomFieldDefinition> {
    const definition = await this.repository.findOne({
      where: { id, workspaceId },
    });

    if (definition === null) {
      throw new NotFoundException('Dieses eigene Feld gibt es nicht.');
    }

    return definition;
  }

  private checkOptions(type: CustomFieldType, options: string[]): string[] {
    if (!MIT_MOEGLICHKEITEN.includes(type)) {
      return [];
    }

    const cleaned = options
      .map((option) => option.trim())
      .filter((o) => o !== '');

    if (cleaned.length === 0) {
      throw new BadRequestException(
        'Ein Auswahlfeld braucht mindestens eine Möglichkeit.',
      );
    }

    if (cleaned.length > MAX_SELECT_OPTIONS) {
      throw new BadRequestException(
        `Ein Auswahlfeld kann höchstens ${MAX_SELECT_OPTIONS} Möglichkeiten haben.`,
      );
    }

    if (new Set(cleaned).size !== cleaned.length) {
      throw new BadRequestException(
        'Die Möglichkeiten müssen sich voneinander unterscheiden.',
      );
    }

    return cleaned;
  }

  private checkFarben(
    options: string[],
    farben: FarbenEingabe,
  ): Record<string, OptionFarbe> {
    const result: Record<string, OptionFarbe> = {};

    for (const { option, farbe } of farben) {
      const name = option.trim();

      if (!options.includes(name)) {
        continue;
      }

      if (!(OPTION_FARBEN as readonly string[]).includes(farbe)) {
        throw new BadRequestException(`"${farbe}" ist keine der Farben.`);
      }

      if (farbe !== 'grau') {
        result[name] = farbe as OptionFarbe;
      }
    }

    return result;
  }

  private pflichtPhase(
    entity: CustomFieldEntity,
    phase: string | null | undefined,
  ): string | null {
    if (phase === undefined || phase === null || phase === '') {
      return null;
    }

    if (entity !== CustomFieldEntity.DEAL) {
      throw new BadRequestException(
        'Pflicht ab einer Phase gibt es nur für Felder an Geschäften.',
      );
    }

    return phase;
  }

  private einstellungen(
    type: CustomFieldType,
    bisher: FeldEinstellungen,
    eingabe: EinstellungenEingabe,
  ): FeldEinstellungen {
    const ergebnis: FeldEinstellungen = { ...bisher };
    const zahl = type === CustomFieldType.NUMBER;
    const datum = type === CustomFieldType.DATE;

    const setzen = <K extends keyof FeldEinstellungen>(
      name: K,
      wert: FeldEinstellungen[K] | null | undefined,
      passt: boolean,
      bezeichnung: string,
    ) => {
      if (wert === undefined) {
        return;
      }

      if (wert === null) {
        delete ergebnis[name];

        return;
      }

      if (!passt) {
        throw new BadRequestException(
          `${bezeichnung} gibt es nur bei ${name === 'datumsformat' ? 'Datumsfeldern' : 'Zahlenfeldern'}.`,
        );
      }

      ergebnis[name] = wert;
    };

    setzen(
      'nachkommastellen',
      eingabe.nachkommastellen,
      zahl,
      'Nachkommastellen',
    );
    setzen(
      'zahlformat',
      eingabe.zahlformat as Zahlformat | null | undefined,
      zahl,
      'Ein Zahlformat',
    );
    setzen(
      'datumsformat',
      eingabe.datumsformat as Datumsformat | null | undefined,
      datum,
      'Ein Datumsformat',
    );

    return ergebnis;
  }

  private checkEindeutig(type: CustomFieldType, eindeutig: boolean): void {
    if (eindeutig && !EINDEUTIG_MOEGLICH.includes(type)) {
      throw new BadRequestException(
        'Diese Art von Feld kann nicht eindeutig sein.',
      );
    }
  }

  private async assertKeineDoppelten(
    definition: CustomFieldDefinition,
  ): Promise<void> {
    const rows: { wert: string }[] = await this.repository.manager.query(
      `SELECT lower("customFields" ->> $2) AS wert
         FROM "${TABELLE[definition.entity]}"
        WHERE "workspaceId" = $1
          AND "deletedAt" IS NULL
          AND ("customFields" ->> $2) IS NOT NULL
        GROUP BY 1
       HAVING count(*) > 1
        LIMIT 1`,
      [definition.workspaceId, definition.key],
    );

    if (rows.length > 0) {
      throw new BadRequestException(
        `"${definition.label}" kann nicht eindeutig werden: „${rows[0].wert}“ kommt mehrfach vor.`,
      );
    }
  }

  private async assertEindeutig(
    workspaceId: string,
    definition: CustomFieldDefinition,
    value: CustomFieldValue,
    kontext: PruefKontext,
  ): Promise<void> {
    const manager = kontext.manager ?? this.repository.manager;
    const rows: unknown[] = await manager.query(
      `SELECT 1
         FROM "${TABELLE[definition.entity]}"
        WHERE "workspaceId" = $1
          AND "deletedAt" IS NULL
          AND lower("customFields" ->> $2) = lower($3)
          AND ($4::uuid IS NULL OR "id" <> $4::uuid)
        LIMIT 1`,
      [workspaceId, definition.key, String(value), kontext.ausserId ?? null],
    );

    if (rows.length > 0) {
      throw new BadRequestException(
        `"${definition.label}" muss eindeutig sein – „${String(value)}“ gibt es schon.`,
      );
    }
  }

  async validate(
    workspaceId: string,
    entity: CustomFieldEntity,
    incoming: CustomFieldValues | undefined,
    existing: CustomFieldValues = {},
    kontext: PruefKontext = {},
  ): Promise<CustomFieldValues> {
    const definitions = await this.list(workspaceId, entity);
    const byKey = new Map(definitions.map((d) => [d.key, d]));

    const merged: CustomFieldValues = { ...existing };

    if (kontext.neu === true) {
      for (const definition of definitions) {
        if (
          definition.standardwertWert !== null &&
          merged[definition.key] === undefined &&
          !Object.prototype.hasOwnProperty.call(incoming ?? {}, definition.key)
        ) {
          merged[definition.key] = definition.standardwertWert;
        }
      }
    }

    for (const [key, raw] of Object.entries(incoming ?? {})) {
      const definition = byKey.get(key);

      if (definition === undefined) {
        throw new BadRequestException(`Unbekanntes eigenes Feld "${key}".`);
      }

      if (definition.gegenseite) {
        throw new BadRequestException(
          `"${definition.label}" ergibt sich aus den Verweisen der anderen Seite und lässt sich hier nicht setzen.`,
        );
      }

      if (definition.type === CustomFieldType.RELATION) {
        const verweis = await verweisePruefen(
          kontext.manager ?? this.repository.manager,
          workspaceId,
          definition,
          verweisLesen(definition, raw),
          existing[key],
        );

        if (verweis === null) {
          delete merged[key];
        } else {
          merged[key] = verweis;
        }

        continue;
      }

      const value = this.coerce(definition, raw);

      if (value === null) {
        if (definition.required) {
          throw new BadRequestException(
            `"${definition.label}" ist ein Pflichtfeld.`,
          );
        }

        delete merged[key];
        continue;
      }

      if (definition.eindeutig && value !== existing[key]) {
        await this.assertEindeutig(workspaceId, definition, value, kontext);
      }

      merged[key] = value;
    }

    for (const definition of definitions) {
      if (definition.required && merged[definition.key] === undefined) {
        throw new BadRequestException(
          `"${definition.label}" ist ein Pflichtfeld.`,
        );
      }
    }

    return merged;
  }

  private coerce(
    definition: CustomFieldDefinition,
    raw: CustomFieldValue,
  ): CustomFieldValue {
    if (raw === null || raw === '') {
      return null;
    }

    if (definition.type === CustomFieldType.ADDRESS) {
      return this.zusammengesetzt(definition, () => adresseLesen(raw));
    }

    if (definition.type === CustomFieldType.LINKS) {
      return this.zusammengesetzt(definition, () => linksLesen(raw));
    }

    if (definition.type === CustomFieldType.RELATION) {
      return verweisLesen(definition, raw);
    }

    if (typeof raw === 'object' && !Array.isArray(raw)) {
      throw new BadRequestException(
        `"${definition.label}" nimmt einen einfachen Wert, kein Objekt.`,
      );
    }

    if (
      Array.isArray(raw) &&
      definition.type !== CustomFieldType.MULTI_SELECT
    ) {
      throw new BadRequestException(
        `"${definition.label}" nimmt nur einen Wert, keine Liste.`,
      );
    }

    switch (definition.type) {
      case CustomFieldType.TEXT: {
        const text = String(raw).trim();

        if (text.length > MAX_TEXT_LENGTH) {
          throw new BadRequestException(
            `"${definition.label}" darf höchstens ${MAX_TEXT_LENGTH} Zeichen lang sein.`,
          );
        }

        return text === '' ? null : text;
      }

      case CustomFieldType.NUMBER: {
        const numeric =
          typeof raw === 'number'
            ? raw
            : this.parseBetrag(String(raw).replace(/%\s*$/u, ''));

        if (!Number.isFinite(numeric)) {
          throw new BadRequestException(
            `"${definition.label}" muss eine Zahl sein.`,
          );
        }

        return numeric;
      }

      case CustomFieldType.DATE: {
        const text = String(raw).trim();
        const parsed = new Date(text);

        if (Number.isNaN(parsed.getTime())) {
          throw new BadRequestException(
            `"${definition.label}" muss ein Datum sein (JJJJ-MM-TT).`,
          );
        }

        return parsed.toISOString().slice(0, 10);
      }

      case CustomFieldType.BOOLEAN: {
        if (typeof raw === 'boolean') {
          return raw;
        }

        const text = String(raw).toLowerCase();

        if (['true', 'ja', '1'].includes(text)) {
          return true;
        }

        if (['false', 'nein', '0'].includes(text)) {
          return false;
        }

        throw new BadRequestException(
          `"${definition.label}" muss ja oder nein sein.`,
        );
      }

      case CustomFieldType.SELECT: {
        const text = String(raw).trim();

        if (!definition.options.includes(text)) {
          throw new BadRequestException(
            `"${text}" ist keine der Möglichkeiten für "${definition.label}".`,
          );
        }

        return text;
      }

      case CustomFieldType.MULTI_SELECT: {
        const list = Array.isArray(raw) ? raw : String(raw).split(';');
        const chosen = list
          .map((entry) => String(entry).trim())
          .filter((entry) => entry !== '');

        for (const entry of chosen) {
          if (!definition.options.includes(entry)) {
            throw new BadRequestException(
              `"${entry}" ist keine der Möglichkeiten für "${definition.label}".`,
            );
          }
        }

        const sorted = definition.options.filter((o) => chosen.includes(o));

        return sorted.length === 0 ? null : sorted;
      }

      case CustomFieldType.CURRENCY: {
        const numeric =
          typeof raw === 'number' ? raw : this.parseBetrag(String(raw));

        if (!Number.isFinite(numeric)) {
          throw new BadRequestException(
            `"${definition.label}" muss ein Betrag sein.`,
          );
        }

        return Math.round(numeric * 100) / 100;
      }

      case CustomFieldType.URL: {
        const text = String(raw).trim();
        let url: URL | null;

        try {
          url = new URL(text);
        } catch {
          url = null;
        }

        if (url === null || url.protocol !== 'https:' || url.hostname === '') {
          throw new BadRequestException(
            `"${definition.label}" muss ein Link sein, der mit https:// beginnt.`,
          );
        }

        if (text.length > MAX_TEXT_LENGTH) {
          throw new BadRequestException(
            `"${definition.label}" darf höchstens ${MAX_TEXT_LENGTH} Zeichen lang sein.`,
          );
        }

        return url.toString();
      }

      case CustomFieldType.EMAIL: {
        const text = String(raw).trim().toLowerCase();

        if (text.length > 254 || !EMAIL_MUSTER.test(text)) {
          throw new BadRequestException(
            `"${definition.label}" muss eine E-Mail-Adresse sein.`,
          );
        }

        return text;
      }

      case CustomFieldType.PHONE: {
        const text = String(raw).trim();
        const normalized = text.replace(/[ ()/.-]/g, '');

        if (
          !TELEFON_MUSTER.test(text) ||
          normalized.replace('+', '').length < 3 ||
          normalized.length > 20
        ) {
          throw new BadRequestException(
            `"${definition.label}" muss eine Telefonnummer sein.`,
          );
        }

        return normalized;
      }

      case CustomFieldType.RATING: {
        const numeric = typeof raw === 'number' ? raw : Number(raw);

        if (!Number.isInteger(numeric) || numeric < 1 || numeric > 5) {
          throw new BadRequestException(
            `"${definition.label}" ist eine Bewertung von 1 bis 5 Sternen.`,
          );
        }

        return numeric;
      }

      default:
        throw new ForbiddenException(
          'Diese Art von eigenem Feld wird nicht unterstützt.',
        );
    }
  }

  private zusammengesetzt(
    definition: CustomFieldDefinition,
    lesen: () => CustomFieldValue,
  ): CustomFieldValue {
    try {
      return lesen();
    } catch (error) {
      if (error instanceof WertFehler) {
        throw new BadRequestException(
          `"${definition.label}": ${error.message}`,
        );
      }

      throw error;
    }
  }

  private parseBetrag(text: string): number {
    const cleaned = text.replace(/[^0-9,.-]/g, '');

    if (cleaned === '') {
      return Number.NaN;
    }

    return Number(
      cleaned.includes(',')
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned,
    );
  }
}
