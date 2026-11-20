type Feld = { name: string; label: string };

export const normalisiere = (wert: string): string =>
  wert
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');

const SYNONYME: Record<string, string[]> = {
  name: [
    'firma',
    'firmenname',
    'unternehmen',
    'company',
    'companyname',
    'organisation',
    'organization',
    'organisationname',
    'kunde',
    'kundenname',
    'titel',
    'dealname',
    'geschaeft',
    'opportunity',
  ],
  companyName: [
    'firma',
    'firmenname',
    'unternehmen',
    'company',
    'companyname',
    'organisation',
    'organization',
    'arbeitgeber',
  ],
  domain: ['website', 'webseite', 'homepage', 'url', 'web', 'internetseite'],
  industry: ['branche', 'industrie', 'sektor', 'sector'],
  employeeCount: [
    'mitarbeiter',
    'mitarbeiterzahl',
    'anzahlmitarbeiter',
    'employees',
    'numberofemployees',
    'beschaeftigte',
  ],
  annualRevenue: ['umsatz', 'jahresumsatz', 'revenue', 'annualrevenue'],
  street: [
    'strasse',
    'str',
    'strassehausnummer',
    'anschrift',
    'adresse',
    'address',
    'street',
    'geschaeftlichstrasse',
    'businessstreet',
  ],
  postalCode: [
    'plz',
    'postleitzahl',
    'zip',
    'zipcode',
    'postalcode',
    'postcode',
    'geschaeftlichpostleitzahl',
    'businesspostalcode',
  ],
  city: ['ort', 'stadt', 'city', 'town', 'geschaeftlichort', 'businesscity'],
  country: [
    'land',
    'country',
    'staat',
    'geschaeftlichland',
    'businesscountryregion',
  ],
  firstName: ['vorname', 'firstname', 'givenname', 'rufname'],
  lastName: ['nachname', 'lastname', 'familienname', 'surname', 'zuname'],
  email: [
    'email',
    'emailadresse',
    'mail',
    'emailaddress',
    'e-mail',
    'e-mail-adresse',
    'email1',
  ],
  phone: [
    'telefon',
    'tel',
    'telefonnummer',
    'phone',
    'phonenumber',
    'mobil',
    'mobile',
    'handy',
    'telefongeschaeftlich',
    'businessphone',
  ],
  emailWeitere: [
    'email2',
    'emailadresse2',
    'email2adresse',
    'e-mail2',
    'email3',
    'emailadresse3',
    'zweiteemail',
    'weitereemail',
  ],
  emailPrivat: ['emailprivat', 'privateemail', 'homeemail', 'privatemail'],
  telefonMobil: [
    'mobil',
    'mobile',
    'handy',
    'mobiltelefon',
    'mobilenumber',
    'mobilephone',
    'mobiltelefonnummer',
    'telefonmobil',
  ],
  telefonPrivat: ['telefonprivat', 'homephone', 'privattelefon', 'telprivat'],
  telefonFax: [
    'fax',
    'faxnummer',
    'telefax',
    'faxgeschaeftlich',
    'businessfax',
  ],
  jobTitle: ['position', 'funktion', 'jobtitle', 'title', 'rolle', 'beruf'],
  amount: [
    'betrag',
    'wert',
    'value',
    'amount',
    'volumen',
    'auftragswert',
    'dealvalue',
  ],
  currency: ['waehrung', 'currency'],
  stage: ['phase', 'stage', 'status', 'pipelinephase', 'dealstage'],
  closeDate: [
    'abschluss',
    'abschlussdatum',
    'closedate',
    'expectedclosedate',
    'erwarteterabschluss',
    'enddatum',
  ],
};

const abstand = (a: string, b: string): number => {
  const zeile = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    let vorher = zeile[0];

    zeile[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const merk = zeile[j];

      zeile[j] = Math.min(
        zeile[j] + 1,
        zeile[j - 1] + 1,
        vorher + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      vorher = merk;
    }
  }

  return zeile[b.length];
};

const namenFuer = (feld: Feld): string[] => [
  normalisiere(feld.label),
  normalisiere(feld.name),
  ...(SYNONYME[feld.name] ?? []).map(normalisiere),
];

const guete = (spalte: string, feld: Feld): number | null => {
  const ziel = normalisiere(spalte);

  if (ziel === '') {
    return null;
  }

  if ([normalisiere(feld.label), normalisiere(feld.name)].includes(ziel)) {
    return 0;
  }

  const namen = namenFuer(feld);

  if (namen.includes(ziel)) {
    return 1;
  }

  const erlaubt = ziel.length < 5 ? 0 : Math.ceil(ziel.length / 6);
  const kleinster = Math.min(...namen.map((name) => abstand(ziel, name)));

  return kleinster <= erlaubt ? 1 + kleinster : null;
};

export const feldFuerSpalte = (spalte: string, felder: Feld[]): string => {
  let bestes: { name: string; guete: number } | null = null;

  for (const feld of felder) {
    const g = guete(spalte, feld);

    if (g !== null && (bestes === null || g < bestes.guete)) {
      bestes = { name: feld.name, guete: g };
    }
  }

  return bestes?.name ?? '';
};

export const ordneSpaltenZu = (
  spalten: string[],
  felder: Feld[],
): Record<string, string> => {
  const paare = spalten
    .flatMap((spalte, position) =>
      felder.map((feld) => ({
        spalte,
        position,
        feld: feld.name,
        guete: guete(spalte, feld),
      })),
    )
    .filter(
      (paar): paar is typeof paar & { guete: number } => paar.guete !== null,
    )
    .sort((a, b) => a.guete - b.guete || a.position - b.position);

  const ergebnis: Record<string, string> = Object.fromEntries(
    spalten.map((spalte) => [spalte, '']),
  );
  const vergeben = new Set<string>();

  for (const paar of paare) {
    if (ergebnis[paar.spalte] === '' && !vergeben.has(paar.feld)) {
      ergebnis[paar.spalte] = paar.feld;
      vergeben.add(paar.feld);
    }
  }

  return ergebnis;
};
