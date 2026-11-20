import { createHash } from 'node:crypto';

import {
  berlinDate,
  berlinTime,
  instantFromBerlin,
} from '../calendar/berlin-time';
import { buildIcs, type IcsEvent } from '../calendar/ics';
import { type GelesenerTermin, liesIcs } from '../calendar/ics-lesen';
import {
  formatRule,
  parseRule,
  type Rule,
  weekdayOf,
} from '../calendar/recurrence';
import {
  type Ablageergebnis,
  type GefundenerKalender,
  type HttpAntwort,
  KalenderFehler,
  type KalenderKlient,
  type KalenderObjekt,
  type Transport,
} from './caldav-client';

export const GRAPH = 'https://graph.microsoft.com/v1.0';
const GRAPH_HOST = 'graph.microsoft.com';
const HOECHSTENS_SEITEN = 20;
const ABGESAGT = 'Abgesagt: ';

const WOCHENTAGE = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
const INDEX = ['first', 'second', 'third', 'fourth'] as const;

type GraphZeit = { dateTime?: string; timeZone?: string };

type GraphMuster = {
  type?: string;
  interval?: number;
  daysOfWeek?: string[];
  dayOfMonth?: number;
  month?: number;
  index?: string;
  firstDayOfWeek?: string;
};

type GraphBereich = {
  type?: string;
  startDate?: string;
  endDate?: string;
  numberOfOccurrences?: number;
  recurrenceTimeZone?: string;
};

export type GraphWiederholung = { pattern?: GraphMuster; range?: GraphBereich };

export type GraphTermin = {
  id?: string;
  iCalUId?: string;
  '@odata.etag'?: string;
  subject?: string | null;
  body?: { contentType?: string; content?: string | null } | null;
  location?: { displayName?: string | null } | null;
  start?: GraphZeit;
  end?: GraphZeit;
  isAllDay?: boolean;
  isCancelled?: boolean;
  sensitivity?: string;
  recurrence?: GraphWiederholung | null;
  lastModifiedDateTime?: string;
  changeKey?: string;
  type?: string;
  originalStart?: string;
  occurrenceId?: string | null;
  cancelledOccurrences?: string[] | null;
  exceptionOccurrences?: GraphTermin[] | null;
  organizer?: { emailAddress?: { address?: string; name?: string } };
  attendees?: {
    emailAddress?: { address?: string; name?: string };
    status?: { response?: string };
  }[];
};

const ANTWORT: Record<string, string> = {
  accepted: 'ACCEPTED',
  declined: 'DECLINED',
  tentativelyAccepted: 'TENTATIVE',
};

export const regelZuGraph = (
  regel: Rule,
  startsAt: Date,
): GraphWiederholung => {
  const tag = berlinDate(startsAt);
  const tage = (
    regel.byDay.length > 0
      ? regel.byDay
      : [{ weekday: weekdayOf(tag), nth: null }]
  ).map((eintrag) => WOCHENTAGE[eintrag.weekday]);
  const nth = regel.byDay.find((eintrag) => eintrag.nth !== null)?.nth ?? null;
  let pattern: GraphMuster;

  if (regel.freq === 'DAILY') {
    pattern = { type: 'daily', interval: regel.interval };
  } else if (regel.freq === 'WEEKLY') {
    pattern = {
      type: 'weekly',
      interval: regel.interval,
      daysOfWeek: tage,
      firstDayOfWeek: 'monday',
    };
  } else if (regel.freq === 'MONTHLY' && nth !== null) {
    pattern = {
      type: 'relativeMonthly',
      interval: regel.interval,
      daysOfWeek: tage,
      index: nth < 0 ? 'last' : (INDEX[nth - 1] ?? 'last'),
    };
  } else if (regel.freq === 'MONTHLY') {
    pattern = {
      type: 'absoluteMonthly',
      interval: regel.interval,
      dayOfMonth: Number(tag.slice(8, 10)),
    };
  } else {
    pattern = {
      type: 'absoluteYearly',
      interval: regel.interval,
      dayOfMonth: Number(tag.slice(8, 10)),
      month: Number(tag.slice(5, 7)),
    };
  }

  const range: GraphBereich =
    regel.until !== null
      ? { type: 'endDate', startDate: tag, endDate: regel.until }
      : regel.count !== null
        ? { type: 'numbered', startDate: tag, numberOfOccurrences: regel.count }
        : { type: 'noEnd', startDate: tag };

  return {
    pattern,
    range: { ...range, recurrenceTimeZone: 'Europe/Berlin' },
  };
};

