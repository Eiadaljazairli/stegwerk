export const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;

export type Frequency = (typeof FREQUENCIES)[number];

export const WEEKDAY_CODES = [
  'MO',
  'TU',
  'WE',
  'TH',
  'FR',
  'SA',
  'SU',
] as const;

export const WEEKDAY_NAMES = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
] as const;

export type WeekdayRef = {
  weekday: number;
  nth: number | null;
};

export type Rule = {
  freq: Frequency;
  interval: number;
  byDay: WeekdayRef[];
  until: string | null;
  count: number | null;
};

const MAX_OCCURRENCES = 750;
const MAX_STEPS = 4000;

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

const asDate = (day: string): Date => new Date(`${day}T00:00:00Z`);

const asDay = (date: Date): string => date.toISOString().slice(0, 10);

export const addDays = (day: string, days: number): string => {
  const date = asDate(day);

  date.setUTCDate(date.getUTCDate() + days);

  return asDay(date);
};

export const addMonths = (day: string, months: number): string => {
  const [year, month, dayOfMonth] = day.split('-').map((part) => Number(part));
  const total = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(total / 12);
  const nextMonth = total - nextYear * 12 + 1;

  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;
};

export const weekdayOf = (day: string): number =>
  (asDate(day).getUTCDay() + 6) % 7;

export const isRealDay = (day: string): boolean =>
  DATE_SHAPE.test(day) && asDay(asDate(day)) === day;

const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

export const parseRule = (text: string): Rule => {
  const rule: Rule = {
    freq: 'WEEKLY',
    interval: 1,
    byDay: [],
    until: null,
    count: null,
  };

  const seen = new Set<string>();
  let hasFreq = false;

  for (const part of text.trim().split(';')) {
    if (part === '') {
      continue;
    }

    const at = part.indexOf('=');

    if (at < 1) {
      throw new Error(`Diese Wiederholung wird nicht unterstützt: ${part}`);
    }

    const name = part.slice(0, at).toUpperCase();
    const value = part.slice(at + 1).toUpperCase();

    if (seen.has(name)) {
      throw new Error(`${name} steht zweimal in der Wiederholung.`);
    }

    seen.add(name);

    switch (name) {
      case 'FREQ': {
        if (!FREQUENCIES.includes(value as Frequency)) {
          throw new Error(
            `Diese Wiederholung wird nicht unterstützt: ${value}`,
          );
        }

        rule.freq = value as Frequency;
        hasFreq = true;
        break;
      }

      case 'INTERVAL': {
        const interval = Number(value);

        if (!/^\d+$/.test(value) || interval < 1 || interval > 999) {
          throw new Error(`Kein gültiger Abstand: ${value}`);
        }

        rule.interval = interval;
        break;
      }

      case 'BYDAY': {
        rule.byDay = value.split(',').map((entry) => parseWeekday(entry));
        break;
      }

      case 'UNTIL': {
        rule.until = parseUntil(value);
        break;
      }

      case 'COUNT': {
        const count = Number(value);

        if (!/^\d+$/.test(value) || count < 1 || count > MAX_OCCURRENCES) {
          throw new Error(`Keine gültige Anzahl: ${value}`);
        }

        rule.count = count;
        break;
      }

      default:
        throw new Error(`Diese Wiederholung wird nicht unterstützt: ${name}`);
    }
  }

  if (!hasFreq) {
    throw new Error('Der Wiederholung fehlt die Angabe, wie oft.');
  }

  if (rule.until !== null && rule.count !== null) {
    throw new Error(
      'Eine Wiederholung endet entweder an einem Tag oder nach einer Anzahl, nicht beides.',
    );
  }

  if (
    rule.byDay.length > 0 &&
    rule.freq !== 'WEEKLY' &&
    rule.freq !== 'MONTHLY'
  ) {
    throw new Error(
      'Wochentage lassen sich nur wöchentlich oder monatlich angeben.',
    );
  }

  if (rule.freq === 'WEEKLY' && rule.byDay.some((day) => day.nth !== null)) {
    throw new Error(
      'Eine wöchentliche Wiederholung kennt keinen "ersten Montag".',
    );
  }

  if (rule.freq === 'MONTHLY' && rule.byDay.length > 1) {
    throw new Error('Monatlich lässt sich nur ein Wochentag angeben.');
  }

  return rule;
};

