import { BadRequestException } from '@nestjs/common';
import { type EntityManager, In, IsNull } from 'typeorm';

import { istVerborgen } from '../workspaces/feldrechte';
import {
  artOhneRecht,
  type SichtbarkeitsArt,
  sichtbarkeitsBedingung,
} from '../workspaces/sichtbarkeit';
import { CustomFieldDefinition } from './custom-field.entity';
import {
  CustomFieldEntity,
  CustomFieldType,
  type CustomFieldValue,
  MAX_VERWEISE,
} from './custom-field.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export const istKennung = (text: string): boolean => UUID.test(text);

export const VERWEIS_TABELLE: Record<CustomFieldEntity, string> = {
  [CustomFieldEntity.COMPANY]: 'companies',
  [CustomFieldEntity.CONTACT]: 'contacts',
  [CustomFieldEntity.DEAL]: 'deals',
  [CustomFieldEntity.TASK]: 'tasks',
};

export const ART_EINZAHL: Record<CustomFieldEntity, string> = {
  [CustomFieldEntity.COMPANY]: 'Firma',
  [CustomFieldEntity.CONTACT]: 'Kontakt',
  [CustomFieldEntity.DEAL]: 'Geschäft',
  [CustomFieldEntity.TASK]: 'Aufgabe',
};

export const ART_MEHRZAHL: Record<CustomFieldEntity, string> = {
  [CustomFieldEntity.COMPANY]: 'Firmen',
  [CustomFieldEntity.CONTACT]: 'Kontakte',
  [CustomFieldEntity.DEAL]: 'Geschäfte',
  [CustomFieldEntity.TASK]: 'Aufgaben',
};

export const titelAusdruck = (alias: string, art: CustomFieldEntity): string =>
  art === CustomFieldEntity.CONTACT
    ? `concat_ws(' ', NULLIF(${alias}."firstName", ''), NULLIF(${alias}."lastName", ''))`
    : art === CustomFieldEntity.TASK
      ? `${alias}."title"`
      : `${alias}."name"`;

export const verweisIds = (wert: unknown): string[] => {
  if (typeof wert === 'string') {
    return wert === '' ? [] : [wert];
  }

  return Array.isArray(wert)
    ? wert.filter((eintrag): eintrag is string => typeof eintrag === 'string')
    : [];
};

export const verweisLesen = (
  definition: Pick<CustomFieldDefinition, 'label' | 'mehrere'>,
  roh: unknown,
): string | string[] | null => {
  if (roh === null || roh === undefined) {
    return null;
  }

  const liste = Array.isArray(roh)
    ? roh.map((eintrag) => String(eintrag))
    : typeof roh === 'string'
      ? definition.mehrere
        ? roh.split(';')
        : [roh]
      : null;

  if (liste === null) {
    throw new BadRequestException(
      `"${definition.label}" erwartet einen Datensatz.`,
    );
  }

  const ids = [
    ...new Set(
      liste
        .map((eintrag) => eintrag.trim().toLowerCase())
        .filter((eintrag) => eintrag !== ''),
    ),
  ];

  for (const id of ids) {
    if (!istKennung(id)) {
      throw new BadRequestException(
        `"${definition.label}" erwartet einen Datensatz, keinen Text.`,
      );
    }
  }

  if (!definition.mehrere && ids.length > 1) {
    throw new BadRequestException(
      `"${definition.label}" nimmt nur einen Datensatz.`,
    );
  }

  if (ids.length > MAX_VERWEISE) {
    throw new BadRequestException(
      `"${definition.label}" nimmt höchstens ${String(MAX_VERWEISE)} Datensätze.`,
    );
  }

  if (ids.length === 0) {
    return null;
  }

  return definition.mehrere ? ids : ids[0];
};

export type VerweisInfo = { titel: string; sichtbar: boolean };

const sichtArt = (art: CustomFieldEntity): SichtbarkeitsArt | null =>
  art === CustomFieldEntity.TASK ? null : (art as SichtbarkeitsArt);

