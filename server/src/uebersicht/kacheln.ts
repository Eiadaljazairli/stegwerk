import { BadRequestException } from '@nestjs/common';

import { DealStage } from '../crm/entities/deal.entity';

export const KACHEL_TYPEN = [
  'kennzahl',
  'balken',
  'liste',
  'pipeline',
  'prognose',
  'aufgaben',
] as const;
export type KachelTyp = (typeof KACHEL_TYPEN)[number];

export const KACHEL_OBJEKTE = [
  'deal',
  'company',
  'contact',
  'task',
  'invoice',
] as const;
export type KachelObjekt = (typeof KACHEL_OBJEKTE)[number];

export const KACHEL_MASSE = ['anzahl', 'summe', 'durchschnitt'] as const;
export type KachelMass = (typeof KACHEL_MASSE)[number];

export const KACHEL_ZEITRAEUME = ['alle', '30', '90', '365', 'jahr'] as const;
export type KachelZeitraum = (typeof KACHEL_ZEITRAEUME)[number];

export const KACHEL_LISTEN = [
  'ruhend',
  'neueGeschaefte',
  'gewonnen',
  'neueFirmen',
  'neueKontakte',
] as const;
export type KachelListe = (typeof KACHEL_LISTEN)[number];

const DEAL_STATUS = [
  'alle',
  'offen',
  'gewonnen',
  'verloren',
  'ruhend',
  ...Object.values(DealStage),
];
const TASK_STATUS = ['alle', 'offen', 'ueberfaellig', 'erledigt'];
const INVOICE_STATUS = ['alle', 'offen', 'bezahlt'];

export const ZEITRASTER = ['woche', 'monat', 'quartal', 'jahr'] as const;
export type Zeitraster = (typeof ZEITRASTER)[number];

const GRUPPEN_JE_OBJEKT: Record<KachelObjekt, string[]> = {
  deal: [
    'phase',
    'verantwortlich',
    'branche',
    'herkunft',
    'verlustgrund',
    ...ZEITRASTER,
  ],
  company: ['verantwortlich', 'branche', 'herkunft', ...ZEITRASTER],
  contact: ['verantwortlich', 'branche', 'herkunft', ...ZEITRASTER],
  task: ['verantwortlich', ...ZEITRASTER],
  invoice: ['branche', 'herkunft', 'kunde', ...ZEITRASTER],
};

export const MIT_BETRAG: readonly KachelObjekt[] = ['deal', 'invoice'];

export const istZeitraster = (gruppe: string | null): gruppe is Zeitraster =>
  (ZEITRASTER as readonly (string | null)[]).includes(gruppe);
export const EIGENES_FELD_GRUPPE = /^feld:([A-Za-z0-9_]{1,100})$/u;

export const MAX_KACHELN = 24;

export type Kachel = {
  id: string;
  typ: KachelTyp;
  titel: string | null;
  objekt: KachelObjekt | null;
  mass: KachelMass | null;
  gruppe: string | null;
  status: string | null;
  pipelineId: string | null;
  nurMeine: boolean;
  zeitraum: KachelZeitraum | null;
  liste: KachelListe | null;
};

export const STANDARD_KACHELN: Kachel[] = [
  kachel('pipeline-wert', 'kennzahl', 'Offene Pipeline', {
    objekt: 'deal',
    mass: 'summe',
    status: 'offen',
  }),
  kachel('offene-geschaefte', 'kennzahl', 'Offene Geschäfte', {
    objekt: 'deal',
    status: 'offen',
  }),
  kachel('firmen', 'kennzahl', 'Firmen', { objekt: 'company' }),
  kachel('kontakte', 'kennzahl', 'Kontakte', { objekt: 'contact' }),
  kachel('offene-aufgaben', 'kennzahl', 'Offene Aufgaben', {
    objekt: 'task',
    status: 'offen',
    nurMeine: true,
  }),
  kachel('ueberfaellig', 'kennzahl', 'Überfällig', {
    objekt: 'task',
    status: 'ueberfaellig',
    nurMeine: true,
  }),
  kachel('ruhend', 'kennzahl', 'Ruhende Geschäfte', {
    objekt: 'deal',
    status: 'ruhend',
  }),
  kachel('pipeline', 'pipeline', 'Pipeline nach Phase', {}),
  kachel('prognose', 'prognose', 'Prognose', {}),
  kachel('aufgaben', 'aufgaben', 'Meine offenen Aufgaben', {}),
];