export const graphZuRegel = (
  wiederholung: GraphWiederholung | null | undefined,
): Rule | null => {
  const muster = wiederholung?.pattern;
  const bereich = wiederholung?.range;

  if (muster === undefined || bereich === undefined) {
    return null;
  }

  const interval = Math.max(1, Math.trunc(muster.interval ?? 1));
  const tage = (muster.daysOfWeek ?? [])
    .map((name) => WOCHENTAGE.indexOf(name as (typeof WOCHENTAGE)[number]))
    .filter((index) => index >= 0);
  const ende = {
    until:
      bereich.type === 'endDate' && typeof bereich.endDate === 'string'
        ? bereich.endDate.slice(0, 10)
        : null,
    count:
      bereich.type === 'numbered' &&
      typeof bereich.numberOfOccurrences === 'number'
        ? bereich.numberOfOccurrences
        : null,
  };

  switch (muster.type) {
    case 'daily':
      return { freq: 'DAILY', interval, byDay: [], ...ende };
    case 'weekly':
      return {
        freq: 'WEEKLY',
        interval,
        byDay: tage.map((weekday) => ({ weekday, nth: null })),
        ...ende,
      };
    case 'absoluteMonthly':
      return { freq: 'MONTHLY', interval, byDay: [], ...ende };
    case 'relativeMonthly': {
      const stelle =
        muster.index === 'last'
          ? -1
          : INDEX.indexOf(muster.index as (typeof INDEX)[number]) + 1;

      return stelle === 0 || tage.length === 0
        ? null
        : {
            freq: 'MONTHLY',
            interval,
            byDay: tage.map((weekday) => ({ weekday, nth: stelle })),
            ...ende,
          };
    }
    case 'absoluteYearly':
      return { freq: 'YEARLY', interval, byDay: [], ...ende };
    default:
      return null;
  }
};

const ohneZone = (zeit: Date): string => zeit.toISOString().slice(0, 19);

const inBerlin = (zeit: Date): { dateTime: string; timeZone: string } => ({
  dateTime: `${berlinDate(zeit)}T${berlinTime(zeit)}:00`,
  timeZone: 'Europe/Berlin',
});

export const terminZuGraph = (
  termin: GelesenerTermin,
): Record<string, unknown> => {
  let wiederholung: GraphWiederholung | null = null;

  if (termin.regel !== null) {
    try {
      wiederholung = regelZuGraph(parseRule(termin.regel), termin.startsAt);
    } catch {
      wiederholung = null;
    }
  }

  return {
    subject: `${termin.abgesagt ? ABGESAGT : ''}${termin.titel}`,
    body: { contentType: 'text', content: termin.beschreibung ?? '' },
    location: { displayName: termin.ort ?? '' },
    isAllDay: termin.ganztaegig,
    sensitivity: termin.privat ? 'private' : 'normal',
    ...(termin.abgesagt ? { showAs: 'free' } : {}),
    start: termin.ganztaegig
      ? {
          dateTime: `${berlinDate(termin.startsAt)}T00:00:00`,
          timeZone: 'Europe/Berlin',
        }
      : inBerlin(termin.startsAt),
    end: termin.ganztaegig
      ? {
          dateTime: `${berlinDate(termin.endsAt)}T00:00:00`,
          timeZone: 'Europe/Berlin',
        }
      : inBerlin(termin.endsAt),
    recurrence: wiederholung,
  };
};

const zeitpunkt = (zeit: GraphZeit | undefined, ganz: boolean): Date | null => {
  const roh = zeit?.dateTime;

  if (roh === undefined || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u.test(roh)) {
    return null;
  }

  if (ganz) {
    return instantFromBerlin(roh.slice(0, 10), '00:00');
  }

  const datum = new Date(`${roh.slice(0, 19)}Z`);

  return Number.isNaN(datum.getTime()) ? null : datum;
};

const geaendertAm = (ereignis: GraphTermin): Date | null => {
  if (ereignis.lastModifiedDateTime === undefined) {
    return null;
  }

  const datum = new Date(ereignis.lastModifiedDateTime);

  return Number.isNaN(datum.getTime()) ? null : datum;
};

