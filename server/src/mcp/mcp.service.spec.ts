import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ForbiddenException } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { type ModuleRef } from '@nestjs/core';
import { type Request, type Response } from 'express';
import {
  buildSchema,
  getNullableType,
  isEnumType,
  isListType,
  isObjectType,
  parse,
  validate,
  type GraphQLOutputType,
  type GraphQLSchema,
} from 'graphql';

import { hoereSicherheit, type SicherheitsMeldung } from '../sicherheit/melden';
import {
  KiVorschlaegeService,
  VorschlagAbgelehnt,
} from '../ki-vorschlaege/ki-vorschlaege.service';
import { WERKZEUGE, ZIEL_LESEN } from './mcp-werkzeuge';
import { McpController } from './mcp.controller';
import { FEHLER, McpService } from './mcp.service';

const VOLLES_SCHEMA = buildSchema(
  readFileSync(join(__dirname, '..', '..', 'schema.gql'), 'utf8'),
);

const BEISPIELE: Record<string, Record<string, unknown>> = {
  search_records: { query: 'Alpen' },
  get_record: { type: 'deal', id: '4b46c558-214a-401f-bece-cf54f5d534ba' },
  list_records: {
    type: 'contact',
    filters: [{ key: 'city', operator: 'EQUALS', value: 'Köln' }],
    match: 'any',
    sortField: 'lastName',
    sortDirection: 'DESC',
  },
  create_note: {
    type: 'company',
    id: '4b46c558-214a-401f-bece-cf54f5d534ba',
    text: 'Rückruf vereinbart',
  },
  create_task: { title: 'Angebot nachfassen', dueDate: '2026-11-02' },
  create_deal: { name: 'Wartung 2027', amount: 1200, stage: 'lead' },
  update_deal: { id: '4b46c558-214a-401f-bece-cf54f5d534ba', stage: 'won' },
  list_quotes: { status: 'DRAFT' },
  get_quote: { id: '4b46c558-214a-401f-bece-cf54f5d534ba' },
  create_mail_draft: {
    type: 'contact',
    id: '4b46c558-214a-401f-bece-cf54f5d534ba',
    subject: 'Ihr Angebot',
    text: 'Guten Tag, anbei …',
  },
  update_quote_texts: {
    id: '4b46c558-214a-401f-bece-cf54f5d534ba',
    introText: 'Vielen Dank für Ihre Anfrage.',
    lines: [
      {
        id: '5b46c558-214a-401f-bece-cf54f5d534bb',
        description: 'Montage vor Ort',
      },
    ],
  },
};

const platzhalter = (typ: GraphQLOutputType): unknown => {
  const kern = getNullableType(typ);

  if (isListType(kern)) {
    return [];
  }

  if (isEnumType(kern)) {
    return kern.getValues()[0].value;
  }

  if (isObjectType(kern)) {
    return {};
  }

  return { Int: 0, Float: 0, Boolean: false }[String(kern)] ?? 'x';
};

const kleinesSchema = (): GraphQLSchema => {
  const schema = buildSchema(
    readFileSync(join(__dirname, '..', '..', 'schema.gql'), 'utf8'),
  );

  for (const typ of Object.values(schema.getTypeMap())) {
    if (isObjectType(typ) && !typ.name.startsWith('__')) {
      for (const feld of Object.values(typ.getFields())) {
        feld.resolve = (quelle: Record<string, unknown>) =>
          quelle[feld.name] ?? platzhalter(feld.type);
      }
    }
  }

  const abfragen = schema.getQueryType()!.getFields();

  abfragen.companies.resolve = () => ({
    totalCount: 1,
    items: [
      { id: 'f1', name: 'Alpenkraft', domain: 'alpen.de', city: 'Rosenheim' },
    ],
  });
  abfragen.contacts.resolve = () => ({ totalCount: 0, items: [] });
  abfragen.deals.resolve = () => {
    throw new Error('Forbidden resource');
  };
  schema.getMutationType()!.getFields().createDeal.resolve = (
    _quelle,
    { input }: { input: { name: string } },
  ) => {
    if (input.name === 'verboten') {
      throw new Error('Dem Schlüssel fehlt die Berechtigung.');
    }

    return { id: 'd1', name: input.name };
  };

  return schema;
};

const anfrage = (apiKey = true): Request =>
  ({
    user: {
      userId: 'k1',
      workspaceId: 'w1',
      email: 'Assistent (Schlüssel)',
      ...(apiKey
        ? { apiKey: { id: 'k1', name: 'Assistent', permissions: [] } }
        : {}),
    },
  }) as unknown as Request;

