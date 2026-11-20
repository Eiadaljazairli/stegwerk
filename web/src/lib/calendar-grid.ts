export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

const asDate = (day: string): Date => new Date(`${day}T00:00:00Z`);

const asDay = (date: Date): string => date.toISOString().slice(0, 10);

export const shiftDay = (day: string, days: number): string => {
  const date = asDate(day);

  date.setUTCDate(date.getUTCDate() + days);

  return asDay(date);
};

export const weekdayIndex = (day: string): number =>
  (asDate(day).getUTCDay() + 6) % 7;

export const startOfMonth = (day: string): string => `${day.slice(0, 7)}-01`;

export const shiftMonth = (day: string, months: number): string => {
  const [year, month] = day.split('-').map((part) => Number(part));
  const total = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(total / 12);
  const nextMonth = total - nextYear * 12 + 1;

  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`;
};

export const monthGrid = (anyDayInMonth: string): string[] => {
  const first = startOfMonth(anyDayInMonth);
  const start = shiftDay(first, -weekdayIndex(first));

  return Array.from({ length: 42 }, (_, index) => shiftDay(start, index));
};

export const isSameMonth = (day: string, month: string): boolean =>
  day.slice(0, 7) === month.slice(0, 7);

export const isWeekend = (day: string): boolean => weekdayIndex(day) >= 5;

export const monthLabel = (day: string): string =>
  new Intl.DateTimeFormat('de-DE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(asDate(day));

export const dayLabel = (day: string): string =>
  new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(asDate(day));

export const todayInBerlin = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

export const daysOf = (appointment: {
  startDate: string;
  endDate: string;
  allDay: boolean;
}): string[] => {
  const last =
    appointment.allDay && appointment.endDate > appointment.startDate
      ? shiftDay(appointment.endDate, -1)
      : appointment.endDate;

  const days: string[] = [appointment.startDate];

  for (let guard = 0; guard < 366 && days[days.length - 1] < last; guard += 1) {
    days.push(shiftDay(days[days.length - 1], 1));
  }

  return days;
};
