import { useEffect } from 'react';

import { ART_DER_SEITE, type Bezeichnung, type ObjektArt } from './bezeichnung';

export type Besuch = { to: string; title: string; art: string };

export const objektDesBesuchs = (besuch: Besuch): ObjektArt | undefined => {
  const teil = /^\/[^/]+/u.exec(besuch.to)?.[0];

  return teil === undefined ? undefined : ART_DER_SEITE[teil];
};

export const artDesBesuchs = (
  besuch: Besuch,
  bezeichnungen: Record<ObjektArt, Bezeichnung>,
): string => {
  const objekt = objektDesBesuchs(besuch);

  return objekt === undefined ? besuch.art : bezeichnungen[objekt].einzahl;
};

const SCHLUESSEL = 'stegwerk.zuletzt';
const HOECHSTENS = 8;

export const zuletztGeoeffnet = (): Besuch[] => {
  try {
    const roh = window.localStorage.getItem(SCHLUESSEL);
    const liste: unknown = roh === null ? [] : JSON.parse(roh);

    return Array.isArray(liste) ? (liste as Besuch[]).slice(0, HOECHSTENS) : [];
  } catch {
    return [];
  }
};

export const merkeBesuch = (besuch: Besuch): void => {
  try {
    const liste = [
      besuch,
      ...zuletztGeoeffnet().filter((b) => b.to !== besuch.to),
    ].slice(0, HOECHSTENS);

    window.localStorage.setItem(SCHLUESSEL, JSON.stringify(liste));
  } catch {}
};

export const useMerkeBesuch = (besuch: Besuch | null): void => {
  const to = besuch?.to;
  const title = besuch?.title;
  const art = besuch?.art;

  useEffect(() => {
    if (to !== undefined && title !== undefined && art !== undefined) {
      merkeBesuch({ to, title, art });
    }
  }, [to, title, art]);
};
