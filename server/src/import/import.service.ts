import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { parse } from 'csv-parse/sync';

import { sniffDelimiter } from '../export/csv';
import {
  DataSource,
  type EntityManager,
  type ObjectLiteral,
  type SelectQueryBuilder,
} from 'typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import {
  CustomFieldEntity,
  type CustomFieldValues,
} from '../custom-fields/custom-field.types';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { verweiseNachNamen } from '../custom-fields/verknuepfung';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity, DealStage } from '../crm/entities/deal.entity';
import { PipelineEntity } from '../crm/entities/pipeline.entity';
import {
  bereinigeEmails,
  bereinigeTelefone,
  type Kontaktweg,
  emailTrifftSql,
  hatZiffer,
  normalisiereTelefonOderNull,
  TELEFON_MELDUNG,
} from '../crm/kontaktwege';
import { phasenFuer, standardPipeline } from '../crm/pipelines';
import { STANDARD_PHASEN } from '../crm/phasen';
import { NoteEntity } from '../crm/entities/note.entity';
import { TaskEntity } from '../crm/entities/task.entity';
import { ProductEntity } from '../quotes/product.entity';
import { TAX_RATES, UNITS } from '../quotes/quote.types';
import { CustomFieldType } from '../custom-fields/custom-field.types';
import {
  assertNeueZieleSchreibbar,
  zielSichtbar,
} from '../workspaces/ziel-sichtbarkeit';
import { bereinigeZweitdomains, domainVon } from '../crm/domains';
import { httpsOderNull } from '../crm/links';
import {
  type CsvInspection,
  ImportEntity,
  type ImportableField,
  type ImportInput,
  type ImportRejection,
  type ImportReport,
} from './dto/import.dto';
import {
  asImportField,
  CUSTOM_IMPORT_PREFIX,
  customEntityFor,
  findImportField,
  type ImportFieldDefinition,
  IMPORT_FIELDS,
  feldrechtDesImports,
} from './import-fields';
import { assertFelderSchreibbar, type FeldArt } from '../workspaces/feldrechte';
import { HOECHSTBETRAG } from '../crm/dto/grenzen';
import { datenbankMeldung } from '../observability/deutsche-meldung';
import {
  assertVerantwortungAenderbar,
  istSchreibbar,
  istSichtbar,
  NUR_LESEN,
  sichtbarkeitsBedingung,
} from '../workspaces/sichtbarkeit';
import { MAX_DEAL_KONTAKTE } from '../crm/deal-kontakte.service';

const HOECHSTE_GANZZAHL = 2_147_483_647;

const MAX_ROWS = 10_000;
const MAX_REPORTED_REJECTIONS = 100;

const WEITERE_KONTAKTE = '__weitereKontakte';

const MIT_FELDRECHTEN: ImportEntity[] = [
  ImportEntity.COMPANY,
  ImportEntity.CONTACT,
  ImportEntity.DEAL,
  ImportEntity.TASK,
];

class RowError extends Error {}

const alsZeilenfehler = (error: unknown): never => {
  if (
    error instanceof ForbiddenException ||
    error instanceof NotFoundException
  ) {
    throw new RowError(error.message);
  }

  throw error;
};

const kontaktwegeErgaenzen = (
  values: Record<string, unknown>,
  vorhanden: ContactEntity,
): void => {
  const email =
    typeof values.email === 'string' ? values.email : vorhanden.email;
  const neueEmails = (values.weitereEmails as Kontaktweg[] | undefined) ?? [];

  if (
    vorhanden.email !== null &&
    email !== null &&
    email.toLowerCase() !== vorhanden.email.toLowerCase()
  ) {
    delete values.email;
  }

  if (values.weitereEmails !== undefined) {
    values.weitereEmails = bereinigeEmails(
      [...(vorhanden.weitereEmails ?? []), ...neueEmails],
      vorhanden.email ?? email,
      vorhanden.weitereEmails ?? [],
      false,
    );
  }

  if (values.weitereTelefone !== undefined) {
    values.weitereTelefone = bereinigeTelefone(
      [
        ...(vorhanden.weitereTelefone ?? []),
        ...(values.weitereTelefone as Kontaktweg[]),
      ],
      (values.phone as string | null | undefined) ?? vorhanden.phone,
      false,
    );
  }
};

type ParsedRow = Record<string, string>;

type Tabelle = { kopf: string[]; zeilen: string[][] };

type Zuordnung = {
  column: string;
  field: ImportFieldDefinition;
  werte?: Map<string, string>;
};

const MAX_WERTE = 50;
const MAX_VORSCHAU = 10;

