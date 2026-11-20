import type { Darstellung } from './ansichtLink';

export type View = 'open' | 'inArbeit' | 'overdue' | 'done';

export const VIEWS: { value: View; label: string }[] = [
  { value: 'open', label: 'Offen' },
  { value: 'inArbeit', label: 'In Arbeit' },
  { value: 'overdue', label: 'Überfällig' },
  { value: 'done', label: 'Erledigt' },
];

export const istView = (wert: unknown): wert is View =>
  VIEWS.some((option) => option.value === wert);

type StandFilter = {
  overdue: boolean | null;
  completed: boolean | null;
  status: string | null;
};

export const viewFilters = (view: View): StandFilter => {
  if (view === 'overdue') {
    return { overdue: true, completed: null, status: null };
  }

  if (view === 'inArbeit') {
    return { overdue: null, completed: null, status: 'in_arbeit' };
  }

  return { overdue: null, completed: view === 'done', status: null };
};

export const aufgabenStandFilter = (
  art: Darstellung,
  view: View,
): StandFilter =>
  art === 'liste'
    ? viewFilters(view)
    : { overdue: null, completed: null, status: null };