const parseWeekday = (entry: string): WeekdayRef => {
  const match = /^(-?\d)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(entry);

  if (match === null) {
    throw new Error(`Kein gültiger Wochentag: ${entry}`);
  }

  const nth = match[1] === undefined ? null : Number(match[1]);

  if (nth !== null && (nth === 0 || nth > 5 || nth < -5)) {
    throw new Error(`Kein gültiger Wochentag: ${entry}`);
  }

  return {
    weekday: WEEKDAY_CODES.indexOf(match[2] as (typeof WEEKDAY_CODES)[number]),
    nth,
  };
};

const parseUntil = (value: string): string => {
  const match = /^(\d{4})(\d{2})(\d{2})(T\d{6}Z?)?$/.exec(value);

  if (match === null) {
    throw new Error(`Kein gültiges Ende: ${value}`);
  }

  const day = `${match[1]}-${match[2]}-${match[3]}`;

  if (!isRealDay(day)) {
    throw new Error(`Kein gültiges Ende: ${value}`);
  }

  return day;
};

export const formatRule = (rule: Rule): string => {
  const parts = [`FREQ=${rule.freq}`];

  if (rule.interval !== 1) {
    parts.push(`INTERVAL=${String(rule.interval)}`);
  }

  if (rule.byDay.length > 0) {
    parts.push(
      `BYDAY=${rule.byDay
        .map(
          (day) =>
            `${day.nth === null ? '' : String(day.nth)}${WEEKDAY_CODES[day.weekday]}`,
        )
        .join(',')}`,
    );
  }

  if (rule.until !== null) {
    parts.push(`UNTIL=${rule.until.replace(/-/g, '')}`);
  }

  if (rule.count !== null) {
    parts.push(`COUNT=${String(rule.count)}`);
  }

  return parts.join(';');
};

const ORDINALS = [
  'ersten',
  'zweiten',
  'dritten',
  'vierten',
  'fünften',
] as const;

const weekdayList = (rule: Rule, startDay: string): string => {
  const tage =
    rule.byDay.length === 0
      ? [WEEKDAY_NAMES[weekdayOf(startDay)]]
      : [...rule.byDay]
          .sort((left, right) => left.weekday - right.weekday)
          .map((day) => WEEKDAY_NAMES[day.weekday]);

  return tage.length === 1
    ? tage[0]
    : `${tage.slice(0, -1).join(', ')} und ${tage[tage.length - 1]}`;
};

export const describeRule = (rule: Rule, startDay: string): string => {
  let text: string;

  switch (rule.freq) {
    case 'DAILY':
      text =
        rule.interval === 1 ? 'Täglich' : `Alle ${String(rule.interval)} Tage`;
      break;

    case 'WEEKLY':
      text =
        rule.interval === 1
          ? `Jeden ${weekdayList(rule, startDay)}`
          : `Alle ${String(rule.interval)} Wochen am ${weekdayList(rule, startDay)}`;
      break;

    case 'MONTHLY': {
      const wie =
        rule.interval === 1
          ? 'Monatlich'
          : `Alle ${String(rule.interval)} Monate`;

      if (rule.byDay.length === 1) {
        const { weekday, nth } = rule.byDay[0];
        const zaehlung =
          nth === null
            ? `jeden ${WEEKDAY_NAMES[weekday]}`
            : nth < 0
              ? `am letzten ${WEEKDAY_NAMES[weekday]}`
              : `am ${ORDINALS[nth - 1]} ${WEEKDAY_NAMES[weekday]}`;

        text = `${wie} ${zaehlung}`;
      } else {
        text = `${wie} am ${String(Number(startDay.slice(8)))}.`;
      }
      break;
    }

    case 'YEARLY':
      text =
        rule.interval === 1
          ? 'Jährlich'
          : `Alle ${String(rule.interval)} Jahre`;
      break;
  }

  if (rule.until !== null) {
    const [year, month, day] = rule.until.split('-');

    return `${text}, bis ${Number(day)}.${Number(month)}.${year}`;
  }

  if (rule.count !== null) {
    return `${text}, ${String(rule.count)} Mal`;
  }

  return text;
};

