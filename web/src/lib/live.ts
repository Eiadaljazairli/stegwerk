import { type DocumentNode, Kind } from 'graphql';

export type LiveObjekt =
  | 'company'
  | 'contact'
  | 'deal'
  | 'note'
  | 'task'
  | 'appointment'
  | 'quote'
  | 'invoice'
  | 'order_confirmation'
  | 'delivery_note';

export type LiveAktion = 'created' | 'updated' | 'deleted' | 'restored';

export type LiveAenderung = {
  objekt: LiveObjekt;
  id: string | null;
  aktion: LiveAktion;
  von: { id: string; name: string } | null;
  tab: string | null;
};

const BETROFFEN: Record<
  LiveObjekt,
  { typen: string[]; felder: string[]; listen?: string[] }
> = {
  company: {
    typen: ['Company'],
    listen: ['tochterfirmen'],
    felder: [
      'companies',
      'company',
      'companyIndustries',
      'meineFavoriten',
      'kachelWerte',
      'kachelnWerte',
      'dashboard',
    ],
  },
  contact: {
    typen: ['Contact'],
    listen: ['contacts'],
    felder: [
      'contacts',
      'contact',
      'meineFavoriten',
      'kachelWerte',
      'kachelnWerte',
      'dashboard',
    ],
  },
  deal: {
    typen: ['Deal'],
    listen: ['deals'],
    felder: [
      'deals',
      'deal',
      'pipeline',
      'dealForecast',
      'auswertung',
      'anzahlRuhendeGeschaefte',
      'meineUebersicht',
      'meineFavoriten',
      'kachelWerte',
      'kachelnWerte',
      'dashboard',
    ],
  },
  note: {
    typen: ['Note'],
    felder: ['notizSuche'],
    listen: ['notes', 'kontaktNotizen'],
  },
  task: {
    typen: ['Task'],
    listen: ['tasks', 'kontaktAufgaben'],
    felder: [
      'tasks',
      'task',
      'myOpenTasks',
      'myTaskDigest',
      'meineUebersicht',
      'kachelWerte',
      'kachelnWerte',
    ],
  },
  appointment: {
    typen: ['Appointment'],
    listen: ['appointments', 'kontaktTermine', 'beteiligtenTermine'],
    felder: [
      'appointments',
      'appointment',
      'appointmentConflicts',
      'meineUebersicht',
    ],
  },
  quote: {
    typen: ['Quote'],
    felder: ['quotes', 'quote', 'kachelWerte', 'kachelnWerte'],
  },
  invoice: {
    typen: ['Invoice'],
    felder: [
      'invoices',
      'invoice',
      'invoicesForQuote',
      'openItems',
      'kachelWerte',
      'kachelnWerte',
    ],
  },
  order_confirmation: {
    typen: ['Begleitbeleg'],
    felder: ['begleitbelege', 'begleitbeleg'],
  },
  delivery_note: {
    typen: ['Begleitbeleg'],
    felder: ['begleitbelege', 'begleitbeleg'],
  },
};

const OBJEKTE = Object.keys(BETROFFEN) as LiveObjekt[];
const AKTIONEN: LiveAktion[] = ['created', 'updated', 'deleted', 'restored'];

const text = (wert: unknown): string | null =>
  typeof wert === 'string' && wert !== '' ? wert : null;

export const liesAenderungen = (roh: string): LiveAenderung[] => {
  let wert: unknown;

  try {
    wert = JSON.parse(roh);
  } catch {
    return [];
  }

  if (!Array.isArray(wert)) {
    return [];
  }

  return wert.flatMap((eintrag): LiveAenderung[] => {
    if (eintrag === null || typeof eintrag !== 'object') {
      return [];
    }

    const e = eintrag as Record<string, unknown>;
    const objekt = e.objekt as LiveObjekt;
    const aktion = e.aktion as LiveAktion;

    if (!OBJEKTE.includes(objekt) || !AKTIONEN.includes(aktion)) {
      return [];
    }

    const von = e.von as Record<string, unknown> | null | undefined;
    const vonId = text(von?.id);
    const vonName = text(von?.name);

    return [
      {
        objekt,
        id: text(e.id),
        aktion,
        von:
          vonId === null || vonName === null
            ? null
            : { id: vonId, name: vonName },
        tab: text(e.tab),
      },
    ];
  });
};

export const wartezeit = (versuch: number, zufall = Math.random): number => {
  const grenze = Math.min(30_000, 1_000 * 2 ** Math.max(0, versuch));

  return Math.round(grenze * (0.5 + zufall() / 2));
};

export const wurzelFelder = (dokument: DocumentNode): string[] =>
  dokument.definitions.flatMap((definition) =>
    definition.kind === Kind.OPERATION_DEFINITION &&
    definition.operation === 'query'
      ? definition.selectionSet.selections.flatMap((auswahl) =>
          auswahl.kind === Kind.FIELD ? [auswahl.name.value] : [],
        )
      : [],
  );

