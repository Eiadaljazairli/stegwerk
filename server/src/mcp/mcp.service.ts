import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { type Request } from 'express';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import {
  KiVorschlaegeService,
  VorschlagAbgelehnt,
} from '../ki-vorschlaege/ki-vorschlaege.service';
import { meldeSicherheit } from '../sicherheit/melden';
import { fuehreAus } from './graphql-ausfuehren';
import {
  nurBekannte,
  UngueltigeEingabe,
  WERKZEUGE,
  werkzeugListe,
} from './mcp-werkzeuge';

export const PROTOKOLL_VERSIONEN = ['2025-06-18', '2025-03-26', '2024-11-05'];

export const FEHLER = {
  PARSE: -32700,
  UNGUELTIG: -32600,
  UNBEKANNTE_METHODE: -32601,
  UNGUELTIGE_PARAMETER: -32602,
  INTERN: -32603,
} as const;

type JsonRpcAnfrage = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

type JsonRpcAntwort =
  | { jsonrpc: '2.0'; id: string | number | null; result: unknown }
  | {
      jsonrpc: '2.0';
      id: string | number | null;
      error: { code: number; message: string };
    };

const fehler = (
  id: string | number | null,
  code: number,
  message: string,
): JsonRpcAntwort => ({ jsonrpc: '2.0', id, error: { code, message } });

const HINWEISE =
  'Stegwerk ist ein CRM. Die Werkzeuge lesen und ändern Firmen (company), Kontakte (contact), Geschäfte (deal) und die Texte von Angeboten mit den Rechten des Schlüssels. Erst suchen (search_records), dann mit der Kennung lesen oder ändern. Beträge sind netto, Daten im Format JJJJ-MM-TT. Mails verschickt der Assistent nie selbst: create_mail_draft legt einen Entwurf an, den ein Mensch prüft und abschickt.';

const HINWEIS_VORSCHLAG =
  ' Dieser Schlüssel schlägt nur vor: jede Änderung wird als Vorschlag abgelegt und erst ausgeführt, wenn ein Mensch sie in Stegwerk unter „KI-Vorschläge“ annimmt. Sag das dem Benutzer, statt die Änderung als erledigt zu melden.';

@Injectable()
export class McpService {
  constructor(private readonly moduleRef: ModuleRef) {}

