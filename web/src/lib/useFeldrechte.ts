import { useQuery } from '@apollo/client';

import { MY_PERMISSIONS } from './queries';
import { type MyPermissions } from './types';

export type FeldArt = 'company' | 'contact' | 'deal' | 'task';

export type Feldrecht = 'alle' | 'lesen' | 'verborgen';

export const STANDARD_FELDRECHTE: {
  schluessel: string;
  art: FeldArt;
  feld: string;
  label: string;
  auch?: string[];
}[] = [
  { schluessel: 'deal.amount', art: 'deal', feld: 'amount', label: 'Betrag' },
  {
    schluessel: 'deal.probability',
    art: 'deal',
    feld: 'probability',
    label: 'Wahrscheinlichkeit',
  },
  {
    schluessel: 'company.annualRevenue',
    art: 'company',
    feld: 'annualRevenue',
    label: 'Jahresumsatz',
  },
  {
    schluessel: 'contact.phone',
    art: 'contact',
    feld: 'phone',
    label: 'Telefon',
  },
  {
    schluessel: 'contact.email',
    art: 'contact',
    feld: 'email',
    label: 'E-Mail',
  },
  {
    schluessel: 'contact.street',
    art: 'contact',
    feld: 'street',
    label: 'Anschrift',
    auch: ['postalCode', 'city', 'country'],
  },
];

const standardSchluessel = (art: FeldArt, feld: string): string =>
  STANDARD_FELDRECHTE.find(
    (eintrag) => eintrag.art === art && (eintrag.auch ?? []).includes(feld),
  )?.schluessel ?? `${art}.${feld}`;

export const eigenesSchluessel = (art: FeldArt, key: string): string =>
  `custom:${art}:${key}`;

const schluesselDerSpalte = (art: FeldArt, spalte: string): string =>
  spalte.startsWith('custom:')
    ? eigenesSchluessel(art, spalte.slice('custom:'.length))
    : standardSchluessel(art, spalte);

export const useFeldrechte = () => {
  const { data } = useQuery<{ myPermissions: MyPermissions }>(MY_PERMISSIONS);
  const rechte = new Map(
    (data?.myPermissions.feldrechte ?? []).map((eintrag) => [
      eintrag.feld,
      eintrag.recht,
    ]),
  );

  const recht = (schluessel: string): Feldrecht =>
    (rechte.get(schluessel) as Feldrecht | undefined) ?? 'alle';

  return {
    geladen: data !== undefined,
    recht,
    standard: (art: FeldArt, feld: string) =>
      recht(standardSchluessel(art, feld)),
    eigenes: (art: FeldArt, key: string) => recht(eigenesSchluessel(art, key)),
    aenderbar: (art: FeldArt, spalte: string) =>
      recht(schluesselDerSpalte(art, spalte)) === 'alle',
    spalten: <C extends { key: string; edit?: unknown }>(
      art: FeldArt,
      spalten: C[],
    ): C[] =>
      spalten
        .filter(
          (spalte) =>
            recht(schluesselDerSpalte(art, spalte.key)) !== 'verborgen',
        )
        .map((spalte) =>
          recht(schluesselDerSpalte(art, spalte.key)) === 'lesen'
            ? { ...spalte, edit: undefined }
            : spalte,
        ),
  };
};
