export type ObjektArt =
  | 'FIRMA'
  | 'KONTAKT'
  | 'GESCHAEFT'
  | 'AUFGABE'
  | 'ANGEBOT';

export type Genus = 'MAENNLICH' | 'WEIBLICH' | 'SAECHLICH';

export type Bezeichnung = { einzahl: string; mehrzahl: string; genus: Genus };

export type ObjektBezeichnung = Bezeichnung & {
  art: ObjektArt;
  istStandard: boolean;
  standardEinzahl: string;
  standardMehrzahl: string;
};

export const OBJEKT_ARTEN: ObjektArt[] = [
  'FIRMA',
  'KONTAKT',
  'GESCHAEFT',
  'AUFGABE',
  'ANGEBOT',
];

export const STANDARD_BEZEICHNUNGEN: Record<ObjektArt, Bezeichnung> = {
  FIRMA: { einzahl: 'Firma', mehrzahl: 'Firmen', genus: 'WEIBLICH' },
  KONTAKT: { einzahl: 'Kontakt', mehrzahl: 'Kontakte', genus: 'MAENNLICH' },
  GESCHAEFT: { einzahl: 'Geschäft', mehrzahl: 'Geschäfte', genus: 'SAECHLICH' },
  AUFGABE: { einzahl: 'Aufgabe', mehrzahl: 'Aufgaben', genus: 'WEIBLICH' },
  ANGEBOT: { einzahl: 'Angebot', mehrzahl: 'Angebote', genus: 'SAECHLICH' },
};

export const GENUS_TEXT: Record<Genus, string> = {
  WEIBLICH: 'weiblich (die)',
  MAENNLICH: 'männlich (der)',
  SAECHLICH: 'sächlich (das)',
};

export const BEZEICHNUNG_MAX = 30;

export type Form =
  | 'einzahl'
  | 'mehrzahl'
  | 'neu'
  | 'ersten'
  | 'keine'
  | 'diese';

const ENDUNG: Record<'neu' | 'ersten' | 'diese', Record<Genus, string>> = {
  neu: { WEIBLICH: 'Neue', MAENNLICH: 'Neuer', SAECHLICH: 'Neues' },
  ersten: { WEIBLICH: 'Erste', MAENNLICH: 'Ersten', SAECHLICH: 'Erstes' },
  diese: { WEIBLICH: 'Diese', MAENNLICH: 'Dieser', SAECHLICH: 'Dieses' },
};

export const akkusativUnsicher = (bezeichnung: Bezeichnung): boolean =>
  bezeichnung.genus === 'MAENNLICH' &&
  !Object.values(STANDARD_BEZEICHNUNGEN).some(
    (standard) =>
      standard.einzahl === bezeichnung.einzahl &&
      standard.genus === bezeichnung.genus,
  );

export const form = (bezeichnung: Bezeichnung, welche: Form): string => {
  switch (welche) {
    case 'einzahl':
      return bezeichnung.einzahl;
    case 'mehrzahl':
      return bezeichnung.mehrzahl;
    case 'keine':
      return `Noch keine ${bezeichnung.mehrzahl}`;
    case 'ersten':
      return akkusativUnsicher(bezeichnung)
        ? bezeichnung.einzahl
        : `${ENDUNG.ersten[bezeichnung.genus]} ${bezeichnung.einzahl}`;
    default:
      return `${ENDUNG[welche][bezeichnung.genus]} ${bezeichnung.einzahl}`;
  }
};

export const anzahl = (bezeichnung: Bezeichnung, wieviele: number): string =>
  wieviele === 1 ? bezeichnung.einzahl : bezeichnung.mehrzahl;

export const bezeichnungenAus = (
  vomServer: readonly ObjektBezeichnung[] | null | undefined,
): Record<ObjektArt, Bezeichnung> => {
  const ergebnis = { ...STANDARD_BEZEICHNUNGEN };

  for (const eintrag of vomServer ?? []) {
    if (
      eintrag.art in ergebnis &&
      eintrag.einzahl.trim() !== '' &&
      eintrag.mehrzahl.trim() !== ''
    ) {
      ergebnis[eintrag.art] = {
        einzahl: eintrag.einzahl,
        mehrzahl: eintrag.mehrzahl,
        genus: eintrag.genus,
      };
    }
  }

  return ergebnis;
};

export const ART_DER_SEITE: Readonly<Record<string, ObjektArt>> = {
  '/firmen': 'FIRMA',
  '/kontakte': 'KONTAKT',
  '/geschaefte': 'GESCHAEFT',
  '/aufgaben': 'AUFGABE',
  '/angebote': 'ANGEBOT',
};

export const seitenName = (
  bezeichnungen: Record<ObjektArt, Bezeichnung>,
  pfad: string,
  sonst: string,
): string => {
  const art = ART_DER_SEITE[pfad];

  return art === undefined ? sonst : bezeichnungen[art].mehrzahl;
};

export const eingabeFehler = (
  einzahl: string,
  mehrzahl: string,
): string | null => {
  for (const [wert, was] of [
    [einzahl, 'Einzahl'],
    [mehrzahl, 'Mehrzahl'],
  ] as const) {
    const text = wert.trim();

    if (text === '') {
      return `Bitte geben Sie die ${was} an.`;
    }

    if ([...text].length > BEZEICHNUNG_MAX) {
      return `Die ${was} darf höchstens ${String(BEZEICHNUNG_MAX)} Zeichen lang sein.`;
    }
  }

  return null;
};

const gleich = (a: Bezeichnung, b: Bezeichnung): boolean =>
  a.einzahl === b.einzahl && a.mehrzahl === b.mehrzahl && a.genus === b.genus;

export const leerText = (
  bezeichnung: Bezeichnung,
  art: ObjektArt,
  standardText: string,
  mitImport = false,
): string =>
  gleich(bezeichnung, STANDARD_BEZEICHNUNGEN[art])
    ? standardText
    : `Legen Sie Ihre ersten ${bezeichnung.mehrzahl} an${mitImport ? ' oder importieren Sie eine Liste' : ''}.`;

export const spalteBenennen =
  (key: string, label: string) =>
  <T extends { key: string; label: string }>(spalte: T): T =>
    spalte.key === key ? { ...spalte, label } : spalte;
