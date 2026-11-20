import { type EntityManager } from 'typeorm';

import { type Meldung, type WebhookEreignis } from '../webhooks/ereignisse';
import {
  objektLesbar,
  ohneVerborgeneFelder,
  zeileSichtbar,
} from '../webhooks/webhook-sicht';
import { type Sichtfeld } from '../workspaces/sichtbarkeit';

export const LIVE_OBJEKTE = [
  'company',
  'contact',
  'deal',
  'note',
  'task',
  'appointment',
  'quote',
  'invoice',
  'order_confirmation',
  'delivery_note',
] as const;

export type LiveObjekt = (typeof LIVE_OBJEKTE)[number];

export const LIVE_AKTIONEN = [
  'created',
  'updated',
  'deleted',
  'restored',
] as const;

export type LiveAktion = (typeof LIVE_AKTIONEN)[number];

export const VERWEIS_SPALTEN = [
  'ownerId',
  'companyId',
  'contactId',
  'dealId',
  'assigneeId',
  'bearbeiterId',
] as const;

type VerweisSpalte = (typeof VERWEIS_SPALTEN)[number];

export type Verweise = Partial<Record<VerweisSpalte, string | null>>;

export type LiveMeldung = {
  workspaceId: string;
  objekt: LiveObjekt;
  id: string;
  aktion: LiveAktion;
  von: string | null;
  tab: string | null;
  verweise: Verweise;
  vorher: Verweise;
  felder: string[] | null;
};

