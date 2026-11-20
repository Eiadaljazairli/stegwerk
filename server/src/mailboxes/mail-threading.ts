const MAX_LAENGE = 500;

export const normalisiereId = (
  roh: string | null | undefined,
): string | null => {
  if (roh === null || roh === undefined) {
    return null;
  }

  const sauber = roh.trim().replace(/^<+/u, '').replace(/>+$/u, '').trim();

  return sauber === '' || sauber.length > MAX_LAENGE ? null : sauber;
};

export const zerlegeReferences = (roh: string | null | undefined): string[] => {
  if (roh === null || roh === undefined) {
    return [];
  }

  const gefunden = roh.match(/<[^<>]+>/gu);
  const stuecke = gefunden ?? roh.split(/[\s,]+/u);
  const raus: string[] = [];

  for (const stueck of stuecke) {
    const id = normalisiereId(stueck);

    if (id !== null && !raus.includes(id)) {
      raus.push(id);
    }
  }

  return raus;
};

export type Verkettung = {
  eigene: string;
  verweise: string[];
};

export const verkettung = (nachricht: {
  messageId: string;
  inReplyTo?: string | null;
  references?: string | null;
}): Verkettung | null => {
  const eigene = normalisiereId(nachricht.messageId);

  if (eigene === null) {
    return null;
  }

  const verweise = zerlegeReferences(nachricht.references);
  const antwortAuf = normalisiereId(nachricht.inReplyTo);

  if (antwortAuf !== null && !verweise.includes(antwortAuf)) {
    verweise.push(antwortAuf);
  }

  return { eigene, verweise: verweise.filter((v) => v !== eigene) };
};

export const suchschluessel = (kette: Verkettung): string[] => [
  kette.eigene,
  ...kette.verweise,
];

export type Zuordnung = {
  schluessel: string;
  zusammenfuehren: string[];
};

export const zuordnen = (kette: Verkettung, gefunden: string[]): Zuordnung => {
  const eindeutig = [...new Set(gefunden.filter((f) => f !== ''))].sort();

  if (eindeutig.length === 0) {
    return {
      schluessel: kette.verweise[0] ?? kette.eigene,
      zusammenfuehren: [],
    };
  }

  const [gewinner, ...rest] = eindeutig;

  return { schluessel: gewinner, zusammenfuehren: rest };
};
