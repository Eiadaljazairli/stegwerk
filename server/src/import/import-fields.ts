import { type CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import { CustomFieldEntity } from '../custom-fields/custom-field.types';
import { DealStage } from '../crm/entities/deal.entity';
import { TAX_RATES, UNITS } from '../quotes/quote.types';
import { ImportEntity } from './dto/import.dto';

export type ImportFieldDefinition = {
  name: string;
  label: string;
  required: boolean;
  kind:
    | 'text'
    | 'integer'
    | 'decimal'
    | 'date'
    | 'stage'
    | 'companyLookup'
    | 'pipelineLookup'
    | 'contactLookup'
    | 'contactsLookup'
    | 'weitereEmail'
    | 'weitereTelefon'
    | 'link'
    | 'domains'
    | 'parentLookup'
    | 'companyRef'
    | 'contactRef'
    | 'dealRef'
    | 'member'
    | 'boolean'
    | 'cents'
    | 'unit'
    | 'taxRate'
    | 'custom';
  art?: string;
  definition?: CustomFieldDefinition;
  optionen?: { wert: string; label: string }[];
};

export const CUSTOM_IMPORT_PREFIX = 'custom:';

const IMPORT_TO_CUSTOM: Partial<Record<ImportEntity, CustomFieldEntity>> = {
  [ImportEntity.COMPANY]: CustomFieldEntity.COMPANY,
  [ImportEntity.CONTACT]: CustomFieldEntity.CONTACT,
  [ImportEntity.DEAL]: CustomFieldEntity.DEAL,
  [ImportEntity.TASK]: CustomFieldEntity.TASK,
};

export const customEntityFor = (
  entity: ImportEntity,
): CustomFieldEntity | undefined => IMPORT_TO_CUSTOM[entity];

export const asImportField = (
  definition: CustomFieldDefinition,
): ImportFieldDefinition => ({
  name: `${CUSTOM_IMPORT_PREFIX}${definition.key}`,
  label: definition.label,
  required: definition.required && definition.standardwertWert === null,
  kind: 'custom',
  definition,
  ...(definition.options.length > 0
    ? {
        optionen: definition.options.map((option) => ({
          wert: option,
          label: option,
        })),
      }
    : {}),
});

const VERANTWORTLICH: ImportFieldDefinition = {
  name: 'ownerEmail',
  label: 'Verantwortlich (E-Mail)',
  required: false,
  kind: 'member',
};

const FIRMA_VERWEIS: ImportFieldDefinition = {
  name: 'companyRef',
  label: 'Firma (Name)',
  required: false,
  kind: 'companyRef',
};
const KONTAKT_VERWEIS: ImportFieldDefinition = {
  name: 'contactRef',
  label: 'Kontakt (E-Mail)',
  required: false,
  kind: 'contactRef',
};
const GESCHAEFT_VERWEIS: ImportFieldDefinition = {
  name: 'dealRef',
  label: 'Geschäft (Bezeichnung)',
  required: false,
  kind: 'dealRef',
};

const COMPANY_LOOKUP: ImportFieldDefinition = {
  name: 'companyName',
  label: 'Firma (Name)',
  required: false,
  kind: 'companyLookup',
};

const COMPANY_FIELDS: ImportFieldDefinition[] = [
  { name: 'name', label: 'Name', required: true, kind: 'text' },
  { name: 'domain', label: 'Domain', required: false, kind: 'text' },
  {
    name: 'zweitdomains',
    label: 'Weitere Domains',
    required: false,
    kind: 'domains',
  },
  { name: 'website', label: 'Website', required: false, kind: 'link' },
  { name: 'linkedin', label: 'LinkedIn', required: false, kind: 'link' },
  { name: 'industry', label: 'Branche', required: false, kind: 'text' },
  {
    name: 'employeeCount',
    label: 'Mitarbeiter',
    required: false,
    kind: 'integer',
  },
  {
    name: 'annualRevenue',
    label: 'Jahresumsatz',
    required: false,
    kind: 'decimal',
  },
  { name: 'street', label: 'Straße', required: false, kind: 'text' },
  { name: 'postalCode', label: 'PLZ', required: false, kind: 'text' },
  { name: 'city', label: 'Stadt', required: false, kind: 'text' },
  { name: 'country', label: 'Land', required: false, kind: 'text' },
  { name: 'phone', label: 'Telefon', required: false, kind: 'text' },
  { name: 'email', label: 'E-Mail', required: false, kind: 'text' },
  {
    name: 'vertretung',
    label: 'Vertreten durch',
    required: false,
    kind: 'text',
  },
  {
    name: 'registergericht',
    label: 'Registergericht',
    required: false,
    kind: 'text',
  },
  {
    name: 'registernummer',
    label: 'Registernummer',
    required: false,
    kind: 'text',
  },
  { name: 'ustIdNr', label: 'USt-IdNr.', required: false, kind: 'text' },
  {
    name: 'parentCompanyName',
    label: 'Muttergesellschaft (Name)',
    required: false,
    kind: 'parentLookup',
  },
  VERANTWORTLICH,
];

const CONTACT_FIELDS: ImportFieldDefinition[] = [
  { name: 'firstName', label: 'Vorname', required: true, kind: 'text' },
  { name: 'lastName', label: 'Nachname', required: true, kind: 'text' },
  { name: 'email', label: 'E-Mail', required: false, kind: 'text' },
  { name: 'phone', label: 'Telefon', required: false, kind: 'text' },
  { name: 'jobTitle', label: 'Position', required: false, kind: 'text' },
  COMPANY_LOOKUP,
  { name: 'street', label: 'Straße', required: false, kind: 'text' },
  { name: 'postalCode', label: 'PLZ', required: false, kind: 'text' },
  { name: 'city', label: 'Stadt', required: false, kind: 'text' },
  { name: 'country', label: 'Land', required: false, kind: 'text' },
  { name: 'linkedin', label: 'LinkedIn', required: false, kind: 'link' },
  {
    name: 'emailWeitere',
    label: 'E-Mail 2',
    required: false,
    kind: 'weitereEmail',
    art: 'sonstige',
  },
  {
    name: 'emailPrivat',
    label: 'E-Mail privat',
    required: false,
    kind: 'weitereEmail',
    art: 'privat',
  },
  {
    name: 'telefonMobil',
    label: 'Telefon mobil',
    required: false,
    kind: 'weitereTelefon',
    art: 'mobil',
  },
  {
    name: 'telefonPrivat',
    label: 'Telefon privat',
    required: false,
    kind: 'weitereTelefon',
    art: 'privat',
  },
  {
    name: 'telefonFax',
    label: 'Fax',
    required: false,
    kind: 'weitereTelefon',
    art: 'fax',
  },
  VERANTWORTLICH,
];

export const feldrechtDesImports = (field: ImportFieldDefinition): string =>
  field.kind === 'weitereEmail'
    ? 'email'
    : field.kind === 'weitereTelefon'
      ? 'phone'
      : ['postalCode', 'city', 'country'].includes(field.name)
        ? 'street'
        : field.kind === 'member'
          ? 'ownerId'
          : field.kind === 'parentLookup'
            ? 'parentCompanyId'
            : field.name;

const DEAL_FIELDS: ImportFieldDefinition[] = [
  { name: 'name', label: 'Bezeichnung', required: true, kind: 'text' },
  { name: 'amount', label: 'Betrag', required: false, kind: 'decimal' },
  { name: 'currency', label: 'Währung', required: false, kind: 'text' },
  {
    name: 'stage',
    label: 'Phase',
    required: false,
    kind: 'stage',
    optionen: Object.values(DealStage).map((stage) => ({
      wert: stage,
      label: stage,
    })),
  },
  { name: 'closeDate', label: 'Abschluss', required: false, kind: 'date' },
  COMPANY_LOOKUP,
  {
    name: 'pipelineName',
    label: 'Pipeline (Name)',
    required: false,
    kind: 'pipelineLookup',
  },
  {
    name: 'primaryContactEmail',
    label: 'Hauptkontakt (E-Mail)',
    required: false,
    kind: 'contactLookup',
  },
  {
    name: 'weitereKontakte',
    label: 'Weitere Kontakte (E-Mails)',
    required: false,
    kind: 'contactsLookup',
  },
  VERANTWORTLICH,
];

const NOTE_FIELDS: ImportFieldDefinition[] = [
  { name: 'body', label: 'Text', required: true, kind: 'text' },
  FIRMA_VERWEIS,
  KONTAKT_VERWEIS,
  GESCHAEFT_VERWEIS,
];

const TASK_FIELDS: ImportFieldDefinition[] = [
  { name: 'title', label: 'Titel', required: true, kind: 'text' },
  {
    name: 'description',
    label: 'Beschreibung',
    required: false,
    kind: 'text',
  },
  { name: 'dueDate', label: 'Fällig', required: false, kind: 'date' },
  {
    name: 'assigneeEmail',
    label: 'Zuständig (E-Mail)',
    required: false,
    kind: 'member',
  },
  {
    name: 'erledigt',
    label: 'Erledigt (ja/nein)',
    required: false,
    kind: 'boolean',
  },
  FIRMA_VERWEIS,
  KONTAKT_VERWEIS,
  GESCHAEFT_VERWEIS,
];

const PRODUCT_FIELDS: ImportFieldDefinition[] = [
  { name: 'name', label: 'Bezeichnung', required: true, kind: 'text' },
  {
    name: 'articleNumber',
    label: 'Artikelnummer',
    required: false,
    kind: 'text',
  },
  {
    name: 'description',
    label: 'Beschreibung',
    required: false,
    kind: 'text',
  },
  {
    name: 'unitPriceCents',
    label: 'Preis (netto)',
    required: false,
    kind: 'cents',
  },
  {
    name: 'unit',
    label: 'Einheit',
    required: false,
    kind: 'unit',
    optionen: UNITS.map((einheit) => ({ wert: einheit, label: einheit })),
  },
  {
    name: 'taxRatePercent',
    label: 'Steuersatz (%)',
    required: false,
    kind: 'taxRate',
    optionen: TAX_RATES.map((satz) => ({
      wert: String(satz),
      label: `${String(satz)} %`,
    })),
  },
];

export const IMPORT_FIELDS: Record<ImportEntity, ImportFieldDefinition[]> = {
  [ImportEntity.COMPANY]: COMPANY_FIELDS,
  [ImportEntity.CONTACT]: CONTACT_FIELDS,
  [ImportEntity.DEAL]: DEAL_FIELDS,
  [ImportEntity.NOTE]: NOTE_FIELDS,
  [ImportEntity.TASK]: TASK_FIELDS,
  [ImportEntity.PRODUCT]: PRODUCT_FIELDS,
};

export const findImportField = (
  entity: ImportEntity,
  name: string,
  customFields: CustomFieldDefinition[] = [],
): ImportFieldDefinition | undefined => {
  if (name.startsWith(CUSTOM_IMPORT_PREFIX)) {
    const key = name.slice(CUSTOM_IMPORT_PREFIX.length);
    const definition = customFields.find((field) => field.key === key);

    return definition === undefined ? undefined : asImportField(definition);
  }

  return IMPORT_FIELDS[entity].find((field) => field.name === name);
};
