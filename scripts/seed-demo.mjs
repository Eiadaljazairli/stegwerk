#!/usr/bin/env node
const API = process.env.API_URL ?? 'http://localhost:4000/graphql';
const [email, password, ...flags] = process.argv.slice(2);
const reset = flags.includes('--reset');

if (email === undefined || password === undefined) {
  console.error(
    'usage: node scripts/seed-demo.mjs <email> <password> [--reset]',
  );
  process.exit(1);
}

const gql = async (query, variables = {}, token) => {
  const response = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = await response.json();

  if (body.errors !== undefined) {
    throw new Error(body.errors[0].message);
  }

  return body.data;
};

const COMPANIES = [
  {
    name: 'Nordwind Logistik GmbH',
    domain: 'nordwind-logistik.de',
    industry: 'Logistik',
    city: 'Hamburg',
    employeeCount: 240,
  },
  {
    name: 'Alpenkraft Maschinenbau AG',
    domain: 'alpenkraft.de',
    industry: 'Maschinenbau',
    city: 'München',
    employeeCount: 890,
  },
  {
    name: 'Elbmarine Systeme',
    domain: 'elbmarine.de',
    industry: 'Schiffbau',
    city: 'Bremen',
    employeeCount: 130,
  },
  {
    name: 'Rheinblick Software GmbH',
    domain: 'rheinblick.io',
    industry: 'Software',
    city: 'Köln',
    employeeCount: 62,
  },
  {
    name: 'Spreequell Energie',
    domain: 'spreequell.de',
    industry: 'Energie',
    city: 'Berlin',
    employeeCount: 410,
  },
  {
    name: 'Isartal Consulting',
    domain: 'isartal-consulting.de',
    industry: 'Beratung',
    city: 'München',
    employeeCount: 28,
  },
  {
    name: 'Hansetec Handel KG',
    domain: 'hansetec.de',
    industry: 'Handel',
    city: 'Lübeck',
    employeeCount: 175,
  },
  {
    name: 'Neckarhof Pharma',
    domain: 'neckarhof-pharma.de',
    industry: 'Pharma',
    city: 'Stuttgart',
    employeeCount: 520,
  },
  {
    name: 'Ruhrglanz Metallbau',
    domain: 'ruhrglanz.de',
    industry: 'Metallbau',
    city: 'Essen',
    employeeCount: 310,
  },
  {
    name: 'Saalequell Getränke',
    domain: 'saalequell.de',
    industry: 'Lebensmittel',
    city: 'Leipzig',
    employeeCount: 95,
  },
  {
    name: 'Donautech Automation',
    domain: 'donautech.de',
    industry: 'Automation',
    city: 'Regensburg',
    employeeCount: 205,
  },
  {
    name: 'Havelblick Immobilien',
    domain: 'havelblick.de',
    industry: 'Immobilien',
    city: 'Potsdam',
    employeeCount: 44,
  },
];

const CONTACTS = [
  ['Anna', 'Schmidt', 'Einkaufsleiterin', 0],
  ['Jonas', 'Weber', 'Geschäftsführer', 0],
  ['Katrin', 'Böhm', 'Leiterin Beschaffung', 1],
  ['Michael', 'Hoffmann', 'Technischer Leiter', 1],
  ['Sabine', 'Krüger', 'Prokuristin', 2],
  ['Thomas', 'Lange', 'IT-Leiter', 3],
  ['Julia', 'Neumann', 'Head of Operations', 3],
  ['Stefan', 'Wagner', 'Einkauf', 4],
  ['Petra', 'Schulz', 'Geschäftsführerin', 5],
  ['Andreas', 'Fischer', 'Vertriebsleiter', 6],
  ['Nicole', 'Braun', 'Leiterin Qualität', 7],
  ['Markus', 'Zimmermann', 'CFO', 8],
  ['Claudia', 'Hartmann', 'Einkaufsleiterin', 9],
  ['Daniel', 'Koch', 'Projektleiter', 10],
  ['Sandra', 'Richter', 'Geschäftsführerin', 11],
];

