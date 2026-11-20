import { BadRequestException } from '@nestjs/common';

import { type CustomFieldDefinition } from './custom-field.entity';
import {
  CustomFieldFilterOperator,
  CustomFieldType,
} from './custom-field.types';
import { BERLIN_HEUTE_SQL, berlinWandzeitSql } from '../calendar/berlin-time';
import { pipelineBedingung } from '../crm/pipelines';
import { type StandardFeld } from './standard-felder';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export type FilterFeld =
  | (Pick<CustomFieldDefinition, 'key' | 'label' | 'type' | 'options'> &
      Partial<Pick<CustomFieldDefinition, 'gegenseite'>>)
  | StandardFeld;

const spalteVon = (feld: FilterFeld): string | null =>
  'spalte' in feld ? feld.spalte : null;

const ZEITPUNKT_SPALTEN = new Set(['createdAt', 'updatedAt', 'completedAt']);

export type FilterKontext = {
  firmaSichtbar?: SqlFragment | null;
};

export const FIRMA_REL = 'firma_rel';

const firmaAlias = (keyParam: string) => `firma_${keyParam}`;

const ueberAusdruck = (
  alias: string,
  feld: StandardFeld,
  keyParam: string,
  kontext: FilterKontext,
): string => {
  const ueber = feld.ueber as NonNullable<StandardFeld['ueber']>;
  const f = firmaAlias(keyParam);
  const sichtbar =
    kontext.firmaSichtbar === undefined || kontext.firmaSichtbar === null
      ? ''
      : ` AND ${kontext.firmaSichtbar.where.split(`${FIRMA_REL}."`).join(`${f}."`)}`;

  return `(SELECT ${f}."${feld.spalte}" FROM "${ueber.tabelle}" ${f} WHERE ${f}."id" = ${alias}."${ueber.fremdschluessel}" AND ${f}."workspaceId" = ${alias}."workspaceId" AND ${f}."deletedAt" IS NULL${sichtbar})`;
};

const TEXT_OPERATORS = [
  CustomFieldFilterOperator.EQUALS,
  CustomFieldFilterOperator.NOT_EQUALS,
  CustomFieldFilterOperator.CONTAINS,
  CustomFieldFilterOperator.NOT_CONTAINS,
  CustomFieldFilterOperator.STARTS_WITH,
  CustomFieldFilterOperator.IS_EMPTY,
  CustomFieldFilterOperator.IS_NOT_EMPTY,
];

const NUMBER_OPERATORS = [
  CustomFieldFilterOperator.EQUALS,
  CustomFieldFilterOperator.NOT_EQUALS,
  CustomFieldFilterOperator.GREATER_THAN,
  CustomFieldFilterOperator.LESS_THAN,
  CustomFieldFilterOperator.IS_EMPTY,
  CustomFieldFilterOperator.IS_NOT_EMPTY,
];

const COMPOSITE_OPERATORS = [
  CustomFieldFilterOperator.CONTAINS,
  CustomFieldFilterOperator.NOT_CONTAINS,
  CustomFieldFilterOperator.IS_EMPTY,
  CustomFieldFilterOperator.IS_NOT_EMPTY,
];

