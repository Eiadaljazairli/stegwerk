import { API_ROOT } from './download';

export const NACHWEIS_KOPF = 'X-Arbeitsnachweis';

export type Aufgabe = {
  algorithm: 'SHA-256';
  challenge: string;
  maxnumber: number;
  salt: string;
  signature: string;
};

export type Pruefsumme = (text: string) => Promise<string>;

const hex = (puffer: ArrayBuffer): string =>
  [...new Uint8Array(puffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

export const sha256: Pruefsumme = async (text) =>
  hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

export const loese = async (
  aufgabe: Aufgabe,
  pruefsumme: Pruefsumme = sha256,
): Promise<number | null> => {
  for (let zahl = 0; zahl <= aufgabe.maxnumber; zahl += 1) {
    if (
      (await pruefsumme(`${aufgabe.salt}${String(zahl)}`)) === aufgabe.challenge
    ) {
      return zahl;
    }
  }

  return null;
};

export const alsKopf = (aufgabe: Aufgabe, zahl: number): string =>
  btoa(
    JSON.stringify({
      algorithm: aufgabe.algorithm,
      challenge: aufgabe.challenge,
      number: zahl,
      salt: aufgabe.salt,
      signature: aufgabe.signature,
    }),
  );

const imWorker = (aufgabe: Aufgabe): Promise<number | null> =>
  new Promise((fertig, fehler) => {
    const worker = new Worker(
      new URL('./arbeitsnachweis.worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (ereignis: MessageEvent<number | null>) => {
      worker.terminate();
      fertig(ereignis.data);
    };
    worker.onerror = () => {
      worker.terminate();
      fehler(new Error('Worker'));
    };
    worker.postMessage(aufgabe);
  });

export type Nachweis = { kopf: string; erhalten: number };

export const MINDESTZEIT_MS = 3_000 + 250;

export const holeNachweis = async (
  laden: typeof fetch = fetch,
  uhr: () => number = Date.now,
): Promise<Nachweis> => {
  const antwort = await laden(`${API_ROOT}/public/nachweis`, {
    cache: 'no-store',
  });
  const erhalten = uhr();

  if (!antwort.ok) {
    throw new Error(
      'Die Sicherheitsprüfung ließ sich nicht laden. Bitte versuchen Sie es gleich noch einmal.',
    );
  }

  const aufgabe = (await antwort.json()) as Aufgabe;
  let zahl: number | null;

  try {
    zahl =
      typeof Worker === 'undefined'
        ? await loese(aufgabe)
        : await imWorker(aufgabe);
  } catch {
    zahl = await loese(aufgabe);
  }

  if (zahl === null) {
    throw new Error(
      'Die Sicherheitsprüfung ist fehlgeschlagen. Bitte laden Sie die Seite neu.',
    );
  }

  return { kopf: alsKopf(aufgabe, zahl), erhalten };
};

export const VORRAT_MS = 9 * 60 * 1000;

type Vorrat = { nachweis: Promise<Nachweis>; seit: number };

const schlafen = (ms: number) =>
  new Promise<void>((weiter) => {
    setTimeout(weiter, ms);
  });

export const nachweisVorrat = (
  holen: () => Promise<Nachweis> = () => holeNachweis(),
  uhr: () => number = Date.now,
  warten: (ms: number) => Promise<void> = schlafen,
) => {
  let vorrat: Vorrat | null = null;

  const auffuellen = (): Vorrat => {
    const nachweis = holen();

    nachweis.catch(() => undefined);
    vorrat = { nachweis, seit: uhr() };

    return vorrat;
  };

  return {
    vorbereiten: () => {
      if (vorrat === null || uhr() - vorrat.seit > VORRAT_MS) {
        auffuellen();
      }
    },
    nimm: async (): Promise<string> => {
      const jetzt =
        vorrat === null || uhr() - vorrat.seit > VORRAT_MS
          ? auffuellen()
          : vorrat;

      vorrat = null;

      try {
        const { kopf, erhalten } = await jetzt.nachweis;
        const rest = erhalten + MINDESTZEIT_MS - uhr();

        if (rest > 0) {
          await warten(rest);
        }

        return kopf;
      } finally {
        auffuellen();
      }
    },
  };
};