const alsEvent = (
  ereignis: GraphTermin,
  uid: string,
): (IcsEvent & { startsAt: Date }) | null => {
  const ganz = ereignis.isAllDay === true;
  const start = zeitpunkt(ereignis.start, ganz);
  const ende = zeitpunkt(ereignis.end, ganz);

  if (start === null || ende === null) {
    return null;
  }

  const betreff = ereignis.subject ?? '';

  return {
    uid,
    startsAt: start,
    endsAt: ende,
    allDay: ganz,
    summary: betreff.startsWith(ABGESAGT)
      ? betreff.slice(ABGESAGT.length)
      : betreff,
    description: ereignis.body?.content ?? null,
    location: ereignis.location?.displayName ?? null,
    changedAt: geaendertAm(ereignis),
    cancelled: ereignis.isCancelled === true || betreff.startsWith(ABGESAGT),
    privat:
      ereignis.sensitivity === 'private' ||
      ereignis.sensitivity === 'confidential',
  };
};

export const serienTagVon = (ereignis: {
  originalStart?: string;
  occurrenceId?: string | null;
}): string | null => {
  if (ereignis.originalStart !== undefined) {
    const datum = new Date(ereignis.originalStart);

    if (!Number.isNaN(datum.getTime())) {
      return berlinDate(datum);
    }
  }

  return ereignis.occurrenceId === undefined || ereignis.occurrenceId === null
    ? null
    : tagAusOccurrenceId(ereignis.occurrenceId);
};

const tagAusOccurrenceId = (kennung: string): string | null =>
  /\.(\d{4}-\d{2}-\d{2})$/u.exec(kennung)?.[1] ?? null;

const ausgefalleneTage = (serie: GraphTermin): string[] =>
  [
    ...new Set(
      (serie.cancelledOccurrences ?? [])
        .map(tagAusOccurrenceId)
        .filter((tag): tag is string => tag !== null),
    ),
  ].sort();

export const ETAG_ZUSATZ = '~serie:';

export const serienEtag = (serie: GraphTermin): string | null => {
  const eigen = serie['@odata.etag'] ?? null;

  if (serie.type !== 'seriesMaster' && serie.recurrence == null) {
    return eigen;
  }

  const ausnahmen = (serie.exceptionOccurrences ?? [])
    .map(
      (ausnahme) =>
        `${ausnahme.id ?? ''}:${ausnahme.changeKey ?? ausnahme.lastModifiedDateTime ?? ''}`,
    )
    .sort();
  const zusatz = createHash('sha256')
    .update(JSON.stringify([ausgefalleneTage(serie), ausnahmen]))
    .digest('hex')
    .slice(0, 16);

  return `${eigen ?? ''}${ETAG_ZUSATZ}${zusatz}`;
};

export const graphEtag = (etag: string): string => etag.split(ETAG_ZUSATZ)[0];

export const graphZuIcs = (ereignis: GraphTermin): string | null => {
  const uid = ereignis.iCalUId ?? ereignis.id;

  if (uid === undefined) {
    return null;
  }

  const haupt = alsEvent(ereignis, uid);

  if (haupt === null) {
    return null;
  }

  const regel = graphZuRegel(ereignis.recurrence);
  const ausnahmen =
    regel === null
      ? []
      : (ereignis.exceptionOccurrences ?? []).flatMap((ausnahme) => {
          const tag = serienTagVon(ausnahme);
          const event = tag === null ? null : alsEvent(ausnahme, uid);

          return event === null || tag === null
            ? []
            : [
                {
                  ...event,
                  ausnahmeVon: {
                    tag,
                    ganztaegig: haupt.allDay === true,
                    uhrzeit: berlinTime(haupt.startsAt),
                  },
                },
              ];
        });
  const vertreten = new Set(ausnahmen.map((event) => event.ausnahmeVon.tag));
  const juengste = [haupt, ...ausnahmen]
    .map((event) => event.changedAt?.getTime() ?? 0)
    .reduce((a, b) => Math.max(a, b), 0);
  const serie: IcsEvent = {
    ...haupt,
    recurrence: regel === null ? null : formatRule(regel),
    skippedDates:
      regel === null
        ? []
        : ausgefalleneTage(ereignis).filter((tag) => !vertreten.has(tag)),
    changedAt: juengste === 0 ? null : new Date(juengste),
    organizerEmail: ereignis.organizer?.emailAddress?.address ?? null,
    organizerName: ereignis.organizer?.emailAddress?.name ?? null,
    attendees: (ereignis.attendees ?? [])
      .filter((eintrag) => eintrag.emailAddress?.address !== undefined)
      .map((eintrag) => ({
        email: eintrag.emailAddress?.address ?? null,
        name: eintrag.emailAddress?.name ?? null,
        partstat: ANTWORT[eintrag.status?.response ?? ''] ?? 'NEEDS-ACTION',
      })),
  };

  return buildIcs([serie, ...ausnahmen], { ohneMethode: true });
};

