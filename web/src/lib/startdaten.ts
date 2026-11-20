import {
  type DefinitionNode,
  type DocumentNode,
  Kind,
  type OperationDefinitionNode,
} from 'graphql';

import { TEAM_NAMEN } from '../components/Verantwortlich';
import {
  BETRIEBS_HINWEIS,
  ENTITLEMENT,
  ICH_BIN_BETREIBER,
  LEERLAUF,
  ME,
  MEINE_FAVORITEN,
  MY_MAILBOX,
  MY_PERMISSIONS,
  OBJEKT_BEZEICHNUNGEN,
  PIPELINES,
  UNGELESENE_BENACHRICHTIGUNGEN,
  ZWEI_FAKTOR_VERLANGT,
} from './queries';

export const START_ABFRAGEN: DocumentNode[] = [
  ME,
  ENTITLEMENT,
  MY_MAILBOX,
  ZWEI_FAKTOR_VERLANGT,
  ICH_BIN_BETREIBER,
  MY_PERMISSIONS,
  PIPELINES,
  BETRIEBS_HINWEIS,
  TEAM_NAMEN,
  MEINE_FAVORITEN,
  UNGELESENE_BENACHRICHTIGUNGEN,
  LEERLAUF,
  OBJEKT_BEZEICHNUNGEN,
];

const operationVon = (dokument: DocumentNode): OperationDefinitionNode => {
  const operation = dokument.definitions.find(
    (definition): definition is OperationDefinitionNode =>
      definition.kind === Kind.OPERATION_DEFINITION,
  );

  if (operation === undefined || operation.operation !== 'query') {
    throw new Error('Nur Abfragen lassen sich zusammenlegen.');
  }

  if ((operation.variableDefinitions ?? []).length > 0) {
    throw new Error(
      `${operation.name?.value ?? 'Abfrage'} hat Variablen und gehört nicht in die Startabfrage.`,
    );
  }

  return operation;
};

export const vereinige = (
  name: string,
  dokumente: DocumentNode[],
): DocumentNode => {
  const fragmente = new Map<string, DefinitionNode>();

  for (const dokument of dokumente) {
    for (const definition of dokument.definitions) {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) {
        fragmente.set(definition.name.value, definition);
      }
    }
  }

  return {
    kind: Kind.DOCUMENT,
    definitions: [
      {
        kind: Kind.OPERATION_DEFINITION,
        operation: 'query' as OperationDefinitionNode['operation'],
        name: { kind: Kind.NAME, value: name },
        variableDefinitions: [],
        directives: [],
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: dokumente.flatMap(
            (dokument) => operationVon(dokument).selectionSet.selections,
          ),
        },
      },
      ...fragmente.values(),
    ],
  };
};

export const APP_START = vereinige('AppStart', START_ABFRAGEN);

export const fehlerhafteFelder = (
  fehler: readonly { path?: readonly (string | number)[] }[] | undefined,
): string[] => [
  ...new Set(
    (fehler ?? [])
      .map((eintrag) => eintrag.path?.[0])
      .filter((feld): feld is string => typeof feld === 'string'),
  ),
];
