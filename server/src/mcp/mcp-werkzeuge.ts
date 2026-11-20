export type JsonSchema = {
  type: 'object';
  properties: Record<string, Record<string, unknown>>;
  required?: string[];
  additionalProperties: false;
};

export type Abfrage = {
  schluessel: string;
  query: string;
  variables: Record<string, unknown>;
};

export type VorschlagZiel = {
  art: 'company' | 'contact' | 'deal' | 'quote';
  id: string;
};

export type VorschlagPlan = {
  zusammenfassung: string;
  ziel: VorschlagZiel | null;
  nachher: Record<string, unknown>;
  vorher?: (datensatz: Record<string, unknown>) => Record<string, unknown>;
  pruefe?: (datensatz: Record<string, unknown>) => string | null;
};

export type Werkzeug = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  schreibt: boolean;
  abfragen: (eingabe: Record<string, unknown>) => Abfrage[];
  vorschlag?: (eingabe: Record<string, unknown>) => VorschlagPlan;
};

export class UngueltigeEingabe extends Error {}

const ART = ['company', 'contact', 'deal'] as const;
type Art = (typeof ART)[number];

const ARTEN_TEXT = 'company (Firma), contact (Kontakt) oder deal (Geschäft)';

const FELDER: Record<Art, string> = {
  company:
    'id name domain zweitdomains website linkedin industry street postalCode city country phone email vertretung registergericht registernummer ustIdNr employeeCount annualRevenue ownerId parentCompanyId herkunft customFields createdAt updatedAt',
  contact:
    'id firstName lastName email phone jobTitle street postalCode city country linkedin companyId ownerId herkunft customFields createdAt updatedAt',
  deal: 'id name stage amount currency probability closeDate lostReason companyId primaryContactId ownerId pipelineId herkunft customFields createdAt updatedAt',
};

const LISTE: Record<Art, string> = {
  company: 'companies',
  contact: 'contacts',
  deal: 'deals',
};