const sichtbarAusdruck = async (
  art: CustomFieldEntity,
  alias: string,
): Promise<{ sql: string; parameters: Record<string, unknown> }> => {
  const sicht = sichtArt(art);

  if (sicht !== null && (await artOhneRecht(sicht))) {
    return { sql: 'false', parameters: {} };
  }
  const bedingung =
    sicht === null ? null : await sichtbarkeitsBedingung(sicht, alias);

  return bedingung === null
    ? { sql: 'true', parameters: {} }
    : {
        sql: `CASE WHEN ${bedingung.where} THEN true ELSE false END`,
        parameters: bedingung.parameters,
      };
};

export const verweiseLaden = async (
  manager: EntityManager,
  workspaceId: string,
  art: CustomFieldEntity,
  ids: readonly string[],
): Promise<Map<string, VerweisInfo>> => {
  const gueltig = [...new Set(ids.filter(istKennung))];

  if (gueltig.length === 0) {
    return new Map();
  }

  const sichtbar = await sichtbarAusdruck(art, 'verweis');
  const zeilen = await manager
    .createQueryBuilder()
    .select('verweis."id"', 'id')
    .addSelect(titelAusdruck('verweis', art), 'titel')
    .addSelect(sichtbar.sql, 'sichtbar')
    .from(VERWEIS_TABELLE[art], 'verweis')
    .where('verweis."workspaceId" = :verweisBereich', {
      verweisBereich: workspaceId,
    })
    .andWhere('verweis."deletedAt" IS NULL')
    .andWhere('verweis."id" IN (:...verweisIds)', { verweisIds: gueltig })
    .setParameters(sichtbar.parameters)
    .getRawMany<{ id: string; titel: string | null; sichtbar: boolean }>();

  return new Map(
    zeilen.map((zeile) => [
      zeile.id,
      {
        titel: zeile.sichtbar ? (zeile.titel ?? '') : '',
        sichtbar: zeile.sichtbar,
      },
    ]),
  );
};

export const verweisePruefen = async (
  manager: EntityManager,
  workspaceId: string,
  definition: Pick<CustomFieldDefinition, 'label' | 'mehrere' | 'zielEntity'>,
  wert: string | string[] | null,
  bisher: unknown,
): Promise<string | string[] | null> => {
  const art = definition.zielEntity as CustomFieldEntity;
  const neu = verweisIds(wert);
  const alt = verweisIds(bisher);
  const dazu = neu.filter((id) => !alt.includes(id));
  const info = await verweiseLaden(manager, workspaceId, art, [
    ...dazu,
    ...alt,
  ]);

  for (const id of dazu) {
    if (info.get(id)?.sichtbar !== true) {
      throw new BadRequestException(
        `${ART_EINZAHL[art]} für "${definition.label}" gibt es in diesem Arbeitsbereich nicht.`,
      );
    }
  }

  const verborgen = alt.filter((id) => info.get(id)?.sichtbar === false);

  if (verborgen.length === 0) {
    return wert;
  }

  if (!definition.mehrere) {
    if (wert !== alt[0]) {
      throw new BadRequestException(
        `"${definition.label}" verweist auf einen Datensatz, den Ihre Rolle nicht sieht; ändern kann ihn nur, wer ihn sieht.`,
      );
    }

    return wert;
  }

  const zusammen = [
    ...verborgen,
    ...neu.filter((id) => !verborgen.includes(id)),
  ];

  if (zusammen.length > MAX_VERWEISE) {
    throw new BadRequestException(
      `"${definition.label}" nimmt höchstens ${String(MAX_VERWEISE)} Datensätze.`,
    );
  }

  return zusammen;
};

