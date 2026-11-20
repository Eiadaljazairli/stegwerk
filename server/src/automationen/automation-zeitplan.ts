import { berlinDate, instantFromBerlin } from '../calendar/berlin-time';
import {
  AutomationRhythmus,
  type AutomationZeitplan,
} from './automation.entity';

const UHRZEIT = /^([01]\d|2[0-3]):([0-5]\d)$/u;

const naechsterTag = (datum: string): string => {
  const tag = new Date(`${datum}T12:00:00Z`);

  tag.setUTCDate(tag.getUTCDate() + 1);

  return tag.toISOString().slice(0, 10);
};

const wochentagVon = (datum: string): number => {
  const tag = new Date(`${datum}T12:00:00Z`).getUTCDay();

  return tag === 0 ? 7 : tag;
};

export const pruefeZeitplan = (plan: AutomationZeitplan): string | null => {
  if (!Object.values(AutomationRhythmus).includes(plan.rhythmus)) {
    return 'Bitte wählen, wie oft die Regel läuft.';
  }

  if (!UHRZEIT.test(plan.uhrzeit)) {
    return 'Die Uhrzeit bitte als HH:MM, etwa 08:30.';
  }

  if (
    plan.rhythmus === AutomationRhythmus.WOECHENTLICH &&
    !(
      Number.isInteger(plan.wochentag) &&
      (plan.wochentag as number) >= 1 &&
      (plan.wochentag as number) <= 7
    )
  ) {
    return 'Bitte den Wochentag wählen.';
  }

  if (
    plan.rhythmus === AutomationRhythmus.MONATLICH &&
    !(
      Number.isInteger(plan.monatstag) &&
      (plan.monatstag as number) >= 1 &&
      (plan.monatstag as number) <= 28
    )
  ) {
    return 'Der Tag im Monat liegt zwischen 1 und 28.';
  }

  return null;
};

export const naechsterLauf = (plan: AutomationZeitplan, nach: Date): Date => {
  let datum = berlinDate(nach);

  for (let schritt = 0; schritt < 62; schritt += 1) {
    const passt =
      plan.rhythmus === AutomationRhythmus.TAEGLICH ||
      (plan.rhythmus === AutomationRhythmus.WOECHENTLICH &&
        wochentagVon(datum) === plan.wochentag) ||
      (plan.rhythmus === AutomationRhythmus.MONATLICH &&
        Number(datum.slice(8, 10)) === plan.monatstag);

    if (passt) {
      const zeitpunkt = instantFromBerlin(datum, plan.uhrzeit);

      if (zeitpunkt.getTime() > nach.getTime()) {
        return zeitpunkt;
      }
    }

    datum = naechsterTag(datum);
  }

  throw new Error('Der Zeitplan trifft nie zu.');
};
