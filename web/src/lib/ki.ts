export type KiAnbieter = 'anthropic' | 'openai';

export const KI_ANBIETER: { wert: KiAnbieter; name: string }[] = [
  { wert: 'anthropic', name: 'Anthropic (Claude)' },
  { wert: 'openai', name: 'OpenAI' },
];

export const anbieterName = (anbieter: string): string =>
  KI_ANBIETER.find((eintrag) => eintrag.wert === anbieter)?.name ?? anbieter;

export const KI_MODELLE: Record<
  KiAnbieter,
  { kennung: string; name: string; hinweis: string }[]
> = {
  anthropic: [
    {
      kennung: 'claude-sonnet-5-5',
      name: 'Claude Sonnet 5.5',
      hinweis: 'Empfohlen: schnell und gründlich',
    },
    {
      kennung: 'claude-opus-5-5',
      name: 'Claude Opus 5.5',
      hinweis: 'Am gründlichsten, teurer',
    },
    {
      kennung: 'claude-haiku-5-5',
      name: 'Claude Haiku 5.5',
      hinweis: 'Am günstigsten, für einfache Fragen',
    },
  ],
  openai: [
    { kennung: 'gpt-5', name: 'GPT-5', hinweis: 'Gründlich' },
    { kennung: 'gpt-5-mini', name: 'GPT-5 mini', hinweis: 'Günstiger' },
  ],
};

export const STANDARD_MODELL: Record<KiAnbieter, string> = {
  anthropic: 'claude-sonnet-5-5',
  openai: 'gpt-5',
};

export const modellName = (anbieter: string, kennung: string): string =>
  KI_MODELLE[anbieter as KiAnbieter]?.find(
    (modell) => modell.kennung === kennung,
  )?.name ?? kennung;

export const ANLEITUNG: Record<
  KiAnbieter,
  { schritte: string[]; link: { href: string; text: string } }
> = {
  anthropic: {
    schritte: [
      'Bei Anthropic in der Console anmelden (ein Konto mit hinterlegter Zahlungsart).',
      'Unter „API Keys“ einen neuen Schlüssel erzeugen und kopieren.',
      'Hier einfügen. Die Kosten rechnet Anthropic direkt mit Ihnen ab.',
    ],
    link: {
      href: 'https://console.anthropic.com/settings/keys',
      text: 'Zur Anthropic Console',
    },
  },
  openai: {
    schritte: [
      'Bei OpenAI auf der Plattform anmelden (ein Konto mit Guthaben oder Zahlungsart).',
      'Unter „API keys“ einen neuen geheimen Schlüssel erzeugen und kopieren.',
      'Hier einfügen. Die Kosten rechnet OpenAI direkt mit Ihnen ab.',
    ],
    link: {
      href: 'https://platform.openai.com/api-keys',
      text: 'Zur OpenAI-Plattform',
    },
  },
};

export type ChatNachricht = {
  rolle: 'user' | 'assistant';
  text: string;
  vorschlaege?: { id: string; zusammenfassung: string }[];
  schritte?: { werkzeug: string; titel: string; ok: boolean }[];
  fehler?: boolean;
};

export const MAX_NACHRICHTEN = 40;
export const MAX_NACHRICHT = 8000;
export const MAX_VERLAUF = 60_000;

export const verlaufFuerServer = (
  nachrichten: ChatNachricht[],
): { rolle: 'user' | 'assistant'; text: string }[] => {
  const sauber = nachrichten
    .filter((nachricht) => nachricht.fehler !== true)
    .filter((nachricht) => nachricht.text.trim() !== '')
    .map((nachricht) => ({
      rolle: nachricht.rolle,
      text: nachricht.text.slice(0, MAX_NACHRICHT),
    }));
  const behalten: typeof sauber = [];
  let summe = 0;

  for (let index = sauber.length - 1; index >= 0; index -= 1) {
    const nachricht = sauber[index];

    if (
      behalten.length >= MAX_NACHRICHTEN ||
      summe + nachricht.text.length > MAX_VERLAUF
    ) {
      break;
    }

    behalten.unshift(nachricht);
    summe += nachricht.text.length;
  }

  while (behalten.length > 0 && behalten[0].rolle !== 'user') {
    behalten.shift();
  }

  return behalten;
};

export type KiBezug = {
  art: 'company' | 'contact' | 'deal' | 'quote';
  id: string;
};

const PFADE: [string, KiBezug['art']][] = [
  ['firmen', 'company'],
  ['kontakte', 'contact'],
  ['geschaefte', 'deal'],
  ['angebote', 'quote'],
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export const bezugAusPfad = (pfad: string): KiBezug | null => {
  const [, teil, id] = pfad.split('/');
  const art = PFADE.find(([name]) => name === teil)?.[1];

  return art !== undefined && id !== undefined && UUID.test(id)
    ? { art, id }
    : null;
};

export const BEZUG_TEXT: Record<KiBezug['art'], string> = {
  company: 'diese Firma',
  contact: 'diesen Kontakt',
  deal: 'dieses Geschäft',
  quote: 'dieses Angebot',
};

export const bezugAusZiel = (ziel: {
  companyId?: string;
  contactId?: string;
  dealId?: string;
  quoteId?: string;
}): KiBezug | null => {
  if (ziel.dealId !== undefined) {
    return { art: 'deal', id: ziel.dealId };
  }

  if (ziel.quoteId !== undefined) {
    return { art: 'quote', id: ziel.quoteId };
  }

  if (ziel.contactId !== undefined) {
    return { art: 'contact', id: ziel.contactId };
  }

  if (ziel.companyId !== undefined) {
    return { art: 'company', id: ziel.companyId };
  }

  return null;
};

export const ohneSignatur = (rumpf: string, signatur: string): string =>
  signatur !== '' && rumpf.endsWith(signatur)
    ? rumpf.slice(0, -signatur.length)
    : rumpf;

export const entwurfEinsetzen = (
  rumpf: string,
  entwurf: string,
  signatur: string,
): string =>
  signatur !== '' && rumpf.endsWith(signatur)
    ? `${entwurf.trim()}${signatur}`
    : entwurf.trim();