export const spurenIn = (
  daten: unknown,
): { typen: Set<string>; listen: Set<string> } => {
  const gefunden = new Set<string>();
  const listen = new Set<string>();
  const besuchen = (wert: unknown, tiefe: number) => {
    if (tiefe > 8 || wert === null || typeof wert !== 'object') {
      return;
    }

    if (Array.isArray(wert)) {
      for (const eintrag of wert.slice(0, 20)) {
        besuchen(eintrag, tiefe + 1);
      }

      return;
    }

    for (const [schluessel, inhalt] of Object.entries(wert)) {
      if (schluessel === '__typename' && typeof inhalt === 'string') {
        gefunden.add(inhalt);
      } else {
        if (Array.isArray(inhalt)) {
          listen.add(schluessel);
        }

        besuchen(inhalt, tiefe + 1);
      }
    }
  };

  besuchen(daten, 0);

  return { typen: gefunden, listen };
};

export const typenIn = (daten: unknown): Set<string> => spurenIn(daten).typen;

export const betrifft = (
  objekte: ReadonlySet<LiveObjekt>,
  dokument: DocumentNode,
  daten: unknown,
): boolean => {
  if (objekte.size === 0) {
    return false;
  }

  const felder = new Set(wurzelFelder(dokument));
  const { typen, listen } = spurenIn(daten);

  return [...objekte].some(
    (objekt) =>
      BETROFFEN[objekt].felder.some((feld) => felder.has(feld)) ||
      BETROFFEN[objekt].typen.some((typ) => typen.has(typ)) ||
      (BETROFFEN[objekt].listen ?? []).some((liste) => listen.has(liste)),
  );
};

const DIESEN: Record<LiveObjekt, string> = {
  company: 'diese Firma',
  contact: 'diesen Kontakt',
  deal: 'dieses Geschäft',
  note: 'diese Notiz',
  task: 'diese Aufgabe',
  appointment: 'diesen Termin',
  quote: 'dieses Angebot',
  invoice: 'diese Rechnung',
  order_confirmation: 'diese Auftragsbestätigung',
  delivery_note: 'diesen Lieferschein',
};

const GETAN: Record<LiveAktion, string> = {
  created: 'angelegt',
  updated: 'geändert',
  deleted: 'gelöscht',
  restored: 'wiederhergestellt',
};

export const hinweisText = (
  aenderung: LiveAenderung,
  ichId: string | null,
): string => {
  const was = DIESEN[aenderung.objekt];
  const getan = GETAN[aenderung.aktion];
  const nachsatz =
    aenderung.aktion === 'deleted' ? '' : ' Angezeigt wird der neue Stand.';

  if (aenderung.von === null) {
    const Was = was.charAt(0).toUpperCase() + was.slice(1);

    return `${Was} wurde gerade an anderer Stelle ${getan}.${nachsatz}`;
  }

  if (aenderung.von.id === ichId) {
    return `Sie haben ${was} gerade in einem anderen Fenster ${getan}.${nachsatz}`;
  }

  return `${aenderung.von.name} hat ${was} gerade ${getan}.${nachsatz}`;
};

export const TAB_KENNUNG: string = (() => {
  const zufall = globalThis.crypto?.randomUUID?.();

  return (
    zufall ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  );
})();

type Zuhoerer = (aenderungen: LiveAenderung[]) => void;

const zuhoerer = new Set<Zuhoerer>();

export const aufAenderungenHoeren = (fn: Zuhoerer): (() => void) => {
  zuhoerer.add(fn);

  return () => {
    zuhoerer.delete(fn);
  };
};

const zuletzt = new Map<string, { aenderung: LiveAenderung; zeit: number }>();

const FRISCH_MS = 20_000;

export const aenderungenMelden = (
  aenderungen: LiveAenderung[],
  jetzt = Date.now(),
): void => {
  for (const [schluessel, eintrag] of zuletzt) {
    if (jetzt - eintrag.zeit > FRISCH_MS) {
      zuletzt.delete(schluessel);
    }
  }

  for (const aenderung of aenderungen) {
    if (aenderung.id !== null && aenderung.tab !== TAB_KENNUNG) {
      zuletzt.set(`${aenderung.objekt}:${aenderung.id}`, {
        aenderung,
        zeit: jetzt,
      });
    }
  }

  for (const fn of zuhoerer) {
    fn(aenderungen);
  }
};

export const fremdeAenderungAn = (
  aenderungen: LiveAenderung[],
  objekt: LiveObjekt,
  id: string,
  tab = TAB_KENNUNG,
): LiveAenderung | null =>
  aenderungen
    .filter(
      (aenderung) =>
        aenderung.objekt === objekt &&
        aenderung.id === id &&
        aenderung.tab !== tab,
    )
    .at(-1) ?? null;

export const kuerzlicheAenderungAn = (
  objekt: LiveObjekt,
  id: string,
  jetzt = Date.now(),
): LiveAenderung | null => {
  const eintrag = zuletzt.get(`${objekt}:${id}`);

  return eintrag === undefined || jetzt - eintrag.zeit > FRISCH_MS
    ? null
    : eintrag.aenderung;
};
