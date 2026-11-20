export const RECURRENCE_MODES = [
  'NONE',
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'MONTHLY_WEEKDAY',
  'YEARLY',
] as const;

export type RecurrenceMode = (typeof RECURRENCE_MODES)[number];

export const RECURRENCE_MODE_LABELS: Record<RecurrenceMode, string> = {
  NONE: 'Einmalig',
  DAILY: 'Täglich',
  WEEKLY: 'Wöchentlich',
  MONTHLY: 'Monatlich, am selben Tag',
  MONTHLY_WEEKDAY: 'Monatlich, am selben Wochentag',
  YEARLY: 'Jährlich',
};

export const WEEKDAY_CODES = [
  'MO',
  'TU',
  'WE',
  'TH',
  'FR',
  'SA',
  'SU',
] as const;

export const WEEKDAY_SHORT = [
  'Mo',
  'Di',
  'Mi',
  'Do',
  'Fr',
  'Sa',
  'So',
] as const;

export type RecurrenceForm = {
  mode: RecurrenceMode;
  interval: number;
  weekdays: number[];
  ends: 'NEVER' | 'UNTIL' | 'COUNT';
  until: string;
  count: number;
};

export const EMPTY_RECURRENCE: RecurrenceForm = {
  mode: 'NONE',
  interval: 1,
  weekdays: [],
  ends: 'NEVER',
  until: '',
  count: 10,
};

export const toRule = (
  form: RecurrenceForm,
  startDate: string,
): string | null => {
  if (form.mode === 'NONE') {
    return null;
  }

  const parts: string[] = [];

  parts.push(`FREQ=${form.mode === 'MONTHLY_WEEKDAY' ? 'MONTHLY' : form.mode}`);

  if (form.interval > 1) {
    parts.push(`INTERVAL=${String(form.interval)}`);
  }

  if (form.mode === 'WEEKLY' && form.weekdays.length > 0) {
    parts.push(
      `BYDAY=${[...form.weekdays]
        .sort((left, right) => left - right)
        .map((weekday) => WEEKDAY_CODES[weekday])
        .join(',')}`,
    );
  }

  if (form.mode === 'MONTHLY_WEEKDAY') {
    parts.push(`BYDAY=${nthWeekdayOf(startDate)}`);
  }

  if (form.ends === 'UNTIL' && form.until !== '') {
    parts.push(`UNTIL=${form.until.replace(/-/g, '')}`);
  }

  if (form.ends === 'COUNT') {
    parts.push(`COUNT=${String(form.count)}`);
  }

  return parts.join(';');
};

export const nthWeekdayOf = (date: string): string => {
  const day = new Date(`${date}T00:00:00Z`);
  const weekday = (day.getUTCDay() + 6) % 7;
  const dayOfMonth = day.getUTCDate();
  const nth = Math.ceil(dayOfMonth / 7);

  const lastOfMonth = new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0),
  ).getUTCDate();

  const vonHinten = Math.ceil((lastOfMonth - dayOfMonth + 1) / 7);

  return vonHinten === 1
    ? `-1${WEEKDAY_CODES[weekday]}`
    : `${String(nth)}${WEEKDAY_CODES[weekday]}`;
};

export const fromRule = (rule: string | null): RecurrenceForm => {
  if (rule === null || rule.trim() === '') {
    return { ...EMPTY_RECURRENCE };
  }

  const parts = new Map<string, string>();

  for (const part of rule.split(';')) {
    const at = part.indexOf('=');

    if (at > 0) {
      parts.set(
        part.slice(0, at).toUpperCase(),
        part.slice(at + 1).toUpperCase(),
      );
    }
  }

  const freq = parts.get('FREQ');
  const byDay = parts.get('BYDAY');

  if (freq === undefined) {
    return { ...EMPTY_RECURRENCE };
  }

  const mode: RecurrenceMode =
    freq === 'MONTHLY'
      ? byDay === undefined
        ? 'MONTHLY'
        : 'MONTHLY_WEEKDAY'
      : freq === 'DAILY' || freq === 'WEEKLY' || freq === 'YEARLY'
        ? freq
        : 'NONE';

  if (mode === 'NONE') {
    return { ...EMPTY_RECURRENCE };
  }

  const until = parts.get('UNTIL');
  const count = parts.get('COUNT');

  return {
    mode,
    interval: Number(parts.get('INTERVAL') ?? '1') || 1,
    weekdays:
      freq === 'WEEKLY' && byDay !== undefined
        ? byDay
            .split(',')
            .map((code) =>
              WEEKDAY_CODES.indexOf(code as (typeof WEEKDAY_CODES)[number]),
            )
            .filter((index) => index >= 0)
        : [],
    ends:
      until !== undefined ? 'UNTIL' : count !== undefined ? 'COUNT' : 'NEVER',
    until:
      until === undefined
        ? ''
        : `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`,
    count: count === undefined ? 10 : Number(count) || 10,
  };
};
