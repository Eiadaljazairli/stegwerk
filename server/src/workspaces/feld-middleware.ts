import { type FieldMiddleware } from '@nestjs/graphql';

import {
  type FeldArt,
  feldrechteJetzt,
  istVerborgen,
  ohneVerborgeneEigene,
} from './feldrechte';

export const verbirgFeld =
  (schluessel: string): FieldMiddleware =>
  async (_kontext, next) => {
    const wert: unknown = await next();

    return (await istVerborgen(schluessel)) ? null : wert;
  };

export const verbirgListe =
  (schluessel: string): FieldMiddleware =>
  async (_kontext, next) => {
    const wert: unknown = await next();

    return (await istVerborgen(schluessel)) ? [] : (wert ?? []);
  };

export const verbirgEigeneFelder =
  (art: FeldArt): FieldMiddleware =>
  async (_kontext, next) => {
    const wert = (await next()) as Record<string, unknown> | null | undefined;

    return ohneVerborgeneEigene(await feldrechteJetzt(), art, wert);
  };