export const verweiseNachNamen = async (
  manager: EntityManager,
  workspaceId: string,
  art: CustomFieldEntity,
  texte: readonly string[],
): Promise<string[]> => {
  const ergebnis: string[] = [];
  const sichtbar = await sichtbarAusdruck(art, 'verweis');
  const mitMail =
    art === CustomFieldEntity.CONTACT && !(await istVerborgen('contact.email'));

  for (const roh of texte) {
    const text = roh.trim();

    if (text === '') {
      continue;
    }

    if (istKennung(text)) {
      ergebnis.push(text.toLowerCase());
      continue;
    }

    const abfrage = manager
      .createQueryBuilder()
      .select('verweis."id"', 'id')
      .from(VERWEIS_TABELLE[art], 'verweis')
      .where('verweis."workspaceId" = :verweisBereich', {
        verweisBereich: workspaceId,
      })
      .andWhere('verweis."deletedAt" IS NULL')
      .andWhere(
        mitMail
          ? `(lower(${titelAusdruck('verweis', art)}) = lower(:verweisName) OR lower(verweis."email") = lower(:verweisName))`
          : `lower(${titelAusdruck('verweis', art)}) = lower(:verweisName)`,
        { verweisName: text },
      )
      .andWhere(sichtbar.sql, sichtbar.parameters)
      .limit(2);
    const treffer = await abfrage.getRawMany<{ id: string }>();

    if (treffer.length === 0) {
      throw new BadRequestException(
        `${ART_EINZAHL[art]} „${text}“ gibt es nicht.`,
      );
    }

    if (treffer.length > 1) {
      throw new BadRequestException(
        `„${text}“ ist nicht eindeutig: es gibt mehrere ${ART_MEHRZAHL[art]} dieses Namens.`,
      );
    }

    ergebnis.push(treffer[0].id);
  }

  return [...new Set(ergebnis)];
};

const felderAuf = (
  manager: EntityManager,
  art: CustomFieldEntity,
  workspaceId: string,
): Promise<CustomFieldDefinition[]> =>
  manager.find(CustomFieldDefinition, {
    where: {
      workspaceId,
      type: CustomFieldType.RELATION,
      zielEntity: art,
      gegenseite: false,
    },
  });

const verweiseErsetzen = async (
  manager: EntityManager,
  workspaceId: string,
  art: CustomFieldEntity,
  ersetzen: Map<string, string | null>,
): Promise<number> => {
  if (ersetzen.size === 0) {
    return 0;
  }

  let anzahl = 0;
  const alte = [...ersetzen.keys()];

  for (const feld of await felderAuf(manager, art, workspaceId)) {
    const tabelle = VERWEIS_TABELLE[feld.entity];
    const zeilen = (await manager.query(
      `SELECT "id", "customFields" -> $2 AS wert FROM "${tabelle}"
        WHERE "workspaceId" = $1 AND ("customFields" -> $2) ?| $3::text[]`,
      [workspaceId, feld.key, alte],
    )) as { id: string; wert: CustomFieldValue }[];

    for (const zeile of zeilen) {
      const neu = [
        ...new Set(
          verweisIds(zeile.wert)
            .map((id) => (ersetzen.has(id) ? ersetzen.get(id) : id))
            .filter((id): id is string => typeof id === 'string'),
        ),
      ];
      const wert =
        neu.length === 0 ? null : feld.mehrere ? neu : (neu[0] ?? null);

      await manager.query(
        `UPDATE "${tabelle}"
            SET "customFields" = CASE WHEN $3::jsonb IS NULL
              THEN "customFields" - $2
              ELSE jsonb_set("customFields", ARRAY[$2], $3::jsonb) END
          WHERE "id" = $1`,
        [zeile.id, feld.key, wert === null ? null : JSON.stringify(wert)],
      );
      anzahl += 1;
    }
  }

  return anzahl;
};

export const verweiseEntfernen = (
  manager: EntityManager,
  workspaceId: string,
  art: CustomFieldEntity,
  ids: readonly string[],
): Promise<number> =>
  verweiseErsetzen(
    manager,
    workspaceId,
    art,
    new Map(ids.map((id) => [id, null])),
  );