const ALLOWED: Record<CustomFieldType, CustomFieldFilterOperator[]> = {
  [CustomFieldType.TEXT]: TEXT_OPERATORS,
  [CustomFieldType.URL]: TEXT_OPERATORS,
  [CustomFieldType.EMAIL]: TEXT_OPERATORS,
  [CustomFieldType.PHONE]: TEXT_OPERATORS,
  [CustomFieldType.CURRENCY]: NUMBER_OPERATORS,
  [CustomFieldType.RATING]: NUMBER_OPERATORS,
  [CustomFieldType.MULTI_SELECT]: [
    CustomFieldFilterOperator.CONTAINS_ANY,
    CustomFieldFilterOperator.CONTAINS_NONE,
    CustomFieldFilterOperator.IS_EMPTY,
    CustomFieldFilterOperator.IS_NOT_EMPTY,
  ],
  [CustomFieldType.SELECT]: [
    CustomFieldFilterOperator.EQUALS,
    CustomFieldFilterOperator.NOT_EQUALS,
    CustomFieldFilterOperator.CONTAINS,
    CustomFieldFilterOperator.IS_EMPTY,
    CustomFieldFilterOperator.IS_NOT_EMPTY,
  ],
  [CustomFieldType.NUMBER]: [
    CustomFieldFilterOperator.EQUALS,
    CustomFieldFilterOperator.NOT_EQUALS,
    CustomFieldFilterOperator.GREATER_THAN,
    CustomFieldFilterOperator.LESS_THAN,
    CustomFieldFilterOperator.IS_EMPTY,
    CustomFieldFilterOperator.IS_NOT_EMPTY,
  ],
  [CustomFieldType.DATE]: [
    CustomFieldFilterOperator.EQUALS,
    CustomFieldFilterOperator.NOT_EQUALS,
    CustomFieldFilterOperator.GREATER_THAN,
    CustomFieldFilterOperator.LESS_THAN,
    CustomFieldFilterOperator.IN_LAST_DAYS,
    CustomFieldFilterOperator.IN_NEXT_DAYS,
    CustomFieldFilterOperator.OLDER_THAN_DAYS,
    CustomFieldFilterOperator.IS_EMPTY,
    CustomFieldFilterOperator.IS_NOT_EMPTY,
  ],
  [CustomFieldType.BOOLEAN]: [
    CustomFieldFilterOperator.EQUALS,
    CustomFieldFilterOperator.IS_EMPTY,
    CustomFieldFilterOperator.IS_NOT_EMPTY,
  ],
  [CustomFieldType.ADDRESS]: COMPOSITE_OPERATORS,
  [CustomFieldType.LINKS]: COMPOSITE_OPERATORS,
  [CustomFieldType.RELATION]: [
    CustomFieldFilterOperator.EQUALS,
    CustomFieldFilterOperator.NOT_EQUALS,
    CustomFieldFilterOperator.IS_EMPTY,
    CustomFieldFilterOperator.IS_NOT_EMPTY,
  ],
};

export const operatorPasst = (
  type: CustomFieldType,
  operator: CustomFieldFilterOperator,
): boolean => ALLOWED[type]?.includes(operator) ?? false;

const parseOptionList = (definition: FilterFeld, value: string): string[] => {
  let list: unknown = null;

  if (value.trim().startsWith('[')) {
    try {
      list = JSON.parse(value);
    } catch {
      list = null;
    }
  }

  const entries = (
    Array.isArray(list) ? list.map((entry) => String(entry)) : value.split(';')
  )
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');

  if (entries.length === 0) {
    throw new BadRequestException(
      `Für den Filter auf "${definition.label}" fehlt ein Wert.`,
    );
  }

  return entries;
};

export const comparableExpression = (
  alias: string,
  definition: FilterFeld,
  keyParam: string,
  kontext: FilterKontext = {},
): string => {
  const spalte = spalteVon(definition);
  const raw =
    spalte === null
      ? `(${alias}."customFields" ->> :${keyParam})`
      : 'ueber' in definition && definition.ueber !== undefined
        ? ueberAusdruck(alias, definition, keyParam, kontext)
        : 'ausdruck' in definition && definition.ausdruck !== undefined
          ? `(${definition.ausdruck(alias)})`
          : `${alias}."${spalte}"`;

  const objekt = `(${alias}."customFields" -> :${keyParam})`;

  switch (definition.type) {
    case CustomFieldType.NUMBER:
    case CustomFieldType.CURRENCY:
    case CustomFieldType.RATING:
      return `${raw}::numeric`;

    case CustomFieldType.DATE:
      return spalte !== null && ZEITPUNKT_SPALTEN.has(spalte)
        ? `${berlinWandzeitSql(raw)}::date`
        : `${raw}::date`;

    case CustomFieldType.ADDRESS:
      return `(${objekt} ->> 'ort')`;

    case CustomFieldType.LINKS:
      return `(${objekt} -> 0 ->> 'url')`;

    case CustomFieldType.BOOLEAN:
      return `${raw}::boolean`;

    default:
      return raw;
  }
};