const DEALS = [
  ['Rahmenvertrag Logistik 2026', 48500, 'NEGOTIATION', 0, 0, '2026-11-30'],
  ['Erweiterung Lagersystem', 12800, 'PROPOSAL', 0, 1, '2026-10-15'],
  ['Wartungsvertrag Anlagen', 96000, 'QUALIFIED', 1, 2, '2027-01-31'],
  ['Ersatzteilpaket Q4', 23400, 'WON', 1, 3, '2026-08-20'],
  ['Retrofit Fertigungsstraße', 187000, 'NEGOTIATION', 1, 2, '2026-12-15'],
  ['Softwarelizenz 50 Plätze', 34500, 'PROPOSAL', 3, 5, '2026-10-31'],
  ['Support-Vertrag Premium', 18000, 'WON', 3, 6, '2026-07-01'],
  ['Photovoltaik Betriebshof', 240000, 'LEAD', 4, 7, '2027-03-31'],
  ['Beratung Prozessoptimierung', 45000, 'QUALIFIED', 5, 8, '2026-11-15'],
  ['Handelsvertretung Nord', 67000, 'LOST', 6, 9, '2026-06-30'],
  ['Reinraum-Ausstattung', 315000, 'NEGOTIATION', 7, 10, '2027-02-28'],
  ['Stahlbau Halle 4', 128000, 'PROPOSAL', 8, 11, '2026-12-01'],
  ['Abfüllanlage Erweiterung', 89000, 'LEAD', 9, 12, '2027-01-15'],
  ['Steuerungstechnik Umbau', 156000, 'QUALIFIED', 10, 13, '2026-11-20'],
  ['Objektverwaltung Portfolio', 52000, 'PROPOSAL', 11, 14, '2026-10-20'],
];

const NOTES = [
  [
    0,
    'Erstgespräch sehr positiv. Entscheidung fällt im Vorstand Ende November.',
  ],
  [
    0,
    'Preisvorstellung liegt 8% unter unserem Angebot. Nachlass bei 3-Jahres-Bindung möglich.',
  ],
  [
    2,
    'Ausschreibung läuft. Drei Wettbewerber im Rennen, wir sind technisch vorn.',
  ],
  [4, 'Technische Prüfung abgeschlossen. Wartet nur noch auf Budgetfreigabe.'],
  [
    7,
    'Fördermittel beantragt. Projekt startet erst nach Bewilligung, frühestens Q1.',
  ],
  [
    10,
    'Sehr hohe Anforderungen an Dokumentation. Zertifizierungsaufwand einplanen.',
  ],
];

const TASKS = [
  ['Angebot nachfassen', -3, 0],
  ['Referenzen zusammenstellen', 2, 2],
  ['Technische Klärung mit Fertigung', 5, 4],
  ['Vertragsentwurf an Rechtsabteilung', 7, 10],
  ['Termin für Werksbesichtigung abstimmen', 12, 13],
  ['Quartalsprognose vorbereiten', 9, null],
  ['Preisliste 2027 aktualisieren', 21, null],
];

const isoDate = (offsetDays) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};

