import { type CustomField, optionFarbe } from './types';

export type BoardFeldArt = 'auswahl' | 'text' | 'person';

export type BoardOption = {
  wert: string;
  label: string;
  farbe?: string | null;
};

export type BoardFeld = {
  key: string;
  label: string;
  art: BoardFeldArt;
  optionen: BoardOption[];
  ohneWert: string | null;
};

export type BoardSpaltenDef = {
  schluessel: string;
  wert: string | null;
  label: string;
  farbe: string | null;
  nimmtAn: boolean;
};

export const OHNE = '';

export const spaltenSchluessel = (wert: string | null): string =>
  wert === null || wert === '' ? OHNE : wert;

export const wertAusSchluessel = (schluessel: string): string | null =>
  schluessel === OHNE ? null : schluessel;

export const spaltenFuer = (
  feld: BoardFeld,
  werte: (string | null)[],
): BoardSpaltenDef[] => {
  const vorhanden = new Set(
    werte.filter((wert): wert is string => wert !== null && wert !== ''),
  );
  const optionen: BoardOption[] =
    feld.art === 'text'
      ? [
          ...new Map(
            [
              ...feld.optionen,
              ...[...vorhanden].map(
                (wert): BoardOption => ({ wert, label: wert }),
              ),
            ].map((option) => [option.wert, option]),
          ).values(),
        ].sort((a, b) => a.label.localeCompare(b.label, 'de'))
      : feld.optionen;
  const bekannt = new Set(optionen.map((option) => option.wert));

  const spalten: BoardSpaltenDef[] = optionen.map((option) => ({
    schluessel: option.wert,
    wert: option.wert,
    label: option.label,
    farbe: option.farbe ?? null,
    nimmtAn: true,
  }));

  for (const wert of [...vorhanden].sort((a, b) => a.localeCompare(b, 'de'))) {
    if (!bekannt.has(wert)) {
      spalten.push({
        schluessel: wert,
        wert,
        label: feld.art === 'person' ? 'Nicht mehr im Team' : wert,
        farbe: null,
        nimmtAn: false,
      });
    }
  }

  const ohneVorhanden = werte.some((wert) => wert === null || wert === '');

  if (feld.ohneWert !== null || ohneVorhanden) {
    spalten.push({
      schluessel: OHNE,
      wert: null,
      label: feld.ohneWert ?? `Ohne ${feld.label}`,
      farbe: null,
      nimmtAn: feld.ohneWert !== null,
    });
  }

  return spalten;
};

export const optionenDesFelds = (feld: CustomField): BoardOption[] =>
  feld.options.map((option) => ({
    wert: option,
    label: option,
    farbe: optionFarbe(feld, option),
  }));

export const aenderungBeimAblegen = (
  feld: string,
  wert: string | null,
): Record<string, unknown> | null => {
  if (feld.startsWith('custom:')) {
    return { customFields: { [feld.slice('custom:'.length)]: wert } };
  }

  switch (feld) {
    case 'std:ownerId':
      return { ownerId: wert };
    case 'std:industry':
      return { industry: wert };
    case 'std:assigneeId':
      return wert === null ? null : { assigneeId: wert };
    default:
      return null;
  }
};

export const wertDesFelds = (datensatz: object, key: string): string | null => {
  const eintrag = datensatz as Record<string, unknown> & {
    customFields?: Record<string, unknown> | null;
    owner?: { id: string } | null;
  };
  const roh = key.startsWith('custom:')
    ? eintrag.customFields?.[key.slice('custom:'.length)]
    : key === 'std:ownerId'
      ? (eintrag.owner?.id ?? eintrag.ownerId)
      : eintrag[key.slice('std:'.length)];

  return typeof roh === 'string' && roh !== '' ? roh : null;
};

export const AUFGABEN_STATUS_OPTIONEN: BoardOption[] = [
  { wert: 'offen', label: 'Offen', farbe: 'grau' },
  { wert: 'in_arbeit', label: 'In Arbeit', farbe: 'blau' },
  { wert: 'erledigt', label: 'Erledigt', farbe: 'gruen' },
];
