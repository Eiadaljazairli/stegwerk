import { berlinWandzeitSql } from '../calendar/berlin-time';
import { type CustomFieldDefinition } from './custom-field.entity';
import { CustomFieldEntity, CustomFieldType } from './custom-field.types';
import { HERKUNFTE } from '../crm/herkunft';

export const STANDARD_PREFIX = 'std:';

export type StandardFeld = Pick<
  CustomFieldDefinition,
  'key' | 'label' | 'type' | 'options'
> & {
  spalte: string;
  ueber?: Ueber;
  ausdruck?: (alias: string) => string;
};

export type Ueber = {
  art: 'company';
  tabelle: 'companies';
  fremdschluessel: 'companyId';
};

const FIRMA: Ueber = {
  art: 'company',
  tabelle: 'companies',
  fremdschluessel: 'companyId',
};

const firmenFeld = (
  spalte: string,
  label: string,
  type: CustomFieldType,
): StandardFeld => ({
  key: `${STANDARD_PREFIX}firma.${spalte}`,
  label: `Firma: ${label}`,
  type,
  options: [],
  spalte,
  ueber: FIRMA,
});

const FIRMEN_FELDER = (): StandardFeld[] => [
  firmenFeld('name', 'Name', CustomFieldType.TEXT),
  firmenFeld('industry', 'Branche', CustomFieldType.TEXT),
  firmenFeld('city', 'Stadt', CustomFieldType.TEXT),
  firmenFeld('postalCode', 'PLZ', CustomFieldType.TEXT),
  firmenFeld('country', 'Land', CustomFieldType.TEXT),
  firmenFeld('employeeCount', 'Mitarbeiter', CustomFieldType.NUMBER),
  firmenFeld('annualRevenue', 'Jahresumsatz', CustomFieldType.NUMBER),
];

const feld = (
  spalte: string,
  label: string,
  type: CustomFieldType,
): StandardFeld => ({
  key: `${STANDARD_PREFIX}${spalte}`,
  label,
  type,
  options: [],
  spalte,
});

const ANGELEGT = feld('createdAt', 'Angelegt am', CustomFieldType.DATE);

const HERKUNFT: StandardFeld = {
  ...feld('herkunft', 'Herkunft', CustomFieldType.SELECT),
  options: [...HERKUNFTE],
};
const GEAENDERT = feld('updatedAt', 'Geändert am', CustomFieldType.DATE);

export const abgeschlossenAm = (alias: string): string =>
  `COALESCE(${alias}."closeDate", ${berlinWandzeitSql(`${alias}."updatedAt"`)}::date)`;

const ABGESCHLOSSEN: StandardFeld = {
  ...feld('closeDate', 'Abschluss, sonst geändert am', CustomFieldType.DATE),
  key: `${STANDARD_PREFIX}abgeschlossen`,
  ausdruck: abgeschlossenAm,
};

export const STANDARD_FELDER: Record<CustomFieldEntity, StandardFeld[]> = {
  [CustomFieldEntity.COMPANY]: [
    feld('name', 'Name', CustomFieldType.TEXT),
    feld('domain', 'Domain', CustomFieldType.TEXT),
    feld('website', 'Website', CustomFieldType.TEXT),
    feld('linkedin', 'LinkedIn', CustomFieldType.TEXT),
    feld('industry', 'Branche', CustomFieldType.TEXT),
    feld('city', 'Stadt', CustomFieldType.TEXT),
    feld('postalCode', 'PLZ', CustomFieldType.TEXT),
    feld('country', 'Land', CustomFieldType.TEXT),
    feld('phone', 'Telefon', CustomFieldType.TEXT),
    feld('email', 'E-Mail', CustomFieldType.TEXT),
    feld('registernummer', 'Registernummer', CustomFieldType.TEXT),
    feld('ustIdNr', 'USt-IdNr.', CustomFieldType.TEXT),
    feld('employeeCount', 'Mitarbeiter', CustomFieldType.NUMBER),
    feld('annualRevenue', 'Jahresumsatz', CustomFieldType.NUMBER),
    HERKUNFT,
    ANGELEGT,
    GEAENDERT,
  ],
  [CustomFieldEntity.CONTACT]: [
    feld('firstName', 'Vorname', CustomFieldType.TEXT),
    feld('lastName', 'Nachname', CustomFieldType.TEXT),
    feld('email', 'E-Mail', CustomFieldType.TEXT),
    feld('phone', 'Telefon', CustomFieldType.TEXT),
    feld('jobTitle', 'Position', CustomFieldType.TEXT),
    feld('city', 'Stadt', CustomFieldType.TEXT),
    feld('postalCode', 'PLZ', CustomFieldType.TEXT),
    feld('country', 'Land', CustomFieldType.TEXT),
    feld('linkedin', 'LinkedIn', CustomFieldType.TEXT),
    HERKUNFT,
    ANGELEGT,
    GEAENDERT,
    ...FIRMEN_FELDER(),
  ],
  [CustomFieldEntity.DEAL]: [
    feld('name', 'Bezeichnung', CustomFieldType.TEXT),
    feld('amount', 'Betrag', CustomFieldType.NUMBER),
    feld('closeDate', 'Abschluss', CustomFieldType.DATE),
    ABGESCHLOSSEN,
    feld('probability', 'Wahrscheinlichkeit', CustomFieldType.NUMBER),
    feld('lostReason', 'Verlustgrund', CustomFieldType.TEXT),
    feld('pipelineId', 'Pipeline', CustomFieldType.SELECT),
    HERKUNFT,
    ANGELEGT,
    GEAENDERT,
    ...FIRMEN_FELDER(),
  ],
  [CustomFieldEntity.TASK]: [
    feld('title', 'Titel', CustomFieldType.TEXT),
    feld('dueDate', 'Fällig', CustomFieldType.DATE),
    feld('completedAt', 'Erledigt am', CustomFieldType.DATE),
    ANGELEGT,
  ],
};

export const standardFeld = (
  entity: CustomFieldEntity,
  key: string,
): StandardFeld | undefined =>
  STANDARD_FELDER[entity].find((eintrag) => eintrag.key === key);

export const istStandardFeld = (
  feld: Pick<CustomFieldDefinition, 'key'>,
): feld is StandardFeld => 'spalte' in feld;