export type SqlFragment = {
  where: string;
  parameters: Record<string, unknown>;
};

export const filterFragment = (
  alias: string,
  definition: FilterFeld,
  operator: CustomFieldFilterOperator,
  value: string | undefined,
  index: number,
  kontext: FilterKontext = {},
): SqlFragment => {
  const fragment = einFilter(
    alias,
    definition,
    operator,
    value,
    index,
    kontext,
  );
  const ueber =
    'ueber' in definition && definition.ueber !== undefined
      ? (kontext.firmaSichtbar ?? null)
      : null;

  return ueber === null
    ? fragment
    : {
        where: fragment.where,
        parameters: { ...ueber.parameters, ...fragment.parameters },
      };
};

const einFilter = (
  alias: string,
  definition: FilterFeld,
  operator: CustomFieldFilterOperator,
  value: string | undefined,
  index: number,
  kontext: FilterKontext,
): SqlFragment => {
  if (!operatorPasst(definition.type, operator)) {
    throw new BadRequestException(
      `Dieser Vergleich passt nicht zu "${definition.label}".`,
    );
  }

  if ('gegenseite' in definition && definition.gegenseite === true) {
    throw new BadRequestException(
      `Nach "${definition.label}" lässt sich nicht filtern.`,
    );
  }

  const keyParam = `cfKey${index}`;
  const valueParam = `cfValue${index}`;
  const parameters: Record<string, unknown> = { [keyParam]: definition.key };

  const needsValue = ![
    CustomFieldFilterOperator.IS_EMPTY,
    CustomFieldFilterOperator.IS_NOT_EMPTY,
  ].includes(operator);

  if (needsValue && (value === undefined || value.trim() === '')) {
    throw new BadRequestException(
      `Für den Filter auf "${definition.label}" fehlt ein Wert.`,
    );
  }

  const expression = comparableExpression(alias, definition, keyParam, kontext);
  const spalte = spalteVon(definition);

  if (
    definition.type === CustomFieldType.ADDRESS ||
    definition.type === CustomFieldType.LINKS
  ) {
    const objekt = `(${alias}."customFields" -> :${keyParam})`;
    const text =
      definition.type === CustomFieldType.ADDRESS
        ? `concat_ws(' ', ${objekt} ->> 'strasse', ${objekt} ->> 'zusatz', ${objekt} ->> 'plz', ${objekt} ->> 'ort', ${objekt} ->> 'bundesland', ${objekt} ->> 'land')`
        : `(SELECT string_agg(concat_ws(' ', link ->> 'url', link ->> 'label'), ' ') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${objekt}) = 'array' THEN ${objekt} ELSE '[]'::jsonb END) AS link)`;

    if (operator === CustomFieldFilterOperator.CONTAINS) {
      return {
        where: `${text} ILIKE :${valueParam}`,
        parameters: {
          ...parameters,
          [valueParam]: `%${ohneJoker(value as string)}%`,
        },
      };
    }

    if (operator === CustomFieldFilterOperator.NOT_CONTAINS) {
      return {
        where: `COALESCE(${text}, '') NOT ILIKE :${valueParam}`,
        parameters: {
          ...parameters,
          [valueParam]: `%${ohneJoker(value as string)}%`,
        },
      };
    }
  }

  if (
    definition.type === CustomFieldType.RELATION &&
    (operator === CustomFieldFilterOperator.EQUALS ||
      operator === CustomFieldFilterOperator.NOT_EQUALS)
  ) {
    const id = (value ?? '').trim().toLowerCase();

    if (!UUID.test(id)) {
      throw new BadRequestException(
        `"${definition.label}" wird mit einem Datensatz verglichen.`,
      );
    }

    const enthaelt = `COALESCE((${alias}."customFields" -> :${keyParam}) @> to_jsonb(CAST(:${valueParam} AS text)), false)`;

    return {
      where:
        operator === CustomFieldFilterOperator.EQUALS
          ? enthaelt
          : `NOT ${enthaelt}`,
      parameters: { ...parameters, [valueParam]: id },
    };
  }

  if (spalte === 'pipelineId') {
    delete parameters[keyParam];

    if (
      (operator !== CustomFieldFilterOperator.EQUALS &&
        operator !== CustomFieldFilterOperator.NOT_EQUALS) ||
      !UUID.test(value ?? '')
    ) {
      throw new BadRequestException(
        'Die Pipeline wird mit „ist“ oder „ist nicht“ und einer Pipeline verglichen.',
      );
    }

    const bedingung = pipelineBedingung(alias, `CAST(:${valueParam} AS uuid)`);

    return {
      where:
        operator === CustomFieldFilterOperator.EQUALS
          ? bedingung
          : `NOT ${bedingung}`,
      parameters: { ...parameters, [valueParam]: value },
    };
  }

  if (spalte !== null) {
    delete parameters[keyParam];

    if (operator === CustomFieldFilterOperator.IS_EMPTY) {
      return { where: `NULLIF(${expression}::text, '') IS NULL`, parameters };
    }

    if (operator === CustomFieldFilterOperator.IS_NOT_EMPTY) {
      return {
        where: `NULLIF(${expression}::text, '') IS NOT NULL`,
        parameters,
      };
    }

    if (operator === CustomFieldFilterOperator.EQUALS) {
      return definition.type === CustomFieldType.TEXT
        ? {
            where: `lower(${expression}) = lower(:${valueParam})`,
            parameters: { ...parameters, [valueParam]: value as string },
          }
        : {
            where: `${expression} = :${valueParam}`,
            parameters: {
              ...parameters,
              [valueParam]: typedValue(definition, value as string),
            },
          };
    }
  }

  switch (operator) {
    case CustomFieldFilterOperator.NOT_CONTAINS:
      return {
        where: `COALESCE(${expression}, '') NOT ILIKE :${valueParam}`,
        parameters: {
          ...parameters,
          [valueParam]: `%${ohneJoker(value as string)}%`,
        },
      };

    case CustomFieldFilterOperator.STARTS_WITH:
      return {
        where: `${expression} ILIKE :${valueParam}`,
        parameters: {
          ...parameters,
          [valueParam]: `${ohneJoker(value as string)}%`,
        },
      };

    case CustomFieldFilterOperator.IN_LAST_DAYS:
      return {
        where: `(${expression} >= ${BERLIN_HEUTE_SQL} - CAST(:${valueParam} AS integer) AND ${expression} <= ${BERLIN_HEUTE_SQL})`,
        parameters: { ...parameters, [valueParam]: tage(definition, value) },
      };

    case CustomFieldFilterOperator.IN_NEXT_DAYS:
      return {
        where: `(${expression} >= ${BERLIN_HEUTE_SQL} AND ${expression} <= ${BERLIN_HEUTE_SQL} + CAST(:${valueParam} AS integer))`,
        parameters: { ...parameters, [valueParam]: tage(definition, value) },
      };

    case CustomFieldFilterOperator.OLDER_THAN_DAYS:
      return {
        where: `${expression} < ${BERLIN_HEUTE_SQL} - CAST(:${valueParam} AS integer)`,
        parameters: { ...parameters, [valueParam]: tage(definition, value) },
      };

    case CustomFieldFilterOperator.IS_EMPTY:
      return {
        where: `(${alias}."customFields" ->> :${keyParam}) IS NULL`,
        parameters,
      };

    case CustomFieldFilterOperator.IS_NOT_EMPTY:
      return {
        where: `(${alias}."customFields" ->> :${keyParam}) IS NOT NULL`,
        parameters,
      };

    case CustomFieldFilterOperator.EQUALS: {
      const typed = typedValue(definition, value as string);

      return {
        where: `${alias}."customFields" @> CAST(:${valueParam} AS jsonb)`,
        parameters: {
          ...parameters,
          [valueParam]: JSON.stringify({ [definition.key]: typed }),
        },
      };
    }

    case CustomFieldFilterOperator.NOT_EQUALS:
      return {
        where: `(${expression} IS DISTINCT FROM :${valueParam})`,
        parameters: {
          ...parameters,
          [valueParam]: typedValue(definition, value as string),
        },
      };

    case CustomFieldFilterOperator.CONTAINS_ANY:
      return {
        where: `COALESCE((${alias}."customFields" -> :${keyParam}) ?| CAST(:${valueParam} AS text[]), false)`,
        parameters: {
          ...parameters,
          [valueParam]: parseOptionList(definition, value as string),
        },
      };

    case CustomFieldFilterOperator.CONTAINS_NONE:
      return {
        where: `NOT COALESCE((${alias}."customFields" -> :${keyParam}) ?| CAST(:${valueParam} AS text[]), false)`,
        parameters: {
          ...parameters,
          [valueParam]: parseOptionList(definition, value as string),
        },
      };

    case CustomFieldFilterOperator.CONTAINS:
      return {
        where: `${expression} ILIKE :${valueParam}`,
        parameters: {
          ...parameters,
          [valueParam]: `%${ohneJoker(value as string)}%`,
        },
      };

    case CustomFieldFilterOperator.GREATER_THAN:
      return {
        where: `${expression} > :${valueParam}`,
        parameters: {
          ...parameters,
          [valueParam]: typedValue(definition, value as string),
        },
      };

    case CustomFieldFilterOperator.LESS_THAN:
      return {
        where: `${expression} < :${valueParam}`,
        parameters: {
          ...parameters,
          [valueParam]: typedValue(definition, value as string),
        },
      };

    default:
      throw new BadRequestException('Dieser Vergleich wird nicht unterstützt.');
  }
};

