import { useEffect, useMemo } from 'react';

import { nachweisVorrat } from './arbeitsnachweis';

export const useArbeitsnachweis = (): (() => Promise<string>) => {
  const vorrat = useMemo(() => nachweisVorrat(), []);

  useEffect(() => {
    vorrat.vorbereiten();

    const takt = window.setInterval(() => vorrat.vorbereiten(), 60_000);

    return () => window.clearInterval(takt);
  }, [vorrat]);

  return vorrat.nimm;
};