const AUSWAHL =
  'id,iCalUId,subject,body,location,start,end,isAllDay,isCancelled,sensitivity,recurrence,lastModifiedDateTime,attendees,organizer,type';
const AUSWAHL_SERIE = `${AUSWAHL},changeKey,originalStart,occurrenceId,cancelledOccurrences,exceptionOccurrences`;
const TAG_MS = 24 * 60 * 60 * 1000;

const tagPlus = (tag: string, tage: number): string =>
  new Date(Date.parse(`${tag}T00:00:00Z`) + tage * TAG_MS)
    .toISOString()
    .slice(0, 10);

const tageZwischen = (von: string, bis: string): number =>
  Math.round(
    (Date.parse(`${bis}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`)) / TAG_MS,
  );

const tagZuGraph = (termin: GelesenerTermin): Record<string, unknown> => {
  const { recurrence: _ohne, ...inhalt } = terminZuGraph({
    ...termin,
    regel: null,
  });

  return inhalt;
};

const gleicherTag = (dort: GraphTermin, soll: GelesenerTermin): boolean => {
  const event = alsEvent(dort, '');

  return (
    event !== null &&
    event.startsAt.getTime() === soll.startsAt.getTime() &&
    event.endsAt.getTime() === soll.endsAt.getTime() &&
    event.allDay === soll.ganztaegig &&
    event.summary === soll.titel &&
    event.cancelled === soll.abgesagt &&
    (event.location ?? '') === (soll.ort ?? '') &&
    (event.description ?? '') === (soll.beschreibung ?? '')
  );
};

const serieAmTag = (serie: GelesenerTermin, tag: string): GelesenerTermin => {
  if (serie.ganztaegig) {
    const dauer = tageZwischen(
      berlinDate(serie.startsAt),
      berlinDate(serie.endsAt),
    );

    return {
      ...serie,
      startsAt: instantFromBerlin(tag, '00:00'),
      endsAt: instantFromBerlin(tagPlus(tag, Math.max(1, dauer)), '00:00'),
    };
  }

  const startsAt = instantFromBerlin(tag, berlinTime(serie.startsAt));

  return {
    ...serie,
    startsAt,
    endsAt: new Date(
      startsAt.getTime() + serie.endsAt.getTime() - serie.startsAt.getTime(),
    ),
  };
};

const gleicheSerie = (dort: GraphTermin, soll: GelesenerTermin): boolean => {
  const event = alsEvent(dort, '');
  const regel = graphZuRegel(dort.recurrence);
  let sollRegel: string | null = null;

  try {
    sollRegel = soll.regel === null ? null : formatRule(parseRule(soll.regel));
  } catch {
    return false;
  }

  return (
    event !== null &&
    regel !== null &&
    sollRegel !== null &&
    formatRule(regel) === sollRegel &&
    event.allDay === soll.ganztaegig &&
    event.startsAt.getTime() === soll.startsAt.getTime() &&
    event.endsAt.getTime() === soll.endsAt.getTime()
  );
};

export class GraphKalenderClient implements KalenderKlient {
  constructor(
    private readonly transport: Transport,
    private readonly bearer: () => Promise<string>,
  ) {}