const run = async () => {
  const { signIn } = await gql(
    `mutation($e: String!, $p: String!) {
      signIn(input: { email: $e, password: $p }) { token workspace { name } }
    }`,
    { e: email, p: password },
  );

  const token = signIn.token;
  console.log(`signed in to "${signIn.workspace.name}"`);

  if (reset) {
    const { companies } = await gql(
      '{ companies(limit: 200) { items { id } } }',
      {},
      token,
    );
    for (const company of companies.items) {
      await gql(
        'mutation($id: ID!) { deleteCompany(id: $id) }',
        { id: company.id },
        token,
      );
    }
    console.log(`cleared ${companies.items.length} existing companies`);
  }

  const companyIds = [];
  for (const company of COMPANIES) {
    const { createCompany } = await gql(
      'mutation($i: CreateCompanyInput!) { createCompany(input: $i) { id } }',
      { i: { ...company, country: 'Deutschland' } },
      token,
    );
    companyIds.push(createCompany.id);
  }
  console.log(`${companyIds.length} companies`);

  const contactIds = [];
  for (const [firstName, lastName, jobTitle, companyIndex] of CONTACTS) {
    const { createContact } = await gql(
      'mutation($i: CreateContactInput!) { createContact(input: $i) { id } }',
      {
        i: {
          firstName,
          lastName,
          jobTitle,
          email:
            `${firstName.toLowerCase()}.${lastName.toLowerCase()}`.replace(
              /[äöü]/g,
              (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue' })[c],
            ) +
            '@' +
            COMPANIES[companyIndex].domain,
          companyId: companyIds[companyIndex],
        },
      },
      token,
    );
    contactIds.push(createContact.id);
  }
  console.log(`${contactIds.length} contacts`);

  const dealIds = [];
  for (const [
    name,
    amount,
    stage,
    companyIndex,
    contactIndex,
    closeDate,
  ] of DEALS) {
    const { createDeal } = await gql(
      'mutation($i: CreateDealInput!) { createDeal(input: $i) { id } }',
      {
        i: {
          name,
          amount,
          stage,
          closeDate,
          companyId: companyIds[companyIndex],
          primaryContactId: contactIds[contactIndex],
        },
      },
      token,
    );
    dealIds.push(createDeal.id);
  }
  console.log(`${dealIds.length} deals`);

  for (const [dealIndex, body] of NOTES) {
    await gql(
      'mutation($i: CreateNoteInput!) { createNote(input: $i) { id } }',
      { i: { body, dealId: dealIds[dealIndex] } },
      token,
    );
  }
  console.log(`${NOTES.length} notes`);

  for (const [title, dueOffset, dealIndex] of TASKS) {
    await gql(
      'mutation($i: CreateTaskInput!) { createTask(input: $i) { id } }',
      {
        i: {
          title,
          dueDate: isoDate(dueOffset),
          ...(dealIndex === null ? {} : { dealId: dealIds[dealIndex] }),
        },
      },
      token,
    );
  }
  console.log(`${TASKS.length} tasks`);

  const APPOINTMENTS = [
    ['Rückruf Nordwind Logistik', 0, '09:00', '09:30', 0, null],
    ['Angebot Alpenkraft besprechen', 0, '11:00', '12:00', 1, null],
    ['Ortstermin Hansetec', 0, '14:00', '16:30', 6, null],

    ['Jahresgespräch Nordwind', -12, '09:00', '10:30', 0, null],
    ['Werksbesichtigung Alpenkraft', -8, '13:00', '16:00', 1, null],
    ['Angebot durchsprechen', -3, '11:00', '12:00', 3, null],
    ['Ortstermin Elbmarine', -1, '08:30', '11:30', 2, null],
    [
      'Wochenbesprechung Vertrieb',
      -7,
      '09:00',
      '10:00',
      null,
      'FREQ=WEEKLY;BYDAY=MO',
    ],
    ['Rückruf Frau Böhm', 1, '10:15', '10:45', 1, null],
    ['Angebotspräsentation Rheinblick', 2, '14:00', '15:30', 3, null],
    ['Messevorbereitung', 3, '09:00', '12:00', null, null],
    ['Übergabe Spreequell', 4, '10:00', '11:00', 4, null],
    ['Quartalsplanung', 7, '09:00', '17:00', null, null],
    ['Betriebsausflug', 21, '00:00', '00:00', null, null],
    ['Monatsabschluss', 5, '15:00', '16:00', null, 'FREQ=MONTHLY;BYDAY=-1FR'],
  ];

  for (const [
    title,
    dayOffset,
    startTime,
    endTime,
    companyIndex,
    recurrence,
  ] of APPOINTMENTS) {
    const allDay = startTime === '00:00' && endTime === '00:00';

    await gql(
      'mutation($i: CreateAppointmentInput!) { createAppointment(input: $i) { id } }',
      {
        i: {
          title,
          startDate: isoDate(dayOffset),
          startTime: allDay ? '00:00' : startTime,
          endDate: isoDate(dayOffset),
          endTime: allDay ? '00:00' : endTime,
          allDay,
          ...(companyIndex === null
            ? {}
            : { companyId: companyIds[companyIndex] }),
          ...(recurrence === null ? {} : { recurrence }),
        },
      },
      token,
    );
  }
  console.log(`${APPOINTMENTS.length} appointments`);

  const PRODUCTS = [
    ['Beratungstag', 'Stunde', 145_00, 19],
    ['Installation vor Ort', 'Stunde', 98_00, 19],
    ['Wartungspauschale', 'Monat', 390_00, 19],
    ['Ersatzteil-Set A', 'Stück', 249_00, 19],
  ];

  const productIds = [];
  for (const [name, unit, unitPriceCents, taxRate] of PRODUCTS) {
    const { createProduct } = await gql(
      'mutation($i: CreateProductInput!) { createProduct(input: $i) { id } }',
      { i: { name, unit, unitPriceCents, taxRatePercent: taxRate } },
      token,
    );
    productIds.push(createProduct.id);
  }
  console.log(`${PRODUCTS.length} products`);

  const { workspaceSummary } = await gql(
    '{ workspaceSummary { companyCount contactCount openDealCount openPipelineValue overdueTaskCount } }',
    {},
    token,
  );
  console.log('\nworkspace now:', workspaceSummary);
};

run().catch((error) => {
  console.error('seed failed:', error.message);
  process.exit(1);
});
