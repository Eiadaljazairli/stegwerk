export const BEISPIEL_HERKUNFT = 'beispiel';

export const BEISPIEL_FIRMEN = [
  {
    schluessel: 'bau',
    name: 'Muster Bau GmbH',
    industry: 'Bau',
    domain: 'muster-bau.example',
    street: 'Lindenstraße 12',
    postalCode: '20095',
    city: 'Hamburg',
    employeeCount: 45,
  },
  {
    schluessel: 'technik',
    name: 'Beispiel Technik AG',
    industry: 'Maschinenbau',
    domain: 'beispiel-technik.example',
    street: 'Industriering 3',
    postalCode: '70173',
    city: 'Stuttgart',
    employeeCount: 230,
  },
  {
    schluessel: 'kanzlei',
    name: 'Kanzlei Probe & Partner',
    industry: 'Beratung',
    domain: 'probe-partner.example',
    street: 'Am Markt 5',
    postalCode: '04109',
    city: 'Leipzig',
    employeeCount: 12,
  },
  {
    schluessel: 'handel',
    name: 'Testhandel Nord KG',
    industry: 'Großhandel',
    domain: 'testhandel-nord.example',
    street: 'Hafenweg 40',
    postalCode: '28195',
    city: 'Bremen',
    employeeCount: 80,
  },
] as const;

export const BEISPIEL_KONTAKTE = [
  { firma: 'bau', vor: 'Anna', nach: 'Muster', titel: 'Geschäftsführerin' },
  { firma: 'bau', vor: 'Jonas', nach: 'Beispiel', titel: 'Einkauf' },
  { firma: 'technik', vor: 'Lena', nach: 'Probe', titel: 'Leitung IT' },
  { firma: 'technik', vor: 'Tim', nach: 'Test', titel: 'Projektleiter' },
  { firma: 'kanzlei', vor: 'Sophie', nach: 'Partner', titel: 'Partnerin' },
  { firma: 'handel', vor: 'Max', nach: 'Nord', titel: 'Vertrieb' },
] as const;

export const BEISPIEL_GESCHAEFTE = [
  {
    firma: 'bau',
    kontakt: 0,
    name: 'Bürogebäude Neubau',
    betrag: 48000,
    phase: 'proposal',
    inTagen: 30,
  },
  {
    firma: 'technik',
    kontakt: 2,
    name: 'Wartungsvertrag 2027',
    betrag: 12500,
    phase: 'negotiation',
    inTagen: 14,
  },
  {
    firma: 'kanzlei',
    kontakt: 4,
    name: 'Erstberatung Digitalisierung',
    betrag: 3200,
    phase: 'qualified',
    inTagen: 45,
  },
  {
    firma: 'handel',
    kontakt: 5,
    name: 'Rahmenvertrag Lager',
    betrag: 21000,
    phase: 'won',
    inTagen: -10,
  },
] as const;

export const BEISPIEL_AUFGABEN = [
  { geschaeft: 0, titel: 'Angebot nachfassen', inTagen: 2 },
  { geschaeft: 1, titel: 'Vertragsentwurf schicken', inTagen: 5 },
  { geschaeft: 2, titel: 'Termin für Erstgespräch vereinbaren', inTagen: -1 },
] as const;

export type Branchenvorlage = {
  name: string;
  phasen: Record<
    'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost',
    string
  >;
  felder: {
    entity: 'COMPANY' | 'CONTACT' | 'DEAL';
    label: string;
    type: 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT';
    options?: string[];
  }[];
};

export const BRANCHENVORLAGEN: Record<string, Branchenvorlage> = {
  handwerk: {
    name: 'Handwerk',
    phasen: {
      lead: 'Anfrage',
      qualified: 'Besichtigung',
      proposal: 'Angebot',
      negotiation: 'Nachverhandlung',
      won: 'Auftrag',
      lost: 'Abgesagt',
    },
    felder: [
      {
        entity: 'DEAL',
        label: 'Gewerk',
        type: 'SELECT',
        options: ['Elektro', 'Sanitär', 'Heizung', 'Maler', 'Trockenbau'],
      },
      { entity: 'DEAL', label: 'Ausführung ab', type: 'DATE' },
      { entity: 'DEAL', label: 'Baustelle', type: 'TEXT' },
    ],
  },
  agentur: {
    name: 'Agentur',
    phasen: {
      lead: 'Erstkontakt',
      qualified: 'Briefing',
      proposal: 'Konzept & Angebot',
      negotiation: 'Pitch',
      won: 'Beauftragt',
      lost: 'Nicht beauftragt',
    },
    felder: [
      {
        entity: 'DEAL',
        label: 'Leistung',
        type: 'SELECT',
        options: [
          'Website',
          'Kampagne',
          'Branding',
          'Social Media',
          'Retainer',
        ],
      },
      { entity: 'DEAL', label: 'Budget pro Monat', type: 'NUMBER' },
      { entity: 'COMPANY', label: 'Ansprechpartner Marketing', type: 'TEXT' },
    ],
  },
  grosshandel: {
    name: 'Großhandel',
    phasen: {
      lead: 'Interessent',
      qualified: 'Bedarf geklärt',
      proposal: 'Angebot',
      negotiation: 'Konditionen',
      won: 'Kunde',
      lost: 'Verloren',
    },
    felder: [
      {
        entity: 'COMPANY',
        label: 'Kundengruppe',
        type: 'SELECT',
        options: ['A-Kunde', 'B-Kunde', 'C-Kunde'],
      },
      { entity: 'COMPANY', label: 'Zahlungsziel (Tage)', type: 'NUMBER' },
      { entity: 'DEAL', label: 'Liefertermin', type: 'DATE' },
    ],
  },
};
