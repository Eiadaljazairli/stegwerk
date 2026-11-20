export const csvText = (inhalt: ArrayBuffer): string => {
  const bytes = new Uint8Array(inhalt);

  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(
      bytes,
    );
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
};

type Feld = { name: string; label: string };

const BEISPIEL: Record<string, string> = {
  name: 'Muster GmbH',
  companyName: 'Muster GmbH',
  domain: 'muster.de',
  industry: 'Maschinenbau',
  employeeCount: '25',
  annualRevenue: '2500000',
  street: 'Hauptstraße 1',
  postalCode: '10115',
  city: 'Berlin',
  country: 'Deutschland',
  firstName: 'Erika',
  lastName: 'Mustermann',
  email: 'erika@muster.de',
  phone: '+49 30 1234567',
  jobTitle: 'Einkauf',
  amount: '12000',
  currency: 'EUR',
  stage: 'Angebot',
  closeDate: '2026-12-31',
};

const zelle = (wert: string): string =>
  /[";\n]/u.test(wert) ? `"${wert.replace(/"/g, '""')}"` : wert;

export const beispielCsv = (felder: Feld[]): string =>
  '﻿' +
  [
    felder.map((feld) => zelle(feld.label)).join(';'),
    felder.map((feld) => zelle(BEISPIEL[feld.name] ?? '')).join(';'),
  ].join('\r\n') +
  '\r\n';
