import { DunningLevel } from './dunning';

export type ReminderFacts = {
  invoiceNumber: string;
  issuedOn: string;
  dueOn: string;
  grossCents: number;
  daysOverdue: number;
  interestCents: number;
  lateFeeCents: number;
  payBy: string;
  companyName: string | null;
};

const money = (cents: number): string => {
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const whole = String(Math.floor(absolute / 100)).replace(
    /\B(?=(\d{3})+(?!\d))/gu,
    '.',
  );

  return `${negative ? '-' : ''}${whole},${String(absolute % 100).padStart(2, '0')} €`;
};

const date = (iso: string): string => {
  const [year, month, day] = iso.slice(0, 10).split('-');

  return `${day}.${month}.${year}`;
};

export const LEVEL_LABELS: Record<string, string> = {
  [DunningLevel.REMINDER]: 'Zahlungserinnerung',
  [DunningLevel.FIRST]: '1. Mahnung',
  [DunningLevel.FINAL]: 'Letzte Mahnung',
};

export const reminderSubject = (
  level: DunningLevel,
  facts: ReminderFacts,
): string =>
  `${LEVEL_LABELS[level] ?? 'Zahlungserinnerung'} zu Rechnung ${facts.invoiceNumber}`;

const amountBlock = (facts: ReminderFacts): string[] => {
  const rows = [`Rechnungsbetrag: ${money(facts.grossCents)}`];

  if (facts.interestCents > 0) {
    rows.push(`Verzugszinsen: ${money(facts.interestCents)}`);
  }

  if (facts.lateFeeCents > 0) {
    rows.push(
      `Verzugspauschale nach §288 Abs. 5 BGB: ${money(facts.lateFeeCents)}`,
    );
  }

  if (rows.length > 1) {
    rows.push(
      `Gesamt: ${money(
        facts.grossCents + facts.interestCents + facts.lateFeeCents,
      )}`,
    );
  }

  return rows;
};

const CROSSED = [
  '',
  'Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben,',
  'betrachten Sie es bitte als gegenstandslos.',
];

export const reminderText = (
  level: DunningLevel,
  facts: ReminderFacts,
): string => {
  const anrede = 'Sehr geehrte Damen und Herren,';
  const rechnung = `unsere Rechnung ${facts.invoiceNumber} vom ${date(
    facts.issuedOn,
  )} über ${money(facts.grossCents)} war am ${date(facts.dueOn)} fällig.`;

  if (level === DunningLevel.REMINDER) {
    return [
      anrede,
      '',
      rechnung,
      'Vermutlich ist sie in der Zwischenzeit untergegangen.',
      '',
      `Wir bitten Sie, den Betrag bis zum ${date(facts.payBy)} auf das in der`,
      'Rechnung genannte Konto zu überweisen.',
      '',
      ...amountBlock(facts),
      ...CROSSED,
      '',
      'Mit freundlichen Grüßen',
      facts.companyName ?? '',
    ].join('\n');
  }

  if (level === DunningLevel.FIRST) {
    return [
      anrede,
      '',
      rechnung,
      `Sie ist seit ${String(facts.daysOverdue)} Tagen offen, und unsere`,
      'Zahlungserinnerung ist ohne Antwort geblieben.',
      '',
      `Wir fordern Sie auf, den offenen Betrag bis zum ${date(facts.payBy)}`,
      'auszugleichen.',
      '',
      ...amountBlock(facts),
      ...CROSSED,
      '',
      'Mit freundlichen Grüßen',
      facts.companyName ?? '',
    ].join('\n');
  }

  return [
    anrede,
    '',
    rechnung,
    `Sie ist seit ${String(facts.daysOverdue)} Tagen offen. Unsere bisherigen`,
    'Schreiben sind ohne Antwort geblieben.',
    '',
    `Wir setzen Ihnen eine letzte Frist bis zum ${date(facts.payBy)}.`,
    'Geht der Betrag bis dahin nicht ein, geben wir den Vorgang ab.',
    '',
    ...amountBlock(facts),
    ...CROSSED,
    '',
    'Mit freundlichen Grüßen',
    facts.companyName ?? '',
  ].join('\n');
};
