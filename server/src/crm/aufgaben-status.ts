import {
  berlinDate,
  berlinTime,
  instantFromBerlin,
} from '../calendar/berlin-time';

export const AUFGABEN_STATUS = ['offen', 'in_arbeit', 'erledigt'] as const;

export type AufgabenStatus = (typeof AUFGABEN_STATUS)[number];

export const statusVon = (task: {
  completedAt: Date | null;
  inArbeitSeit: Date | null;
}): AufgabenStatus =>
  task.completedAt !== null
    ? 'erledigt'
    : task.inArbeitSeit !== null
      ? 'in_arbeit'
      : 'offen';

export const faelligAb = (task: {
  dueDate: string | null;
  dueTime: string | null;
}): Date | null =>
  task.dueDate === null || task.dueTime === null
    ? null
    : instantFromBerlin(task.dueDate, task.dueTime);

export const istUeberfaellig = (
  task: {
    completedAt: Date | null;
    dueDate: string | null;
    dueTime: string | null;
  },
  jetzt: Date = new Date(),
): boolean => {
  if (task.completedAt !== null || task.dueDate === null) {
    return false;
  }

  const heute = berlinDate(jetzt);

  if (task.dueDate < heute) {
    return true;
  }

  if (task.dueDate > heute || task.dueTime === null) {
    return false;
  }

  return task.dueTime < berlinTime(jetzt);
};
