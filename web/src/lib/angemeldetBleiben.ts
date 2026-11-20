export const BROWSER_MARKE = 'stegwerk_browser';

const WAHL_SCHLUESSEL = 'stegwerk.angemeldetBleiben';

export const hatMarke = (cookieKopf: string): boolean =>
  cookieKopf
    .split(';')
    .some((teil) => teil.trim().startsWith(`${BROWSER_MARKE}=`));

export const markeCookie = (https: boolean): string =>
  `${BROWSER_MARKE}=1; Path=/; SameSite=Strict${https ? '; Secure' : ''}`;

export const sitzungGilt = (
  angemeldetBleiben: boolean | undefined,
  cookieKopf: string,
): boolean => angemeldetBleiben !== false || hatMarke(cookieKopf);

export const setzeMarke = (): void => {
  try {
    document.cookie = markeCookie(window.location.protocol === 'https:');
  } catch {}
};

export const liesCookies = (): string => {
  try {
    return document.cookie;
  } catch {
    return '';
  }
};

export const liesWahl = (): boolean => {
  try {
    return window.localStorage.getItem(WAHL_SCHLUESSEL) === 'ja';
  } catch {
    return false;
  }
};

export const merkeWahl = (wert: boolean): void => {
  try {
    window.localStorage.setItem(WAHL_SCHLUESSEL, wert ? 'ja' : 'nein');
  } catch {}
};
