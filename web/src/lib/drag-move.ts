import { minutesOf } from './week-grid';

export const SNAP_MINUTES = 15;

export const MIN_MINUTES = 15;

const MINUTES_PER_DAY = 1440;

const dayIndex = (day: string): number =>
  Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);

const dayFromIndex = (index: number): string =>
  new Date(index * 86_400_000).toISOString().slice(0, 10);

const asWall = (absolute: number): { date: string; time: string } => {
  const day = Math.floor(absolute / MINUTES_PER_DAY);
  const minute = absolute - day * MINUTES_PER_DAY;

  return {
    date: dayFromIndex(day),
    time: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(
      minute % 60,
    ).padStart(2, '0')}`,
  };
};

export type Span = {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
};

const asAbsolute = (span: Span): { start: number; end: number } => ({
  start: dayIndex(span.startDate) * MINUTES_PER_DAY + minutesOf(span.startTime),
  end: dayIndex(span.endDate) * MINUTES_PER_DAY + minutesOf(span.endTime),
});

export const snap = (minutes: number, step = SNAP_MINUTES): number =>
  Math.round(minutes / step) * step;

export const isDrag = (
  from: { x: number; y: number },
  to: { x: number; y: number },
  threshold = 4,
): boolean =>
  Math.abs(to.x - from.x) >= threshold || Math.abs(to.y - from.y) >= threshold;

export const movedTo = (
  span: Span,
  move: { days: number; minutes: number },
): Span => {
  const { start, end } = asAbsolute(span);
  const dauer = end - start;

  let neu = start + move.days * MINUTES_PER_DAY + snap(move.minutes);

  const zieltag = Math.floor(
    (start + move.days * MINUTES_PER_DAY) / MINUTES_PER_DAY,
  );

  neu = Math.max(zieltag * MINUTES_PER_DAY, neu);

  const anfang = asWall(neu);
  const schluss = asWall(neu + dauer);

  return {
    startDate: anfang.date,
    startTime: anfang.time,
    endDate: schluss.date,
    endTime: schluss.time,
  };
};

export const resizedTo = (span: Span, minutes: number): Span => {
  const { start, end } = asAbsolute(span);

  const neu = Math.max(start + MIN_MINUTES, snap(end + minutes));
  const schluss = asWall(neu);

  return {
    ...span,
    endDate: schluss.date,
    endTime: schluss.time,
  };
};

export const minutesFromPixels = (
  pixels: number,
  pixelsPerHour: number,
): number => (pixels / pixelsPerHour) * 60;

export const daysFromPixels = (pixels: number, columnWidth: number): number =>
  columnWidth <= 0 ? 0 : Math.round(pixels / columnWidth);

export const moveLabel = (span: Span, allDay: boolean): string => {
  const [year, month, day] = span.startDate.split('-');
  const tag = `${Number(day)}.${Number(month)}.${year}`;

  return allDay ? tag : `${tag}, ${span.startTime}–${span.endTime}`;
};
