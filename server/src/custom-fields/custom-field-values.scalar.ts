import { BadRequestException } from '@nestjs/common';
import { GraphQLScalarType, Kind, type ValueNode } from 'graphql';

import { type CustomFieldValues } from './custom-field.types';

const MAX_LIST = 50;

const isFlatTextObject = (value: unknown, maxKeys: number): boolean =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length <= maxKeys &&
  Object.values(value).every(
    (entry) => entry === null || typeof entry === 'string',
  );

const isAllowedValue = (value: unknown): boolean =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  (Array.isArray(value) &&
    value.length <= MAX_LIST &&
    value.every(
      (entry) => typeof entry === 'string' || isFlatTextObject(entry, 2),
    )) ||
  isFlatTextObject(value, 6);

const check = (value: unknown): CustomFieldValues => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BadRequestException('Eigene Felder müssen ein Objekt sein.');
  }

  for (const [key, entry] of Object.entries(value)) {
    if (!isAllowedValue(entry)) {
      throw new BadRequestException(
        `Das eigene Feld "${key}" nimmt Text, eine Zahl, ja/nein, eine Liste, eine Anschrift oder nichts.`,
      );
    }
  }

  return value as CustomFieldValues;
};

const fromLiteral = (node: ValueNode): unknown => {
  switch (node.kind) {
    case Kind.STRING:
    case Kind.ENUM:
      return node.value;

    case Kind.INT:
      return Number.parseInt(node.value, 10);

    case Kind.FLOAT:
      return Number.parseFloat(node.value);

    case Kind.BOOLEAN:
      return node.value;

    case Kind.NULL:
      return null;

    case Kind.LIST:
      return node.values.map((entry) => fromLiteral(entry));

    case Kind.OBJECT:
      return Object.fromEntries(
        node.fields.map((field) => [
          field.name.value,
          fromLiteral(field.value),
        ]),
      );

    default:
      throw new BadRequestException(
        'Ein Wert in den eigenen Feldern hat eine Form, die nicht vorgesehen ist.',
      );
  }
};

export const CustomFieldValuesScalar = new GraphQLScalarType({
  name: 'CustomFieldValues',
  description:
    'A flat object of custom field values: text, numbers, true/false, a list of texts, or null.',
  serialize: (value) => check(value),
  parseValue: (value) => check(value),
  parseLiteral: (node) => check(fromLiteral(node)),
});