const dienst = (schema = kleinesSchema()) =>
  new McpService({
    get: () => ({ schema }),
  } as unknown as ModuleRef);

describe('McpService', () => {
  let gemeldet: SicherheitsMeldung[];
  let aufhoeren: () => void;

  beforeEach(() => {
    gemeldet = [];
    aufhoeren = hoereSicherheit((meldung) => gemeldet.push(meldung));
  });

  afterEach(() => aufhoeren());

  it('baut für jedes Werkzeug Abfragen, die zum echten Schema passen', () => {
    expect(Object.keys(BEISPIELE).sort()).toEqual(
      WERKZEUGE.map((werkzeug) => werkzeug.name).sort(),
    );

    for (const werkzeug of WERKZEUGE) {
      for (const abfrage of werkzeug.abfragen(BEISPIELE[werkzeug.name])) {
        expect([
          werkzeug.name,
          validate(VOLLES_SCHEMA, parse(abfrage.query)).map(
            (problem) => problem.message,
          ),
        ]).toEqual([werkzeug.name, []]);
      }
    }
  });

  it('handelt die Protokollversion aus und meldet die Verbindung', async () => {
    const antwort = await dienst().verarbeite(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          clientInfo: { name: 'claude-ai' },
        },
      },
      anfrage(),
    );

    expect(antwort).toMatchObject({
      id: 1,
      result: {
        protocolVersion: '2025-03-26',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'stegwerk' },
      },
    });
    expect(gemeldet).toEqual([
      expect.objectContaining({
        art: 'mcp_verbunden',
        workspaceId: 'w1',
        details: { schluessel: 'Assistent', programm: 'claude-ai' },
      }),
    ]);

    const unbekannt = await dienst().verarbeite(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'initialize',
        params: { protocolVersion: '1999-01-01' },
      },
      anfrage(),
    );

    expect(unbekannt).toMatchObject({
      result: { protocolVersion: '2025-06-18' },
    });
  });

  it('beantwortet Benachrichtigungen nicht und lehnt Stapel und Unbekanntes ab', async () => {
    const mcp = dienst();

    expect(
      await mcp.verarbeite(
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        anfrage(),
      ),
    ).toBeNull();
    expect(
      await mcp.verarbeite(
        [{ jsonrpc: '2.0', id: 1, method: 'ping' }],
        anfrage(),
      ),
    ).toMatchObject({ error: { code: FEHLER.UNGUELTIG } });
    expect(
      await mcp.verarbeite({ id: 1, method: 'ping' }, anfrage()),
    ).toMatchObject({ error: { code: FEHLER.UNGUELTIG } });
    expect(
      await mcp.verarbeite(
        { jsonrpc: '2.0', id: 'a', method: 'sampling/createMessage' },
        anfrage(),
      ),
    ).toMatchObject({ id: 'a', error: { code: FEHLER.UNBEKANNTE_METHODE } });
    expect(
      await mcp.verarbeite(
        { jsonrpc: '2.0', id: 3, method: 'ping' },
        anfrage(),
      ),
    ).toEqual({ jsonrpc: '2.0', id: 3, result: {} });
  });

  it('listet die Werkzeuge mit Schema und Hinweisen', async () => {
    const antwort = (await dienst().verarbeite(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      anfrage(),
    )) as { result: { tools: Array<Record<string, unknown>> } };

    expect(antwort.result.tools.map((werkzeug) => werkzeug.name)).toEqual(
      WERKZEUGE.map((werkzeug) => werkzeug.name),
    );
    expect(
      antwort.result.tools.find((werkzeug) => werkzeug.name === 'get_record'),
    ).toMatchObject({
      inputSchema: { type: 'object', required: ['type', 'id'] },
      annotations: { readOnlyHint: true },
    });
  });

  it('lehnt unbekannte Werkzeuge und falsche Eingaben als Parameterfehler ab', async () => {
    const mcp = dienst();
    const rufe = (name: string, args: Record<string, unknown>) =>
      mcp.verarbeite(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name, arguments: args },
        },
        anfrage(),
      );

    expect(await rufe('delete_everything', {})).toMatchObject({
      error: { code: FEHLER.UNGUELTIGE_PARAMETER },
    });
    expect(await rufe('get_record', { type: 'hund', id: 'x' })).toMatchObject({
      error: { code: FEHLER.UNGUELTIGE_PARAMETER },
    });
    expect(
      await rufe('search_records', { query: 'a', geheim: true }),
    ).toMatchObject({ error: { code: FEHLER.UNGUELTIGE_PARAMETER } });
    expect(await rufe('search_records', {})).toMatchObject({
      error: { code: FEHLER.UNGUELTIGE_PARAMETER },
    });
  });

  it('liefert, was die Rechte erlauben, und sagt, was fehlt', async () => {
    const antwort = (await dienst().verarbeite(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'search_records', arguments: { query: 'Alpen' } },
      },
      anfrage(),
    )) as {
      result: {
        isError: boolean;
        content: Array<{ text: string }>;
        structuredContent: Record<string, unknown>;
      };
    };

    expect(antwort.result.isError).toBe(false);
    expect(antwort.result.structuredContent).toEqual({
      companies: {
        totalCount: 1,
        items: [
          {
            id: 'f1',
            name: 'Alpenkraft',
            domain: 'alpen.de',
            city: 'Rosenheim',
          },
        ],
      },
      contacts: { totalCount: 0, items: [] },
    });
    expect(antwort.result.content[0].text).toContain('Hinweis:');
    expect(gemeldet).toEqual([]);
  });

  it('meldet Änderungen und gibt verweigerte als Werkzeugfehler zurück', async () => {
    const mcp = dienst();
    const lege = (name: string) =>
      mcp.verarbeite(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'create_deal', arguments: { name } },
        },
        anfrage(),
      );

    expect(await lege('Wartung')).toMatchObject({
      result: {
        isError: false,
        structuredContent: { id: 'd1', name: 'Wartung', currency: 'x' },
      },
    });
    expect(gemeldet).toEqual([
      expect.objectContaining({
        art: 'mcp_aenderung',
        details: { werkzeug: 'create_deal', schluessel: 'Assistent' },
      }),
    ]);

    const verboten = (await lege('verboten')) as {
      result: { isError: boolean; content: Array<{ text: string }> };
    };

    expect(verboten.result.isError).toBe(true);
    expect(verboten.result.content[0].text).toBe(
      'Dem Schlüssel fehlt die Berechtigung.',
    );
    expect(gemeldet).toHaveLength(1);
  });
});

