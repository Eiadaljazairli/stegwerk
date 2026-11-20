#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildSchema,
  getNamedType,
  isEnumType,
  isInputObjectType,
  isObjectType,
  isScalarType,
} from 'graphql';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..');

const klammerInhalt = (text, start) => {
  let tiefe = 0;

  for (let i = start; i < text.length; i += 1) {
    const zeichen = text[i];

    if (zeichen === '(') {
      tiefe += 1;
    } else if (zeichen === ')') {
      tiefe -= 1;

      if (tiefe === 0) {
        return { inhalt: text.slice(start + 1, i), ende: i + 1 };
      }
    }
  }

  throw new Error('Klammer ohne Ende');
};

const wachen = (block) => {
  const gefunden = new Set();

  for (const treffer of block.matchAll(/@UseGuards\(/gu)) {
    const { inhalt } = klammerInhalt(
      block,
      treffer.index + 'UseGuards'.length + 1,
    );

    for (const name of inhalt.split(',')) {
      const sauber = name.trim();

      if (sauber !== '') {
        gefunden.add(sauber);
      }
    }
  }

  return gefunden;
};

export const operationenAusResolvern = (texte) => {
  const ergebnis = new Map();

  for (const text of texte) {
    const klassen = [...text.matchAll(/^export class \w+/gmu)];

    klassen.forEach((klasse, nummer) => {
      const vorher = text.slice(
        nummer === 0 ? 0 : (klassen[nummer - 1].index ?? 0),
        klasse.index,
      );
      const resolverStelle = vorher.lastIndexOf('@Resolver(');

      if (resolverStelle === -1) {
        return;
      }

      const klassenWachen = wachen(vorher.slice(resolverStelle));
      const rumpf = text.slice(
        klasse.index,
        nummer + 1 < klassen.length ? klassen[nummer + 1].index : text.length,
      );

      for (const treffer of rumpf.matchAll(/@(Query|Mutation)\(/gu)) {
        const art = treffer[1];
        const { inhalt, ende } = klammerInhalt(
          rumpf,
          treffer.index + art.length + 1,
        );
        const anfang = Math.max(
          rumpf.lastIndexOf('\n\n', treffer.index),
          rumpf.lastIndexOf('{\n', treffer.index),
        );
        const signatur = /\n\s*(?:async\s+)?(\w+)\s*\(/u.exec(
          rumpf.slice(ende),
        );

        if (signatur === null) {
          throw new Error(`Methode zu @${art} nicht gefunden`);
        }

        const block = rumpf.slice(anfang, ende + signatur.index);
        const name = /\bname:\s*'([^']+)'/u.exec(inhalt)?.[1] ?? signatur[1];
        const alle = new Set([...klassenWachen, ...wachen(block)]);

        ergebnis.set(`${art}.${name}`, {
          schluessel: alle.has('GqlAuthGuard') && !alle.has('NurMenschWache'),
        });
      }
    });
  }

  return ergebnis;
};

const typText = (typ) => String(typ);

const argumente = (feld) =>
  feld.args.map((arg) => ({
    name: arg.name,
    typ: typText(arg.type),
    ...(arg.defaultValue === undefined
      ? {}
      : { vorgabe: JSON.stringify(arg.defaultValue) }),
  }));

const nachName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

export const erzeugeReferenz = (schemaText, resolverTexte) => {
  const schema = buildSchema(schemaText);
  const operationen = operationenAusResolvern(resolverTexte);
  const fehlend = [];
  const erreichte = new Set();
  const offen = [];

  const merke = (typ) => {
    const name = getNamedType(typ).name;

    if (!erreichte.has(name)) {
      erreichte.add(name);
      offen.push(name);
    }
  };

  const liste = (wurzel, art) => {
    if (wurzel === null || wurzel === undefined) {
      return [];
    }

    return Object.values(wurzel.getFields())
      .filter((feld) => {
        const eintrag = operationen.get(`${art}.${feld.name}`);

        if (eintrag === undefined) {
          fehlend.push(`${art}.${feld.name}`);

          return false;
        }

        return eintrag.schluessel;
      })
      .map((feld) => {
        feld.args.forEach((arg) => merke(arg.type));
        merke(feld.type);

        return {
          name: feld.name,
          ...(feld.description ? { beschreibung: feld.description } : {}),
          argumente: argumente(feld),
          rueckgabe: typText(feld.type),
        };
      })
      .sort(nachName);
  };

  const abfragen = liste(schema.getQueryType(), 'Query');
  const aenderungen = liste(schema.getMutationType(), 'Mutation');

  if (fehlend.length > 0) {
    throw new Error(
      `Ohne Resolver im Quelltext: ${fehlend.join(', ')}. Das Skript liest die Dekoratoren; steht die Operation anders da, hier nachziehen.`,
    );
  }

  const typen = [];

  while (offen.length > 0) {
    const typ = schema.getType(offen.shift());

    if (typ === undefined || typ === null) {
      continue;
    }

    if (isScalarType(typ)) {
      if (!['String', 'Int', 'Float', 'Boolean', 'ID'].includes(typ.name)) {
        typen.push({
          name: typ.name,
          art: 'skalar',
          ...(typ.description ? { beschreibung: typ.description } : {}),
        });
      }
    } else if (isEnumType(typ)) {
      typen.push({
        name: typ.name,
        art: 'aufzaehlung',
        werte: typ.getValues().map((wert) => wert.name),
      });
    } else if (isObjectType(typ) || isInputObjectType(typ)) {
      typen.push({
        name: typ.name,
        art: isObjectType(typ) ? 'objekt' : 'eingabe',
        ...(typ.description ? { beschreibung: typ.description } : {}),
        felder: Object.values(typ.getFields())
          .map((feld) => {
            merke(feld.type);
            (feld.args ?? []).forEach((arg) => merke(arg.type));

            return {
              name: feld.name,
              typ: typText(feld.type),
              ...((feld.args ?? []).length > 0
                ? { argumente: argumente(feld) }
                : {}),
            };
          })
          .sort(nachName),
      });
    }
  }

  return { abfragen, aenderungen, typen: typen.sort(nachName) };
};

const resolverDateien = (ordner) =>
  readdirSync(ordner).flatMap((name) => {
    const pfad = join(ordner, name);

    return statSync(pfad).isDirectory()
      ? resolverDateien(pfad)
      : name.endsWith('.resolver.ts')
        ? [pfad]
        : [];
  });

export const referenzAusRepository = (wurzel = WURZEL) =>
  erzeugeReferenz(
    readFileSync(join(wurzel, 'server/schema.gql'), 'utf8'),
    resolverDateien(join(wurzel, 'server/src'))
      .sort()
      .map((datei) => readFileSync(datei, 'utf8')),
  );

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const referenz = referenzAusRepository();
  const ziel = join(WURZEL, 'web/src/lib/schema-referenz.json');

  writeFileSync(ziel, `${JSON.stringify(referenz, null, 2)}\n`);
  // oxlint-disable-next-line no-console
  console.log(
    `${String(referenz.abfragen.length)} Abfragen, ${String(referenz.aenderungen.length)} Mutationen, ${String(referenz.typen.length)} Typen → ${ziel}`,
  );
}
