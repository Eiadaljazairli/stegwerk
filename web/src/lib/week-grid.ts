import { shiftDay, weekdayIndex } from './calendar-grid';

export const MINUTES_PER_DAY = 1440;

export const minutesOf = (time: string): number => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);

  if (match === null) {
    return 0;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    return 0;
  }

  return hours * 60 + minutes;
};

export const weekDays = (anyDayInWeek: string): string[] => {
  const monday = shiftDay(anyDayInWeek, -weekdayIndex(anyDayInWeek));

  return Array.from({ length: 7 }, (_, index) => shiftDay(monday, index));
};

export const weekLabel = (anyDayInWeek: string): string => {
  const days = weekDays(anyDayInWeek);
  const from = new Date(`${days[0]}T00:00:00Z`);
  const to = new Date(`${days[6]}T00:00:00Z`);

  const tag = new Intl.DateTimeFormat('de-DE', {
    day: 'numeric',
    timeZone: 'UTC',
  });
  const monat = new Intl.DateTimeFormat('de-DE', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  const voll = new Intl.DateTimeFormat('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return days[0].slice(0, 7) === days[6].slice(0, 7)
    ? `${tag.format(from)}.–${voll.format(to)}`
    : `${monat.format(from)} – ${voll.format(to)}`;
};

export type Placeable = {
  id: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
};

export const blockOn = (
  appointment: Placeable,
  day: string,
): { top: number; height: number } | null => {
  if (appointment.allDay) {
    return null;
  }

  if (day < appointment.startDate || day > appointment.endDate) {
    return null;
  }

  const top =
    day === appointment.startDate ? minutesOf(appointment.startTime) : 0;
  const bottom =
    day === appointment.endDate
      ? minutesOf(appointment.endTime)
      : MINUTES_PER_DAY;

  if (bottom <= top) {
    return null;
  }

  return { top, height: bottom - top };
};

export type Placed<T> = {
  item: T;
  top: number;
  height: number;
  column: number;
  columns: number;
};

export const layoutDay = <T extends Placeable>(
  appointments: readonly T[],
  day: string,
): Placed<T>[] => {
  const blocks = appointments
    .map((item) => {
      const block = blockOn(item, day);

      return block === null ? null : { item, ...block };
    })
    .filter(
      (entry): entry is { item: T; top: number; height: number } =>
        entry !== null,
    )
    .sort(
      (left, right) =>
        left.top - right.top ||
        right.height - left.height ||
        left.item.id.localeCompare(right.item.id),
    );

  const placed: Placed<T>[] = [];

  const spaltenEnde: number[] = [];

  for (const block of blocks) {
    let column = spaltenEnde.findIndex((ende) => ende <= block.top);

    if (column === -1) {
      column = spaltenEnde.length;
    }

    spaltenEnde[column] = block.top + block.height;
    placed.push({ ...block, column, columns: 1 });
  }

  let gruppeVon = 0;
  let gruppeBis = -1;

  const gruppeAbschliessen = (bisIndex: number): void => {
    const gruppe = placed.slice(gruppeVon, bisIndex);
    const breite = Math.max(...gruppe.map((entry) => entry.column)) + 1;

    for (const entry of gruppe) {
      entry.columns = breite;
    }
  };

  for (let index = 0; index < placed.length; index += 1) {
    const entry = placed[index];

    if (index > gruppeVon && entry.top >= gruppeBis) {
      gruppeAbschliessen(index);
      gruppeVon = index;
      gruppeBis = -1;
    }

    gruppeBis = Math.max(gruppeBis, entry.top + entry.height);
  }

  if (placed.length > 0) {
    gruppeAbschliessen(placed.length);
  }

  return placed;
};

export const visibleHours = (
  appointments: readonly Placeable[],
  days: readonly string[],
  fallback: { from: number; to: number } = { from: 7, to: 20 },
): { from: number; to: number } => {
  let earliest = fallback.from * 60;
  let latest = fallback.to * 60;

  for (const day of days) {
    for (const appointment of appointments) {
      const block = blockOn(appointment, day);

      if (block === null) {
        continue;
      }

      earliest = Math.min(earliest, block.top);
      latest = Math.max(latest, block.top + block.height);
    }
  }

  return {
    from: Math.max(0, Math.floor(earliest / 60)),
    to: Math.min(24, Math.ceil(latest / 60)),
  };
};

export const nowMinutes = (now: Date = new Date()): number => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

  return minutesOf(parts);
};
