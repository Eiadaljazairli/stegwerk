export type DigestTask = {
  id: string;
  title: string;
  dueOn: string | null;
  dueTime?: string | null;
  inArbeit?: boolean;
  done: boolean;
  context: string | null;
};

export type DigestGroups = {
  overdue: DigestTask[];
  today: DigestTask[];
  tomorrow: DigestTask[];
};

export const MAX_PER_GROUP = 15;

const addDays = (date: string, days: number): string => {
  const moment = new Date(`${date.slice(0, 10)}T00:00:00Z`);

  moment.setUTCDate(moment.getUTCDate() + days);

  return moment.toISOString().slice(0, 10);
};

export const groupTasks = (
  tasks: DigestTask[],
  today: string,
): DigestGroups => {
  const tomorrow = addDays(today, 1);
  const groups: DigestGroups = { overdue: [], today: [], tomorrow: [] };

  for (const task of tasks) {
    if (task.done || task.dueOn === null) {
      continue;
    }

    const due = task.dueOn.slice(0, 10);

    if (due < today) {
      groups.overdue.push(task);
    } else if (due === today) {
      groups.today.push(task);
    } else if (due === tomorrow) {
      groups.tomorrow.push(task);
    }
  }

  const schluessel = (task: DigestTask) =>
    `${task.dueOn ?? ''} ${task.dueTime ?? '99:99'}`;

  groups.overdue.sort((left, right) =>
    schluessel(left).localeCompare(schluessel(right)),
  );
  groups.today.sort((left, right) =>
    schluessel(left).localeCompare(schluessel(right)),
  );
  groups.tomorrow.sort((left, right) =>
    schluessel(left).localeCompare(schluessel(right)),
  );

  return groups;
};

export const worthSending = (groups: DigestGroups): boolean =>
  groups.overdue.length > 0 || groups.today.length > 0;

const formatDate = (iso: string): string => {
  const [year, month, day] = iso.slice(0, 10).split('-');

  return `${day}.${month}.${year}`;
};

const lines = (tasks: DigestTask[]): string[] => {
  const shown = tasks.slice(0, MAX_PER_GROUP).map((task) => {
    const context = task.context === null ? '' : ` (${task.context})`;
    const uhr =
      task.dueTime === null || task.dueTime === undefined
        ? ''
        : `, ${task.dueTime} Uhr`;
    const due = task.dueOn === null ? '' : ` — ${formatDate(task.dueOn)}${uhr}`;
    const stand = task.inArbeit === true ? ' [in Arbeit]' : '';

    return `  ${task.title}${due}${context}${stand}`;
  });

  const rest = tasks.length - shown.length;

  return rest > 0 ? [...shown, `  und ${String(rest)} weitere`] : shown;
};

export const digestSubject = (groups: DigestGroups): string => {
  if (groups.overdue.length > 0) {
    return `${String(groups.overdue.length)} überfällige ${
      groups.overdue.length === 1 ? 'Aufgabe' : 'Aufgaben'
    }`;
  }

  return `${String(groups.today.length)} ${
    groups.today.length === 1 ? 'Aufgabe' : 'Aufgaben'
  } heute`;
};

export const digestText = (
  groups: DigestGroups,
  greeting: string,
  link: string,
): string => {
  const parts: string[] = [`Guten Morgen ${greeting},`, ''];

  if (groups.overdue.length > 0) {
    parts.push('Überfällig:', ...lines(groups.overdue), '');
  }

  if (groups.today.length > 0) {
    parts.push('Heute fällig:', ...lines(groups.today), '');
  }

  if (groups.tomorrow.length > 0) {
    parts.push('Morgen:', ...lines(groups.tomorrow), '');
  }

  parts.push(`Alle Aufgaben: ${link}`);

  return parts.join('\n');
};
