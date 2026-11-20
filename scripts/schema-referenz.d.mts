// Typen zu schema-referenz.mjs, für den Test in web/src/lib.
import { type Referenz } from '../web/src/lib/schema-referenz';

export declare const operationenAusResolvern: (
  texte: string[],
) => Map<string, { schluessel: boolean }>;

export declare const erzeugeReferenz: (
  schemaText: string,
  resolverTexte: string[],
) => Referenz;

export declare const referenzAusRepository: (wurzel?: string) => Referenz;