const ohneJoker = (text: string): string => text.replace(/[\\%_]/g, '\\$&');

const tage = (definition: FilterFeld, value: string | undefined): number => {
  const anzahl = Number(value);

  if (!Number.isInteger(anzahl) || anzahl < 0 || anzahl > 3650) {
    throw new BadRequestException(
      `Für "${definition.label}" braucht es eine Anzahl Tage zwischen 0 und 3650.`,
    );
  }

  return anzahl;
};

const typedValue = (
  definition: FilterFeld,
  value: string,
): string | number | boolean => {
  switch (definition.type) {
    case CustomFieldType.NUMBER:
    case CustomFieldType.CURRENCY:
    case CustomFieldType.RATING: {
      const numeric = Number(value.replace(',', '.'));

      if (!Number.isFinite(numeric)) {
        throw new BadRequestException(
          `"${definition.label}" wird mit einer Zahl verglichen.`,
        );
      }

      return numeric;
    }

    case CustomFieldType.BOOLEAN: {
      const text = value.toLowerCase();

      if (['true', 'ja', '1'].includes(text)) {
        return true;
      }

      if (['false', 'nein', '0'].includes(text)) {
        return false;
      }

      throw new BadRequestException(
        `"${definition.label}" wird mit ja oder nein verglichen.`,
      );
    }

    case CustomFieldType.DATE: {
      const parsed = new Date(value);

      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException(
          `"${definition.label}" wird mit einem Datum verglichen.`,
        );
      }

      return parsed.toISOString().slice(0, 10);
    }

    case CustomFieldType.EMAIL:
      return value.trim().toLowerCase();

    case CustomFieldType.PHONE:
      return value.trim().replace(/[ ()/.-]/g, '');

    default:
      return value;
  }
};
