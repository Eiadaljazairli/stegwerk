import { sichereAnfrage } from '../webhooks/webhook-ziel';
import { type KiAnbieter, KI_ANBIETER_NAME } from './ki-modelle';

export const KI_RECHNER: Record<KiAnbieter, string> = {
  anthropic: 'api.anthropic.com',
  openai: 'api.openai.com',
};

export type KiHttpAnfrage = {
  methode: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  rumpf?: string | null;
  zeitlimitMs?: number;
};

export type KiHttpAntwort = { status: number; rumpf: string };

export type KiTransport = (anfrage: KiHttpAnfrage) => Promise<KiHttpAntwort>;

export const KI_HTTP = Symbol('KI_HTTP');

const ZEITLIMIT_MS = 90_000;

const MAX_ANTWORT = 2 * 1024 * 1024;

export const sichererKiTransport =
  (): KiTransport =>
  async ({ methode, url, headers, rumpf = null, zeitlimitMs }) => {
    const ziel = new URL(url);

    if (
      ziel.protocol !== 'https:' ||
      !Object.values(KI_RECHNER).includes(ziel.hostname) ||
      ziel.port !== '' ||
      ziel.username !== ''
    ) {
      throw new Error('Diese Adresse gehört zu keinem KI-Anbieter.');
    }

    const antwort = await sichereAnfrage(
      ziel,
      methode,
      headers,
      rumpf,
      Math.max(1, Math.min(ZEITLIMIT_MS, zeitlimitMs ?? ZEITLIMIT_MS)),
      MAX_ANTWORT,
    );

    return { status: antwort.status, rumpf: antwort.rumpf };
  };

export class KiFehler extends Error {
  constructor(
    message: string,
    readonly art: 'schluessel' | 'modell' | 'grenze' | 'sonstig',
  ) {
    super(message);
    this.name = 'KiFehler';
  }
}

const grundAus = (rumpf: string): string | null => {
  try {
    const json = JSON.parse(rumpf) as { error?: { message?: unknown } };
    const text = json.error?.message;

    if (typeof text !== 'string') {
      return null;
    }

    // eslint-disable-next-line no-control-regex
    const sauber = text.replace(/[\u0000-\u001f]+/gu, ' ').trim();

    return sauber === '' ? null : sauber.slice(0, 200);
  } catch {
    return null;
  }
};

export const pruefeKiAntwort = (
  anbieter: KiAnbieter,
  antwort: KiHttpAntwort,
): void => {
  const name = KI_ANBIETER_NAME[anbieter];
  const { status } = antwort;

  if (status >= 200 && status < 300) {
    return;
  }

  if (status === 401 || status === 403) {
    throw new KiFehler(
      `${name} hat den API-Schlüssel abgelehnt. Wurde er widerrufen? Bitte unter Einstellungen → KI einen gültigen Schlüssel eintragen.`,
      'schluessel',
    );
  }

  if (status === 404) {
    throw new KiFehler(
      `${name} kennt dieses Modell nicht oder Ihr Konto hat keinen Zugriff darauf. Bitte unter Einstellungen → KI ein anderes wählen.`,
      'modell',
    );
  }

  if (status === 429) {
    throw new KiFehler(
      `${name} lässt gerade keine weiteren Anfragen zu (Grenze Ihres Kontos erreicht oder Guthaben aufgebraucht). Bitte später erneut versuchen oder das Konto beim Anbieter prüfen.`,
      'grenze',
    );
  }

  if (status >= 500 || status === 0) {
    throw new KiFehler(
      `${name} ist gerade nicht erreichbar (Status ${String(status)}). Bitte gleich noch einmal versuchen.`,
      'sonstig',
    );
  }

  const grund = grundAus(antwort.rumpf);

  throw new KiFehler(
    `${name} hat die Anfrage abgelehnt (Status ${String(status)})${grund === null ? '' : `: ${grund}`}.`,
    'sonstig',
  );
};

export type KiWerkzeugBeschreibung = {
  name: string;
  beschreibung: string;
  schema: Record<string, unknown>;
};

export type KiWerkzeugAufruf = {
  id: string;
  name: string;
  eingabe: Record<string, unknown>;
};

export type KiErgebnis = { id: string; text: string; fehler: boolean };

