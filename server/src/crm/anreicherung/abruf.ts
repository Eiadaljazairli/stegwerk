import {
  pruefeZielForm,
  type RoheAntwort,
  sichereRoheAnfrage,
  UngueltigesZiel,
} from '../../webhooks/webhook-ziel';

export const USER_AGENT = 'Stegwerk-Firmendaten/1.0';

export const MAX_WEITERLEITUNGEN = 3;

export const ZEITLIMIT_MS = 8_000;

export const HTML_MAX_BYTES = 1024 * 1024;

export const BILD_MAX_BYTES = 200 * 1024;

export class AbrufFehler extends Error {}

export class VorgangErschoepft extends AbrufFehler {}

export type Budget = { vorAnfrage: () => number };

export type Abruf = RoheAntwort & {
  url: URL;
};

export const abrufbar = (roh: string, erlaubeIntern: boolean): URL => {
  try {
    return pruefeZielForm(roh, true, erlaubeIntern);
  } catch (fehler) {
    if (fehler instanceof UngueltigesZiel) {
      throw new AbrufFehler(
        fehler.message.startsWith('Webhooks')
          ? 'Nur Adressen mit http oder https lassen sich lesen.'
          : fehler.message,
      );
    }

    throw fehler;
  }
};

export type Anfrager = typeof sichereRoheAnfrage;

export const holen = async (
  start: URL,
  maxBytes: number,
  accept: string,
  erlaubeIntern: boolean,
  anfrage: Anfrager = sichereRoheAnfrage,
  budget?: Budget,
): Promise<Abruf> => {
  let url = abrufbar(start.toString(), erlaubeIntern);

  for (let schritt = 0; schritt <= MAX_WEITERLEITUNGEN; schritt += 1) {
    let antwort: RoheAntwort;
    const zeitlimit = budget?.vorAnfrage() ?? ZEITLIMIT_MS;

    try {
      antwort = await anfrage(
        url,
        'GET',
        {
          'user-agent': USER_AGENT,
          accept,
          'accept-language': 'de-DE,de;q=0.9,en;q=0.5',
        },
        null,
        zeitlimit,
        maxBytes,
        erlaubeIntern,
      );
    } catch (fehler) {
      if (fehler instanceof UngueltigesZiel) {
        throw new AbrufFehler(fehler.message);
      }

      throw new AbrufFehler(
        `${url.hostname} ist nicht erreichbar oder antwortet nicht.`,
      );
    }

    if (
      antwort.status >= 300 &&
      antwort.status < 400 &&
      antwort.location !== null
    ) {
      if (schritt === MAX_WEITERLEITUNGEN) {
        throw new AbrufFehler(
          `${start.hostname} leitet zu oft weiter (mehr als ${String(MAX_WEITERLEITUNGEN)}-mal).`,
        );
      }

      let weiter: string;

      try {
        weiter = new URL(antwort.location, url).toString();
      } catch {
        throw new AbrufFehler(
          `${url.hostname} leitet an eine ungültige Adresse weiter.`,
        );
      }

      url = abrufbar(weiter, erlaubeIntern);
      continue;
    }

    return { ...antwort, url };
  }

  throw new AbrufFehler(`${start.hostname} leitet zu oft weiter.`);
};
