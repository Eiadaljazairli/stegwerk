import { useCallback, useEffect, useState } from 'react';

export const useUeberlauf = <T extends HTMLElement>(): [
  (element: T | null) => void,
  boolean,
] => {
  const [element, setElement] = useState<T | null>(null);
  const [laeuftUeber, setLaeuftUeber] = useState(false);
  const ref = useCallback((neu: T | null) => setElement(neu), []);

  useEffect(() => {
    if (element === null || typeof ResizeObserver === 'undefined') {
      setLaeuftUeber(false);

      return undefined;
    }

    const pruefen = () =>
      setLaeuftUeber(
        element.scrollWidth > element.clientWidth + 1 ||
          element.scrollHeight > element.clientHeight + 1,
      );
    const beobachter = new ResizeObserver(pruefen);

    beobachter.observe(element);

    for (const kind of Array.from(element.children)) {
      beobachter.observe(kind);
    }

    pruefen();

    return () => beobachter.disconnect();
  }, [element]);

  return [ref, laeuftUeber];
};

export const scrollAttribute = (
  laeuftUeber: boolean,
  label: string,
  { istListe = false }: { istListe?: boolean } = {},
) => {
  if (!laeuftUeber) {
    return {};
  }

  return istListe
    ? { tabIndex: 0, 'aria-label': label }
    : { tabIndex: 0, role: 'region' as const, 'aria-label': label };
};