export type KiSchritt =
  | { art: 'text'; rolle: 'user' | 'assistant'; text: string }
  | { art: 'anbieter'; roh: unknown }
  | { art: 'ergebnisse'; ergebnisse: KiErgebnis[] };

export type KiAnfrage = {
  schluessel: string;
  modell: string;
  system: string;
  verlauf: KiSchritt[];
  werkzeuge: KiWerkzeugBeschreibung[];
  maxTokens: number;
  zeitlimitMs?: number;
};

export type KiRunde = {
  text: string;
  aufrufe: KiWerkzeugAufruf[];
  roh: unknown;
  ende: 'fertig' | 'werkzeuge' | 'gekuerzt' | 'abgelehnt';
  tokens: number;
};

export type KiProgramm = {
  antworte(anfrage: KiAnfrage): Promise<KiRunde>;
  pruefe(schluessel: string, modell: string): Promise<void>;
};

const alsJson = (rumpf: string): Record<string, unknown> => {
  try {
    const json = JSON.parse(rumpf) as unknown;

    return json !== null && typeof json === 'object'
      ? (json as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const eingabeAus = (wert: unknown): Record<string, unknown> => {
  if (typeof wert === 'string') {
    try {
      return eingabeAus(JSON.parse(wert));
    } catch {
      return {};
    }
  }

  return wert !== null && typeof wert === 'object' && !Array.isArray(wert)
    ? (wert as Record<string, unknown>)
    : {};
};

const ANTHROPIC_VERSION = '2023-06-01';

export class AnthropicProgramm implements KiProgramm {
  constructor(private readonly http: KiTransport) {}

  private kopf(schluessel: string): Record<string, string> {
    return {
      'x-api-key': schluessel,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    };
  }

  async pruefe(schluessel: string, modell: string): Promise<void> {
    pruefeKiAntwort(
      'anthropic',
      await this.http({
        methode: 'GET',
        url: `https://${KI_RECHNER.anthropic}/v1/models/${encodeURIComponent(modell)}`,
        headers: this.kopf(schluessel),
      }),
    );
  }

  async antworte(anfrage: KiAnfrage): Promise<KiRunde> {
    const nachrichten = anfrage.verlauf.map((schritt) => {
      if (schritt.art === 'text') {
        return { role: schritt.rolle, content: schritt.text };
      }

      if (schritt.art === 'anbieter') {
        return { role: 'assistant', content: schritt.roh };
      }

      return {
        role: 'user',
        content: schritt.ergebnisse.map((ergebnis) => ({
          type: 'tool_result',
          tool_use_id: ergebnis.id,
          content: ergebnis.text,
          ...(ergebnis.fehler ? { is_error: true } : {}),
        })),
      };
    });
    const werkzeuge = anfrage.werkzeuge.map((werkzeug, index) => ({
      name: werkzeug.name,
      description: werkzeug.beschreibung,
      input_schema: werkzeug.schema,
      ...(index === anfrage.werkzeuge.length - 1
        ? { cache_control: { type: 'ephemeral' } }
        : {}),
    }));
    const antwort = await this.http({
      methode: 'POST',
      url: `https://${KI_RECHNER.anthropic}/v1/messages`,
      headers: this.kopf(anfrage.schluessel),
      zeitlimitMs: anfrage.zeitlimitMs,
      rumpf: JSON.stringify({
        model: anfrage.modell,
        max_tokens: anfrage.maxTokens,
        system: [
          {
            type: 'text',
            text: anfrage.system,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: nachrichten,
        ...(werkzeuge.length > 0 ? { tools: werkzeuge } : {}),
      }),
    });

    pruefeKiAntwort('anthropic', antwort);

    const json = alsJson(antwort.rumpf);
    const bloecke = Array.isArray(json.content)
      ? (json.content as Record<string, unknown>[])
      : [];
    const text = bloecke
      .filter(
        (block) => block.type === 'text' && typeof block.text === 'string',
      )
      .map((block) => block.text as string)
      .join('\n')
      .trim();
    const aufrufe = bloecke
      .filter((block) => block.type === 'tool_use')
      .map((block) => ({
        id: String(block.id),
        name: String(block.name),
        eingabe: eingabeAus(block.input),
      }));
    const nutzung = (json.usage ?? {}) as Record<string, unknown>;
    const stop = json.stop_reason;

    return {
      text,
      aufrufe,
      roh: bloecke,
      ende:
        stop === 'refusal'
          ? 'abgelehnt'
          : aufrufe.length > 0
            ? 'werkzeuge'
            : stop === 'max_tokens'
              ? 'gekuerzt'
              : 'fertig',
      tokens:
        Number(nutzung.input_tokens ?? 0) + Number(nutzung.output_tokens ?? 0),
    };
  }
}

export class OpenAiProgramm implements KiProgramm {
  constructor(private readonly http: KiTransport) {}

  private kopf(schluessel: string): Record<string, string> {
    return {
      authorization: `Bearer ${schluessel}`,
      'content-type': 'application/json',
    };
  }

  async pruefe(schluessel: string, modell: string): Promise<void> {
    pruefeKiAntwort(
      'openai',
      await this.http({
        methode: 'GET',
        url: `https://${KI_RECHNER.openai}/v1/models/${encodeURIComponent(modell)}`,
        headers: this.kopf(schluessel),
      }),
    );
  }

  async antworte(anfrage: KiAnfrage): Promise<KiRunde> {
    const nachrichten: unknown[] = [
      { role: 'system', content: anfrage.system },
    ];

    for (const schritt of anfrage.verlauf) {
      if (schritt.art === 'text') {
        nachrichten.push({ role: schritt.rolle, content: schritt.text });
      } else if (schritt.art === 'anbieter') {
        nachrichten.push(schritt.roh);
      } else {
        for (const ergebnis of schritt.ergebnisse) {
          nachrichten.push({
            role: 'tool',
            tool_call_id: ergebnis.id,
            content: ergebnis.fehler
              ? `Fehler: ${ergebnis.text}`
              : ergebnis.text,
          });
        }
      }
    }

    const antwort = await this.http({
      methode: 'POST',
      url: `https://${KI_RECHNER.openai}/v1/chat/completions`,
      headers: this.kopf(anfrage.schluessel),
      zeitlimitMs: anfrage.zeitlimitMs,
      rumpf: JSON.stringify({
        model: anfrage.modell,
        max_completion_tokens: anfrage.maxTokens,
        messages: nachrichten,
        ...(anfrage.werkzeuge.length > 0
          ? {
              tools: anfrage.werkzeuge.map((werkzeug) => ({
                type: 'function',
                function: {
                  name: werkzeug.name,
                  description: werkzeug.beschreibung,
                  parameters: werkzeug.schema,
                },
              })),
            }
          : {}),
      }),
    });

    pruefeKiAntwort('openai', antwort);

    const json = alsJson(antwort.rumpf);
    const [wahl] = Array.isArray(json.choices)
      ? (json.choices as Record<string, unknown>[])
      : [];
    const nachricht = (wahl?.message ?? {}) as Record<string, unknown>;
    const aufrufe = (
      Array.isArray(nachricht.tool_calls)
        ? (nachricht.tool_calls as Record<string, unknown>[])
        : []
    )
      .filter((aufruf) => aufruf.type === 'function')
      .map((aufruf) => {
        const funktion = (aufruf.function ?? {}) as Record<string, unknown>;

        return {
          id: String(aufruf.id),
          name: String(funktion.name),
          eingabe: eingabeAus(funktion.arguments),
        };
      });
    const nutzung = (json.usage ?? {}) as Record<string, unknown>;
    const grund = wahl?.finish_reason;

    return {
      text:
        typeof nachricht.content === 'string' ? nachricht.content.trim() : '',
      aufrufe,
      roh: {
        role: 'assistant',
        content:
          typeof nachricht.content === 'string' ? nachricht.content : null,
        ...(Array.isArray(nachricht.tool_calls)
          ? { tool_calls: nachricht.tool_calls }
          : {}),
      },
      ende:
        grund === 'content_filter'
          ? 'abgelehnt'
          : aufrufe.length > 0
            ? 'werkzeuge'
            : grund === 'length'
              ? 'gekuerzt'
              : 'fertig',
      tokens: Number(nutzung.total_tokens ?? 0),
    };
  }
}

export const kiProgramme = (
  http: KiTransport,
): Record<KiAnbieter, KiProgramm> => ({
  anthropic: new AnthropicProgramm(http),
  openai: new OpenAiProgramm(http),
});
