import { useEffect } from 'react';

export const useSeitenkopf = (titel: string, beschreibung: string): void => {
  useEffect(() => {
    const vorherTitel = document.title;
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    const vorherBeschreibung = meta?.content ?? null;

    document.title = `${titel} · Stegwerk`;

    if (meta !== null) {
      meta.content = beschreibung;
    }

    return () => {
      document.title = vorherTitel;

      if (meta !== null && vorherBeschreibung !== null) {
        meta.content = vorherBeschreibung;
      }
    };
  }, [titel, beschreibung]);
};
