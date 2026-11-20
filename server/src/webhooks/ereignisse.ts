import { AsyncLocalStorage } from 'node:async_hooks';
import { EventEmitter } from 'node:events';

export const WEBHOOK_OBJEKTE = [
  'company',
  'contact',
  'deal',
  'note',
  'task',
  'appointment',
  'quote',
  'invoice',
] as const;

export type WebhookObjekt = (typeof WEBHOOK_OBJEKTE)[number];

export const WEBHOOK_AKTIONEN = [
  'created',
  'updated',
  'deleted',
  'restored',
] as const;

export type WebhookAktion = (typeof WEBHOOK_AKTIONEN)[number];

const BESONDERE = [
  'deal.stage_changed',
  'deal.won',
  'deal.lost',
  'deal.contact_added',
  'deal.contact_removed',
  'quote.accepted',
  'quote.declined',
  'invoice.issued',
  'invoice.paid',
  'order_confirmation.issued',
  'order_confirmation.cancelled',
  'delivery_note.issued',
  'delivery_note.cancelled',
] as const;

export type WebhookEreignis =
  | `${WebhookObjekt}.${WebhookAktion}`
  | (typeof BESONDERE)[number];

export const WEBHOOK_EREIGNISSE: readonly WebhookEreignis[] = [
  ...WEBHOOK_OBJEKTE.flatMap((objekt) =>
    WEBHOOK_AKTIONEN.map((aktion) => `${objekt}.${aktion}` as WebhookEreignis),
  ),
  ...BESONDERE,
];

export type Aenderung = { before: unknown; after: unknown };

export type Meldung = {
  workspaceId: string;
  event: WebhookEreignis;
  data: Record<string, unknown>;
  changes?: Record<string, Aenderung>;
};

export const aenderungen = (
  vorher: Record<string, unknown>,
  nachher: Record<string, unknown>,
): Record<string, Aenderung> => {
  const gleich = (a: unknown, b: unknown) =>
    JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const ergebnis: Record<string, Aenderung> = {};

  for (const feld of new Set([
    ...Object.keys(vorher),
    ...Object.keys(nachher),
  ])) {
    if (feld === 'updatedAt') {
      continue;
    }

    if (feld === 'customFields') {
      const alt = (vorher.customFields ?? {}) as Record<string, unknown>;
      const neu = (nachher.customFields ?? {}) as Record<string, unknown>;

      for (const key of new Set([...Object.keys(alt), ...Object.keys(neu)])) {
        if (!gleich(alt[key], neu[key])) {
          ergebnis[`customFields.${key}`] = {
            before: alt[key] ?? null,
            after: neu[key] ?? null,
          };
        }
      }

      continue;
    }

    if (!gleich(vorher[feld], nachher[feld])) {
      ergebnis[feld] = {
        before: vorher[feld] ?? null,
        after: nachher[feld] ?? null,
      };
    }
  }

  return ergebnis;
};

const kanal = new EventEmitter();

kanal.setMaxListeners(50);

const zurueckgehalten = new AsyncLocalStorage<(() => void)[]>();

export const nachDemSpeichern = (ausgeben: () => void): void => {
  const warteschlange = zurueckgehalten.getStore();

  if (warteschlange === undefined) {
    ausgeben();
  } else {
    warteschlange.push(ausgeben);
  }
};

export const meldungenZurueckhalten = <T>(
  warteschlange: (() => void)[],
  arbeit: () => Promise<T>,
): Promise<T> => zurueckgehalten.run(warteschlange, arbeit);

export const melde = (meldung: Meldung): void => {
  nachDemSpeichern(() => kanal.emit('ereignis', meldung));
};

export const hoereAuf = (
  zuhoerer: (meldung: Meldung) => void,
): (() => void) => {
  kanal.on('ereignis', zuhoerer);

  return () => {
    kanal.off('ereignis', zuhoerer);
  };
};
