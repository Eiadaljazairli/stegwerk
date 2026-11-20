import { type CookieOptions, type Request, type Response } from 'express';

export const SITZUNGS_COOKIE = 'stegwerk_sitzung';

const optionen = (tage: number | null): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/graphql',
  ...(tage === null ? {} : { maxAge: tage * 24 * 60 * 60 * 1000 }),
});

export const setzeSitzung = (
  antwort: Response | undefined,
  token: string,
  tage: number | null,
): void => {
  antwort?.cookie(SITZUNGS_COOKIE, token, optionen(tage));
};

export const loescheSitzung = (antwort: Response | undefined): void => {
  antwort?.clearCookie(SITZUNGS_COOKIE, { ...optionen(0), maxAge: undefined });
};

export const liesCookie = (
  anfrage: Request | undefined,
  gesucht: string,
): string | null => {
  const kopf = anfrage?.headers.cookie ?? '';

  for (const teil of kopf.split(';')) {
    const [name, ...wert] = teil.trim().split('=');

    if (name === gesucht && wert.length > 0) {
      try {
        return decodeURIComponent(wert.join('='));
      } catch {
        return null;
      }
    }
  }

  return null;
};

export const liesSitzung = (anfrage: Request | undefined): string | null =>
  liesCookie(anfrage, SITZUNGS_COOKIE);
