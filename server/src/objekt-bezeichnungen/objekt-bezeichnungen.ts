export enum ObjektArt {
  FIRMA = 'FIRMA',
  KONTAKT = 'KONTAKT',
  GESCHAEFT = 'GESCHAEFT',
  AUFGABE = 'AUFGABE',
  ANGEBOT = 'ANGEBOT',
}

export enum Genus {
  MAENNLICH = 'MAENNLICH',
  WEIBLICH = 'WEIBLICH',
  SAECHLICH = 'SAECHLICH',
}

export type Bezeichnung = { einzahl: string; mehrzahl: string; genus: Genus };

export const STANDARD_BEZEICHNUNGEN: Record<ObjektArt, Bezeichnung> = {
  [ObjektArt.FIRMA]: {
    einzahl: 'Firma',
    mehrzahl: 'Firmen',
    genus: Genus.WEIBLICH,
  },
  [ObjektArt.KONTAKT]: {
    einzahl: 'Kontakt',
    mehrzahl: 'Kontakte',
    genus: Genus.MAENNLICH,
  },
  [ObjektArt.GESCHAEFT]: {
    einzahl: 'Geschäft',
    mehrzahl: 'Geschäfte',
    genus: Genus.SAECHLICH,
  },
  [ObjektArt.AUFGABE]: {
    einzahl: 'Aufgabe',
    mehrzahl: 'Aufgaben',
    genus: Genus.WEIBLICH,
  },
  [ObjektArt.ANGEBOT]: {
    einzahl: 'Angebot',
    mehrzahl: 'Angebote',
    genus: Genus.SAECHLICH,
  },
};

export type GespeicherteBezeichnungen = Partial<Record<ObjektArt, Bezeichnung>>;

export const VERGEBENE_NAMEN: readonly string[] = [
  'Übersicht',
  'Kalender',
  'Artikel',
  'Auswertung',
  'Auswertungen',
  'Rechnung',
  'Rechnungen',
  'Offener Posten',
  'Offene Posten',
  'Postfach',
  'Postfächer',
  'Serienmail',
  'Serienmails',
  'KI-Vorschlag',
  'KI-Vorschläge',
  'Verteiler',
  'Einstellung',
  'Einstellungen',
  'Betrieb',
  'Favorit',
  'Favoriten',
  'Zuletzt geöffnet',
  'Befehl',
  'Befehle',
  'Treffer',
  'Notiz',
  'Notizen',
  'E-Mail',
  'E-Mails',
  'Hilfe',
  'Hilfe und Handbuch',
  'Fehlerbehebung',
];

export const BEZEICHNUNG_MAX = 30;

const ERLAUBT = /^[\p{L}\p{N}][\p{L}\p{N} .&/'’-]*$/u;

export class BezeichnungUngueltig extends Error {}

const wort = (roh: string, was: string): string => {
  const text = roh.normalize('NFC').replace(/\s+/gu, ' ').trim();

  if (text === '') {
    throw new BezeichnungUngueltig(`Bitte geben Sie die ${was} an.`);
  }

  if ([...text].length > BEZEICHNUNG_MAX) {
    throw new BezeichnungUngueltig(
      `Die ${was} darf höchstens ${String(BEZEICHNUNG_MAX)} Zeichen lang sein.`,
    );
  }

  if (!ERLAUBT.test(text)) {
    throw new BezeichnungUngueltig(
      `Die ${was} darf nur Buchstaben, Ziffern, Leerzeichen und - . & / ' enthalten und muss mit einem Buchstaben oder einer Ziffer beginnen.`,
    );
  }

  return text.charAt(0).toLocaleUpperCase('de-DE') + text.slice(1);
};

export const wirksameBezeichnung = (
  gespeichert: GespeicherteBezeichnungen | null | undefined,
  art: ObjektArt,
): Bezeichnung => gespeichert?.[art] ?? STANDARD_BEZEICHNUNGEN[art];

const gleich = (a: Bezeichnung, b: Bezeichnung): boolean =>
  a.einzahl === b.einzahl && a.mehrzahl === b.mehrzahl && a.genus === b.genus;

export const mitBezeichnung = (
  gespeichert: GespeicherteBezeichnungen | null | undefined,
  art: ObjektArt,
  eingabe: { einzahl: string; mehrzahl: string; genus: Genus },
): GespeicherteBezeichnungen => {
  if (!Object.values(Genus).includes(eingabe.genus)) {
    throw new BezeichnungUngueltig('Bitte wählen Sie das Geschlecht.');
  }

  const neu: Bezeichnung = {
    einzahl: wort(eingabe.einzahl, 'Einzahl'),
    mehrzahl: wort(eingabe.mehrzahl, 'Mehrzahl'),
    genus: eingabe.genus,
  };

  const schon = new Map<string, ObjektArt>();

  for (const andere of Object.values(ObjektArt)) {
    if (andere === art) {
      continue;
    }

    const b = wirksameBezeichnung(gespeichert, andere);

    schon.set(b.einzahl.toLocaleLowerCase('de-DE'), andere);
    schon.set(b.mehrzahl.toLocaleLowerCase('de-DE'), andere);
  }

  const vergeben = new Set(
    VERGEBENE_NAMEN.map((name) => name.toLocaleLowerCase('de-DE')),
  );

  for (const form of [neu.einzahl, neu.mehrzahl]) {
    if (vergeben.has(form.toLocaleLowerCase('de-DE'))) {
      throw new BezeichnungUngueltig(
        `„${form}“ heißt schon eine andere Seite oder ein Befehl in Navigation und Suche. Bitte wählen Sie einen anderen Namen.`,
      );
    }

    const belegt = schon.get(form.toLocaleLowerCase('de-DE'));

    if (belegt !== undefined) {
      throw new BezeichnungUngueltig(
        `„${form}“ heißt schon ein anderes Objekt (${STANDARD_BEZEICHNUNGEN[belegt].einzahl}). Zwei gleiche Namen ließen sich in Navigation und Suche nicht unterscheiden.`,
      );
    }
  }

  const ergebnis: GespeicherteBezeichnungen = { ...(gespeichert ?? {}) };

  if (gleich(neu, STANDARD_BEZEICHNUNGEN[art])) {
    delete ergebnis[art];
  } else {
    ergebnis[art] = neu;
  }

  return ergebnis;
};

export const ohneBezeichnung = (
  gespeichert: GespeicherteBezeichnungen | null | undefined,
  art: ObjektArt | null,
): GespeicherteBezeichnungen => {
  if (art === null) {
    return {};
  }

  const ergebnis: GespeicherteBezeichnungen = { ...(gespeichert ?? {}) };

  delete ergebnis[art];

  return ergebnis;
};

export const dateiTeil = (wortRoh: string, ersatz: string): string => {
  const ascii = wortRoh
    .replace(/Ä/gu, 'Ae')
    .replace(/Ö/gu, 'Oe')
    .replace(/Ü/gu, 'Ue')
    .replace(/ä/gu, 'ae')
    .replace(/ö/gu, 'oe')
    .replace(/ü/gu, 'ue')
    .replace(/ß/gu, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');

  return ascii === '' ? ersatz : ascii;
};
