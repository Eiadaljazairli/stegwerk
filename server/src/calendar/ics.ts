import { berlinDate, berlinTime, instantFromBerlin } from './berlin-time';

const CRLF = '\r\n';

const MAX_OCTETS = 75;

export const escapeText = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');

export const paramWert = (value: string): string =>
  value.replace(/[\u0000-\u001f\u007f"]+/gu, ' ').trim();

export const foldLine = (line: string): string => {
  const parts: string[] = [];

  let current = '';
  let octets = 0;
  let limit = MAX_OCTETS;

  for (const character of line) {
    const size = Buffer.byteLength(character, 'utf8');

    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
      limit = MAX_OCTETS - 1;
    }

    current += character;
    octets += size;
  }

  parts.push(current);

  return parts.join(`${CRLF} `);
};

export const icsTimestamp = (instant: Date): string =>
  instant
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

export const icsDate = (instant: Date): string =>
  berlinDate(instant).replace(/-/g, '');

export type IcsEvent = {
  uid: string;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  description?: string | null;
  location?: string | null;
  videoLink?: string | null;
  organizerEmail?: string | null;
  organizerName?: string | null;
  attendees?: {
    email: string | null;
    name?: string | null;
    partstat?: string;
  }[];
  allDay?: boolean;
  recurrence?: string | null;
  skippedDates?: readonly string[];
  ausnahmeVon?: { tag: string; ganztaegig: boolean; uhrzeit: string } | null;
  changedAt?: Date | null;
  cancelled?: boolean;
  sequenz?: number;
  rsvp?: boolean;
  privat?: boolean;
};

const line = (name: string, value: string): string => `${name}:${value}`;

const ZONE = 'Europe/Berlin';

const istZeitserie = (event: IcsEvent): boolean =>
  event.allDay !== true &&
  event.recurrence !== null &&
  event.recurrence !== undefined &&
  event.recurrence !== '';

const brauchtZone = (event: IcsEvent): boolean =>
  istZeitserie(event) ||
  (event.ausnahmeVon !== null &&
    event.ausnahmeVon !== undefined &&
    !event.ausnahmeVon.ganztaegig);

const berlinStempel = (instant: Date): string =>
  `${berlinDate(instant).replace(/-/g, '')}T${berlinTime(instant).replace(':', '')}00`;

const VTIMEZONE_BERLIN: readonly string[] = [
  'BEGIN:VTIMEZONE',
  `TZID:${ZONE}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

const regelMitZone = (regel: string): string =>
  regel.replace(
    /UNTIL=(\d{4})(\d{2})(\d{2})(?![\dT])/u,
    (_ganz, j, m, t) =>
      `UNTIL=${icsTimestamp(
        new Date(
          instantFromBerlin(
            `${j as string}-${m as string}-${t as string}`,
            '23:59',
          ).getTime() + 59_000,
        ),
      )}`,
  );

const eventLines = (event: IcsEvent, stamp: Date): string[] => {
  const lines: string[] = [
    'BEGIN:VEVENT',
    line('UID', event.uid),
    line('DTSTAMP', icsTimestamp(event.changedAt ?? stamp)),
    ...(event.allDay === true
      ? [
          `DTSTART;VALUE=DATE:${icsDate(event.startsAt)}`,
          `DTEND;VALUE=DATE:${icsDate(event.endsAt)}`,
        ]
      : istZeitserie(event)
        ? [
            `DTSTART;TZID=${ZONE}:${berlinStempel(event.startsAt)}`,
            `DTEND;TZID=${ZONE}:${berlinStempel(event.endsAt)}`,
          ]
        : [
            line('DTSTART', icsTimestamp(event.startsAt)),
            line('DTEND', icsTimestamp(event.endsAt)),
          ]),
    line('SUMMARY', escapeText(event.summary)),
  ];

  if (event.ausnahmeVon !== null && event.ausnahmeVon !== undefined) {
    const tag = event.ausnahmeVon.tag.replace(/-/g, '');

    lines.push(
      event.ausnahmeVon.ganztaegig
        ? `RECURRENCE-ID;VALUE=DATE:${tag}`
        : `RECURRENCE-ID;TZID=${ZONE}:${tag}T${event.ausnahmeVon.uhrzeit.replace(':', '')}00`,
    );
  }

  if (event.sequenz !== undefined) {
    lines.push(line('SEQUENCE', String(event.sequenz)));
  }

  if (
    event.description !== null &&
    event.description !== undefined &&
    event.description !== ''
  ) {
    lines.push(line('DESCRIPTION', escapeText(event.description)));
  }

  const video =
    event.videoLink === null ||
    event.videoLink === undefined ||
    event.videoLink === ''
      ? null
      : paramWert(event.videoLink);

  if (
    event.location !== null &&
    event.location !== undefined &&
    event.location !== ''
  ) {
    lines.push(line('LOCATION', escapeText(event.location)));
  } else if (video !== null) {
    lines.push(line('LOCATION', escapeText(video)));
  }

  if (video !== null) {
    lines.push(line('URL', video));
  }

  if (event.organizerEmail !== null && event.organizerEmail !== undefined) {
    const name =
      event.organizerName === null || event.organizerName === undefined
        ? ''
        : `;CN="${paramWert(event.organizerName)}"`;

    lines.push(
      line(`ORGANIZER${name}`, `mailto:${paramWert(event.organizerEmail)}`),
    );
  }

  for (const attendee of event.attendees ?? []) {
    if (attendee.email === null || attendee.email === '') {
      continue;
    }

    const name =
      attendee.name === null ||
      attendee.name === undefined ||
      attendee.name === ''
        ? ''
        : `;CN="${paramWert(attendee.name)}"`;

    const partstat =
      attendee.partstat === undefined ? '' : `;PARTSTAT=${attendee.partstat}`;

    lines.push(
      line(
        `ATTENDEE;ROLE=REQ-PARTICIPANT${partstat}${
          event.rsvp === true ? ';RSVP=TRUE' : ''
        }${name}`,
        `mailto:${paramWert(attendee.email)}`,
      ),
    );
  }

  if (
    event.recurrence !== null &&
    event.recurrence !== undefined &&
    event.recurrence !== ''
  ) {
    lines.push(
      line(
        'RRULE',
        event.allDay === true
          ? event.recurrence
          : regelMitZone(event.recurrence),
      ),
    );

    for (const day of event.skippedDates ?? []) {
      lines.push(
        event.allDay === true
          ? `EXDATE;VALUE=DATE:${day.replace(/-/g, '')}`
          : `EXDATE;TZID=${ZONE}:${day.replace(/-/g, '')}T${berlinTime(
              event.startsAt,
            ).replace(':', '')}00`,
      );
    }
  }

  if (event.privat === true) {
    lines.push(line('CLASS', 'PRIVATE'));
  }

  lines.push(
    line('STATUS', event.cancelled === true ? 'CANCELLED' : 'CONFIRMED'),
  );
  lines.push('END:VEVENT');

  return lines;
};

export const buildIcs = (
  events: IcsEvent[],
  options: {
    stamp?: Date;
    name?: string;
    methode?: 'PUBLISH' | 'REQUEST' | 'CANCEL';
    ohneMethode?: boolean;
  } = {},
): string => {
  const stamp = options.stamp ?? new Date();

  const abo =
    options.name === undefined
      ? []
      : [
          `X-WR-CALNAME:${escapeText(options.name)}`,
          'X-WR-TIMEZONE:Europe/Berlin',
          'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
          'X-PUBLISHED-TTL:PT1H',
        ];

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Stegwerk//Kalender//DE',
    'CALSCALE:GREGORIAN',
    ...(options.ohneMethode === true
      ? []
      : [`METHOD:${options.methode ?? 'PUBLISH'}`]),
    ...abo,
    ...(events.some(brauchtZone) ? VTIMEZONE_BERLIN : []),
    ...events.flatMap((event) => eventLines(event, stamp)),
    'END:VCALENDAR',
  ];

  return `${lines.map(foldLine).join(CRLF)}${CRLF}`;
};
