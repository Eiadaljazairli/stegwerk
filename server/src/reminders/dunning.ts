import { registerEnumType } from '@nestjs/graphql';

export enum DunningLevel {
  NONE = 'none',
  DUE = 'due',
  REMINDER = 'reminder',
  FIRST = 'first',
  FINAL = 'final',
}

registerEnumType(DunningLevel, { name: 'DunningLevel' });

export const DUNNING_ORDER: readonly DunningLevel[] = [
  DunningLevel.REMINDER,
  DunningLevel.FIRST,
  DunningLevel.FINAL,
];

export const DAYS_BETWEEN_STEPS = 7;

export const DEFAULT_AFTER_DAYS = 30;

export const INTEREST_SURCHARGE_CONSUMER = 5;
export const INTEREST_SURCHARGE_BUSINESS = 9;

export const LATE_FEE_BUSINESS_CENTS = 4000;

export const daysBetween = (from: string, to: string): number => {
  const start = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return 0;
  }

  return Math.round((end - start) / 86_400_000);
};

export type ReminderRecord = {
  level: DunningLevel;
  sentOn: string;
};

export type DunningSubject = {
  dueOn: string | null;
  settled: boolean;
  sent: ReminderRecord[];
};

export type DunningState = {
  level: DunningLevel;
  daysOverdue: number;
  nextStep: DunningLevel | null;
  nextStepOn: string | null;
  inDefault: boolean;
};

const addDays = (date: string, days: number): string => {
  const moment = new Date(`${date.slice(0, 10)}T00:00:00Z`);

  moment.setUTCDate(moment.getUTCDate() + days);

  return moment.toISOString().slice(0, 10);
};

export const dunningStateOf = (
  invoice: DunningSubject,
  today: string,
): DunningState => {
  if (invoice.settled || invoice.dueOn === null) {
    return {
      level: DunningLevel.NONE,
      daysOverdue: 0,
      nextStep: null,
      nextStepOn: null,
      inDefault: false,
    };
  }

  const overdue = daysBetween(invoice.dueOn, today);

  if (overdue <= 0) {
    return {
      level: DunningLevel.NONE,
      daysOverdue: overdue,
      nextStep: null,
      nextStepOn: null,
      inDefault: false,
    };
  }

  let highest: DunningLevel = DunningLevel.DUE;
  let lastSentOn: string | null = null;

  for (const record of invoice.sent) {
    const rank = DUNNING_ORDER.indexOf(record.level);

    if (rank === -1) {
      continue;
    }

    if (rank >= DUNNING_ORDER.indexOf(highest)) {
      highest = record.level;
    }

    if (lastSentOn === null || record.sentOn > lastSentOn) {
      lastSentOn = record.sentOn;
    }
  }

  const reachedRank = DUNNING_ORDER.indexOf(highest);
  const nextStep = DUNNING_ORDER[reachedRank + 1] ?? null;

  const earliest =
    lastSentOn === null ? today : addDays(lastSentOn, DAYS_BETWEEN_STEPS);

  return {
    level: highest,
    daysOverdue: overdue,
    nextStep,
    nextStepOn: nextStep === null || earliest <= today ? null : earliest,
    inDefault: overdue >= DEFAULT_AFTER_DAYS,
  };
};

export const mayRemindToday = (state: DunningState): boolean =>
  state.nextStep !== null && state.nextStepOn === null;

export const interestCents = (
  grossCents: number,
  days: number,
  baseRatePercent: number | null,
  isConsumer: boolean,
): number => {
  if (baseRatePercent === null || days <= 0 || grossCents <= 0) {
    return 0;
  }

  const rate =
    baseRatePercent +
    (isConsumer ? INTEREST_SURCHARGE_CONSUMER : INTEREST_SURCHARGE_BUSINESS);

  if (rate <= 0) {
    return 0;
  }

  return Math.round((grossCents * (rate / 100) * days) / 365);
};

export const lateFeeCents = (
  isConsumer: boolean,
  inDefault: boolean,
): number => (isConsumer || !inDefault ? 0 : LATE_FEE_BUSINESS_CENTS);
