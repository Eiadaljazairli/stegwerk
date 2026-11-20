import { type EntityManager } from 'typeorm';

import { type AppointmentEntity } from './appointment.entity';

export const BELEGT = 'Belegt';

export type Sichtregel = {
  betrachterId: string | null;
  belegtFuer: ReadonlySet<string>;
};

type Pruefbar = Pick<
  AppointmentEntity,
  'ownerId' | 'privat' | 'quelle' | 'companyId' | 'contactId' | 'dealId'
> &
  Partial<Pick<AppointmentEntity, 'nurBelegt'>>;

export const istGeschwaerzt = (
  termin: Pruefbar,
  regel: Sichtregel,
): boolean => {
  if (regel.betrachterId !== null && termin.ownerId === regel.betrachterId) {
    return false;
  }

  if (termin.privat === true) {
    return true;
  }

  return (
    termin.quelle === 'kalender' &&
    (termin.nurBelegt === true || regel.belegtFuer.has(termin.ownerId)) &&
    termin.companyId === null &&
    termin.contactId === null &&
    termin.dealId === null
  );
};

export const schwaerzen = <T extends AppointmentEntity>(termin: T): T => {
  const kopie = Object.create(Object.getPrototypeOf(termin) as object) as T;

  Object.assign(kopie, termin, {
    title: BELEGT,
    description: null,
    location: null,
    videoLink: null,
    companyId: null,
    company: null,
    contactId: null,
    contact: null,
    dealId: null,
    deal: null,
    geschwaerzt: true,
  });

  return kopie;
};

export const sichtregelLaden = async (
  manager: EntityManager,
  workspaceId: string,
  betrachterId: string | null,
): Promise<Sichtregel> => {
  const zeilen = (await manager.query(
    `SELECT "userId" FROM "kalender_verbindungen"
      WHERE "workspaceId" = $1 AND "sichtbarkeit" = 'belegt'`,
    [workspaceId],
  )) as { userId: string }[];

  return {
    betrachterId,
    belegtFuer: new Set(zeilen.map((zeile) => zeile.userId)),
  };
};

export const belegtFesthalten = async (
  manager: EntityManager,
  userId: string,
  workspaceId: string | null,
): Promise<void> => {
  await manager.query(
    `UPDATE "appointments" t SET "nurBelegt" = true
       FROM "kalender_verbindungen" v
      WHERE v."userId" = $1
        AND ($2::uuid IS NULL OR v."workspaceId" = $2::uuid)
        AND v."sichtbarkeit" = 'belegt'
        AND t."workspaceId" = v."workspaceId"
        AND t."ownerId" = v."userId"
        AND t."quelle" = 'kalender'
        AND t."nurBelegt" = false`,
    [userId, workspaceId],
  );
};

export const fuerBetrachter = <T extends AppointmentEntity>(
  termine: T[],
  regel: Sichtregel,
): T[] =>
  termine.map((termin) =>
    istGeschwaerzt(termin, regel) ? schwaerzen(termin) : termin,
  );

export const schwaerzeFuer = async <T extends AppointmentEntity>(
  manager: EntityManager,
  workspaceId: string,
  betrachterId: string | null,
  termine: T[],
): Promise<T[]> =>
  termine.length === 0
    ? termine
    : fuerBetrachter(
        termine,
        await sichtregelLaden(manager, workspaceId, betrachterId),
      );

export const ohneGeschwaerzteFuer = async <T extends AppointmentEntity>(
  manager: EntityManager,
  workspaceId: string,
  betrachterId: string | null,
  termine: T[],
): Promise<T[]> => {
  if (termine.length === 0) {
    return termine;
  }

  const regel = await sichtregelLaden(manager, workspaceId, betrachterId);

  return termine.filter((termin) => !istGeschwaerzt(termin, regel));
};

const GESCHWAERZTE_FELDER = [
  'title',
  'description',
  'location',
  'videoLink',
  'companyId',
  'contactId',
  'dealId',
];

const pruefbarAus = (data: Record<string, unknown>): Pruefbar => ({
  ownerId: data.ownerId as string,
  privat: data.privat === true,
  quelle: data.quelle as Pruefbar['quelle'],
  companyId: (data.companyId ?? null) as string | null,
  contactId: (data.contactId ?? null) as string | null,
  dealId: (data.dealId ?? null) as string | null,
  nurBelegt: data.nurBelegt === true,
});

export const terminDatenFuer = <
  D extends Record<string, unknown>,
  C extends Record<string, unknown> | undefined,
>(
  data: D,
  changes: C,
  regel: Sichtregel,
): { data: D; changes: C } => {
  const ohneMerker = <W extends Record<string, unknown> | undefined>(
    werte: W,
  ): W =>
    werte === undefined
      ? werte
      : (Object.fromEntries(
          Object.entries(werte).filter(([feld]) => feld !== 'nurBelegt'),
        ) as W);

  if (!istGeschwaerzt(pruefbarAus(data), regel)) {
    return { data: ohneMerker(data), changes: ohneMerker(changes) };
  }

  const ohne = <W extends Record<string, unknown>>(werte: W): W =>
    Object.fromEntries(
      Object.entries(werte).map(([feld, wert]) =>
        GESCHWAERZTE_FELDER.includes(feld)
          ? [feld, feld === 'title' ? BELEGT : null]
          : [feld, wert],
      ),
    ) as W;

  return {
    data: ohneMerker(ohne(data)),
    changes:
      changes === undefined
        ? changes
        : (Object.fromEntries(
            Object.entries(changes).filter(
              ([feld]) =>
                !GESCHWAERZTE_FELDER.includes(feld) && feld !== 'nurBelegt',
            ),
          ) as C),
  };
};