  private async anfrage(
    methode: string,
    adresse: string,
    rumpf?: unknown,
    kopf: Record<string, string> = {},
  ): Promise<HttpAntwort> {
    const url = new URL(adresse);

    if (url.protocol !== 'https:' || url.hostname !== GRAPH_HOST) {
      throw new KalenderFehler('Unerwartete Adresse des Kalenderanbieters.');
    }

    const antwort = await this.transport({
      methode,
      url,
      kopf: {
        authorization: `Bearer ${await this.bearer()}`,
        accept: 'application/json',
        prefer: 'outlook.timezone="UTC", outlook.body-content-type="text"',
        ...(rumpf === undefined ? {} : { 'content-type': 'application/json' }),
        ...kopf,
      },
      rumpf: rumpf === undefined ? undefined : JSON.stringify(rumpf),
    });

    if (antwort.status === 401 || antwort.status === 403) {
      throw new KalenderFehler(
        'Microsoft hat den Zugriff auf den Kalender abgelehnt. Bitte neu verbinden.',
      );
    }

    return antwort;
  }

  private json<T>(antwort: HttpAntwort): T {
    try {
      return JSON.parse(antwort.rumpf) as T;
    } catch {
      throw new KalenderFehler('Microsoft hat unverständlich geantwortet.');
    }
  }

  async entdecken(): Promise<GefundenerKalender[]> {
    const antwort = await this.anfrage(
      'GET',
      `${GRAPH}/me/calendars?$select=id,name,canEdit,isDefaultCalendar&$top=100`,
    );

    if (antwort.status !== 200) {
      throw new KalenderFehler('Die Kalender ließen sich nicht abrufen.');
    }

    const liste =
      this.json<{
        value?: {
          id?: string;
          name?: string;
          canEdit?: boolean;
          isDefaultCalendar?: boolean;
        }[];
      }>(antwort).value ?? [];

    return liste
      .filter(
        (eintrag): eintrag is typeof eintrag & { id: string } =>
          typeof eintrag.id === 'string' && eintrag.canEdit !== false,
      )
      .sort(
        (a, b) =>
          Number(b.isDefaultCalendar === true) -
          Number(a.isDefaultCalendar === true),
      )
      .map((eintrag) => ({
        url: `${GRAPH}/me/calendars/${encodeURIComponent(eintrag.id)}`,
        name: (eintrag.name ?? 'Kalender').slice(0, 200),
      }));
  }

  neueAdresse(kalenderUrl: string, name: string): string {
    return `${kalenderUrl}/events#neu-${name}`;
  }

  async ablegen(
    href: string,
    ics: string,
    bedingung: { etag?: string | null; erzwingen?: boolean } = {},
  ): Promise<Ablageergebnis> {
    const datei = liesIcs(ics);
    const termin = datei.termine[0];

    if (termin === undefined) {
      throw new KalenderFehler('Der Termin ließ sich nicht übersetzen.');
    }

    const inhalt = terminZuGraph(termin);
    const neu = href.includes('#neu-');
    const serie = termin.regel !== null && inhalt.recurrence !== null;
    let ifMatch: string | null =
      bedingung.erzwingen !== true &&
      bedingung.etag !== undefined &&
      bedingung.etag !== null
        ? graphEtag(bedingung.etag)
        : null;

    if (!neu && serie) {
      const vorher = await this.serieHolen(href);

      if (vorher !== null) {
        const dortStand =
          bedingung.etag?.includes(ETAG_ZUSATZ) === true
            ? serienEtag(vorher)
            : (vorher['@odata.etag'] ?? null);

        if (ifMatch !== null && dortStand !== bedingung.etag) {
          return { etag: null, konflikt: true };
        }

        if (gleicheSerie(vorher, termin)) {
          delete inhalt.recurrence;
          delete inhalt.start;
          delete inhalt.end;
          delete inhalt.isAllDay;
        }

        ifMatch =
          bedingung.erzwingen === true
            ? null
            : (vorher['@odata.etag'] ?? ifMatch);
      }
    }

    const antwort = neu
      ? await this.anfrage('POST', href.split('#')[0], {
          ...inhalt,
          transactionId: termin.uid.slice(0, 100),
        })
      : await this.anfrage(
          'PATCH',
          href,
          inhalt,
          ifMatch === null ? {} : { 'if-match': ifMatch },
        );

    if (antwort.status === 412) {
      return { etag: null, konflikt: true };
    }

    if (antwort.status < 200 || antwort.status >= 300) {
      throw new KalenderFehler(
        `Der Kalender hat den Termin nicht angenommen (${String(antwort.status)}).`,
      );
    }

    const ereignis = this.json<GraphTermin>(antwort);
    const adresse =
      neu && typeof ereignis.id === 'string'
        ? `${GRAPH}/me/events/${encodeURIComponent(ereignis.id)}`
        : href;
    let etag = ereignis['@odata.etag'] ?? null;

    if (serie && !adresse.includes('#neu-')) {
      const stand = await this.tageAblegen(adresse, termin, datei.ausnahmen);

      etag = stand === null ? etag : serienEtag(stand);
    }

    return {
      etag,
      konflikt: false,
      ...(neu && adresse !== href ? { href: adresse } : {}),
    };
  }

