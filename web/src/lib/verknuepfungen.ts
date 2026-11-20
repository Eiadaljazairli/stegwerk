export type ZielSpalte = 'companyId' | 'contactId' | 'dealId';

export type ZielArt = 'firma' | 'kontakt' | 'geschaeft';

export const ZIEL_SPALTEN: {
  spalte: ZielSpalte;
  art: ZielArt;
  label: string;
}[] = [
  { spalte: 'companyId', art: 'firma', label: 'Firma' },
  { spalte: 'contactId', art: 'kontakt', label: 'Kontakt' },
  { spalte: 'dealId', art: 'geschaeft', label: 'Geschäft' },
];

export type MitAkten = {
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  company?: { id: string; name: string } | null;
  contact?: { id: string; firstName: string; lastName: string } | null;
  deal?: { id: string; name: string } | null;
};

export type Verknuepfung = {
  spalte: ZielSpalte;
  art: ZielArt;
  id: string;
  label: string | null;
  to: string | null;
};

const PFAD: Record<ZielArt, string> = {
  firma: '/firmen',
  kontakt: '/kontakte',
  geschaeft: '/geschaefte',
};

const titel = (eintrag: MitAkten, spalte: ZielSpalte): string | null => {
  if (spalte === 'companyId') {
    return eintrag.company?.name ?? null;
  }

  if (spalte === 'contactId') {
    return eintrag.contact == null
      ? null
      : `${eintrag.contact.firstName} ${eintrag.contact.lastName}`.trim();
  }

  return eintrag.deal?.name ?? null;
};

const kennung = (eintrag: MitAkten, spalte: ZielSpalte): string | null => {
  const direkt = eintrag[spalte];

  if (direkt != null) {
    return direkt;
  }

  const objekt =
    spalte === 'companyId'
      ? eintrag.company
      : spalte === 'contactId'
        ? eintrag.contact
        : eintrag.deal;

  return objekt?.id ?? null;
};

export const verknuepfungen = (
  eintrag: MitAkten,
  hier: Partial<Record<ZielSpalte, string>> = {},
): Verknuepfung[] =>
  ZIEL_SPALTEN.flatMap(({ spalte, art }) => {
    const id = kennung(eintrag, spalte);

    if (id === null || hier[spalte] === id) {
      return [];
    }

    const label = titel(eintrag, spalte);

    return [
      {
        spalte,
        art,
        id,
        label,
        to: label === null ? null : `${PFAD[art]}/${id}`,
      },
    ];
  });

export const freieArten = (eintrag: MitAkten): typeof ZIEL_SPALTEN =>
  ZIEL_SPALTEN.filter(({ spalte }) => kennung(eintrag, spalte) === null);

export const loesbar = (
  eintrag: MitAkten,
  verknuepfung: Verknuepfung,
  mindestensEine: boolean,
): boolean => {
  if (verknuepfung.label === null) {
    return false;
  }

  const anzahl = ZIEL_SPALTEN.filter(
    ({ spalte }) => kennung(eintrag, spalte) !== null,
  ).length;

  return !mindestensEine || anzahl > 1;
};

export type ZielVorschlag = { spalte: ZielSpalte; id: string; label: string };

export const zielMitVorschlaegen = (
  hier: Partial<Record<ZielSpalte, string>>,
  vorschlaege: ZielVorschlag[],
  gewaehlt: ReadonlySet<string>,
): Partial<Record<ZielSpalte, string>> => {
  const ziel: Partial<Record<ZielSpalte, string>> = { ...hier };

  for (const vorschlag of vorschlaege) {
    if (gewaehlt.has(vorschlag.id) && ziel[vorschlag.spalte] === undefined) {
      ziel[vorschlag.spalte] = vorschlag.id;
    }
  }

  return ziel;
};