const matchesMonthly = (rule: Rule, startDay: string, day: string): boolean => {
  if (rule.byDay.length === 0) {
    return day.slice(8) === startDay.slice(8);
  }

  const { weekday, nth } = rule.byDay[0];

  if (weekdayOf(day) !== weekday) {
    return false;
  }

  if (nth === null) {
    return true;
  }

  const dayOfMonth = Number(day.slice(8));

  if (nth > 0) {
    return Math.ceil(dayOfMonth / 7) === nth;
  }

  const [year, month] = day.split('-').map((part) => Number(part));

  return Math.ceil((daysInMonth(year, month) - dayOfMonth + 1) / 7) === -nth;
};

export const occurrencesBetween = (
  rule: Rule,
  startDay: string,
  window: { from: string; to: string },
  options: { skip?: readonly string[] } = {},
): string[] => {
  const skip = new Set(options.skip ?? []);
  const found: string[] = [];

  let seen = 0;

  const take = (day: string): boolean => {
    if (rule.count !== null && seen >= rule.count) {
      return false;
    }

    if (rule.until !== null && day > rule.until) {
      return false;
    }

    seen += 1;

    if (day >= window.from && day <= window.to && !skip.has(day)) {
      found.push(day);
    }

    return true;
  };

  if (rule.freq === 'DAILY') {
    for (
      let day = startDay, step = 0;
      step < MAX_STEPS && found.length < MAX_OCCURRENCES && day <= window.to;
      day = addDays(day, rule.interval), step += 1
    ) {
      if (!take(day)) {
        break;
      }
    }

    return found;
  }

  if (rule.freq === 'WEEKLY') {
    const weekdays =
      rule.byDay.length === 0
        ? [weekdayOf(startDay)]
        : [...new Set(rule.byDay.map((day) => day.weekday))].sort(
            (left, right) => left - right,
          );

    let weekStart = addDays(startDay, -weekdayOf(startDay));

    for (
      let step = 0;
      step < MAX_STEPS &&
      found.length < MAX_OCCURRENCES &&
      weekStart <= window.to;
      weekStart = addDays(weekStart, 7 * rule.interval), step += 1
    ) {
      let weiter = true;

      for (const weekday of weekdays) {
        const day = addDays(weekStart, weekday);

        if (day < startDay) {
          continue;
        }

        if (!take(day)) {
          weiter = false;
          break;
        }
      }

      if (!weiter) {
        break;
      }
    }

    return found;
  }

  if (rule.freq === 'MONTHLY') {
    for (
      let cursor = `${startDay.slice(0, 7)}-01`, step = 0;
      step < MAX_STEPS && found.length < MAX_OCCURRENCES && cursor <= window.to;
      cursor = addMonths(cursor, rule.interval), step += 1
    ) {
      const [year, month] = cursor.split('-').map((part) => Number(part));
      const last = daysInMonth(year, month);
      let weiter = true;

      for (let dayOfMonth = 1; dayOfMonth <= last; dayOfMonth += 1) {
        const day = `${cursor.slice(0, 8)}${String(dayOfMonth).padStart(2, '0')}`;

        if (day < startDay || !matchesMonthly(rule, startDay, day)) {
          continue;
        }

        if (!take(day)) {
          weiter = false;
          break;
        }
      }

      if (!weiter) {
        break;
      }
    }

    return found;
  }

  for (
    let year = Number(startDay.slice(0, 4)), step = 0;
    step < MAX_STEPS && found.length < MAX_OCCURRENCES;
    year += rule.interval, step += 1
  ) {
    const day = `${String(year).padStart(4, '0')}${startDay.slice(4)}`;

    if (day > window.to) {
      break;
    }

    if (!isRealDay(day)) {
      continue;
    }

    if (!take(day)) {
      break;
    }
  }

  return found;
};

export const teileRegel = (
  rule: Rule,
  startDay: string,
  day: string,
): { vorher: Rule; nachher: Rule } => {
  const davor = occurrencesBetween(rule, startDay, {
    from: startDay,
    to: addDays(day, -1),
  }).length;

  return {
    vorher:
      rule.count === null
        ? { ...rule, until: addDays(day, -1) }
        : { ...rule, count: Math.max(davor, 1) },
    nachher:
      rule.count === null
        ? { ...rule }
        : { ...rule, count: Math.max(rule.count - davor, 1) },
  };
};