export type LiveAusgabe = {
  objekt: LiveObjekt;
  id: string | null;
  aktion: LiveAktion;
  von: { id: string; name: string } | null;
  tab: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const BESONDERE: Record<string, LiveObjekt | undefined> = {
  'deal.stage_changed': 'deal',
  'deal.won': 'deal',
  'deal.lost': 'deal',
  'deal.contact_added': 'deal',
  'deal.contact_removed': 'deal',
  'quote.accepted': 'quote',
  'quote.declined': 'quote',
  'invoice.issued': 'invoice',
  'invoice.paid': 'invoice',
  'order_confirmation.issued': 'order_confirmation',
  'order_confirmation.cancelled': 'order_confirmation',
  'delivery_note.issued': 'delivery_note',
  'delivery_note.cancelled': 'delivery_note',
};

const istObjekt = (wert: string): wert is LiveObjekt =>
  (LIVE_OBJEKTE as readonly string[]).includes(wert);

const istAktion = (wert: string): wert is LiveAktion =>
  (LIVE_AKTIONEN as readonly string[]).includes(wert);

const verweiseAus = (daten: Record<string, unknown>): Verweise => {
  const ergebnis: Verweise = {};

  for (const spalte of VERWEIS_SPALTEN) {
    if (!(spalte in daten)) {
      continue;
    }

    const wert = daten[spalte];

    ergebnis[spalte] = typeof wert === 'string' ? wert : null;
  }

  return ergebnis;
};

export const ausMeldung = (
  meldung: Meldung,
  von: string | null,
  tab: string | null,
): LiveMeldung | null => {
  const [anfang = '', ende = ''] = meldung.event.split('.');
  const besonders = BESONDERE[meldung.event];
  const objekt = besonders ?? (istObjekt(anfang) ? anfang : null);
  const aktion: LiveAktion | null =
    besonders !== undefined ? 'updated' : istAktion(ende) ? ende : null;

  if (objekt === null || aktion === null) {
    return null;
  }

  const roh = meldung.event.startsWith('deal.contact_')
    ? meldung.data.dealId
    : meldung.data.id;

  if (typeof roh !== 'string' || !UUID.test(roh)) {
    return null;
  }

  const verweise =
    objekt === 'deal' && roh !== meldung.data.id
      ? {}
      : verweiseAus(meldung.data);
  const vorher: Verweise = {};

  for (const spalte of VERWEIS_SPALTEN) {
    const aenderung = meldung.changes?.[spalte];

    if (aenderung !== undefined) {
      vorher[spalte] =
        typeof aenderung.before === 'string' ? aenderung.before : null;
    }
  }

  return {
    workspaceId: meldung.workspaceId,
    objekt,
    id: roh,
    aktion,
    von,
    tab,
    verweise,
    vorher,
    felder:
      aktion === 'updated' && meldung.changes !== undefined
        ? Object.keys(meldung.changes)
        : null,
  };
};

type Rolle = { everything: boolean; permissions: string[] };

export const darfErfahren = async (
  manager: EntityManager,
  meldung: LiveMeldung,
  rolle: Rolle,
  sicht: Sichtfeld,
): Promise<boolean> => {
  const event = `${meldung.objekt}.updated` as WebhookEreignis;
  const jetzt = { event, data: { id: meldung.id, ...meldung.verweise } };

  if (!objektLesbar(jetzt, rolle)) {
    return false;
  }

  if (meldung.felder !== null && meldung.felder.length > 0) {
    const { changes } = ohneVerborgeneFelder(
      {
        event,
        data: {},
        changes: Object.fromEntries(
          meldung.felder.map((feld) => [feld, { before: null, after: null }]),
        ),
      },
      sicht.felder,
    );

    if (changes !== undefined && Object.keys(changes).length === 0) {
      return false;
    }
  }

  if (await zeileSichtbar(manager, meldung.workspaceId, jetzt, sicht)) {
    return true;
  }

  if (Object.keys(meldung.vorher).length === 0) {
    return false;
  }

  return zeileSichtbar(
    manager,
    meldung.workspaceId,
    { event, data: { ...jetzt.data, ...meldung.vorher } },
    sicht,
  );
};

export const GRENZE_JE_ART = 40;

export const buendeln = (
  liste: LiveAusgabe[],
  grenze = GRENZE_JE_ART,
): LiveAusgabe[] => {
  const jeSchluessel = new Map<string, LiveAusgabe>();

  for (const eintrag of liste) {
    const schluessel = `${eintrag.objekt}:${eintrag.id ?? '*'}`;

    jeSchluessel.delete(schluessel);
    jeSchluessel.set(schluessel, eintrag);
  }

  const jeArt = new Map<LiveObjekt, LiveAusgabe[]>();

  for (const eintrag of jeSchluessel.values()) {
    jeArt.set(eintrag.objekt, [...(jeArt.get(eintrag.objekt) ?? []), eintrag]);
  }

  const ergebnis: LiveAusgabe[] = [];

  for (const [objekt, eintraege] of jeArt) {
    const alle = eintraege.some((eintrag) => eintrag.id === null);

    if (alle || eintraege.length > grenze) {
      const letzter = eintraege[eintraege.length - 1];

      ergebnis.push({
        objekt,
        id: null,
        aktion: 'updated',
        von: letzter.von,
        tab: letzter.tab,
      });
    } else {
      ergebnis.push(...eintraege);
    }
  }

  return ergebnis;
};

export const liesLiveMeldung = (roh: string): LiveMeldung | null => {
  let wert: unknown;

  try {
    wert = JSON.parse(roh);
  } catch {
    return null;
  }

  if (wert === null || typeof wert !== 'object') {
    return null;
  }

  const m = wert as Partial<LiveMeldung>;

  if (
    typeof m.workspaceId !== 'string' ||
    typeof m.id !== 'string' ||
    typeof m.objekt !== 'string' ||
    !istObjekt(m.objekt) ||
    typeof m.aktion !== 'string' ||
    !istAktion(m.aktion) ||
    m.verweise === null ||
    typeof m.verweise !== 'object' ||
    m.vorher === null ||
    typeof m.vorher !== 'object'
  ) {
    return null;
  }

  return {
    workspaceId: m.workspaceId,
    objekt: m.objekt,
    id: m.id,
    aktion: m.aktion,
    von: typeof m.von === 'string' ? m.von : null,
    tab: typeof m.tab === 'string' ? m.tab : null,
    verweise: m.verweise,
    vorher: m.vorher,
    felder: Array.isArray(m.felder)
      ? m.felder.filter((feld): feld is string => typeof feld === 'string')
      : null,
  };
};