  private async serieHolen(href: string): Promise<GraphTermin | null> {
    const antwort = await this.anfrage(
      'GET',
      `${href}?$select=${AUSWAHL_SERIE}&$expand=exceptionOccurrences`,
    );

    if (antwort.status === 404 || antwort.status === 410) {
      return null;
    }

    if (antwort.status !== 200) {
      throw new KalenderFehler(
        `Die Serie ließ sich nicht laden (${String(antwort.status)}).`,
      );
    }

    return this.json<GraphTermin>(antwort);
  }

  private async vorkommen(
    href: string,
    tag: string,
  ): Promise<GraphTermin | null> {
    const abfrage = new URLSearchParams({
      startDateTime: instantFromBerlin(tag, '00:00').toISOString(),
      endDateTime: instantFromBerlin(tagPlus(tag, 1), '00:00').toISOString(),
      $select: 'id,originalStart,occurrenceId,type',
    });
    const antwort = await this.anfrage(
      'GET',
      `${href}/instances?${abfrage.toString()}`,
    );

    if (antwort.status !== 200) {
      return null;
    }

    return (
      (this.json<{ value?: GraphTermin[] }>(antwort).value ?? []).find(
        (eintrag) => serienTagVon(eintrag) === tag,
      ) ?? null
    );
  }

  private async tagSchreiben(id: string, soll: GelesenerTermin): Promise<void> {
    const antwort = await this.anfrage(
      'PATCH',
      `${GRAPH}/me/events/${encodeURIComponent(id)}`,
      tagZuGraph(soll),
    );

    if (antwort.status < 200 || antwort.status >= 300) {
      throw new KalenderFehler(
        `Der Kalender hat den geänderten Tag nicht angenommen (${String(antwort.status)}).`,
      );
    }
  }

  private async tageAblegen(
    href: string,
    serie: GelesenerTermin,
    ausnahmen: GelesenerTermin[],
  ): Promise<GraphTermin | null> {
    const stand = await this.serieHolen(href);

    if (stand === null) {
      return null;
    }

    const ausgefallen = new Set(ausgefalleneTage(stand));
    const dortGeaendert = new Map<string, GraphTermin>();

    for (const ausnahme of stand.exceptionOccurrences ?? []) {
      const tag = serienTagVon(ausnahme);

      if (tag !== null && typeof ausnahme.id === 'string') {
        dortGeaendert.set(tag, ausnahme);
      }
    }

    const hierGeaendert = new Map<string, GelesenerTermin>();

    for (const ausnahme of ausnahmen) {
      if (ausnahme.serienTag !== null) {
        hierGeaendert.set(ausnahme.serienTag, ausnahme);
      }
    }

    let geschrieben = false;

    for (const [tag, soll] of hierGeaendert) {
      if (ausgefallen.has(tag)) {
        continue;
      }

      const dort = dortGeaendert.get(tag) ?? (await this.vorkommen(href, tag));

      if (
        dort?.id === undefined ||
        (dortGeaendert.has(tag) && gleicherTag(dort, soll))
      ) {
        continue;
      }

      await this.tagSchreiben(dort.id, soll);
      geschrieben = true;
    }

    for (const tag of serie.ausfaelle) {
      if (ausgefallen.has(tag) || hierGeaendert.has(tag)) {
        continue;
      }

      const dort = dortGeaendert.get(tag) ?? (await this.vorkommen(href, tag));

      if (dort?.id === undefined) {
        continue;
      }

      const antwort = await this.anfrage(
        'DELETE',
        `${GRAPH}/me/events/${encodeURIComponent(dort.id)}`,
      );

      if (
        antwort.status !== 404 &&
        antwort.status !== 410 &&
        (antwort.status < 200 || antwort.status >= 300)
      ) {
        throw new KalenderFehler(
          `Der Kalender hat das Löschen eines Tages abgelehnt (${String(antwort.status)}).`,
        );
      }

      geschrieben = true;
    }

    for (const [tag, dort] of dortGeaendert) {
      if (hierGeaendert.has(tag) || serie.ausfaelle.includes(tag)) {
        continue;
      }

      const soll = serieAmTag(serie, tag);

      if (dort.id === undefined || gleicherTag(dort, soll)) {
        continue;
      }

      await this.tagSchreiben(dort.id, soll);
      geschrieben = true;
    }

    return geschrieben ? this.serieHolen(href) : stand;
  }

