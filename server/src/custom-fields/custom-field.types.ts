import { registerEnumType } from '@nestjs/graphql';

export enum CustomFieldType {
  TEXT = 'text',
  NUMBER = 'number',
  DATE = 'date',
  BOOLEAN = 'boolean',
  SELECT = 'select',
  MULTI_SELECT = 'multi_select',
  CURRENCY = 'currency',
  URL = 'url',
  EMAIL = 'email',
  PHONE = 'phone',
  RATING = 'rating',
  ADDRESS = 'address',
  LINKS = 'links',
  RELATION = 'relation',
}

export type Adresse = {
  strasse?: string;
  zusatz?: string;
  plz?: string;
  ort?: string;
  bundesland?: string;
  land?: string;
};

export const ADRESS_TEILE = [
  'strasse',
  'zusatz',
  'plz',
  'ort',
  'bundesland',
  'land',
] as const;

export type AdressTeil = (typeof ADRESS_TEILE)[number];

export type Link = { url: string; label?: string };

export const ZAHLFORMATE = ['zahl', 'prozent'] as const;

export type Zahlformat = (typeof ZAHLFORMATE)[number];

export const DATUMSFORMATE = ['absolut', 'relativ'] as const;

export type Datumsformat = (typeof DATUMSFORMATE)[number];

export type FeldEinstellungen = {
  nachkommastellen?: number;
  zahlformat?: Zahlformat;
  datumsformat?: Datumsformat;
};

export const MAX_LINKS = 10;
export const MAX_ADRESS_TEIL = 200;

export const OPTION_FARBEN = [
  'grau',
  'rot',
  'orange',
  'gelb',
  'gruen',
  'blau',
  'lila',
  'pink',
] as const;

export type OptionFarbe = (typeof OPTION_FARBEN)[number];

export const MIT_MOEGLICHKEITEN: CustomFieldType[] = [
  CustomFieldType.SELECT,
  CustomFieldType.MULTI_SELECT,
];

export const EINDEUTIG_MOEGLICH: CustomFieldType[] = [
  CustomFieldType.TEXT,
  CustomFieldType.NUMBER,
  CustomFieldType.DATE,
  CustomFieldType.SELECT,
  CustomFieldType.CURRENCY,
  CustomFieldType.URL,
  CustomFieldType.EMAIL,
  CustomFieldType.PHONE,
];

export enum CustomFieldEntity {
  COMPANY = 'company',
  CONTACT = 'contact',
  DEAL = 'deal',
  TASK = 'task',
}

export const VERWEIS_ARTEN: CustomFieldEntity[] = [
  CustomFieldEntity.COMPANY,
  CustomFieldEntity.CONTACT,
  CustomFieldEntity.DEAL,
];

export const MAX_VERWEISE = 50;

registerEnumType(CustomFieldType, { name: 'CustomFieldType' });
registerEnumType(CustomFieldEntity, { name: 'CustomFieldEntity' });

export enum CustomFieldFilterOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  CONTAINS = 'contains',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  IS_EMPTY = 'is_empty',
  IS_NOT_EMPTY = 'is_not_empty',
  CONTAINS_ANY = 'contains_any',
  CONTAINS_NONE = 'contains_none',
  NOT_CONTAINS = 'not_contains',
  STARTS_WITH = 'starts_with',
  IN_LAST_DAYS = 'in_last_days',
  IN_NEXT_DAYS = 'in_next_days',
  OLDER_THAN_DAYS = 'older_than_days',
}

registerEnumType(CustomFieldFilterOperator, {
  name: 'CustomFieldFilterOperator',
});

export const CUSTOM_SORT_PREFIX = 'custom:';

export type CustomFieldValue =
  | string
  | number
  | boolean
  | string[]
  | Adresse
  | Link[]
  | null;

export type CustomFieldValues = Record<string, CustomFieldValue>;

export const MAX_FIELDS_PER_ENTITY = 30;
export const MAX_TEXT_LENGTH = 500;
export const MAX_SELECT_OPTIONS = 50;
export const STANDARD_WAEHRUNG = 'EUR';