describe('McpService im Vorschlagsmodus', () => {
  const vorschlagend = (): Request =>
    ({
      user: {
        userId: 'k1',
        workspaceId: 'w1',
        email: 'Assistent (Schlüssel)',
        apiKey: {
          id: 'k1',
          name: 'Assistent',
          permissions: ['deal:view'],
          schreibmodus: 'vorschlag',
        },
      },
    }) as unknown as Request;

  const mitVorschlaegen = (
    vorschlagen: (...args: unknown[]) => Promise<{ id: string }>,
  ) => {
    const schema = kleinesSchema();
    let geschrieben = 0;

    schema.getMutationType()!.getFields().createDeal.resolve = () => {
      geschrieben += 1;

      return { id: 'd1', name: 'x' };
    };

    return {
      mcp: new McpService({
        get: (wer: unknown) =>
          wer === KiVorschlaegeService ? { vorschlagen } : { schema },
      } as unknown as ModuleRef),
      geschrieben: () => geschrieben,
    };
  };

  const rufe = (mcp: McpService, name: string, args: Record<string, unknown>) =>
    mcp.verarbeite(
      {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: { name, arguments: args },
      },
      vorschlagend(),
    );

  it('schreibt nichts, sondern legt einen Vorschlag an und sagt es dem Assistenten', async () => {
    const vorschlagen = jest.fn(() => Promise.resolve({ id: 'v1' }));
    const { mcp, geschrieben } = mitVorschlaegen(vorschlagen);

    const antwort = (await rufe(mcp, 'create_deal', { name: 'Wartung' })) as {
      result: { isError: boolean; structuredContent: Record<string, unknown> };
    };

    expect(geschrieben()).toBe(0);
    expect(vorschlagen).toHaveBeenCalledTimes(1);
    expect(antwort.result).toMatchObject({
      isError: false,
      structuredContent: { vorschlag: 'v1', status: 'offen' },
    });
  });

  it('prüft die Eingabe vorher wie beim Ausführen', async () => {
    const vorschlagen = jest.fn(() => Promise.resolve({ id: 'v1' }));
    const { mcp } = mitVorschlaegen(vorschlagen);

    expect(await rufe(mcp, 'update_deal', { id: 'kaputt' })).toMatchObject({
      error: { code: FEHLER.UNGUELTIGE_PARAMETER },
    });
    expect(vorschlagen).not.toHaveBeenCalled();
  });

  it('gibt einen abgelehnten Vorschlag als Werkzeugfehler zurück', async () => {
    const { mcp } = mitVorschlaegen(() =>
      Promise.reject(new VorschlagAbgelehnt('Diesen Datensatz gibt es nicht.')),
    );

    expect(
      await rufe(mcp, 'update_deal', {
        id: '4b46c558-214a-401f-bece-cf54f5d534ba',
        stage: 'won',
      }),
    ).toMatchObject({
      result: {
        isError: true,
        content: [{ text: 'Diesen Datensatz gibt es nicht.' }],
      },
    });
  });

  it('liest weiter wie sonst und sagt beim Verbinden, dass nur vorgeschlagen wird', async () => {
    const vorschlagen = jest.fn(() => Promise.resolve({ id: 'v1' }));
    const { mcp } = mitVorschlaegen(vorschlagen);

    expect(await rufe(mcp, 'search_records', { query: 'Alpen' })).toMatchObject(
      { result: { isError: false } },
    );
    expect(vorschlagen).not.toHaveBeenCalled();

    const verbunden = (await mcp.verarbeite(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      vorschlagend(),
    )) as { result: { instructions: string } };

    expect(verbunden.result.instructions).toContain('schlägt nur vor');
  });

  it('beschreibt jeden schreibenden Vorschlag mit Ziel und Nachher, lesbar am echten Schema', () => {
    for (const werkzeug of WERKZEUGE.filter((w) => w.schreibt)) {
      expect([werkzeug.name, werkzeug.vorschlag === undefined]).toEqual([
        werkzeug.name,
        false,
      ]);

      const plan = werkzeug.vorschlag!(BEISPIELE[werkzeug.name]);

      expect(plan.zusammenfassung.length).toBeGreaterThan(0);
      expect(Object.keys(plan.nachher).length).toBeGreaterThan(0);
    }

    for (const query of Object.values(ZIEL_LESEN)) {
      expect(validate(VOLLES_SCHEMA, parse(query))).toEqual([]);
    }
  });

  it('hält beim Angebot nur die vorgeschlagenen Texte fest', () => {
    const werkzeug = WERKZEUGE.find((w) => w.name === 'update_quote_texts')!;
    const plan = werkzeug.vorschlag!(BEISPIELE.update_quote_texts);

    expect(plan.nachher).toEqual({
      introText: 'Vielen Dank für Ihre Anfrage.',
      'position:5b46c558-214a-401f-bece-cf54f5d534bb': 'Montage vor Ort',
    });
    expect(
      plan.vorher!({
        introText: null,
        closingText: 'Bleibt',
        lines: [
          { id: '5b46c558-214a-401f-bece-cf54f5d534bb', description: 'Alt' },
        ],
      }),
    ).toEqual({
      introText: null,
      'position:5b46c558-214a-401f-bece-cf54f5d534bb': 'Alt',
    });
    expect(plan.pruefe!({ status: 'SENT' })).toContain('Entwurf');
    expect(plan.pruefe!({ status: 'DRAFT' })).toBeNull();
  });
});