@Injectable()
export class ImportService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly customFieldsService: CustomFieldsService,
  ) {}

  private parseRoh(csv: string): string[][] {
    try {
      const roh = parse(csv, {
        delimiter: sniffDelimiter(csv),
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_column_count: true,
      }) as string[][];

      return roh.filter((zeile) => zeile.some((zelle) => zelle.trim() !== ''));
    } catch (error) {
      throw new BadRequestException(
        `Die Datei ließ sich nicht als CSV lesen: ${(error as Error).message}`,
      );
    }
  }

  private tabelle(csv: string, kopfzeile = 0): Tabelle {
    const roh = this.parseRoh(csv);

    if (roh.length <= kopfzeile) {
      throw new BadRequestException(
        kopfzeile === 0
          ? 'Die Datei ist leer.'
          : `Die Datei hat keine ${kopfzeile + 1}. Zeile.`,
      );
    }

    const gesehen = new Map<string, number>();
    const kopf = roh[kopfzeile].map((zelle, index) => {
      const name = zelle.trim() === '' ? `Spalte ${index + 1}` : zelle.trim();
      const anzahl = (gesehen.get(name) ?? 0) + 1;

      gesehen.set(name, anzahl);

      return anzahl === 1 ? name : `${name} (${anzahl})`;
    });
    const zeilen = roh
      .slice(kopfzeile + 1)
      .map((zeile) => kopf.map((_, index) => (zeile[index] ?? '').trim()));

    return { kopf, zeilen };
  }

  async felder(
    workspaceId: string,
    entity: ImportEntity,
  ): Promise<ImportableField[]> {
    const feldArt = customEntityFor(entity);
    const eigene =
      feldArt === undefined
        ? []
        : (await this.customFieldsService.list(workspaceId, feldArt)).filter(
            (definition) => !definition.gegenseite,
          );
    const phasen = await phasenFuer(this.dataSource.manager, workspaceId, null);
    const phasenName = new Map(
      phasen.map((phase) => [phase.stage as string, phase.label]),
    );

    return [...IMPORT_FIELDS[entity], ...eigene.map(asImportField)].map(
      ({ name, label, required, kind, optionen }) => ({
        name,
        label,
        required,
        ...(optionen === undefined
          ? {}
          : {
              optionen: optionen.map((option) => ({
                wert: option.wert,
                label:
                  kind === 'stage'
                    ? (phasenName.get(option.wert) ?? option.label)
                    : option.label,
              })),
            }),
      }),
    );
  }

  inspect(csv: string, kopfzeile = 0): CsvInspection {
    const roh = this.parseRoh(csv);
    const { kopf, zeilen } = this.tabelle(csv, kopfzeile);

    if (zeilen.length === 0) {
      throw new BadRequestException('Die Datei enthält keine Datenzeilen.');
    }

    const spaltenWerte = kopf.map((spalte, index) => {
      const zaehler = new Map<string, number>();

      for (const zeile of zeilen) {
        const wert = zeile[index];

        if (wert !== '') {
          zaehler.set(wert, (zaehler.get(wert) ?? 0) + 1);
        }
      }

      const werte = [...zaehler.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))
        .map(([wert]) => wert.slice(0, 200));

      return {
        spalte,
        werte: werte.slice(0, MAX_WERTE),
        mehr: werte.length > MAX_WERTE,
      };
    });

    return {
      columns: kopf,
      rowCount: zeilen.length,
      sampleRow: zeilen[0],
      kopfzeile,
      vorschau: roh
        .slice(0, MAX_VORSCHAU)
        .map((zeile) => zeile.slice(0, 30).map((zelle) => zelle.slice(0, 100))),
      spaltenWerte,
    };
  }

  private parseNumber(raw: string): number {
    const cleaned = raw.replace(/[^\d,.-]/g, '');
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');

    const normalised =
      lastComma > lastDot
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');

    const value = Number.parseFloat(normalised);

    if (!Number.isFinite(value)) {
      throw new RowError(`"${raw}" ist keine Zahl.`);
    }

    return value;
  }

  private imBereich(label: string, wert: number, hoechstens: number): number {
    if (wert < 0) {
      throw new RowError(`${label} darf nicht negativ sein.`);
    }

    if (wert > hoechstens) {
      throw new RowError(
        `${label} darf höchstens ${hoechstens.toLocaleString('de-DE')} betragen.`,
      );
    }

    return wert;
  }

  private zeilenFehler<T>(machen: () => T): T {
    try {
      return machen();
    } catch (error) {
      throw new RowError((error as Error).message);
    }
  }

  private alsLink(raw: string, label: string): string | null {
    return this.zeilenFehler(() => httpsOderNull(raw, label));
  }

  private parseDate(raw: string): string {
    const german = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
    const iso =
      german !== null ? `${german[3]}-${german[2]}-${german[1]}` : raw;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      throw new RowError(
        `"${raw}" ist kein Datum (JJJJ-MM-TT oder TT.MM.JJJJ).`,
      );
    }

    const tag = new Date(`${iso}T00:00:00Z`);

    if (Number.isNaN(tag.getTime()) || tag.toISOString().slice(0, 10) !== iso) {
      throw new RowError(`Den ${raw} gibt es nicht.`);
    }

    return iso;
  }

  private parseStage(raw: string, namen: Map<string, DealStage>): DealStage {
    const candidate = raw.trim().toLowerCase();
    const match =
      Object.values(DealStage).find((stage) => stage === candidate) ??
      namen.get(candidate);

    if (match === undefined) {
      throw new RowError(
        `"${raw}" ist keine Phase (${[...new Set(namen.keys())].join(', ')}).`,
      );
    }

    return match;
  }

  private async phasenNamen(
    manager: EntityManager,
    workspaceId: string,
  ): Promise<Map<string, DealStage>> {
    const namen = new Map<string, DealStage>();

    for (const [stage, { label }] of Object.entries(STANDARD_PHASEN)) {
      namen.set(label.toLowerCase(), stage as DealStage);
    }

    for (const phase of await phasenFuer(manager, workspaceId, null)) {
      namen.set(phase.label.toLowerCase(), phase.stage);
    }

    return namen;
  }

  private async firmaVerweis(
    manager: EntityManager,
    workspaceId: string,
    name: string,
  ): Promise<string> {
    const treffer = await manager
      .getRepository(CompanyEntity)
      .createQueryBuilder('f')
      .where('f.workspaceId = :workspaceId', { workspaceId })
      .andWhere('lower(f.name) = lower(:name)', { name })
      .getMany();

    return this.einziger(manager, treffer, 'companyId', `Die Firma „${name}“`);
  }

  private async kontaktVerweis(
    manager: EntityManager,
    workspaceId: string,
    email: string,
  ): Promise<string> {
    const treffer = await manager
      .getRepository(ContactEntity)
      .createQueryBuilder('k')
      .where('k.workspaceId = :workspaceId', { workspaceId })
      .andWhere(emailTrifftSql('k', 'mail'), { mail: email.toLowerCase() })
      .getMany();

    return this.einziger(
      manager,
      treffer,
      'contactId',
      `Den Kontakt „${email}“`,
    );
  }

  private async geschaeftVerweis(
    manager: EntityManager,
    workspaceId: string,
    name: string,
  ): Promise<string> {
    const treffer = await manager
      .getRepository(DealEntity)
      .createQueryBuilder('g')
      .where('g.workspaceId = :workspaceId', { workspaceId })
      .andWhere('lower(g.name) = lower(:name)', { name })
      .getMany();

    return this.einziger(manager, treffer, 'dealId', `Das Geschäft „${name}“`);
  }

  private async einziger(
    manager: EntityManager,
    treffer: { id: string }[],
    spalte: 'companyId' | 'contactId' | 'dealId',
    was: string,
  ): Promise<string> {
    const sichtbar: string[] = [];

    for (const eintrag of treffer) {
      if (await zielSichtbar(manager, { [spalte]: eintrag.id })) {
        sichtbar.push(eintrag.id);
      }
    }

    if (sichtbar.length === 0) {
      throw new RowError(`${was} gibt es nicht.`);
    }

    if (sichtbar.length > 1) {
      throw new RowError(`${was} gibt es mehrmals; bitte eindeutig benennen.`);
    }

    return sichtbar[0];
  }

  private async mitglied(
    manager: EntityManager,
    workspaceId: string,
    email: string,
  ): Promise<string> {
    const [treffer] = (await manager.query(
      `SELECT m."userId" FROM "memberships" m
         JOIN "users" u ON u."id" = m."userId"
        WHERE m."workspaceId" = $1 AND lower(u."email") = lower($2)
        LIMIT 1`,
      [workspaceId, email.trim()],
    )) as { userId: string }[];

    if (treffer === undefined) {
      throw new RowError(`„${email}“ ist kein Mitglied dieses Bereichs.`);
    }

    return treffer.userId;
  }

  private parseJaNein(raw: string, label: string): boolean {
    const text = raw.trim().toLowerCase();

    if (
      ['ja', 'j', 'x', 'true', 'wahr', '1', 'yes', 'erledigt'].includes(text)
    ) {
      return true;
    }

    if (['nein', 'n', 'false', 'falsch', '0', 'no', 'offen'].includes(text)) {
      return false;
    }

    throw new RowError(`${label}: „${raw}“ ist weder ja noch nein.`);
  }

  private parseSteuersatz(raw: string): number {
    const satz = this.parseNumber(raw.replace(/%/gu, ''));

    if (!(TAX_RATES as readonly number[]).includes(satz)) {
      throw new RowError(
        `„${raw}“ ist kein Steuersatz (${TAX_RATES.join(', ')} %).`,
      );
    }

    return satz;
  }

  private parseEinheit(raw: string): string {
    const treffer = UNITS.find(
      (einheit) => einheit.toLowerCase() === raw.trim().toLowerCase(),
    );

    if (treffer === undefined) {
      throw new RowError(`„${raw}“ ist keine Einheit (${UNITS.join(', ')}).`);
    }

    return treffer;
  }

  private zuordnen(
    raw: string,
    werte: Map<string, string> | undefined,
    mehrere: boolean,
  ): string {
    if (werte === undefined || werte.size === 0) {
      return raw;
    }

    const einer = (wert: string): string =>
      werte.get(wert.trim().toLowerCase()) ?? wert;

    if (!mehrere) {
      return einer(raw);
    }

    return raw
      .split(';')
      .map((teil) => einer(teil))
      .filter((teil) => teil.trim() !== '')
      .join(';');
  }

  private async resolvePipelineId(
    manager: EntityManager,
    workspaceId: string,
    name: string,
  ): Promise<string> {
    const pipelines = await manager.find(PipelineEntity, {
      where: { workspaceId },
      order: { position: 'ASC', createdAt: 'ASC' },
    });
    const treffer = pipelines.find(
      (pipeline) => pipeline.name.toLowerCase() === name.toLowerCase(),
    );

    if (treffer === undefined) {
      throw new RowError(
        `"${name}" ist keine Pipeline (${pipelines.map((p) => p.name).join(', ')}).`,
      );
    }

    return treffer.id;
  }

  private async resolveCompanyId(
    manager: EntityManager,
    workspaceId: string,
    name: string,
  ): Promise<string> {
    const existing = await manager.findOne(CompanyEntity, {
      where: { workspaceId, name },
    });

    if (existing !== null) {
      return existing.id;
    }

    const created = await manager.save(
      manager.create(CompanyEntity, {
        workspaceId,
        name,
        herkunft: 'import',
        customFields: await this.customFieldsService.standardwerte(
          workspaceId,
          CustomFieldEntity.COMPANY,
          manager,
        ),
      }),
    );

    return created.id;
  }

  private async weitereKontakteAnhaengen(
    manager: EntityManager,
    workspaceId: string,
    dealId: string,
    kontakte: string[] | undefined,
  ): Promise<void> {
    if (kontakte === undefined || kontakte.length === 0) {
      return;
    }

    const [geschaeft] = (await manager.query(
      `SELECT "primaryContactId" FROM "deals"
        WHERE "id" = $1 AND "workspaceId" = $2 FOR UPDATE`,
      [dealId, workspaceId],
    )) as { primaryContactId: string | null }[];
    const vorhanden = new Set(
      (
        (await manager.query(
          `SELECT "contactId" FROM "deal_kontakte"
            WHERE "dealId" = $1 AND "workspaceId" = $2`,
          [dealId, workspaceId],
        )) as { contactId: string }[]
      ).map((zeile) => zeile.contactId),
    );
    const neue = [...new Set(kontakte)].filter(
      (contactId) =>
        !vorhanden.has(contactId) && contactId !== geschaeft?.primaryContactId,
    );

    if (vorhanden.size + neue.length > MAX_DEAL_KONTAKTE) {
      throw new RowError(
        `An einem Geschäft stehen höchstens ${String(MAX_DEAL_KONTAKTE)} weitere Kontakte.`,
      );
    }

    for (const contactId of neue) {
      await manager.query(
        `INSERT INTO "deal_kontakte" ("workspaceId", "dealId", "contactId")
         SELECT $1, $2, $3
          WHERE NOT EXISTS (
            SELECT 1 FROM "deals" g
             WHERE g."id" = $2 AND g."primaryContactId" = $3)
         ON CONFLICT ("dealId", "contactId") DO NOTHING`,
        [workspaceId, dealId, contactId],
      );
    }
  }

  private async resolveContactId(
    manager: EntityManager,
    workspaceId: string,
    email: string,
  ): Promise<string> {
    const kontakt = await manager
      .getRepository(ContactEntity)
      .createQueryBuilder('kontakt')
      .where('kontakt.workspaceId = :workspaceId', { workspaceId })
      .andWhere('LOWER(kontakt.email) = :email', {
        email: email.trim().toLowerCase(),
      })
      .getOne();

    if (
      kontakt === null ||
      !(await istSichtbar('contact', kontakt.ownerId, kontakt.id))
    ) {
      throw new RowError(`Kein Kontakt mit der Adresse „${email.trim()}“.`);
    }

    return kontakt.id;
  }

  private async buildValues(
    manager: EntityManager,
    workspaceId: string,
    row: ParsedRow,
    mapping: Zuordnung[],
    phasenNamen: Map<string, DealStage>,
  ): Promise<{
    values: Record<string, unknown>;
    customValues: CustomFieldValues;
  }> {
    const values: Record<string, unknown> = {};
    const customValues: CustomFieldValues = {};

    for (const { column, field, werte } of mapping) {
      const raw = this.zuordnen(
        (row[column] ?? '').trim(),
        werte,
        field.definition?.type === CustomFieldType.MULTI_SELECT,
      ).trim();

      if (raw === '') {
        if (field.required) {
          throw new RowError(`${field.label} ist ein Pflichtfeld.`);
        }

        continue;
      }

      switch (field.kind) {
        case 'integer':
          values[field.name] = this.imBereich(
            field.label,
            Math.trunc(this.parseNumber(raw)),
            HOECHSTE_GANZZAHL,
          );
          break;
        case 'decimal':
          values[field.name] = this.imBereich(
            field.label,
            this.parseNumber(raw),
            HOECHSTBETRAG,
          );
          break;
        case 'date':
          values[field.name] = this.parseDate(raw);
          break;
        case 'stage':
          values[field.name] = this.parseStage(raw, phasenNamen);
          break;
        case 'parentLookup':
          values.parentCompanyName = raw;
          break;
        case 'companyRef':
          values.companyId = await this.firmaVerweis(manager, workspaceId, raw);
          break;
        case 'contactRef':
          values.contactId = await this.kontaktVerweis(
            manager,
            workspaceId,
            raw,
          );
          break;
        case 'dealRef':
          values.dealId = await this.geschaeftVerweis(
            manager,
            workspaceId,
            raw,
          );
          break;
        case 'member':
          values[field.name === 'assigneeEmail' ? 'assigneeId' : 'ownerId'] =
            await this.mitglied(manager, workspaceId, raw);
          break;
        case 'boolean':
          values[field.name] = this.parseJaNein(raw, field.label);
          break;
        case 'cents':
          values[field.name] = Math.round(
            this.imBereich(field.label, this.parseNumber(raw), 100_000_000) *
              100,
          );
          break;
        case 'unit':
          values[field.name] = this.parseEinheit(raw);
          break;
        case 'taxRate':
          values[field.name] = this.parseSteuersatz(raw);
          break;
        case 'pipelineLookup':
          values.pipelineId = await this.resolvePipelineId(
            manager,
            workspaceId,
            raw,
          );
          break;
        case 'contactLookup':
          values.primaryContactId = await this.resolveContactId(
            manager,
            workspaceId,
            raw,
          );
          break;
        case 'contactsLookup': {
          const kennungen: string[] = [];

          for (const adresse of raw.split(/[;,\n]/u)) {
            if (adresse.trim() !== '') {
              kennungen.push(
                await this.resolveContactId(manager, workspaceId, adresse),
              );
            }
          }

          values[WEITERE_KONTAKTE] = kennungen;
          break;
        }
        case 'companyLookup':
          values.companyId = await this.resolveCompanyId(
            manager,
            workspaceId,
            raw,
          );
          break;
        case 'link':
          values[field.name] = this.alsLink(raw, field.label);
          break;
        case 'domains':
          values.zweitdomains = this.zeilenFehler(() =>
            bereinigeZweitdomains(
              raw.split(/[;,\s]+/u),
              (values.domain as string | undefined) ?? null,
            ),
          );
          break;
        case 'custom':
          if (
            field.definition?.type === CustomFieldType.RELATION &&
            field.definition.zielEntity !== null
          ) {
            const ids = await verweiseNachNamen(
              manager,
              workspaceId,
              field.definition.zielEntity,
              field.definition.mehrere ? raw.split(';') : [raw],
            );

            customValues[field.definition.key] = field.definition.mehrere
              ? ids
              : (ids[0] ?? null);
            break;
          }

          customValues[field.definition?.key ?? ''] = raw;
          break;
        case 'weitereEmail':
        case 'weitereTelefon': {
          const liste =
            field.kind === 'weitereEmail' ? 'weitereEmails' : 'weitereTelefone';
          const bisher = (values[liste] as Kontaktweg[] | undefined) ?? [];

          values[liste] = [
            ...bisher,
            ...raw
              .split(/[;,\n]/u)
              .map((teil) => teil.trim())
              .filter(Boolean)
              .map((wert) => ({ art: field.art ?? 'sonstige', wert })),
          ];
          break;
        }
        default:
          values[field.name] =
            field.name === 'domain'
              ? domainVon(raw)
              : field.name === 'email'
                ? raw.toLowerCase()
                : raw;
      }
    }

    const nummern = [
      values.phone,
      ...((values.weitereTelefone as Kontaktweg[] | undefined) ?? []).map(
        (eintrag) => eintrag.wert,
      ),
    ];

    if (nummern.some((wert) => typeof wert === 'string' && !hatZiffer(wert))) {
      throw new RowError(TELEFON_MELDUNG);
    }

    if (typeof values.phone === 'string') {
      values.phone = normalisiereTelefonOderNull(values.phone);
    }

    if (values.weitereEmails !== undefined) {
      try {
        values.weitereEmails = bereinigeEmails(
          values.weitereEmails as Kontaktweg[],
          values.email as string | undefined,
          [],
          false,
        );
      } catch (error) {
        throw new RowError((error as Error).message);
      }
    }

    if (values.weitereTelefone !== undefined) {
      values.weitereTelefone = bereinigeTelefone(
        values.weitereTelefone as Kontaktweg[],
        values.phone as string | undefined,
        false,
      );
    }

    return { values, customValues };
  }

  private async pruefePhase(
    manager: EntityManager,
    workspaceId: string,
    values: Record<string, unknown>,
  ): Promise<void> {
    const pipelineId =
      (values.pipelineId as string | undefined) ??
      (await standardPipeline(manager, workspaceId)).id;
    const phasen = await phasenFuer(manager, workspaceId, pipelineId);

    if (values.stage === undefined) {
      const erste = phasen.find((phase) => !phase.ausgeblendet);

      if (erste !== undefined && erste.stage !== DealStage.LEAD) {
        values.stage = erste.stage;
      }

      return;
    }

    const phase = phasen.find((eintrag) => eintrag.stage === values.stage);

    if (phase?.ausgeblendet === true) {
      throw new RowError(
        `Die Phase „${phase.label}“ ist in dieser Pipeline ausgeblendet.`,
      );
    }
  }

  private async findDuplicate(
    manager: EntityManager,
    entity: ImportEntity,
    workspaceId: string,
    values: Record<string, unknown>,
  ): Promise<{
    id: string;
    ownerId: string | null;
    customFields?: CustomFieldValues;
  } | null> {
    if (entity === ImportEntity.COMPANY) {
      const firmen = () =>
        manager
          .getRepository(CompanyEntity)
          .createQueryBuilder('f')
          .where('f.workspaceId = :workspaceId', { workspaceId });

      if (typeof values.domain === 'string') {
        const domain = domainVon(values.domain);
        const byDomain = await this.sichtbarZuerst('company', 'f', () =>
          firmen()
            .andWhere('(f.domain = :domain OR f.zweitdomains ? :domain)', {
              domain,
            })
            .orderBy('CASE WHEN f.domain = :domain THEN 0 ELSE 1 END')
            .addOrderBy('f.id'),
        );

        if (byDomain !== null) {
          return byDomain;
        }
      }

      return this.sichtbarZuerst('company', 'f', () =>
        firmen()
          .andWhere('f.name = :name', { name: values.name as string })
          .orderBy('f.id'),
      );
    }

    if (entity === ImportEntity.CONTACT && typeof values.email === 'string') {
      const mail = values.email.toLowerCase();

      return this.sichtbarZuerst('contact', 'k', () =>
        manager
          .getRepository(ContactEntity)
          .createQueryBuilder('k')
          .where('k.workspaceId = :workspaceId', { workspaceId })
          .andWhere(emailTrifftSql('k', 'mail'), { mail })
          .orderBy(`CASE WHEN lower(k.email) = :mail THEN 0 ELSE 1 END`)
          .addOrderBy('k.id'),
      );
    }

    return null;
  }

  private async sichtbarZuerst<T extends ObjectLiteral>(
    art: 'company' | 'contact',
    alias: string,
    abfrage: () => SelectQueryBuilder<T>,
  ): Promise<T | null> {
    const bedingung = await sichtbarkeitsBedingung(art, alias);

    if (bedingung === null) {
      return abfrage().getOne();
    }

    const sichtbar = await abfrage()
      .andWhere(bedingung.where, bedingung.parameters)
      .getOne();

    if (sichtbar !== null) {
      return sichtbar;
    }

    if ((await abfrage().getOne()) !== null) {
      throw new RowError(
        art === 'company'
          ? 'Diese Firma lässt sich nicht einlesen: Name oder Domain gehören zu einer Firma, auf die Sie keinen Zugriff haben.'
          : 'Dieser Kontakt lässt sich nicht einlesen: die Adresse gehört zu einem Kontakt, auf den Sie keinen Zugriff haben.',
      );
    }

    return null;
  }

  private async waereKreis(
    manager: EntityManager,
    workspaceId: string,
    firmaId: string,
    mutterId: string,
  ): Promise<boolean> {
    const kreis: unknown[] = await manager.query(
      `WITH RECURSIVE kette AS (
         SELECT "id", "parentCompanyId", 1 AS tiefe
           FROM "companies"
          WHERE "id" = $1 AND "workspaceId" = $2
         UNION ALL
         SELECT firma."id", firma."parentCompanyId", kette.tiefe + 1
           FROM "companies" firma
           JOIN kette ON firma."id" = kette."parentCompanyId"
          WHERE firma."workspaceId" = $2 AND kette.tiefe < 100
       )
       SELECT 1 FROM kette WHERE "id" = $3 LIMIT 1`,
      [mutterId, workspaceId, firmaId],
    );

    return kreis.length > 0;
  }

  private entityClass(entity: ImportEntity) {
    if (entity === ImportEntity.COMPANY) {
      return CompanyEntity;
    }

    if (entity === ImportEntity.CONTACT) {
      return ContactEntity;
    }

    return DealEntity;
  }

  async run(
    workspaceId: string,
    input: ImportInput,
    userId?: string,
  ): Promise<ImportReport> {
    const kopfzeile = input.kopfzeile ?? 0;
    const { kopf, zeilen } = this.tabelle(input.csv, kopfzeile);

    if (zeilen.length > MAX_ROWS) {
      throw new BadRequestException(
        `Die Datei hat ${zeilen.length} Zeilen, erlaubt sind ${MAX_ROWS}. Teilen Sie sie auf und lesen Sie sie in Teilen ein.`,
      );
    }

    for (const korrektur of input.korrekturen ?? []) {
      const index = korrektur.zeile - kopfzeile - 2;

      if (index >= 0 && index < zeilen.length) {
        zeilen[index] = kopf.map((_, spalte) =>
          (korrektur.zellen[spalte] ?? '').trim(),
        );
      }
    }

    const rows: ParsedRow[] = zeilen.map((zeile) =>
      Object.fromEntries(kopf.map((name, index) => [name, zeile[index]])),
    );

    const feldArt = customEntityFor(input.entity);
    const customDefinitions =
      feldArt === undefined
        ? []
        : (await this.customFieldsService.list(workspaceId, feldArt)).filter(
            (definition) => !definition.gegenseite,
          );

    const mapping: Zuordnung[] = input.mapping.map(
      ({ column, field, werte }) => {
        const definition = findImportField(
          input.entity,
          field,
          customDefinitions,
        );

        if (definition === undefined) {
          throw new BadRequestException(`Unbekanntes Feld "${field}".`);
        }

        if (!kopf.includes(column)) {
          throw new BadRequestException(
            `Die Spalte „${column}“ gibt es in der Datei nicht.`,
          );
        }

        return {
          column,
          field: definition,
          werte:
            werte === undefined
              ? undefined
              : new Map(
                  werte.map(({ von, nach }) => [
                    von.trim().toLowerCase(),
                    nach,
                  ]),
                ),
        };
      },
    );

    if (MIT_FELDRECHTEN.includes(input.entity)) {
      await assertFelderSchreibbar(
        input.entity.toLowerCase() as FeldArt,
        mapping
          .map(({ field }) => feldrechtDesImports(field))
          .filter((name) => !name.startsWith(CUSTOM_IMPORT_PREFIX)),
        mapping
          .map(({ field }) => field.name)
          .filter((name) => name.startsWith(CUSTOM_IMPORT_PREFIX))
          .map((name) => name.slice(CUSTOM_IMPORT_PREFIX.length)),
      );
    }

    const mappedFields = new Set(mapping.map(({ field }) => field.name));
    const missingRequired = [
      ...IMPORT_FIELDS[input.entity],
      ...customDefinitions.map(asImportField),
    ]
      .filter((field) => field.required && !mappedFields.has(field.name))
      .map((field) => field.label);

    if (missingRequired.length > 0) {
      throw new BadRequestException(
        `Diese Spalten müssen zugeordnet werden: ${missingRequired.join(', ')}`,
      );
    }

    if (
      (input.entity === ImportEntity.NOTE ||
        input.entity === ImportEntity.TASK) &&
      userId === undefined
    ) {
      throw new BadRequestException(
        'Notizen und Aufgaben lassen sich nur von einer Person importieren.',
      );
    }

    const report: ImportReport = {
      dryRun: input.dryRun,
      created: 0,
      updated: 0,
      rejected: 0,
      rejections: [],
    };

    await this.dataSource
      .transaction(async (manager) => {
        const phasenNamen = await this.phasenNamen(manager, workspaceId);

        for (const [index, row] of rows.entries()) {
          const rowNumber = index + kopfzeile + 2;

          await manager.query('SAVEPOINT import_zeile');

          try {
            const { values, customValues } = await this.buildValues(
              manager,
              workspaceId,
              row,
              mapping,
              phasenNamen,
            );

            if (
              Object.keys(values).length === 0 &&
              Object.keys(customValues).length === 0
            ) {
              throw new RowError('Die Zeile ist leer.');
            }

            const ergebnis = await this.zeileSpeichern(manager, {
              workspaceId,
              entity: input.entity,
              values,
              customValues,
              feldArt: customDefinitions.length > 0 ? feldArt : undefined,
              userId,
            });

            report[ergebnis] += 1;
            await manager.query('RELEASE SAVEPOINT import_zeile');
          } catch (error) {
            await manager.query('ROLLBACK TO SAVEPOINT import_zeile');
            report.rejected += 1;

            if (report.rejections.length < MAX_REPORTED_REJECTIONS) {
              report.rejections.push({
                row: rowNumber,
                reason:
                  error instanceof RowError ||
                  error instanceof BadRequestException
                    ? error.message
                    : (datenbankMeldung(error) ??
                      (error as Error).message ??
                      'Unbekannter Fehler'),
                zellen: zeilen[index],
              } satisfies ImportRejection);
            }
          }
        }

        if (input.dryRun) {
          throw new DryRunRollback();
        }
      })
      .catch((error: unknown) => {
        if (!(error instanceof DryRunRollback)) {
          throw error;
        }
      });

    return report;
  }

  private async zeileSpeichern(
    manager: EntityManager,
    zeile: {
      workspaceId: string;
      entity: ImportEntity;
      values: Record<string, unknown>;
      customValues: CustomFieldValues;
      feldArt: CustomFieldEntity | undefined;
      userId: string | undefined;
    },
  ): Promise<'created' | 'updated'> {
    const { workspaceId, entity, values, customValues, feldArt, userId } =
      zeile;

    if (entity === ImportEntity.NOTE) {
      return this.notizSpeichern(
        manager,
        workspaceId,
        values,
        userId as string,
      );
    }

    if (entity === ImportEntity.PRODUCT) {
      return this.artikelSpeichern(manager, workspaceId, values);
    }

    if (entity === ImportEntity.TASK) {
      if (feldArt !== undefined) {
        values.customFields = await this.customFieldsService.validate(
          workspaceId,
          feldArt,
          customValues,
          {},
          { manager, neu: true },
        );
      }

      return this.aufgabeSpeichern(
        manager,
        workspaceId,
        values,
        userId as string,
      );
    }

    const weitereKontakte = values[WEITERE_KONTAKTE] as string[] | undefined;

    delete values[WEITERE_KONTAKTE];

    if (entity === ImportEntity.DEAL) {
      await this.pruefePhase(manager, workspaceId, values);
    }

    if (values.parentCompanyName !== undefined) {
      if (
        String(values.parentCompanyName).toLowerCase() ===
        String(values.name ?? '').toLowerCase()
      ) {
        throw new RowError(
          'Eine Firma kann nicht ihre eigene Muttergesellschaft sein.',
        );
      }

      values.parentCompanyId = await this.firmaVerweis(
        manager,
        workspaceId,
        String(values.parentCompanyName),
      );
      delete values.parentCompanyName;
    }

    const duplicate = await this.findDuplicate(
      manager,
      entity,
      workspaceId,
      values,
    );

    if (feldArt !== undefined) {
      values.customFields = await this.customFieldsService.validate(
        workspaceId,
        feldArt,
        customValues,
        duplicate?.customFields ?? {},
        { ausserId: duplicate?.id ?? null, manager, neu: duplicate === null },
      );
    }

    const target = this.entityClass(entity);

    if (duplicate !== null) {
      const art = entity === ImportEntity.COMPANY ? 'company' : 'contact';

      if (!(await istSchreibbar(art, duplicate.ownerId, duplicate.id))) {
        throw new RowError(NUR_LESEN);
      }

      await assertVerantwortungAenderbar(
        art,
        duplicate.ownerId,
        values.ownerId as string | undefined,
      ).catch(alsZeilenfehler);

      if (
        entity === ImportEntity.COMPANY &&
        values.zweitdomains !== undefined
      ) {
        const vorhanden = duplicate as unknown as CompanyEntity;

        values.zweitdomains = bereinigeZweitdomains(
          [
            ...(vorhanden.zweitdomains ?? []),
            ...(values.zweitdomains as string[]),
          ],
          (values.domain as string | undefined) ?? vorhanden.domain,
        );
      }

      if (entity === ImportEntity.CONTACT) {
        kontaktwegeErgaenzen(values, duplicate as unknown as ContactEntity);
      }

      if (values.parentCompanyId === duplicate.id) {
        throw new RowError(
          'Eine Firma kann nicht ihre eigene Muttergesellschaft sein.',
        );
      }

      if (
        typeof values.parentCompanyId === 'string' &&
        (await this.waereKreis(
          manager,
          workspaceId,
          duplicate.id,
          values.parentCompanyId,
        ))
      ) {
        throw new RowError(
          'Diese Firma gehört schon zum Konzern dieser Firma; als Mutter entstünde ein Kreis.',
        );
      }

      await manager.update(target, duplicate.id, values);
      await this.weitereKontakteAnhaengen(
        manager,
        workspaceId,
        duplicate.id,
        weitereKontakte,
      );

      return 'updated';
    }

    const angelegt = (await manager.save(
      manager.create(target, {
        ...values,
        workspaceId,
        herkunft: 'import',
      }),
    )) as { id: string };

    await this.weitereKontakteAnhaengen(
      manager,
      workspaceId,
      angelegt.id,
      weitereKontakte,
    );

    return 'created';
  }

  private async notizSpeichern(
    manager: EntityManager,
    workspaceId: string,
    values: Record<string, unknown>,
    userId: string,
  ): Promise<'created'> {
    if (
      values.companyId === undefined &&
      values.contactId === undefined &&
      values.dealId === undefined
    ) {
      throw new RowError(
        'Eine Notiz braucht eine Firma, einen Kontakt oder ein Geschäft.',
      );
    }

    await assertNeueZieleSchreibbar(manager, {
      companyId: values.companyId as string | undefined,
      contactId: values.contactId as string | undefined,
      dealId: values.dealId as string | undefined,
    }).catch(alsZeilenfehler);

    await manager.save(
      manager.create(NoteEntity, {
        workspaceId,
        body: String(values.body).slice(0, 20_000),
        companyId: (values.companyId as string | undefined) ?? null,
        contactId: (values.contactId as string | undefined) ?? null,
        dealId: (values.dealId as string | undefined) ?? null,
        authorId: userId,
      }),
    );

    return 'created';
  }

  private async aufgabeSpeichern(
    manager: EntityManager,
    workspaceId: string,
    values: Record<string, unknown>,
    userId: string,
  ): Promise<'created'> {
    const { erledigt, ...rest } = values;

    await assertNeueZieleSchreibbar(manager, {
      companyId: values.companyId as string | undefined,
      contactId: values.contactId as string | undefined,
      dealId: values.dealId as string | undefined,
    }).catch(alsZeilenfehler);

    await manager.save(
      manager.create(TaskEntity, {
        ...rest,
        workspaceId,
        title: String(values.title).slice(0, 200),
        assigneeId: (values.assigneeId as string | undefined) ?? userId,
        createdById: userId,
        completedAt: erledigt === true ? new Date() : null,
      }),
    );

    return 'created';
  }

  private async artikelSpeichern(
    manager: EntityManager,
    workspaceId: string,
    values: Record<string, unknown>,
  ): Promise<'created' | 'updated'> {
    if (
      typeof values.articleNumber === 'string' &&
      values.articleNumber.length > 50
    ) {
      throw new RowError('Die Artikelnummer darf höchstens 50 Zeichen haben.');
    }

    const artikel = manager.getRepository(ProductEntity);
    const abfrage = artikel
      .createQueryBuilder('a')
      .where('a.workspaceId = :workspaceId', { workspaceId });
    const vorhanden =
      typeof values.articleNumber === 'string'
        ? await abfrage
            .andWhere('lower(a.articleNumber) = lower(:nummer)', {
              nummer: values.articleNumber,
            })
            .getOne()
        : await abfrage
            .andWhere('lower(a.name) = lower(:name)', { name: values.name })
            .getOne();

    if (vorhanden !== null) {
      const { articleNumber: _nummer, ...aenderung } = values;

      await artikel.update(vorhanden.id, aenderung);

      return 'updated';
    }

    await artikel.save(artikel.create({ ...values, workspaceId }));

    return 'created';
  }
}

class DryRunRollback extends Error {}
