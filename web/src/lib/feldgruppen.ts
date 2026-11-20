import { type CustomField, type CustomFieldGroup } from './types';

export type Abschnitt = {
  id: string | null;
  name: string;
  felder: CustomField[];
  leere: CustomField[];
  eingeklappt: boolean;
};

export const OHNE_ABSCHNITT = 'Weitere Angaben';

export const istLeer = (wert: unknown): boolean => {
  if (wert === null || wert === undefined) {
    return true;
  }

  if (typeof wert === 'string') {
    return wert.trim() === '';
  }

  if (Array.isArray(wert)) {
    return wert.length === 0;
  }

  if (typeof wert === 'object') {
    return Object.values(wert as Record<string, unknown>).every((teil) =>
      istLeer(teil),
    );
  }

  return false;
};

export const immerSichtbar = (feld: CustomField): boolean =>
  feld.required ||
  (feld.pflichtAbPhase !== null && feld.pflichtAbPhase !== undefined);

export const abschnitteBilden = (
  felder: CustomField[],
  gruppen: CustomFieldGroup[],
  werte: Record<string, unknown>,
  leereZeigen: boolean,
): Abschnitt[] => {
  const sortiert = [...gruppen].sort(
    (a, b) => a.position - b.position || a.name.localeCompare(b.name, 'de'),
  );
  const bekannt = new Set(sortiert.map((gruppe) => gruppe.id));
  const verteilen = (liste: CustomField[]) => {
    const sichtbar: CustomField[] = [];
    const leere: CustomField[] = [];

    for (const feld of liste) {
      if (leereZeigen || immerSichtbar(feld) || !istLeer(werte[feld.key])) {
        sichtbar.push(feld);
      } else {
        leere.push(feld);
      }
    }

    return { felder: sichtbar, leere };
  };

  const abschnitte: Abschnitt[] = sortiert.map((gruppe) => ({
    id: gruppe.id,
    name: gruppe.name,
    eingeklappt: gruppe.eingeklappt,
    ...verteilen(felder.filter((feld) => feld.gruppeId === gruppe.id)),
  }));

  abschnitte.push({
    id: null,
    name: OHNE_ABSCHNITT,
    eingeklappt: false,
    ...verteilen(
      felder.filter(
        (feld) =>
          feld.gruppeId === null ||
          feld.gruppeId === undefined ||
          !bekannt.has(feld.gruppeId),
      ),
    ),
  });

  return abschnitte.filter(
    (abschnitt) => abschnitt.felder.length + abschnitt.leere.length > 0,
  );
};

export const anzahlLeere = (abschnitte: Abschnitt[]): number =>
  abschnitte.reduce((summe, abschnitt) => summe + abschnitt.leere.length, 0);

const EINGEKLAPPT = 'stegwerk.feldgruppen.eingeklappt';
const LEERE = 'stegwerk.feldgruppen.leere';

const lesen = (schluessel: string): Record<string, boolean> => {
  try {
    const roh: unknown = JSON.parse(
      window.localStorage.getItem(schluessel) ?? '{}',
    );

    if (typeof roh !== 'object' || roh === null || Array.isArray(roh)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(roh).filter(([, wert]) => typeof wert === 'boolean'),
    ) as Record<string, boolean>;
  } catch {
    return {};
  }
};

const schreiben = (schluessel: string, name: string, wert: boolean): void => {
  try {
    window.localStorage.setItem(
      schluessel,
      JSON.stringify({ ...lesen(schluessel), [name]: wert }),
    );
  } catch {}
};

const merkName = (
  abschnittId: string | null,
  entity: CustomField['entity'],
): string => abschnittId ?? `ohne:${entity}`;

export const istEingeklappt = (
  abschnitt: Abschnitt,
  entity: CustomField['entity'],
): boolean =>
  lesen(EINGEKLAPPT)[merkName(abschnitt.id, entity)] ?? abschnitt.eingeklappt;

export const merkeEingeklappt = (
  abschnittId: string | null,
  entity: CustomField['entity'],
  eingeklappt: boolean,
): void => schreiben(EINGEKLAPPT, merkName(abschnittId, entity), eingeklappt);

export const leereSichtbar = (entity: CustomField['entity']): boolean =>
  lesen(LEERE)[entity] ?? false;

export const merkeLeereSichtbar = (
  entity: CustomField['entity'],
  sichtbar: boolean,
): void => schreiben(LEERE, entity, sichtbar);
