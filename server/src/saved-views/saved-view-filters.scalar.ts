import { BadRequestException } from '@nestjs/common';
import { GraphQLScalarType, Kind, type ValueNode } from 'graphql';

const MAX_FILTERS = 10;

const MAX_GRUPPE = 5;

const isFilter = (entry: unknown): boolean => {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    return false;
  }

  const record = entry as Record<string, unknown>;
  const keys = Object.keys(record);

  if (
    keys.some((key) => !['key', 'operator', 'value', 'gruppe'].includes(key))
  ) {
    return false;
  }

  return (
    typeof record.key === 'string' &&
    typeof record.operator === 'string' &&
    (record.value === undefined ||
      record.value === null ||
      typeof record.value === 'string') &&
    (record.gruppe === undefined ||
      record.gruppe === null ||
      (typeof record.gruppe === 'number' &&
        Number.isInteger(record.gruppe) &&
        record.gruppe >= 1 &&
        record.gruppe <= MAX_GRUPPE))
  );
};

const check = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) {
    throw new BadRequestException('Filter müssen eine Liste sein.');
  }

  if (value.length > MAX_FILTERS) {
    throw new BadRequestException(
      `Eine Ansicht kann höchstens ${MAX_FILTERS} Filter enthalten.`,
    );
  }

  for (const entry of value) {
    if (!isFilter(entry)) {
      throw new BadRequestException(
        'Jeder Filter braucht ein Feld und einen Vergleich; ein Wert ist freigestellt.',
      );
    }
  }

  return value;
};

const fromLiteral = (node: ValueNode): unknown => {
  switch (node.kind) {
    case Kind.STRING:
    case Kind.ENUM:
      return node.value;

    case Kind.INT:
      return Number(node.value);

    case Kind.NULL:
      return null;

    case Kind.LIST:
      return node.values.map(fromLiteral);

    case Kind.OBJECT:
      return Object.fromEntries(
        node.fields.map((field) => [
          field.name.value,
          fromLiteral(field.value),
        ]),
      );

    default:
      throw new BadRequestException(
        'Ein Wert in den Filtern hat eine Form, die nicht vorgesehen ist.',
      );
  }
};

export const SavedViewFiltersScalar = new GraphQLScalarType({
  name: 'SavedViewFilters',
  description:
    'A list of custom field comparisons: { key, operator, value? } entries.',
  serialize: (value) => check(value),
  parseValue: (value) => check(value),
  parseLiteral: (node) => check(fromLiteral(node)),
});

const MAX_COLUMNS = 30;

const MAX_COLUMN_KEY = 80;

const checkColumns = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    throw new BadRequestException('Spalten müssen eine Liste sein.');
  }

  if (value.length > MAX_COLUMNS) {
    throw new BadRequestException(
      `Eine Ansicht kann höchstens ${MAX_COLUMNS} Spalten enthalten.`,
    );
  }

  for (const entry of value) {
    if (typeof entry !== 'string' || entry === '') {
      throw new BadRequestException('Jede Spalte ist ein nicht leerer Name.');
    }

    if (entry.length > MAX_COLUMN_KEY) {
      throw new BadRequestException('Dieser Spaltenname ist zu lang.');
    }
  }

  if (new Set(value as string[]).size !== value.length) {
    throw new BadRequestException('Eine Spalte darf nur einmal vorkommen.');
  }

  return value as string[];
};

export const SavedViewColumnsScalar = new GraphQLScalarType({
  name: 'SavedViewColumns',
  description: 'The column keys a list shows, in order.',
  serialize: (value) => checkColumns(value),
  parseValue: (value) => checkColumns(value),
  parseLiteral: (node) => checkColumns(fromLiteral(node)),
});
