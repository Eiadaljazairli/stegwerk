import { HERKUNFT_LABELS, HERKUNFTE } from './herkunft';
import { type CustomField } from './types';
import { type FeldArt } from './useFeldrechte';

type Art = CustomField['entity'];

const feld = (
  entity: Art,
  spalte: string,
  label: string,
  type: CustomField['type'],
): CustomField =>
  ({
    id: `std:${spalte}`,
    entity,
    key: `std:${spalte}`,
    label,
    type,
    options: [],
  }) as unknown as CustomField;

const firmenFelder = (entity: Art): CustomField[] =>
  (
    [
      ['name', 'Name', 'TEXT'],
      ['industry', 'Branche', 'TEXT'],
      ['city', 'Stadt', 'TEXT'],
      ['postalCode', 'PLZ', 'TEXT'],
      ['country', 'Land', 'TEXT'],
      ['employeeCount', 'Mitarbeiter', 'NUMBER'],
      ['annualRevenue', 'Jahresumsatz', 'NUMBER'],
    ] as const
  ).map(([spalte, label, type]) =>
    feld(entity, `firma.${spalte}`, `Firma: ${label}`, type),
  );

export const FIRMA_PREFIX = 'std:firma.';

export const feldrechtDesFilters = (
  art: FeldArt,
  key: string,
): { art: FeldArt; feld: string } =>
  key.startsWith(FIRMA_PREFIX)
    ? { art: 'company', feld: key.slice(FIRMA_PREFIX.length) }
    : { art, feld: key.slice('std:'.length) };

const herkunft = (entity: Art): CustomField => ({
  ...feld(entity, 'herkunft', 'Herkunft', 'SELECT'),
  options: HERKUNFTE,
  optionLabels: HERKUNFT_LABELS,
});

const zeitstempel = (entity: Art): CustomField[] => [
  feld(entity, 'createdAt', 'Angelegt am', 'DATE'),
  feld(entity, 'updatedAt', 'Geändert am', 'DATE'),
];

export const STANDARD_FILTER_FELDER: Record<Art, CustomField[]> = {
  COMPANY: [
    feld('COMPANY', 'name', 'Name', 'TEXT'),
    feld('COMPANY', 'domain', 'Domain', 'TEXT'),
    feld('COMPANY', 'website', 'Website', 'TEXT'),
    feld('COMPANY', 'linkedin', 'LinkedIn', 'TEXT'),
    feld('COMPANY', 'industry', 'Branche', 'TEXT'),
    feld('COMPANY', 'city', 'Stadt', 'TEXT'),
    feld('COMPANY', 'postalCode', 'PLZ', 'TEXT'),
    feld('COMPANY', 'country', 'Land', 'TEXT'),
    feld('COMPANY', 'phone', 'Telefon', 'TEXT'),
    feld('COMPANY', 'email', 'E-Mail', 'TEXT'),
    feld('COMPANY', 'registernummer', 'Registernummer', 'TEXT'),
    feld('COMPANY', 'ustIdNr', 'USt-IdNr.', 'TEXT'),
    feld('COMPANY', 'employeeCount', 'Mitarbeiter', 'NUMBER'),
    feld('COMPANY', 'annualRevenue', 'Jahresumsatz', 'NUMBER'),
    herkunft('COMPANY'),
    ...zeitstempel('COMPANY'),
  ],
  CONTACT: [
    feld('CONTACT', 'firstName', 'Vorname', 'TEXT'),
    feld('CONTACT', 'lastName', 'Nachname', 'TEXT'),
    feld('CONTACT', 'email', 'E-Mail', 'TEXT'),
    feld('CONTACT', 'phone', 'Telefon', 'TEXT'),
    feld('CONTACT', 'jobTitle', 'Position', 'TEXT'),
    feld('CONTACT', 'city', 'Stadt', 'TEXT'),
    feld('CONTACT', 'postalCode', 'PLZ', 'TEXT'),
    feld('CONTACT', 'country', 'Land', 'TEXT'),
    feld('CONTACT', 'linkedin', 'LinkedIn', 'TEXT'),
    herkunft('CONTACT'),
    ...zeitstempel('CONTACT'),
    ...firmenFelder('CONTACT'),
  ],
  DEAL: [
    feld('DEAL', 'name', 'Bezeichnung', 'TEXT'),
    feld('DEAL', 'amount', 'Betrag', 'NUMBER'),
    feld('DEAL', 'closeDate', 'Abschluss', 'DATE'),
    feld('DEAL', 'abgeschlossen', 'Abschluss, sonst geändert am', 'DATE'),
    feld('DEAL', 'probability', 'Wahrscheinlichkeit', 'NUMBER'),
    feld('DEAL', 'lostReason', 'Verlustgrund', 'TEXT'),
    herkunft('DEAL'),
    ...zeitstempel('DEAL'),
    ...firmenFelder('DEAL'),
  ],
  TASK: [
    feld('TASK', 'title', 'Titel', 'TEXT'),
    feld('TASK', 'dueDate', 'Fällig', 'DATE'),
    feld('TASK', 'completedAt', 'Erledigt am', 'DATE'),
    feld('TASK', 'createdAt', 'Angelegt am', 'DATE'),
  ],
};