const EINZELN: Record<Art, string> = {
  company: 'company',
  contact: 'contact',
  deal: 'deal',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const text = (
  eingabe: Record<string, unknown>,
  name: string,
  { pflicht = false, max = 200 }: { pflicht?: boolean; max?: number } = {},
): string | undefined => {
  const wert = eingabe[name];

  if (wert === undefined || wert === null) {
    if (pflicht) {
      throw new UngueltigeEingabe(`„${name}“ fehlt.`);
    }

    return undefined;
  }

  if (typeof wert !== 'string' || (pflicht && wert.trim() === '')) {
    throw new UngueltigeEingabe(`„${name}“ muss ein Text sein.`);
  }

  if (wert.length > max) {
    throw new UngueltigeEingabe(
      `„${name}“ ist zu lang (höchstens ${String(max)} Zeichen).`,
    );
  }

  return wert;
};

const kennung = (
  eingabe: Record<string, unknown>,
  name: string,
  pflicht = false,
): string | undefined => {
  const wert = text(eingabe, name, { pflicht, max: 36 });

  if (wert !== undefined && !UUID.test(wert)) {
    throw new UngueltigeEingabe(`„${name}“ ist keine gültige Kennung.`);
  }

  return wert;
};

const art = (
  eingabe: Record<string, unknown>,
  pflicht = true,
): Art | undefined => {
  const wert = eingabe.type;

  if (wert === undefined && !pflicht) {
    return undefined;
  }

  if (!ART.includes(wert as Art)) {
    throw new UngueltigeEingabe(`„type“ muss ${ARTEN_TEXT} sein.`);
  }

  return wert as Art;
};

const zahl = (
  eingabe: Record<string, unknown>,
  name: string,
  { min, max }: { min: number; max: number },
): number | undefined => {
  const wert = eingabe[name];

  if (wert === undefined || wert === null) {
    return undefined;
  }

  if (
    typeof wert !== 'number' ||
    !Number.isFinite(wert) ||
    wert < min ||
    wert > max
  ) {
    throw new UngueltigeEingabe(
      `„${name}“ muss eine Zahl zwischen ${String(min)} und ${String(max)} sein.`,
    );
  }

  return wert;
};

export const nurBekannte = (
  werkzeug: Werkzeug,
  eingabe: Record<string, unknown>,
): void => {
  const bekannt = new Set(Object.keys(werkzeug.inputSchema.properties));
  const fremd = Object.keys(eingabe).filter((name) => !bekannt.has(name));

  if (fremd.length > 0) {
    throw new UngueltigeEingabe(
      `Unbekannte Angaben: ${fremd.map((name) => `„${name}“`).join(', ')}.`,
    );
  }

  for (const name of werkzeug.inputSchema.required ?? []) {
    if (eingabe[name] === undefined || eingabe[name] === null) {
      throw new UngueltigeEingabe(`„${name}“ fehlt.`);
    }
  }
};

const OPERATOREN = [
  'EQUALS',
  'NOT_EQUALS',
  'CONTAINS',
  'NOT_CONTAINS',
  'STARTS_WITH',
  'GREATER_THAN',
  'LESS_THAN',
  'IS_EMPTY',
  'IS_NOT_EMPTY',
  'IN_LAST_DAYS',
  'IN_NEXT_DAYS',
  'OLDER_THAN_DAYS',
] as const;

const PHASEN = [
  'LEAD',
  'QUALIFIED',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
] as const;

const auswahl = (
  eingabe: Record<string, unknown>,
  name: string,
  werte: readonly string[],
): string | undefined => {
  const roh = text(eingabe, name, { max: 30 });

  if (roh === undefined) {
    return undefined;
  }

  const wert = roh.toUpperCase();

  if (!werte.includes(wert)) {
    throw new UngueltigeEingabe(
      `„${name}“ ist einer von: ${werte.join(', ')}.`,
    );
  }

  return wert;
};

const typSchema = {
  type: 'string',
  enum: [...ART],
  description:
    'Die Art des Datensatzes: company (Firma), contact (Kontakt), deal (Geschäft).',
};

const DEAL_EINGABE: Record<string, Record<string, unknown>> = {
  name: {
    type: 'string',
    maxLength: 200,
    description: 'Bezeichnung des Geschäfts.',
  },
  amount: { type: 'number', minimum: 0, description: 'Betrag (netto).' },
  currency: {
    type: 'string',
    minLength: 3,
    maxLength: 3,
    description: 'Währung nach ISO 4217, etwa EUR.',
  },
  stage: {
    type: 'string',
    enum: [...PHASEN],
    description: 'Phase.',
  },
  closeDate: {
    type: 'string',
    format: 'date',
    description: 'Erwarteter Abschluss, JJJJ-MM-TT.',
  },
  companyId: {
    type: 'string',
    format: 'uuid',
    description: 'Kennung der Firma.',
  },
  primaryContactId: {
    type: 'string',
    format: 'uuid',
    description: 'Kennung des Hauptkontakts.',
  },
  lostReason: {
    type: 'string',
    maxLength: 200,
    description: 'Grund, falls verloren.',
  },
};

const dealVariablen = (eingabe: Record<string, unknown>) => {
  const werte: Record<string, unknown> = {};

  if (eingabe.name !== undefined)
    werte.name = text(eingabe, 'name', { pflicht: true });
  if (eingabe.amount !== undefined)
    werte.amount = zahl(eingabe, 'amount', { min: 0, max: 1e12 });
  if (eingabe.currency !== undefined)
    werte.currency = text(eingabe, 'currency', { max: 3 });
  if (eingabe.stage !== undefined)
    werte.stage = auswahl(eingabe, 'stage', PHASEN);
  if (eingabe.closeDate !== undefined)
    werte.closeDate = text(eingabe, 'closeDate', { max: 10 });
  if (eingabe.companyId !== undefined)
    werte.companyId = kennung(eingabe, 'companyId');
  if (eingabe.primaryContactId !== undefined)
    werte.primaryContactId = kennung(eingabe, 'primaryContactId');
  if (eingabe.lostReason !== undefined)
    werte.lostReason = text(eingabe, 'lostReason');

  return werte;
};

const ART_NAMEN: Record<Art, string> = {
  company: 'Firma',
  contact: 'Kontakt',
  deal: 'Geschäft',
};

const ANGEBOT_STATUS = ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED'] as const;

const ANGEBOT_FELDER =
  'id number status companyId contactId dealId issuedOn validUntil currency introText closingText updatedAt lines{id position name description quantity unit}';

const ohneLeere = (werte: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(werte).filter(([, wert]) => wert !== undefined),
  );

const auswahlAus = (
  datensatz: Record<string, unknown>,
  felder: string[],
): Record<string, unknown> =>
  Object.fromEntries(felder.map((feld) => [feld, datensatz[feld] ?? null]));

const adressen = (
  eingabe: Record<string, unknown>,
  name: string,
): string[] | undefined => {
  const roh = eingabe[name];

  if (roh === undefined || roh === null) {
    return undefined;
  }

  if (
    !Array.isArray(roh) ||
    roh.length > 20 ||
    roh.some((eintrag) => typeof eintrag !== 'string' || eintrag.length > 320)
  ) {
    throw new UngueltigeEingabe(
      `„${name}“ ist eine Liste von höchstens 20 Adressen.`,
    );
  }

  return roh as string[];
};

const entwurfVariablen = (eingabe: Record<string, unknown>) => ({
  art: art(eingabe) as Art,
  id: kennung(eingabe, 'id', true) as string,
  an: adressen(eingabe, 'to'),
  cc: adressen(eingabe, 'cc'),
  betreff: text(eingabe, 'subject', { pflicht: true, max: 200 }) as string,
  rumpf: text(eingabe, 'text', { pflicht: true, max: 20_000 }) as string,
});

type AngebotsTexte = {
  id: string;
  introText?: string;
  closingText?: string;
  lines?: { id: string; description: string }[];
};

const angebotsTexte = (eingabe: Record<string, unknown>): AngebotsTexte => {
  const id = kennung(eingabe, 'id', true) as string;
  const roh = eingabe.lines;

  if (roh !== undefined && !Array.isArray(roh)) {
    throw new UngueltigeEingabe('„lines“ muss eine Liste sein.');
  }

  const lines = (roh as unknown[] | undefined)?.map((zeile) => {
    if (zeile === null || typeof zeile !== 'object' || Array.isArray(zeile)) {
      throw new UngueltigeEingabe('Jede Position braucht id und description.');
    }

    const eintrag = zeile as Record<string, unknown>;
    const fremd = Object.keys(eintrag).filter(
      (feld) => feld !== 'id' && feld !== 'description',
    );

    if (fremd.length > 0) {
      throw new UngueltigeEingabe(
        `Unbekannte Angaben an einer Position: ${fremd.join(', ')}.`,
      );
    }

    return {
      id: kennung(eintrag, 'id', true) as string,
      description: text(eintrag, 'description', { max: 2000 }) ?? '',
    };
  });

  if ((lines?.length ?? 0) > 200) {
    throw new UngueltigeEingabe('Höchstens 200 Positionen.');
  }

  const introText = text(eingabe, 'introText', { max: 5000 });
  const closingText = text(eingabe, 'closingText', { max: 5000 });

  if (
    introText === undefined &&
    closingText === undefined &&
    (lines === undefined || lines.length === 0)
  ) {
    throw new UngueltigeEingabe('Es ist nichts zu ändern angegeben.');
  }

  return ohneLeere({ id, introText, closingText, lines }) as AngebotsTexte;
};

const angebotsTextAnsicht = (
  werte: AngebotsTexte,
): Record<string, unknown> => ({
  ...(werte.introText === undefined ? {} : { introText: werte.introText }),
  ...(werte.closingText === undefined
    ? {}
    : { closingText: werte.closingText }),
  ...Object.fromEntries(
    (werte.lines ?? []).map((zeile) => [
      `position:${zeile.id}`,
      zeile.description,
    ]),
  ),
});

const angebotsTextVorher = (
  datensatz: Record<string, unknown>,
  nachher: Record<string, unknown>,
): Record<string, unknown> => {
  const zeilen = (datensatz.lines ?? []) as {
    id: string;
    description: string | null;
  }[];

  return Object.fromEntries(
    Object.keys(nachher).map((feld) => {
      if (!feld.startsWith('position:')) {
        return [feld, datensatz[feld] ?? null];
      }

      const zeile = zeilen.find((z) => z.id === feld.slice(9));

      return [feld, zeile === undefined ? null : (zeile.description ?? null)];
    }),
  );
};

export const ZIEL_LESEN: Record<VorschlagZiel['art'], string> = {
  company: `query($id:ID!){company(id:$id){${FELDER.company}}}`,
  contact: `query($id:ID!){contact(id:$id){${FELDER.contact}}}`,
  deal: `query($id:ID!){deal(id:$id){${FELDER.deal}}}`,
  quote: `query($id:ID!){quote(id:$id){${ANGEBOT_FELDER}}}`,
};

export const zielName = (
  art: VorschlagZiel['art'],
  datensatz: Record<string, unknown>,
): string =>
  art === 'contact'
    ? `${String(datensatz.firstName ?? '')} ${String(datensatz.lastName ?? '')}`.trim()
    : art === 'quote'
      ? `Angebot ${String(datensatz.number ?? '')}`
      : String(datensatz.name ?? '');

export const WERKZEUGE: Werkzeug[] = [
  {
    name: 'search_records',
    title: 'Suchen',
    description:
      'Sucht Firmen, Kontakte und Geschäfte nach Name, E-Mail oder Domain. Liefert je Art die besten Treffer mit Kennung; Einzelheiten danach mit get_record.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          description: 'Suchbegriff.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          description: 'Treffer je Art, Standard 5.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    schreibt: false,
    abfragen: (eingabe) => {
      const search = text(eingabe, 'query', { pflicht: true });
      const limit = zahl(eingabe, 'limit', { min: 1, max: 10 }) ?? 5;

      return [
        {
          schluessel: 'companies',
          query: `query($search:String,$limit:Int){companies(search:$search,limit:$limit){totalCount items{id name domain city}}}`,
          variables: { search, limit },
        },
        {
          schluessel: 'contacts',
          query: `query($search:String,$limit:Int){contacts(search:$search,limit:$limit){totalCount items{id firstName lastName email companyId}}}`,
          variables: { search, limit },
        },
        {
          schluessel: 'deals',
          query: `query($search:String,$limit:Int){deals(search:$search,limit:$limit){totalCount items{id name stage amount currency companyId}}}`,
          variables: { search, limit },
        },
      ];
    },
  },
  {
    name: 'get_record',
    title: 'Datensatz lesen',
    description:
      'Liest eine Firma, einen Kontakt oder ein Geschäft mit allen Feldern, die der Schlüssel sehen darf, dazu die letzten Notizen und offenen Aufgaben.',
    inputSchema: {
      type: 'object',
      properties: {
        type: typSchema,
        id: {
          type: 'string',
          format: 'uuid',
          description: 'Kennung des Datensatzes.',
        },
      },
      required: ['type', 'id'],
      additionalProperties: false,
    },
    schreibt: false,
    abfragen: (eingabe) => {
      const typ = art(eingabe) as Art;
      const id = kennung(eingabe, 'id', true);

      return [
        {
          schluessel: 'record',
          query: `query($id:ID!){${EINZELN[typ]}(id:$id){${FELDER[typ]} notes{id body createdAt authorName} tasks{id title dueDate status}}}`,
          variables: { id },
        },
      ];
    },
  },
  {
    name: 'list_records',
    title: 'Liste mit Filter',
    description:
      'Listet Firmen, Kontakte oder Geschäfte, wahlweise mit Suchbegriff, Filtern und Sortierung, wie die Listen im Programm. Filterfelder: Standardfelder als "std:<feld>" (etwa std:city, std:stage, std:ownerId), eigene Felder als "custom:<schlüssel>", Felder der Firma bei Kontakten und Geschäften als "std:firma.<feld>".',
    inputSchema: {
      type: 'object',
      properties: {
        type: typSchema,
        query: { type: 'string', maxLength: 200, description: 'Suchbegriff.' },
        filters: {
          type: 'array',
          maxItems: 10,
          description:
            'Bedingungen, alle müssen gelten (oder eine, mit match "any").',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', maxLength: 60 },
              operator: {
                type: 'string',
                enum: [...OPERATOREN],
              },
              value: { type: 'string', maxLength: 200 },
            },
            required: ['key', 'operator'],
            additionalProperties: false,
          },
        },
        match: {
          type: 'string',
          enum: ['all', 'any'],
          description: 'Alle Bedingungen oder mindestens eine.',
        },
        sortField: {
          type: 'string',
          maxLength: 70,
          description:
            'Spalte, nach der sortiert wird, etwa name oder createdAt.',
        },
        sortDirection: { type: 'string', enum: ['ASC', 'DESC'] },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Standard 20.',
        },
        offset: { type: 'integer', minimum: 0, maximum: 10000 },
      },
      required: ['type'],
      additionalProperties: false,
    },
    schreibt: false,
    abfragen: (eingabe) => {
      const typ = art(eingabe) as Art;
      const roh = eingabe.filters;

      if (roh !== undefined && !Array.isArray(roh)) {
        throw new UngueltigeEingabe('„filters“ muss eine Liste sein.');
      }

      const customFilters = (roh as Record<string, unknown>[] | undefined)?.map(
        (bedingung) => {
          if (bedingung === null || typeof bedingung !== 'object') {
            throw new UngueltigeEingabe(
              'Jede Bedingung braucht key und operator.',
            );
          }

          return {
            key: text(bedingung, 'key', { pflicht: true, max: 60 }),
            operator:
              auswahl(bedingung, 'operator', OPERATOREN) ??
              (() => {
                throw new UngueltigeEingabe(
                  'Jede Bedingung braucht einen operator.',
                );
              })(),
            value: text(bedingung, 'value'),
          };
        },
      );

      if ((customFilters?.length ?? 0) > 10) {
        throw new UngueltigeEingabe('Höchstens zehn Bedingungen.');
      }

      const match = text(eingabe, 'match', { max: 3 });

      if (match !== undefined && match !== 'all' && match !== 'any') {
        throw new UngueltigeEingabe('„match“ ist all oder any.');
      }

      const richtung = text(eingabe, 'sortDirection', { max: 4 });

      if (richtung !== undefined && richtung !== 'ASC' && richtung !== 'DESC') {
        throw new UngueltigeEingabe('„sortDirection“ ist ASC oder DESC.');
      }

      return [
        {
          schluessel: 'list',
          query: `query($search:String,$limit:Int,$offset:Int,$customFilters:[CustomFieldFilterInput!],$filterVerknuepfung:FilterVerknuepfung,$sortField:String,$sortDirection:SortDirection){${LISTE[typ]}(search:$search,limit:$limit,offset:$offset,customFilters:$customFilters,filterVerknuepfung:$filterVerknuepfung,sortField:$sortField,sortDirection:$sortDirection){totalCount hasMore items{${FELDER[typ]}}}}`,
          variables: {
            search: text(eingabe, 'query'),
            limit: zahl(eingabe, 'limit', { min: 1, max: 50 }) ?? 20,
            offset: zahl(eingabe, 'offset', { min: 0, max: 10_000 }) ?? 0,
            customFilters,
            filterVerknuepfung: match === 'any' ? 'ODER' : undefined,
            sortField: text(eingabe, 'sortField', { max: 70 }),
            sortDirection: richtung,
          },
        },
      ];
    },
  },
  {
    name: 'create_note',
    title: 'Notiz anlegen',
    description:
      'Schreibt eine Notiz an eine Firma, einen Kontakt oder ein Geschäft. Text in Markdown (Überschriften, Listen, fett, Links).',
    inputSchema: {
      type: 'object',
      properties: {
        type: typSchema,
        id: {
          type: 'string',
          format: 'uuid',
          description: 'Kennung der Akte.',
        },
        text: {
          type: 'string',
          minLength: 1,
          maxLength: 20000,
          description: 'Inhalt der Notiz.',
        },
      },
      required: ['type', 'id', 'text'],
      additionalProperties: false,
    },
    schreibt: true,
    abfragen: (eingabe) => {
      const typ = art(eingabe) as Art;
      const id = kennung(eingabe, 'id', true);
      const body = text(eingabe, 'text', { pflicht: true, max: 20_000 });

      return [
        {
          schluessel: 'note',
          query: `mutation($input:CreateNoteInput!){createNote(input:$input){id body createdAt companyId contactId dealId}}`,
          variables: { input: { body, [`${typ}Id`]: id } },
        },
      ];
    },
    vorschlag: (eingabe) => {
      const typ = art(eingabe) as Art;

      return {
        zusammenfassung: `Notiz an ${ART_NAMEN[typ]}`,
        ziel: { art: typ, id: kennung(eingabe, 'id', true) as string },
        nachher: {
          text: text(eingabe, 'text', { pflicht: true, max: 20_000 }),
        },
      };
    },
  },
  {
    name: 'create_task',
    title: 'Aufgabe anlegen',
    description:
      'Legt eine Aufgabe an, wahlweise an einer Firma, einem Kontakt oder einem Geschäft. Ohne Zuständige gehört sie der Person, der der Schlüssel gehört.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        description: { type: 'string', maxLength: 5000 },
        dueDate: {
          type: 'string',
          format: 'date',
          description: 'Fällig am, JJJJ-MM-TT.',
        },
        dueTime: {
          type: 'string',
          pattern: '^\\d{2}:\\d{2}$',
          description: 'Uhrzeit, etwa 09:30.',
        },
        type: {
          ...typSchema,
          description: 'Art der Akte, an der die Aufgabe hängt.',
        },
        id: {
          type: 'string',
          format: 'uuid',
          description: 'Kennung der Akte.',
        },
        assigneeId: {
          type: 'string',
          format: 'uuid',
          description: 'Kennung der zuständigen Person.',
        },
      },
      required: ['title'],
      additionalProperties: false,
    },
    schreibt: true,
    abfragen: (eingabe) => {
      const typ = art(eingabe, false);
      const id = kennung(eingabe, 'id');

      if ((typ === undefined) !== (id === undefined)) {
        throw new UngueltigeEingabe('„type“ und „id“ gehören zusammen.');
      }

      return [
        {
          schluessel: 'task',
          query: `mutation($input:CreateTaskInput!){createTask(input:$input){id title description dueDate dueTime status assigneeId companyId contactId dealId}}`,
          variables: {
            input: {
              title: text(eingabe, 'title', { pflicht: true }),
              description: text(eingabe, 'description', { max: 5000 }),
              dueDate: text(eingabe, 'dueDate', { max: 10 }),
              dueTime: text(eingabe, 'dueTime', { max: 5 }),
              assigneeId: kennung(eingabe, 'assigneeId'),
              ...(typ === undefined ? {} : { [`${typ}Id`]: id }),
            },
          },
        },
      ];
    },
    vorschlag: (eingabe) => {
      const typ = art(eingabe, false);
      const id = kennung(eingabe, 'id');
      const titel = text(eingabe, 'title', { pflicht: true }) as string;

      return {
        zusammenfassung: `Aufgabe „${titel}“`,
        ziel: typ === undefined || id === undefined ? null : { art: typ, id },
        nachher: ohneLeere({
          title: titel,
          description: text(eingabe, 'description', { max: 5000 }),
          dueDate: text(eingabe, 'dueDate', { max: 10 }),
          dueTime: text(eingabe, 'dueTime', { max: 5 }),
          assigneeId: kennung(eingabe, 'assigneeId'),
        }),
      };
    },
  },
  {
    name: 'create_deal',
    title: 'Geschäft anlegen',
    description:
      'Legt ein Geschäft an. Pflichtfelder der gewählten Phase und Rechte gelten wie im Programm.',
    inputSchema: {
      type: 'object',
      properties: DEAL_EINGABE,
      required: ['name'],
      additionalProperties: false,
    },
    schreibt: true,
    abfragen: (eingabe) => [
      {
        schluessel: 'deal',
        query: `mutation($input:CreateDealInput!){createDeal(input:$input){${FELDER.deal}}}`,
        variables: { input: dealVariablen(eingabe) },
      },
    ],
    vorschlag: (eingabe) => {
      const werte = dealVariablen(eingabe);
      const firma = werte.companyId as string | undefined;
      const kontakt = werte.primaryContactId as string | undefined;

      return {
        zusammenfassung: `Neues Geschäft „${String(werte.name ?? '')}“`,
        ziel:
          firma !== undefined
            ? { art: 'company', id: firma }
            : kontakt !== undefined
              ? { art: 'contact', id: kontakt }
              : null,
        nachher: werte,
      };
    },
  },
  {
    name: 'update_deal',
    title: 'Geschäft ändern',
    description:
      'Ändert ein Geschäft, etwa Phase, Betrag oder Abschlussdatum. Nur die angegebenen Felder ändern sich.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
          description: 'Kennung des Geschäfts.',
        },
        ...DEAL_EINGABE,
      },
      required: ['id'],
      additionalProperties: false,
    },
    schreibt: true,
    abfragen: (eingabe) => {
      const id = kennung(eingabe, 'id', true);
      const { id: _id, ...rest } = eingabe;
      const werte = dealVariablen(rest);

      if (Object.keys(werte).length === 0) {
        throw new UngueltigeEingabe('Es ist nichts zu ändern angegeben.');
      }

      return [
        {
          schluessel: 'deal',
          query: `mutation($input:UpdateDealInput!){updateDeal(input:$input){${FELDER.deal}}}`,
          variables: { input: { id, ...werte } },
        },
      ];
    },
    vorschlag: (eingabe) => {
      const id = kennung(eingabe, 'id', true) as string;
      const { id: _id, ...rest } = eingabe;
      const werte = dealVariablen(rest);

      return {
        zusammenfassung: 'Geschäft ändern',
        ziel: { art: 'deal', id },
        nachher: werte,
        vorher: (datensatz) => auswahlAus(datensatz, Object.keys(werte)),
      };
    },
  },
  {
    name: 'list_quotes',
    title: 'Angebote auflisten',
    description:
      'Listet Angebote, wahlweise nur die einer Firma oder eines Geschäfts oder nur Entwürfe (status DRAFT). Einzelheiten mit get_quote.',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: {
          type: 'string',
          format: 'uuid',
          description: 'Nur Angebote dieser Firma.',
        },
        dealId: {
          type: 'string',
          format: 'uuid',
          description: 'Nur Angebote dieses Geschäfts.',
        },
        status: {
          type: 'string',
          enum: [...ANGEBOT_STATUS],
          description: 'Nur Angebote in diesem Status.',
        },
      },
      additionalProperties: false,
    },
    schreibt: false,
    abfragen: (eingabe) => [
      {
        schluessel: 'quotes',
        query: `query($companyId:ID,$dealId:ID,$status:QuoteStatus){quotes(companyId:$companyId,dealId:$dealId,status:$status){id number status companyId contactId dealId issuedOn validUntil currency}}`,
        variables: {
          companyId: kennung(eingabe, 'companyId'),
          dealId: kennung(eingabe, 'dealId'),
          status: auswahl(eingabe, 'status', ANGEBOT_STATUS),
        },
      },
    ],
  },
  {
    name: 'get_quote',
    title: 'Angebot lesen',
    description:
      'Liest ein Angebot mit Einleitung, Schlusstext und Positionen (Kennung, Bezeichnung, Beschreibung, Menge).',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
          description: 'Kennung des Angebots.',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
    schreibt: false,
    abfragen: (eingabe) => [
      {
        schluessel: 'quote',
        query: `query($id:ID!){quote(id:$id){${ANGEBOT_FELDER}}}`,
        variables: { id: kennung(eingabe, 'id', true) },
      },
    ],
  },
  {
    name: 'create_mail_draft',
    title: 'Mail-Entwurf anlegen',
    description:
      'Legt einen Mail-Entwurf an einer Firma, einem Kontakt oder einem Geschäft an. Er wird nicht verschickt: ein Mensch prüft ihn in Stegwerk und schickt ihn aus seinem Postfach. Ohne "to" geht er an die Adresse des Kontakts (beim Geschäft: des Hauptkontakts).',
    inputSchema: {
      type: 'object',
      properties: {
        type: typSchema,
        id: {
          type: 'string',
          format: 'uuid',
          description: 'Kennung der Akte.',
        },
        to: {
          type: 'array',
          maxItems: 20,
          items: { type: 'string', maxLength: 320 },
          description: 'Empfänger; leer: die Adresse der Akte.',
        },
        cc: {
          type: 'array',
          maxItems: 20,
          items: { type: 'string', maxLength: 320 },
          description: 'Kopie.',
        },
        subject: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          description: 'Betreff.',
        },
        text: {
          type: 'string',
          minLength: 1,
          maxLength: 20000,
          description: 'Text der Mail, ohne Signatur.',
        },
      },
      required: ['type', 'id', 'subject', 'text'],
      additionalProperties: false,
    },
    schreibt: true,
    abfragen: (eingabe) => [
      {
        schluessel: 'draft',
        query: `mutation($input:MailEntwurfAnlegenInput!){mailEntwurfAnlegen(input:$input){id an cc betreff status companyId contactId dealId}}`,
        variables: { input: entwurfVariablen(eingabe) },
      },
    ],
    vorschlag: (eingabe) => {
      const werte = entwurfVariablen(eingabe);

      return {
        zusammenfassung: `Mail-Entwurf „${werte.betreff}“`,
        ziel: { art: werte.art, id: werte.id },
        nachher: ohneLeere({
          an: werte.an,
          cc: werte.cc,
          betreff: werte.betreff,
          text: werte.rumpf,
        }),
      };
    },
  },
  {
    name: 'update_quote_texts',
    title: 'Angebotstexte ändern',
    description:
      'Ändert nur Texte eines Angebots im Status DRAFT: Einleitung, Schlusstext und Beschreibungen einzelner Positionen (Kennung aus get_quote). Preise, Mengen und Empfänger bleiben, wie sie sind.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
          description: 'Kennung des Angebots.',
        },
        introText: {
          type: 'string',
          maxLength: 5000,
          description: 'Einleitung über den Positionen.',
        },
        closingText: {
          type: 'string',
          maxLength: 5000,
          description: 'Schlusstext unter den Positionen.',
        },
        lines: {
          type: 'array',
          maxItems: 200,
          description: 'Neue Beschreibungen einzelner Positionen.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              description: { type: 'string', maxLength: 2000 },
            },
            required: ['id', 'description'],
            additionalProperties: false,
          },
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
    schreibt: true,
    abfragen: (eingabe) => [
      {
        schluessel: 'quote',
        query: `mutation($input:SetQuoteTextsInput!){setQuoteTexts(input:$input){${ANGEBOT_FELDER}}}`,
        variables: { input: angebotsTexte(eingabe) },
      },
    ],
    vorschlag: (eingabe) => {
      const werte = angebotsTexte(eingabe);
      const nachher = angebotsTextAnsicht(werte);

      return {
        zusammenfassung: 'Angebotstexte ändern',
        ziel: { art: 'quote', id: werte.id },
        nachher,
        vorher: (datensatz) => angebotsTextVorher(datensatz, nachher),
        pruefe: (datensatz) =>
          datensatz.status === 'DRAFT'
            ? null
            : 'Texte lassen sich nur an einem Angebot im Entwurf ändern.',
      };
    },
  },
];

export const werkzeugListe = () =>
  WERKZEUGE.map((werkzeug) => ({
    name: werkzeug.name,
    title: werkzeug.title,
    description: werkzeug.description,
    inputSchema: werkzeug.inputSchema,
    annotations: {
      title: werkzeug.title,
      readOnlyHint: !werkzeug.schreibt,
      destructiveHint: false,
      idempotentHint: !werkzeug.schreibt,
      openWorldHint: false,
    },
  }));
