import { type ListenStand, PARAMETER, standKodieren } from './ansichtLink';
import { type CustomFieldFilter } from './types';

export type KachelFuerLink = {
  objekt: string | null;
  gruppe: string | null;
  status: string | null;
  pipelineId: string | null;
  nurMeine: boolean;
  zeitraum: string | null;
};

const LISTE: Record<string, string> = {
  deal: '/geschaefte',
  company: '/firmen',
  contact: '/kontakte',
};

const ZEITRASTER = new Set(['woche', 'monat', 'quartal', 'jahr']);

const zwei = (zahl: number): string => String(zahl).padStart(2, '0');

const iso = (tag: Date): string =>
  `${String(tag.getFullYear())}-${zwei(tag.getMonth() + 1)}-${zwei(tag.getDate())}`;

export const zeitraumAus = (
  raster: string,
  schluessel: string,
): { von: Date; bis: Date } | null => {
  let von: Date;
  let bis: Date;

  if (raster === 'woche' && /^\d{4}-\d{2}-\d{2}$/u.test(schluessel)) {
    const [j, m, t] = schluessel.split('-').map(Number);

    von = new Date(j, m - 1, t);
    bis = new Date(j, m - 1, t + 7);
  } else if (raster === 'monat' && /^\d{4}-\d{2}$/u.test(schluessel)) {
    const [j, m] = schluessel.split('-').map(Number);

    von = new Date(j, m - 1, 1);
    bis = new Date(j, m, 1);
  } else if (raster === 'quartal' && /^\d{4}-Q[1-4]$/u.test(schluessel)) {
    const j = Number(schluessel.slice(0, 4));
    const q = Number(schluessel.slice(6));

    von = new Date(j, (q - 1) * 3, 1);
    bis = new Date(j, q * 3, 1);
  } else if (raster === 'jahr' && /^\d{4}$/u.test(schluessel)) {
    von = new Date(Number(schluessel), 0, 1);
    bis = new Date(Number(schluessel) + 1, 0, 1);
  } else {
    return null;
  }

  return { von, bis };
};

const datumsFeld = (kachel: KachelFuerLink): string =>
  kachel.objekt === 'deal' &&
  (kachel.status === 'gewonnen' || kachel.status === 'verloren')
    ? 'std:abgeschlossen'
    : 'std:createdAt';

const gleich = (key: string, wert: string): CustomFieldFilter =>
  wert === ''
    ? { key, operator: 'IS_EMPTY' }
    : { key, operator: 'EQUALS', value: wert };

const PHASE_AUS_STATUS: Record<string, string> = {
  offen: 'OPEN',
  ruhend: 'RUHEND',
  gewonnen: 'WON',
  verloren: 'LOST',
};

export const balkenLink = (
  angefragt: KachelFuerLink,
  schluessel: string,
  heute: Date = new Date(),
  pipelines = 1,
): string | null => {
  const objekt = angefragt.objekt ?? '';
  const ziel = LISTE[objekt];
  const gruppe = angefragt.gruppe ?? '';

  if (ziel === undefined || schluessel === '__andere') {
    return null;
  }

  if (objekt === 'deal' && angefragt.pipelineId === null && pipelines !== 1) {
    return null;
  }

  if (
    gruppe === 'verlustgrund' &&
    angefragt.status !== null &&
    angefragt.status !== 'alle' &&
    angefragt.status !== 'verloren'
  ) {
    return null;
  }

  const kachel: KachelFuerLink =
    gruppe === 'verlustgrund'
      ? { ...angefragt, status: 'verloren' }
      : angefragt;

  const filters: ListenStand['filters'] = {};
  const customFilters: CustomFieldFilter[] = [];

  if (kachel.nurMeine) {
    filters.verantwortlich = 'me';
  }

  if (objekt === 'deal') {
    if (kachel.status !== null && kachel.status !== 'alle') {
      filters.stage =
        PHASE_AUS_STATUS[kachel.status] ?? kachel.status.toUpperCase();
    }

    if (kachel.pipelineId !== null) {
      filters.pipelineId = kachel.pipelineId;
    }
  }

  const datum = datumsFeld(kachel);

  switch (kachel.zeitraum) {
    case '30':
    case '90':
    case '365':
      customFilters.push({
        key: datum,
        operator: 'IN_LAST_DAYS',
        value: kachel.zeitraum,
      });
      break;
    case 'jahr':
      customFilters.push({
        key: datum,
        operator: 'GREATER_THAN',
        value: `${String(heute.getFullYear() - 1)}-12-31`,
      });
      break;
    default:
      break;
  }

  if (gruppe === 'phase') {
    filters.stage = schluessel;
  } else if (gruppe === 'verantwortlich') {
    if (schluessel === '') {
      return null;
    }

    filters.verantwortlich = schluessel;
  } else if (gruppe === 'verlustgrund') {
    customFilters.push(gleich('std:lostReason', schluessel));
  } else if (gruppe === 'herkunft') {
    customFilters.push(gleich('std:herkunft', schluessel));
  } else if (gruppe === 'branche') {
    customFilters.push(
      gleich(
        objekt === 'company' ? 'std:industry' : 'std:firma.industry',
        schluessel,
      ),
    );
  } else if (gruppe.startsWith('feld:')) {
    customFilters.push(gleich(gruppe.slice('feld:'.length), schluessel));
  } else if (ZEITRASTER.has(gruppe)) {
    const abschnitt = zeitraumAus(gruppe, schluessel);

    if (abschnitt === null) {
      return null;
    }

    const davor = new Date(abschnitt.von);

    davor.setDate(davor.getDate() - 1);
    customFilters.push(
      { key: datum, operator: 'GREATER_THAN', value: iso(davor) },
      { key: datum, operator: 'LESS_THAN', value: iso(abschnitt.bis) },
    );
  }

  const stand: ListenStand = {
    search: null,
    sortField: null,
    sortDirection: null,
    customFilters,
    columns: [],
    filters,
  };

  return `${ziel}?${PARAMETER}=${standKodieren(stand)}`;
};
