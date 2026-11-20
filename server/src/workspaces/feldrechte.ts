import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { getRequestContext } from '../observability/request-context';

export type Feldrecht = 'verborgen' | 'lesen';

export type Feldrechte = Record<string, Feldrecht>;

export type FeldArt = 'company' | 'contact' | 'deal' | 'task';

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
    auch: ['weitereTelefone'],
  },
  {
    schluessel: 'contact.email',
    art: 'contact',
    feld: 'email',
    label: 'E-Mail',
    auch: ['weitereEmails'],
  },
  {
    schluessel: 'contact.street',
    art: 'contact',
    feld: 'street',
    label: 'Anschrift',
    auch: ['postalCode', 'city', 'country'],
  },
];

const STANDARD_SCHLUESSEL = new Set(
  STANDARD_FELDRECHTE.map((eintrag) => eintrag.schluessel),
);

export const FELDART_DER_ENTITAET: Record<string, FeldArt | undefined> = {
  CompanyEntity: 'company',
  ContactEntity: 'contact',
  DealEntity: 'deal',
  TaskEntity: 'task',
};

export const standardSchluessel = (art: FeldArt, feld: string): string =>
  STANDARD_FELDRECHTE.find(
    (eintrag) =>
      eintrag.art === art &&
      (eintrag.feld === feld || (eintrag.auch ?? []).includes(feld)),
  )?.schluessel ?? `${art}.${feld}`;

export const eigenesSchluessel = (art: FeldArt, key: string): string =>
  `custom:${art}:${key}`;

const EIGENES_FELD =
  /^custom:(company|contact|deal|task):[A-Za-z0-9_]{1,100}$/u;

export const normalisiereFeldrechte = (roh: unknown): Feldrechte => {
  const ergebnis: Feldrechte = {};

  if (roh === null || typeof roh !== 'object' || Array.isArray(roh)) {
    return ergebnis;
  }

  for (const [schluessel, recht] of Object.entries(roh)) {
    if (
      (recht === 'verborgen' || recht === 'lesen') &&
      (STANDARD_SCHLUESSEL.has(schluessel) || EIGENES_FELD.test(schluessel))
    ) {
      ergebnis[schluessel] = recht;
    }
  }

  return ergebnis;
};

export const feldrechteJetzt = async (): Promise<Feldrechte> => {
  const laden = getRequestContext()?.sichtfeld;

  return laden === undefined ? {} : (await laden()).felder;
};

export const istVerborgen = async (schluessel: string): Promise<boolean> =>
  (await feldrechteJetzt())[schluessel] === 'verborgen';

export const ohneVerborgeneEigene = <T extends Record<string, unknown>>(
  rechte: Feldrechte,
  art: FeldArt,
  werte: T | null | undefined,
): T | null | undefined => {
  if (werte === null || werte === undefined) {
    return werte;
  }

  const weg = Object.keys(werte).filter(
    (key) => rechte[eigenesSchluessel(art, key)] === 'verborgen',
  );

  if (weg.length === 0) {
    return werte;
  }

  return Object.fromEntries(
    Object.entries(werte).filter(([key]) => !weg.includes(key)),
  ) as T;
};

export const assertFelderSchreibbar = async (
  art: FeldArt,
  standard: string[],
  eigene: string[],
): Promise<void> => {
  const rechte = await feldrechteJetzt();

  if (Object.keys(rechte).length === 0) {
    return;
  }

  const gesperrt = [
    ...standard
      .filter((feld) => rechte[standardSchluessel(art, feld)] !== undefined)
      .map(
        (feld) =>
          STANDARD_FELDRECHTE.find(
            (eintrag) => eintrag.schluessel === standardSchluessel(art, feld),
          )?.label ?? feld,
      ),
    ...eigene.filter(
      (key) => rechte[eigenesSchluessel(art, key)] !== undefined,
    ),
  ];

  if (gesperrt.length > 0) {
    throw new ForbiddenException(
      `Ihre Rolle darf diese Felder nicht ändern: ${gesperrt.join(', ')}.`,
    );
  }
};

export const assertNichtVerborgen = async (
  schluessel: string,
  label: string,
): Promise<void> => {
  if (await istVerborgen(schluessel)) {
    throw new BadRequestException(
      `Nach „${label}“ kann Ihre Rolle nicht filtern oder sortieren.`,
    );
  }
};

export const assertFeldrechteVergebbar = (
  eigene: Feldrechte,
  gewuenscht: Feldrechte,
): void => {
  for (const [schluessel, recht] of Object.entries(eigene)) {
    const neu = gewuenscht[schluessel];
    const mindestensSoStreng =
      neu === 'verborgen' || (neu === 'lesen' && recht === 'lesen');

    if (!mindestensSoStreng) {
      throw new ForbiddenException(
        'Sie können einer Rolle nur Felder freigeben, die Sie selbst sehen und ändern dürfen.',
      );
    }
  }
};