  async verarbeite(
    nachricht: unknown,
    req: Request,
  ): Promise<JsonRpcAntwort | null> {
    if (
      nachricht === null ||
      typeof nachricht !== 'object' ||
      Array.isArray(nachricht)
    ) {
      return fehler(
        null,
        FEHLER.UNGUELTIG,
        'Eine einzelne JSON-RPC-Nachricht erwartet.',
      );
    }

    const anfrage = nachricht as JsonRpcAnfrage;
    const id =
      typeof anfrage.id === 'string' || typeof anfrage.id === 'number'
        ? anfrage.id
        : null;

    if (anfrage.jsonrpc !== '2.0' || typeof anfrage.method !== 'string') {
      return fehler(id, FEHLER.UNGUELTIG, 'Ungültige JSON-RPC-Nachricht.');
    }

    if (anfrage.id === undefined) {
      return null;
    }

    const params =
      anfrage.params !== null && typeof anfrage.params === 'object'
        ? (anfrage.params as Record<string, unknown>)
        : {};

    switch (anfrage.method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: this.initialisieren(params, req),
        };
      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };
      case 'tools/list':
        return { jsonrpc: '2.0', id, result: { tools: werkzeugListe() } };
      case 'tools/call':
        return this.aufrufen(id, params, req);
      case 'resources/list':
        return { jsonrpc: '2.0', id, result: { resources: [] } };
      case 'prompts/list':
        return { jsonrpc: '2.0', id, result: { prompts: [] } };
      default:
        return fehler(
          id,
          FEHLER.UNBEKANNTE_METHODE,
          `Unbekannte Methode „${anfrage.method}“.`,
        );
    }
  }

  private initialisieren(params: Record<string, unknown>, req: Request) {
    const gewuenscht = params.protocolVersion;
    const user = req.user as RequestUser;

    meldeSicherheit({
      art: 'mcp_verbunden',
      workspaceId: user.workspaceId,
      actorId: user.apiKey === undefined ? user.userId : null,
      details: {
        schluessel: user.apiKey?.name ?? null,
        programm: this.programm(params),
      },
    });

    return {
      protocolVersion:
        typeof gewuenscht === 'string' &&
        PROTOKOLL_VERSIONEN.includes(gewuenscht)
          ? gewuenscht
          : PROTOKOLL_VERSIONEN[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'stegwerk', title: 'Stegwerk', version: '1.0.0' },
      instructions:
        user.apiKey?.schreibmodus === 'vorschlag'
          ? HINWEISE + HINWEIS_VORSCHLAG
          : HINWEISE,
    };
  }

  private programm(params: Record<string, unknown>): string | null {
    const info = params.clientInfo as { name?: unknown } | undefined;

    return typeof info?.name === 'string' ? info.name.slice(0, 80) : null;
  }

  private async aufrufen(
    id: string | number | null,
    params: Record<string, unknown>,
    req: Request,
  ): Promise<JsonRpcAntwort> {
    const werkzeug = WERKZEUGE.find((eintrag) => eintrag.name === params.name);

    if (werkzeug === undefined) {
      return fehler(
        id,
        FEHLER.UNGUELTIGE_PARAMETER,
        `Unbekanntes Werkzeug „${String(params.name)}“.`,
      );
    }

    const eingabe =
      params.arguments !== null &&
      typeof params.arguments === 'object' &&
      !Array.isArray(params.arguments)
        ? (params.arguments as Record<string, unknown>)
        : {};

    let abfragen: ReturnType<typeof werkzeug.abfragen>;

    try {
      nurBekannte(werkzeug, eingabe);
      abfragen = werkzeug.abfragen(eingabe);
    } catch (problem) {
      if (problem instanceof UngueltigeEingabe) {
        return fehler(id, FEHLER.UNGUELTIGE_PARAMETER, problem.message);
      }

      throw problem;
    }

    const user = req.user as RequestUser;

    if (werkzeug.schreibt && user.apiKey?.schreibmodus === 'vorschlag') {
      return this.vorschlagen(id, werkzeug, eingabe, req);
    }

    const { ergebnis, meldungen } = await fuehreAus(
      this.moduleRef.get(GraphQLSchemaHost, { strict: false }).schema,
      abfragen,
      { req },
    );

    const nichts = Object.keys(ergebnis).length === 0;

    if (werkzeug.schreibt && !nichts) {
      meldeSicherheit({
        art: 'mcp_aenderung',
        workspaceId: user.workspaceId,
        actorId: user.apiKey === undefined ? user.userId : null,
        details: {
          werkzeug: werkzeug.name,
          schluessel: user.apiKey?.name ?? null,
        },
      });
    }

    if (nichts) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: meldungen.join(' ') }],
          isError: true,
        },
      };
    }

    const inhalt =
      abfragen.length === 1 ? ergebnis[abfragen[0].schluessel] : ergebnis;
    const strukturiert =
      inhalt !== null && typeof inhalt === 'object' && !Array.isArray(inhalt)
        ? (inhalt as Record<string, unknown>)
        : { ergebnis: inhalt };

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text:
              JSON.stringify(inhalt, null, 2) +
              (meldungen.length > 0
                ? `\n\nHinweis: ${meldungen.join(' ')}`
                : ''),
          },
        ],
        structuredContent: strukturiert,
        isError: false,
      },
    };
  }

  private async vorschlagen(
    id: string | number | null,
    werkzeug: (typeof WERKZEUGE)[number],
    eingabe: Record<string, unknown>,
    req: Request,
  ): Promise<JsonRpcAntwort> {
    try {
      const vorschlag = await this.moduleRef
        .get(KiVorschlaegeService, { strict: false })
        .vorschlagen(req as { user?: RequestUser }, werkzeug, eingabe);
      const inhalt = {
        vorschlag: vorschlag.id,
        status: 'offen',
        hinweis:
          'Noch nichts geändert. Der Vorschlag liegt in Stegwerk unter „KI-Vorschläge“ zur Freigabe bereit; ein Mensch nimmt ihn an oder verwirft ihn.',
      };

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(inhalt, null, 2) }],
          structuredContent: inhalt,
          isError: false,
        },
      };
    } catch (problem) {
      if (
        problem instanceof VorschlagAbgelehnt ||
        problem instanceof UngueltigeEingabe
      ) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: problem.message }],
            isError: true,
          },
        };
      }

      throw problem;
    }
  }
}
