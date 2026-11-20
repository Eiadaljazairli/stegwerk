import { alsKlartext } from '../crm/formatierter-text';
import { instantFromBerlin } from './berlin-time';
import { type IcsEvent } from './ics';

export const AUFGABE_DAUER_MS = 30 * 60 * 1000;

const naechsterTag = (datum: string): string => {
  const tag = new Date(`${datum}T12:00:00Z`);

  tag.setUTCDate(tag.getUTCDate() + 1);

  return tag.toISOString().slice(0, 10);
};

export const aufgabeAlsEvent = (
  aufgabe: {
    id: string;
    title: string;
    description: string | null;
    dueDate: string;
    dueTime: string | null;
    updatedAt: Date;
  },
  host: string,
): IcsEvent => {
  const mitUhrzeit = aufgabe.dueTime !== null;
  const beginn = instantFromBerlin(
    aufgabe.dueDate,
    mitUhrzeit ? (aufgabe.dueTime ?? '00:00') : '00:00',
  );

  return {
    uid: `aufgabe-${aufgabe.id}@${host}`,
    startsAt: beginn,
    endsAt: mitUhrzeit
      ? new Date(beginn.getTime() + AUFGABE_DAUER_MS)
      : instantFromBerlin(naechsterTag(aufgabe.dueDate), '00:00'),
    allDay: !mitUhrzeit,
    summary: `Aufgabe: ${aufgabe.title}`,
    description:
      aufgabe.description === null ? null : alsKlartext(aufgabe.description),
    changedAt: aufgabe.updatedAt,
  };
};