describe('McpController', () => {
  const antwort = () => {
    const res: Record<string, jest.Mock> = {};

    for (const name of ['status', 'json', 'end', 'setHeader']) {
      res[name] = jest.fn(() => res);
    }

    return res;
  };
  const steuerung = new McpController(dienst(), {
    get: () => 'http://localhost:5840/',
  } as unknown as ConfigService);
  const mitHerkunft = (origin?: string) =>
    ({
      ...anfrage(),
      headers: origin === undefined ? {} : { origin },
    }) as unknown as Request;
  const ping = { jsonrpc: '2.0', id: 1, method: 'ping' };

  it('lehnt fremde Herkunft ab und lässt Programme ohne Origin durch', async () => {
    await expect(
      steuerung.nachricht(
        mitHerkunft('https://boese.example'),
        antwort() as unknown as Response,
        ping,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    for (const origin of [undefined, 'http://localhost:5840']) {
      const res = antwort();

      await steuerung.nachricht(
        mitHerkunft(origin),
        res as unknown as Response,
        ping,
      );
      expect(res.status).toHaveBeenCalledWith(200);
    }
  });

  it('antwortet auf Benachrichtigungen mit 202 und auf GET mit 405', async () => {
    const res = antwort();

    await steuerung.nachricht(mitHerkunft(), res as unknown as Response, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(res.status).toHaveBeenCalledWith(202);

    const strom = antwort();

    steuerung.strom(strom as unknown as Response);
    expect(strom.status).toHaveBeenCalledWith(405);
    expect(strom.setHeader).toHaveBeenCalledWith('Allow', 'POST');
  });
});
