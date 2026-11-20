import { createHmac, timingSafeEqual } from 'node:crypto';

export type AbmeldeDaten = {
  workspaceId: string;
  email: string;
  thema: string;
};

const base64url = (wert: Buffer | string): string =>
  Buffer.from(wert).toString('base64url');

const signatur = (nutzlast: string, geheimnis: string): string =>
  createHmac('sha256', `abmelden:${geheimnis}`)
    .update(nutzlast)
    .digest('base64url');

export const abmeldeToken = (
  daten: AbmeldeDaten,
  geheimnis: string,
): string => {
  const nutzlast = base64url(
    JSON.stringify([daten.workspaceId, daten.email, daten.thema]),
  );

  return `${nutzlast}.${signatur(nutzlast, geheimnis)}`;
};

export const leseAbmeldeToken = (
  token: string,
  geheimnis: string,
): AbmeldeDaten | null => {
  const [nutzlast, sig, rest] = token.split('.');

  if (nutzlast === undefined || sig === undefined || rest !== undefined) {
    return null;
  }

  const erwartet = Buffer.from(signatur(nutzlast, geheimnis));
  const erhalten = Buffer.from(sig);

  if (
    erwartet.length !== erhalten.length ||
    !timingSafeEqual(erwartet, erhalten)
  ) {
    return null;
  }

  try {
    const werte: unknown = JSON.parse(
      Buffer.from(nutzlast, 'base64url').toString('utf8'),
    );

    if (
      !Array.isArray(werte) ||
      werte.length !== 3 ||
      !werte.every((wert) => typeof wert === 'string')
    ) {
      return null;
    }

    const [workspaceId, email, thema] = werte as string[];

    return { workspaceId, email, thema };
  } catch {
    return null;
  }
};