  async loeschen(href: string): Promise<void> {
    if (href.includes('#neu-')) {
      return;
    }

    const antwort = await this.anfrage('DELETE', href);

    if (
      antwort.status !== 404 &&
      antwort.status !== 410 &&
      (antwort.status < 200 || antwort.status >= 300)
    ) {
      throw new KalenderFehler(
        `Der Kalender hat das Löschen abgelehnt (${String(antwort.status)}).`,
      );
    }
  }

  private objekt(ereignis: GraphTermin): KalenderObjekt[] {
    const ics = graphZuIcs(ereignis);

    return ics === null || typeof ereignis.id !== 'string'
      ? []
      : [
          {
            href: `${GRAPH}/me/events/${encodeURIComponent(ereignis.id)}`,
            etag: serienEtag(ereignis),
            ics,
          },
        ];
  }

  private async alle(adresse: string): Promise<GraphTermin[]> {
    const ergebnis: GraphTermin[] = [];
    let naechste: string | undefined = adresse;

    for (let seite = 0; naechste !== undefined; seite += 1) {
      if (seite >= HOECHSTENS_SEITEN) {
        throw new KalenderFehler('Der Kalender liefert zu viele Termine.');
      }

      const antwort = await this.anfrage('GET', naechste);

      if (antwort.status !== 200) {
        throw new KalenderFehler(
          `Der Kalender ließ sich nicht abfragen (${String(antwort.status)}).`,
        );
      }

      const inhalt = this.json<{
        value?: GraphTermin[];
        '@odata.nextLink'?: string;
      }>(antwort);

      ergebnis.push(...(inhalt.value ?? []));
      naechste = inhalt['@odata.nextLink'];
    }

    return ergebnis;
  }

  async abfragen(
    kalenderUrl: string,
    von: Date,
    bis: Date,
  ): Promise<KalenderObjekt[]> {
    const abfrage = (filter: string): string =>
      `${kalenderUrl}/events?${new URLSearchParams({
        $filter: filter,
        $select: AUSWAHL,
        $top: '100',
      }).toString()}`;
    const einzelne = await this.alle(
      abfrage(
        `type eq 'singleInstance' and start/dateTime lt '${ohneZone(bis)}' and end/dateTime gt '${ohneZone(von)}'`,
      ),
    );
    const serien = await this.alle(abfrage(`type eq 'seriesMaster'`));
    const vollstaendig: GraphTermin[] = [];

    for (const serie of serien) {
      vollstaendig.push(
        typeof serie.id === 'string'
          ? ((await this.serieHolen(
              `${GRAPH}/me/events/${encodeURIComponent(serie.id)}`,
            )) ?? serie)
          : serie,
      );
    }

    return [...einzelne, ...vollstaendig].flatMap((ereignis) =>
      this.objekt(ereignis),
    );
  }

  async holen(href: string): Promise<KalenderObjekt | null> {
    if (href.includes('#neu-')) {
      return null;
    }

    const antwort = await this.anfrage('GET', `${href}?$select=${AUSWAHL}`);

    if (antwort.status === 404 || antwort.status === 410) {
      return null;
    }

    if (antwort.status !== 200) {
      throw new KalenderFehler(
        `Der Termin ließ sich nicht laden (${String(antwort.status)}).`,
      );
    }

    const ereignis = this.json<GraphTermin>(antwort);
    const vollstaendig =
      ereignis.type === 'seriesMaster' ? await this.serieHolen(href) : ereignis;

    return vollstaendig === null
      ? null
      : (this.objekt(vollstaendig)[0] ?? null);
  }
}
