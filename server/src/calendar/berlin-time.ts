const ZONE = 'Europe/Berlin';

const PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const berlinParts = (
  instant: Date,
): { date: string; hour: number; minute: number } => {
  const parts = PARTS.formatToParts(instant);
  const get = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? '00';

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
  };
};

export const berlinDate = (instant: Date): string => berlinParts(instant).date;

export const berlinTime = (instant: Date): string => {
  const { hour, minute } = berlinParts(instant);

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

export const berlinOffsetMinutes = (instant: Date): number => {
  const shown = berlinParts(instant);
  const asUtc = Date.parse(
    `${shown.date}T${String(shown.hour).padStart(2, '0')}:${String(
      shown.minute,
    ).padStart(2, '0')}:00Z`,
  );

  const toTheMinute = Math.floor(instant.getTime() / 60_000) * 60_000;

  return (asUtc - toTheMinute) / 60_000;
};

const offsetAt = (instant: Date): number =>
  berlinOffsetMinutes(instant) * 60_000;

export const instantFromBerlin = (date: string, time: string): Date => {
  const clock = /^(\d{1,2}):(\d{2})$/.exec(time);

  if (clock === null) {
    throw new Error(`Kein gültiger Zeitpunkt: ${date} ${time}`);
  }

  const hour = Number(clock[1]);
  const minute = Number(clock[2]);

  if (hour > 23 || minute > 59) {
    throw new Error(`Diese Uhrzeit gibt es nicht: ${time}`);
  }

  const naive = Date.parse(
    `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`,
  );

  if (Number.isNaN(naive)) {
    throw new Error(`Kein gültiger Zeitpunkt: ${date} ${time}`);
  }

  if (new Date(naive).toISOString().slice(0, 10) !== date) {
    throw new Error(`Kein gültiger Zeitpunkt: ${date} ${time}`);
  }

  const rough = new Date(naive - offsetAt(new Date(naive)));

  return new Date(naive - offsetAt(rough));
};

export type Window = {
  startsAt: Date;
  endsAt: Date;
};

export const overlaps = (left: Window, right: Window): boolean =>
  left.startsAt.getTime() < right.endsAt.getTime() &&
  right.startsAt.getTime() < left.endsAt.getTime();

export const durationMinutes = (window: Window): number =>
  Math.round((window.endsAt.getTime() - window.startsAt.getTime()) / 60_000);

export const spansMidnight = (window: Window): boolean =>
  berlinDate(window.startsAt) !== berlinDate(window.endsAt);

export const daysCovered = (window: Window): string[] => {
  const days: string[] = [];
  const last = berlinDate(window.endsAt);

  let cursor = new Date(window.startsAt.getTime());
  let current = berlinDate(cursor);

  days.push(current);

  for (let guard = 0; guard < 366 && current !== last; guard += 1) {
    cursor = new Date(cursor.getTime() + 86_400_000);
    current = berlinDate(cursor);

    if (!days.includes(current)) {
      days.push(current);
    }
  }

  return days;
};

export const BERLIN_HEUTE_SQL = `(now() AT TIME ZONE '${ZONE}')::date`;

export const berlinWandzeitSql = (ausdruck: string): string =>
  `(${ausdruck} AT TIME ZONE '${ZONE}')`;
