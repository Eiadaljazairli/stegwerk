export const SSO_ANBIETER = ['google', 'microsoft'] as const;

export type SsoAnbieter = (typeof SSO_ANBIETER)[number];

const NAME: Record<SsoAnbieter, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
};

export const ssoName = (anbieter: string): string =>
  (NAME as Record<string, string>)[anbieter] ?? anbieter;

export const sichtbareAnbieter = (
  vomServer: readonly string[] | undefined,
): SsoAnbieter[] =>
  SSO_ANBIETER.filter((anbieter) => (vomServer ?? []).includes(anbieter));

export const markeAusFragment = (hash: string): string | null => {
  const treffer = /^#sso=([A-Za-z0-9_-]{20,100})$/u.exec(hash);

  return treffer === null ? null : treffer[1];
};

export type SsoRueckmeldung =
  | { art: 'fehler'; text: string }
  | { art: 'verknuepft'; anbieter: SsoAnbieter; text: string };

const istAnbieter = (wert: string | null): wert is SsoAnbieter =>
  (SSO_ANBIETER as readonly string[]).includes(wert ?? '');

const FEHLER_ALLGEMEIN = 'Die Anmeldung beim Anbieter ist fehlgeschlagen.';

const FEHLERTEXT: Record<string, (anbieter: string) => string> = {
  abgebrochen: () => 'Die Anmeldung wurde beim Anbieter abgebrochen.',
  nicht_zustande: () =>
    'Die Anmeldung beim Anbieter ist nicht zustande gekommen.',
  fehlgeschlagen: () =>
    'Die Anmeldung ist fehlgeschlagen. Bitte noch einmal versuchen.',
  anbieter: () =>
    'Die Antwort des Anbieters ließ sich nicht prüfen. Bitte noch einmal versuchen.',
  vorgang: () =>
    'Dieser Anmeldevorgang ist unbekannt oder schon benutzt. Bitte beginnen Sie noch einmal.',
  abgelaufen: () =>
    'Der Anmeldevorgang ist abgelaufen. Bitte beginnen Sie noch einmal.',
  browser: () =>
    'Der Anmeldevorgang wurde in einem anderen Browser begonnen. Bitte beginnen Sie ihn in diesem Browser noch einmal.',
  keine_adresse: (n) =>
    `${n} hat keine E-Mail-Adresse genannt. Bitte melden Sie sich mit Passwort an.`,
  konto_vorhanden: (n) =>
    `Zu dieser Adresse gibt es schon ein Stegwerk-Konto. Melden Sie sich mit Ihrem Passwort an und verknüpfen Sie ${n} unter Team → Mein Konto → Anmelden mit Google und Microsoft.`,
  kein_konto: () =>
    'Zu dieser Adresse gibt es noch kein Stegwerk-Konto. Bitte registrieren Sie sich zuerst.',
  anders_verknuepft: (n) =>
    `Ihr Stegwerk-Konto ist schon mit einem anderen ${n}-Konto verknüpft. Melden Sie sich damit an.`,
  fremd_verknuepft: (n) =>
    `Dieses ${n}-Konto gehört schon zu einem anderen Stegwerk-Konto.`,
  erst_trennen: (n) =>
    `Ihr Konto ist schon mit einem anderen ${n}-Konto verknüpft. Trennen Sie es zuerst.`,
};

export const ssoRueckmeldung = (search: string): SsoRueckmeldung | null => {
  const parameter = new URLSearchParams(search);
  const stand = parameter.get('sso');
  const anbieter = parameter.get('anbieter');

  if (stand === 'fehler') {
    const grund = parameter.get('grund') ?? '';
    const text = Object.hasOwn(FEHLERTEXT, grund) ? FEHLERTEXT[grund] : null;

    return {
      art: 'fehler',
      text:
        text === null
          ? FEHLER_ALLGEMEIN
          : text(istAnbieter(anbieter) ? NAME[anbieter] : 'Anbieter'),
    };
  }

  if (stand === 'verknuepft' && istAnbieter(anbieter)) {
    return {
      art: 'verknuepft',
      anbieter,
      text: `Ihr Konto lässt sich jetzt auch mit ${NAME[anbieter]} anmelden.`,
    };
  }

  return null;
};

export const ohneSsoParameter = (search: string): string => {
  const parameter = new URLSearchParams(search);

  parameter.delete('sso');
  parameter.delete('grund');
  parameter.delete('anbieter');

  const rest = parameter.toString();

  return rest === '' ? '' : `?${rest}`;
};

export const darfTrennen = (
  anzahlVerknuepfungen: number,
  passwortGesetzt: boolean,
): boolean => passwortGesetzt || anzahlVerknuepfungen > 1;
