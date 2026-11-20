import { type EntityManager } from 'typeorm';

import {
  eigenesSchluessel,
  type FeldArt,
  type Feldrechte,
  STANDARD_FELDRECHTE,
} from '../workspaces/feldrechte';
import { Permission, roleAllows } from '../workspaces/permissions';
import { istSichtbarFuer, type Sichtfeld } from '../workspaces/sichtbarkeit';
import { type Aenderung, type Meldung } from './ereignisse';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const objektVon = (event: string): string => event.split('.')[0] ?? '';

const FELDART: Record<string, FeldArt | undefined> = {
  company: 'company',
  contact: 'contact',
  deal: 'deal',
  task: 'task',
};

const TABELLE: Record<string, string | undefined> = {
  company: 'companies',
  contact: 'contacts',
  deal: 'deals',
  note: 'notes',
  task: 'tasks',
  appointment: 'appointments',
  quote: 'quotes',
  invoice: 'invoices',
  order_confirmation: 'begleitbelege',
  delivery_note: 'begleitbelege',
};

const EIGENE_SPALTE: Record<string, string | undefined> = {
  task: 'assigneeId',
  appointment: 'ownerId',
  quote: 'bearbeiterId',
  order_confirmation: 'bearbeiterId',
  delivery_note: 'bearbeiterId',
};

const LESERECHT: Record<string, Permission | undefined> = {
  company: Permission.COMPANY_VIEW,
  contact: Permission.CONTACT_VIEW,
  deal: Permission.DEAL_VIEW,
  task: Permission.TASK_VIEW,
  appointment: Permission.APPOINTMENT_VIEW,
  quote: Permission.QUOTE_VIEW,
  order_confirmation: Permission.QUOTE_VIEW,
  delivery_note: Permission.QUOTE_VIEW,
  invoice: Permission.INVOICE_VIEW,
};

const AKTENRECHT = [
  ['companyId', Permission.COMPANY_VIEW],
  ['contactId', Permission.CONTACT_VIEW],
  ['dealId', Permission.DEAL_VIEW],
] as const;

type Rolle = { everything: boolean; permissions: string[] };

export const darfAbonnieren = (event: string, rolle: Rolle): boolean => {
  const objekt = objektVon(event);

  if (objekt === 'note') {
    return AKTENRECHT.some(([, recht]) => roleAllows(rolle, recht));
  }

  const recht = LESERECHT[objekt];

  return recht !== undefined && roleAllows(rolle, recht);
};

export const objektLesbar = (
  meldung: Pick<Meldung, 'event' | 'data'>,
  rolle: Rolle,
): boolean => {
  if (objektVon(meldung.event) !== 'note') {
    return darfAbonnieren(meldung.event, rolle);
  }

  const noetig = AKTENRECHT.filter(
    ([spalte]) => typeof meldung.data[spalte] === 'string',
  );

  return (noetig.length === 0 ? AKTENRECHT : noetig).every(([, recht]) =>
    roleAllows(rolle, recht),
  );
};

const verborgeneSpalten = (art: FeldArt, felder: Feldrechte): Set<string> => {
  const weg = new Set<string>();

  for (const eintrag of STANDARD_FELDRECHTE) {
    if (eintrag.art === art && felder[eintrag.schluessel] === 'verborgen') {
      weg.add(eintrag.feld);

      for (const auch of eintrag.auch ?? []) {
        weg.add(auch);
      }
    }
  }

  return weg;
};

export const ohneVerborgeneFelder = (
  meldung: Pick<Meldung, 'event' | 'data' | 'changes'>,
  felder: Feldrechte,
): Pick<Meldung, 'data' | 'changes'> => {
  const art = FELDART[objektVon(meldung.event)];

  if (art === undefined || Object.keys(felder).length === 0) {
    return { data: meldung.data, changes: meldung.changes };
  }

  const weg = verborgeneSpalten(art, felder);
  const eigenVerborgen = (key: string) =>
    felder[eigenesSchluessel(art, key)] === 'verborgen';

  const data = Object.fromEntries(
    Object.entries(meldung.data)
      .filter(([feld]) => !weg.has(feld))
      .map(([feld, wert]): [string, unknown] =>
        feld === 'customFields' && wert !== null && typeof wert === 'object'
          ? [
              feld,
              Object.fromEntries(
                Object.entries(wert as Record<string, unknown>).filter(
                  ([key]) => !eigenVerborgen(key),
                ),
              ),
            ]
          : [feld, wert],
      ),
  );

  const changes =
    meldung.changes === undefined
      ? undefined
      : (Object.fromEntries(
          Object.entries(meldung.changes).filter(([feld]) =>
            feld.startsWith('customFields.')
              ? !eigenVerborgen(feld.slice('customFields.'.length))
              : !weg.has(feld),
          ),
        ) as Record<string, Aenderung>);

  return { data, changes };
};

