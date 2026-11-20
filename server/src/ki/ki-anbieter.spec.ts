import {
  AnthropicProgramm,
  KiFehler,
  type KiHttpAnfrage,
  type KiHttpAntwort,
  OpenAiProgramm,
  pruefeKiAntwort,
  sichererKiTransport,
} from './ki-anbieter';
import { KiDrossel } from './ki-drossel';

const aufzeichnen = (antworten: KiHttpAntwort[]) => {
  const anfragen: KiHttpAnfrage[] = [];

  return {
    anfragen,
    http: (anfrage: KiHttpAnfrage) => {
      anfragen.push(anfrage);

      return Promise.resolve(antworten.shift() as KiHttpAntwort);
    },
  };
};

const WERKZEUG = {
  name: 'search_records',
  beschreibung: 'Sucht.',
  schema: { type: 'object', properties: {}, additionalProperties: false },
};

describe('OpenAI', () => {
  it('übersetzt Werkzeuge, Aufrufe und Ergebnisse', async () => {
    const { anfragen, http } = aufzeichnen([
      {
        status: 200,
        rumpf: JSON.stringify({
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'search_records',
                      arguments: '{"query":"Dach"}',
                    },
                  },
                ],
              },
            },
          ],
          usage: { total_tokens: 42 },
        }),
      },
    ]);
    const programm = new OpenAiProgramm(http);
    const runde = await programm.antworte({
      schluessel: 'sk-geheim',
      modell: 'gpt-5',
      system: 'Regeln',
      verlauf: [
        { art: 'text', rolle: 'user', text: 'Frage' },
        { art: 'anbieter', roh: { role: 'assistant', content: 'vorher' } },
        {
          art: 'ergebnisse',
          ergebnisse: [{ id: 'call_0', text: 'nichts', fehler: true }],
        },
      ],
      werkzeuge: [WERKZEUG],
      maxTokens: 100,
    });

    expect(runde).toMatchObject({
      ende: 'werkzeuge',
      tokens: 42,
      aufrufe: [
        { id: 'call_1', name: 'search_records', eingabe: { query: 'Dach' } },
      ],
    });
    expect(anfragen[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect(anfragen[0].headers.authorization).toBe('Bearer sk-geheim');

    const rumpf = JSON.parse(anfragen[0].rumpf as string) as {
      messages: unknown[];
      tools: unknown[];
      max_completion_tokens: number;
    };

    expect(rumpf.max_completion_tokens).toBe(100);
    expect(rumpf.messages).toEqual([
      { role: 'system', content: 'Regeln' },
      { role: 'user', content: 'Frage' },
      { role: 'assistant', content: 'vorher' },
      { role: 'tool', tool_call_id: 'call_0', content: 'Fehler: nichts' },
    ]);
    expect(rumpf.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'search_records',
          description: 'Sucht.',
          parameters: WERKZEUG.schema,
        },
      },
    ]);
    expect(anfragen[0].rumpf).not.toContain('sk-geheim');
  });

  it('erkennt den Inhaltsfilter als Ablehnung', async () => {
    const { http } = aufzeichnen([
      {
        status: 200,
        rumpf: JSON.stringify({
          choices: [
            { finish_reason: 'content_filter', message: { content: '' } },
          ],
        }),
      },
    ]);

    await expect(
      new OpenAiProgramm(http).antworte({
        schluessel: 'k',
        modell: 'gpt-5',
        system: '',
        verlauf: [{ art: 'text', rolle: 'user', text: 'x' }],
        werkzeuge: [],
        maxTokens: 10,
      }),
    ).resolves.toMatchObject({ ende: 'abgelehnt' });
  });
});

describe('Anthropic', () => {
  it('fragt beim Prüfen nach dem Modell, ohne etwas zu erzeugen', async () => {
    const { anfragen, http } = aufzeichnen([{ status: 200, rumpf: '{}' }]);

    await new AnthropicProgramm(http).pruefe('k', 'claude-haiku-5-5');

    expect(anfragen[0]).toMatchObject({
      methode: 'GET',
      url: 'https://api.anthropic.com/v1/models/claude-haiku-5-5',
    });
    expect(anfragen[0].headers['anthropic-version']).toBe('2023-06-01');
  });

  it('meldet eine abgeschnittene Antwort und die Ablehnung', async () => {
    const { http } = aufzeichnen([
      {
        status: 200,
        rumpf: JSON.stringify({
          content: [{ type: 'text', text: 'Halb' }],
          stop_reason: 'max_tokens',
        }),
      },
      {
        status: 200,
        rumpf: JSON.stringify({ content: [], stop_reason: 'refusal' }),
      },
    ]);
    const programm = new AnthropicProgramm(http);
    const anfrage = {
      schluessel: 'k',
      modell: 'claude-sonnet-5-5',
      system: '',
      verlauf: [{ art: 'text' as const, rolle: 'user' as const, text: 'x' }],
      werkzeuge: [],
      maxTokens: 10,
    };

    await expect(programm.antworte(anfrage)).resolves.toMatchObject({
      text: 'Halb',
      ende: 'gekuerzt',
    });
    await expect(programm.antworte(anfrage)).resolves.toMatchObject({
      ende: 'abgelehnt',
    });
  });
});

describe('Fehler und Weg nach draußen', () => {
  it('ordnet Antworten der Anbieter als Satz ein', () => {
    expect(() => pruefeKiAntwort('openai', { status: 404, rumpf: '' })).toThrow(
      'kennt dieses Modell nicht',
    );
    expect(() =>
      pruefeKiAntwort('anthropic', {
        status: 400,
        rumpf: JSON.stringify({ error: { message: 'bad\nrequest' } }),
      }),
    ).toThrow('Status 400): bad request.');
    expect(() =>
      pruefeKiAntwort('anthropic', { status: 429, rumpf: '' }),
    ).toThrow(KiFehler);
  });

  it('geht nur zu den zwei Anbietern', async () => {
    const http = sichererKiTransport();

    await expect(
      http({
        methode: 'GET',
        url: 'https://example.org/v1/models',
        headers: {},
      }),
    ).rejects.toThrow('keinem KI-Anbieter');
    await expect(
      http({
        methode: 'GET',
        url: 'http://api.openai.com/v1/models',
        headers: {},
      }),
    ).rejects.toThrow('keinem KI-Anbieter');
    await expect(
      http({
        methode: 'GET',
        url: 'https://api.anthropic.com:8443/v1/models',
        headers: {},
      }),
    ).rejects.toThrow('keinem KI-Anbieter');
  });
});

describe('Drossel', () => {
  it('zählt im Fenster und gibt danach wieder frei', () => {
    let jetzt = 0;
    const drossel = new KiDrossel(() => jetzt);

    expect(drossel.versuche('a', 2, 1000)).toBe(true);
    expect(drossel.versuche('a', 2, 1000)).toBe(true);
    expect(drossel.versuche('a', 2, 1000)).toBe(false);
    expect(drossel.versuche('b', 2, 1000)).toBe(true);
    jetzt = 1001;
    expect(drossel.versuche('a', 2, 1000)).toBe(true);
  });
});