function kachel(
  id: string,
  typ: KachelTyp,
  titel: string,
  rest: Partial<Kachel>,
): Kachel {
  return {
    id,
    typ,
    titel,
    objekt: null,
    mass: null,
    gruppe: null,
    status: null,
    pipelineId: null,
    nurMeine: false,
    zeitraum: null,
    liste: null,
    ...rest,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const KENNUNG = /^[A-Za-z0-9_-]{1,40}$/u;

const aus = <T extends string>(
  erlaubt: readonly T[],
  wert: unknown,
  was: string,
): T | null => {
  if (wert === null || wert === undefined || wert === '') {
    return null;
  }

  if (!(erlaubt as readonly unknown[]).includes(wert)) {
    throw new BadRequestException(`Unbekannte Angabe für ${was}.`);
  }

  return wert as T;
};

export const OBJEKT_DER_LISTE: Record<KachelListe, KachelObjekt> = {
  ruhend: 'deal',
  neueGeschaefte: 'deal',
  gewonnen: 'deal',
  neueFirmen: 'company',
  neueKontakte: 'contact',
};

export const objektDerKachel = (eintrag: Kachel): KachelObjekt => {
  switch (eintrag.typ) {
    case 'kennzahl':
    case 'balken':
      return eintrag.objekt as KachelObjekt;
    case 'liste':
      return OBJEKT_DER_LISTE[eintrag.liste as KachelListe];
    case 'aufgaben':
      return 'task';
    default:
      return 'deal';
  }
};

export const pruefeKachel = (roh: Record<string, unknown>): Kachel => {
  const typ = aus(KACHEL_TYPEN, roh.typ, 'die Art der Kachel');

  if (typ === null) {
    throw new BadRequestException('Eine Kachel braucht eine Art.');
  }

  const id = typeof roh.id === 'string' ? roh.id : '';

  if (!KENNUNG.test(id)) {
    throw new BadRequestException('Die Kennung der Kachel ist ungültig.');
  }

  const titelRoh = typeof roh.titel === 'string' ? roh.titel.trim() : '';

  if (titelRoh.length > 80) {
    throw new BadRequestException('Der Titel ist länger als 80 Zeichen.');
  }

  const ergebnis = kachel(id, typ, '', {});

  ergebnis.titel = titelRoh === '' ? null : titelRoh;

  if (typ === 'liste') {
    const liste = aus(KACHEL_LISTEN, roh.liste, 'die Liste');

    if (liste === null) {
      throw new BadRequestException('Welche Liste soll die Kachel zeigen?');
    }

    ergebnis.liste = liste;
    ergebnis.nurMeine = roh.nurMeine === true;

    return ergebnis;
  }

  if (typ === 'pipeline') {
    ergebnis.pipelineId = pruefePipeline(roh.pipelineId);

    return ergebnis;
  }

  if (typ !== 'kennzahl' && typ !== 'balken') {
    return ergebnis;
  }

  const objekt = aus(KACHEL_OBJEKTE, roh.objekt, 'das Objekt');

  if (objekt === null) {
    throw new BadRequestException('Was soll die Kachel zählen?');
  }

  const mass = aus(KACHEL_MASSE, roh.mass, 'das Maß') ?? 'anzahl';

  if (mass !== 'anzahl' && !MIT_BETRAG.includes(objekt)) {
    throw new BadRequestException(
      'Summe und Durchschnitt gibt es nur für Beträge von Geschäften und Rechnungen.',
    );
  }

  const status = aus(
    objekt === 'deal'
      ? DEAL_STATUS
      : objekt === 'task'
        ? TASK_STATUS
        : objekt === 'invoice'
          ? INVOICE_STATUS
          : [],
    roh.status,
    'den Status',
  );

  ergebnis.objekt = objekt;
  ergebnis.mass = mass;
  ergebnis.status = status;
  ergebnis.nurMeine = objekt !== 'invoice' && roh.nurMeine === true;
  ergebnis.zeitraum = aus(KACHEL_ZEITRAEUME, roh.zeitraum, 'den Zeitraum');
  ergebnis.pipelineId =
    objekt === 'deal' ? pruefePipeline(roh.pipelineId) : null;

  if (typ === 'balken') {
    const gruppe = typeof roh.gruppe === 'string' ? roh.gruppe : '';

    if (
      !GRUPPEN_JE_OBJEKT[objekt].includes(gruppe) &&
      (objekt === 'invoice' || !EIGENES_FELD_GRUPPE.test(gruppe))
    ) {
      throw new BadRequestException('Wonach sollen die Balken gruppieren?');
    }

    ergebnis.gruppe = gruppe;
  }

  return ergebnis;
};

const pruefePipeline = (wert: unknown): string | null => {
  if (wert === null || wert === undefined || wert === '') {
    return null;
  }

  if (typeof wert !== 'string' || !UUID.test(wert)) {
    throw new BadRequestException('Die Pipeline ist ungültig.');
  }

  return wert;
};

export const pruefeKacheln = (roh: Record<string, unknown>[]): Kachel[] => {
  if (roh.length > MAX_KACHELN) {
    throw new BadRequestException(
      `Höchstens ${String(MAX_KACHELN)} Kacheln je Übersicht.`,
    );
  }

  const kacheln = roh.map(pruefeKachel);

  if (new Set(kacheln.map((k) => k.id)).size !== kacheln.length) {
    throw new BadRequestException('Zwei Kacheln haben dieselbe Kennung.');
  }

  return kacheln;
};