type Verweis = { tabelle: string; id: string; ownerId?: string | null };

export const zeileSichtbar = async (
  manager: EntityManager,
  workspaceId: string,
  meldung: Pick<Meldung, 'event' | 'data'>,
  sicht: Sichtfeld,
): Promise<boolean> => {
  const eingeschraenkt = Object.values(sicht.arten).some(
    (weite) => weite === 'eigene',
  );

  if (!eingeschraenkt) {
    return true;
  }

  const objekt = objektVon(meldung.event);
  const tabelle = TABELLE[objekt];
  const data = meldung.data;
  const roh = data.id ?? (objekt === 'deal' ? data.dealId : undefined);
  const id = typeof roh === 'string' && UUID.test(roh) ? roh : null;

  if (id === null) {
    return true;
  }

  if (tabelle === undefined) {
    return false;
  }

  let zeile: Record<string, unknown> = data;
  const akte =
    objekt === 'company' || objekt === 'contact' || objekt === 'deal';
  const eigeneSpalte = EIGENE_SPALTE[objekt];
  const unvollstaendig = akte
    ? !('ownerId' in data)
    : (!('companyId' in data) &&
        !('contactId' in data) &&
        !('dealId' in data)) ||
      (eigeneSpalte !== undefined && !(eigeneSpalte in data));

  if (unvollstaendig) {
    const [gelesen] = (await manager.query(
      `SELECT * FROM "${tabelle}" WHERE "id" = $1 AND "workspaceId" = $2`,
      [id, workspaceId],
    )) as Record<string, unknown>[];

    zeile = gelesen ?? data;
  }

  if (
    eigeneSpalte !== undefined &&
    sicht.ich !== null &&
    zeile[eigeneSpalte] === sicht.ich
  ) {
    return true;
  }

  const verweise: Verweis[] = [];

  if (akte) {
    verweise.push({
      tabelle,
      id,
      ownerId: (zeile.ownerId as string | null | undefined) ?? null,
    });
  } else {
    for (const [spalte, ziel] of [
      ['companyId', 'companies'],
      ['contactId', 'contacts'],
      ['dealId', 'deals'],
    ] as const) {
      const wert = zeile[spalte];

      if (typeof wert === 'string') {
        verweise.push({ tabelle: ziel, id: wert });
      }
    }
  }

  const artVon: Record<string, keyof Sichtfeld['arten']> = {
    companies: 'company',
    contacts: 'contact',
    deals: 'deal',
  };

  const sichtbar = async (verweis: Verweis): Promise<boolean> => {
    const art = artVon[verweis.tabelle];

    if (sicht.arten[art] !== 'eigene') {
      return true;
    }

    let owner = verweis.ownerId;

    if (owner === undefined) {
      const [gelesen] = (await manager.query(
        `SELECT "ownerId" FROM "${verweis.tabelle}" WHERE "id" = $1 AND "workspaceId" = $2`,
        [verweis.id, workspaceId],
      )) as { ownerId: string | null }[];

      owner = gelesen?.ownerId ?? null;
    }

    return istSichtbarFuer(sicht, art, owner, verweis.id);
  };

  if ((objekt === 'note' || objekt === 'task') && verweise.length > 0) {
    for (const verweis of verweise) {
      if (await sichtbar(verweis)) {
        return true;
      }
    }

    return false;
  }

  for (const verweis of verweise) {
    if (!(await sichtbar(verweis))) {
      return false;
    }
  }

  return true;
};
