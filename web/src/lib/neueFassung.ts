import { useEffect, useState } from 'react';

export const GELADEN: string =
  typeof __STEGWERK_FASSUNG__ === 'string' ? __STEGWERK_FASSUNG__ : '';

const ALLE_MS = 5 * 60 * 1000;

export const istNeuer = (geladen: string, ausgeliefert: unknown): boolean =>
  typeof ausgeliefert === 'string' &&
  ausgeliefert !== '' &&
  geladen !== '' &&
  ausgeliefert !== geladen;

export const useNeueFassung = (): boolean => {
  const [neu, setNeu] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD) {
      return undefined;
    }

    let aus = false;

    const pruefen = async () => {
      if (aus || document.visibilityState === 'hidden') {
        return;
      }

      try {
        const antwort = await fetch('/version.json', { cache: 'no-store' });

        if (!antwort.ok) {
          return;
        }

        const inhalt = (await antwort.json()) as { version?: unknown };

        if (!aus && istNeuer(GELADEN, inhalt.version)) {
          setNeu(true);
        }
      } catch {}
    };

    const beimZurueckkehren = () => {
      if (document.visibilityState === 'visible') {
        void pruefen();
      }
    };

    const nachladenGescheitert = (ereignis: Event) => {
      ereignis.preventDefault();
      setNeu(true);
    };

    const uhr = window.setInterval(() => void pruefen(), ALLE_MS);

    document.addEventListener('visibilitychange', beimZurueckkehren);
    window.addEventListener('focus', beimZurueckkehren);
    window.addEventListener('vite:preloadError', nachladenGescheitert);

    return () => {
      aus = true;
      window.clearInterval(uhr);
      document.removeEventListener('visibilitychange', beimZurueckkehren);
      window.removeEventListener('focus', beimZurueckkehren);
      window.removeEventListener('vite:preloadError', nachladenGescheitert);
    };
  }, []);

  return neu;
};
