import { type GraphQLSchema, graphql } from 'graphql';

import { deutscherSatz } from '../observability/deutsche-meldung';
import { type Abfrage } from './mcp-werkzeuge';

export const fuehreAus = async (
  schema: GraphQLSchema,
  abfragen: Abfrage[],
  kontext: { req: unknown } & Record<string, unknown>,
): Promise<{ ergebnis: Record<string, unknown>; meldungen: string[] }> => {
  const ergebnis: Record<string, unknown> = {};
  const meldungen: string[] = [];

  for (const abfrage of abfragen) {
    const antwort = await graphql({
      schema,
      source: abfrage.query,
      variableValues: abfrage.variables,
      contextValue: kontext,
    });

    if (antwort.errors !== undefined && antwort.errors.length > 0) {
      meldungen.push(
        ...antwort.errors.map((problem) => deutscherSatz(problem.message)),
      );
      continue;
    }

    const daten = antwort.data as Record<string, unknown> | null;

    ergebnis[abfrage.schluessel] =
      daten === null || daten === undefined ? null : Object.values(daten)[0];
  }

  return { ergebnis, meldungen };
};
