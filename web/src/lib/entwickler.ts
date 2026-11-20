export type EntwicklerTeil = {
  slug: string;
  titel: string;
  beschreibung: string;
  datei?: string;
};

export const ENTWICKLER_TEILE: EntwicklerTeil[] = [
  {
    slug: '',
    titel: 'Für Entwickler',
    beschreibung:
      'Schnittstelle, Webhooks, KI-Assistenten über MCP und das Webformular von Stegwerk: Anleitung, Beispiele mit curl und die Referenz der GraphQL-Schnittstelle.',
  },
  {
    slug: 'schnittstelle',
    titel: 'Zugang für Programme',
    beschreibung:
      'API-Schlüssel anlegen und benutzen: GraphQL unter /graphql, Dateien per REST, viele Datensätze auf einmal, Grenzen und was ein Schlüssel nicht darf.',
    datei: 'schnittstelle.md',
  },
  {
    slug: 'referenz',
    titel: 'Referenz der Schnittstelle',
    beschreibung:
      'Alle Abfragen und Mutationen, die ein API-Schlüssel aufrufen darf, mit Argumenten, Rückgabetypen und den Feldern jedes Typs.',
  },
  {
    slug: 'webhooks',
    titel: 'Webhooks',
    beschreibung:
      'Ereignisse von Stegwerk an eine eigene Adresse: Aufbau der Nachricht, Kopfzeilen, Wiederholungen und die Prüfung der Signatur mit HMAC-SHA256.',
    datei: 'webhooks.md',
  },
  {
    slug: 'mcp',
    titel: 'KI-Assistenten anbinden (MCP)',
    beschreibung:
      'Claude und andere Assistenten über das Model Context Protocol an Stegwerk anbinden: Schlüssel, Einrichtung, Werkzeuge und was der Assistent darf.',
    datei: 'mcp.md',
  },
  {
    slug: 'webformular',
    titel: 'Webformular',
    beschreibung:
      'Das Kontaktformular von Stegwerk auf der eigenen Website einbinden: der Schnipsel, was eine Anfrage anlegt und wie das Formular geschützt ist.',
    datei: 'webformular.md',
  },
];

export const entwicklerTeil = (
  slug: string | undefined,
): EntwicklerTeil | null =>
  ENTWICKLER_TEILE.find((teil) => teil.slug === (slug ?? '')) ?? null;

export const entwicklerPfad = (slug: string): string =>
  slug === '' ? '/entwickler' : `/entwickler/${slug}`;

export const dokuLinkZiel = (ziel: string): string | null => {
  if (/^(?:https?:|mailto:)/iu.test(ziel)) {
    return ziel;
  }

  const [datei, anker] = ziel.split('#');

  if (datei === '' && anker !== undefined) {
    return `#${anker}`;
  }

  const teil = ENTWICKLER_TEILE.find(
    (eintrag) => eintrag.datei !== undefined && eintrag.datei === datei,
  );

  if (teil === undefined) {
    return null;
  }

  return `${entwicklerPfad(teil.slug)}${anker === undefined ? '' : `#${anker}`}`;
};
