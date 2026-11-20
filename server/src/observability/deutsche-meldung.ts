const FELDNAMEN: Record<string, string> = {
  name: 'Name',
  firstName: 'Vorname',
  lastName: 'Nachname',
  email: 'E-Mail',
  phone: 'Telefon',
  jobTitle: 'Position',
  domain: 'Domain',
  industry: 'Branche',
  employeeCount: 'Mitarbeiterzahl',
  annualRevenue: 'Jahresumsatz',
  street: 'Straße',
  postalCode: 'PLZ',
  city: 'Ort',
  country: 'Land',
  amount: 'Betrag',
  currency: 'Währung',
  probability: 'Wahrscheinlichkeit',
  closeDate: 'Abschlussdatum',
  stage: 'Phase',
  title: 'Titel',
  body: 'Text',
  dueDate: 'Fälligkeit',
  description: 'Beschreibung',
  subject: 'Betreff',
  password: 'Passwort',
  companyId: 'Firma',
  contactId: 'Kontakt',
  dealId: 'Geschäft',
  ownerId: 'Verantwortlich',
  assigneeId: 'Zuständig',
  id: 'Kennung',
  url: 'Adresse',
  quantity: 'Menge',
  unitPriceCents: 'Einzelpreis',
  discountPercent: 'Rabatt',
  taxRatePercent: 'Steuersatz',
};

const feld = (roh: string): string => {
  const letzter =
    roh
      .split('.')
      .filter((teil) => !/^\d+$/u.test(teil))
      .pop() ?? roh;

  return FELDNAMEN[letzter] ?? `„${letzter}“`;
};

const MUSTER: [RegExp, (f: string, w: string) => string][] = [
  [
    /^(\S+) must be an email$/u,
    (f) => `${f}: bitte eine gültige E-Mail-Adresse.`,
  ],
  [
    /^(\S+) must not be less than (\S+)$/u,
    (f, w) => `${f} darf nicht kleiner als ${w} sein.`,
  ],
  [
    /^(\S+) must not be greater than (\S+)$/u,
    (f, w) => `${f} darf nicht größer als ${w} sein.`,
  ],
  [
    /^(\S+) must be shorter than or equal to (\d+) characters$/u,
    (f, w) => `${f} darf höchstens ${w} Zeichen lang sein.`,
  ],
  [
    /^(\S+) must be longer than or equal to (\d+) characters$/u,
    (f, w) => `${f} braucht mindestens ${w} Zeichen.`,
  ],
  [/^(\S+) should not be empty$/u, (f) => `${f} darf nicht leer sein.`],
  [/^(\S+) should not be null or undefined$/u, (f) => `${f} fehlt.`],
  [/^(\S+) must be a UUID$/u, (f) => `${f}: die Kennung ist ungültig.`],
  [
    /^(\S+) must be a valid ISO 8601 date string$/u,
    (f) => `${f}: dieses Datum gibt es nicht.`,
  ],
  [
    /^(\S+) must be an integer number$/u,
    (f) => `${f} muss eine ganze Zahl sein.`,
  ],
  [/^(\S+) must be a positive number$/u, (f) => `${f} muss größer als 0 sein.`],
  [
    /^(\S+) must be a number conforming to the specified constraints$/u,
    (f) => `${f} muss eine Zahl sein.`,
  ],
  [/^(\S+) must be a boolean value$/u, (f) => `${f} muss ja oder nein sein.`],
  [/^(\S+) must be a string$/u, (f) => `${f} muss ein Text sein.`],
  [/^(\S+) must be an array$/u, (f) => `${f} muss eine Liste sein.`],
  [/^(\S+) must be an object$/u, (f) => `${f} hat die falsche Form.`],
  [
    /^(\S+) must be a URL address$/u,
    (f) => `${f}: bitte eine gültige Adresse (https://…).`,
  ],
  [
    /^(\S+) must be one of the following values: .*$/u,
    (f) => `${f}: dieser Wert ist nicht vorgesehen.`,
  ],
  [
    /^property (\S+) should not exist$/u,
    (f) => `${f} ist hier nicht vorgesehen.`,
  ],
];

export const deutscherSatz = (satz: string): string => {
  for (const [muster, text] of MUSTER) {
    const treffer = muster.exec(satz.trim());

    if (treffer !== null) {
      return text(feld(treffer[1]), treffer[2] ?? '');
    }
  }

  return satz;
};

export const datenbankMeldung = (fehler: unknown): string | null => {
  const code =
    (fehler as { driverError?: { code?: unknown }; code?: unknown } | null)
      ?.driverError?.code ?? (fehler as { code?: unknown } | null)?.code;

  switch (code) {
    case '22003':
      return 'Eine Zahl ist zu groß.';
    case '22007':
    case '22008':
      return 'Dieses Datum gibt es nicht.';
    case '22001':
      return 'Ein Text ist zu lang.';
    case '22P02':
      return 'Eine Angabe hat das falsche Format.';
    case '23505':
      return 'Diesen Eintrag gibt es schon.';
    case '23503':
      return 'Ein verknüpfter Eintrag fehlt oder wird noch gebraucht.';
    default:
      return null;
  }
};