export const verweiseUmhaengen = (
  manager: EntityManager,
  workspaceId: string,
  art: CustomFieldEntity,
  wegIds: readonly string[],
  behaltenId: string,
): Promise<number> =>
  verweiseErsetzen(
    manager,
    workspaceId,
    art,
    new Map(wegIds.map((id) => [id, behaltenId])),
  );

export type GegenfeldInhalt = {
  eintraege: { id: string; titel: string }[];
  nichtSichtbar: number;
};

export const MAX_GEGENFELD_EINTRAEGE = 100;

export const gegenfeldLesen = async (
  manager: EntityManager,
  workspaceId: string,
  quelle: Pick<CustomFieldDefinition, 'entity' | 'key'>,
  zielId: string,
  sichtbarErlaubt: boolean,
): Promise<GegenfeldInhalt> => {
  const sichtbar = sichtbarErlaubt
    ? await sichtbarAusdruck(quelle.entity, 'quelle')
    : { sql: 'false', parameters: {} };
  const verweisende = () =>
    manager
      .createQueryBuilder()
      .from(VERWEIS_TABELLE[quelle.entity], 'quelle')
      .where('quelle."workspaceId" = :quelleBereich', {
        quelleBereich: workspaceId,
      })
      .andWhere('quelle."deletedAt" IS NULL')
      .andWhere(
        `(quelle."customFields" @> jsonb_build_object(CAST(:quelleKey AS text), CAST(:quelleZiel AS text))
          OR quelle."customFields" @> jsonb_build_object(CAST(:quelleKey AS text), jsonb_build_array(CAST(:quelleZiel AS text))))`,
        { quelleKey: quelle.key, quelleZiel: zielId },
      )
      .setParameters(sichtbar.parameters);

  const [zeilen, gezaehlt] = await Promise.all([
    verweisende()
      .select('quelle."id"', 'id')
      .addSelect(titelAusdruck('quelle', quelle.entity), 'titel')
      .andWhere(sichtbar.sql)
      .orderBy(titelAusdruck('quelle', quelle.entity), 'ASC')
      .limit(MAX_GEGENFELD_EINTRAEGE)
      .getRawMany<{ id: string; titel: string | null }>(),
    verweisende()
      .select(`COUNT(*) FILTER (WHERE NOT (${sichtbar.sql}))`, 'anzahl')
      .getRawOne<{ anzahl: string }>(),
  ]);

  return {
    eintraege: zeilen.map((zeile) => ({
      id: zeile.id,
      titel: zeile.titel ?? '',
    })),
    nichtSichtbar: Number(gezaehlt?.anzahl ?? 0),
  };
};

export const gegenfelderVon = async (
  manager: EntityManager,
  workspaceId: string,
  art: CustomFieldEntity,
): Promise<
  { gegenfeld: CustomFieldDefinition; quelle: CustomFieldDefinition }[]
> => {
  const gegenfelder = await manager.find(CustomFieldDefinition, {
    where: {
      workspaceId,
      entity: art,
      type: CustomFieldType.RELATION,
      gegenseite: true,
      archivedAt: IsNull(),
    },
    order: { position: 'ASC', createdAt: 'ASC' },
  });
  const quellIds = gegenfelder
    .map((feld) => feld.gegenfeldId)
    .filter((id): id is string => id !== null);
  const quellen =
    quellIds.length === 0
      ? []
      : await manager.find(CustomFieldDefinition, {
          where: { workspaceId, id: In(quellIds), archivedAt: IsNull() },
        });
  const nachId = new Map(quellen.map((quelle) => [quelle.id, quelle]));

  return gegenfelder.flatMap((gegenfeld) => {
    const quelle =
      gegenfeld.gegenfeldId === null
        ? undefined
        : nachId.get(gegenfeld.gegenfeldId);

    return quelle === undefined ? [] : [{ gegenfeld, quelle }];
  });
};
