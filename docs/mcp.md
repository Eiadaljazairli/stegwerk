# KI-Assistenten anbinden (MCP)

Ein KI-Assistent wie Claude kann Stegwerk über das **Model Context Protocol**
benutzen: Firmen, Kontakte und Geschäfte suchen und lesen, Notizen und
Aufgaben anlegen, Geschäfte anlegen und weiterschieben, Mail-Entwürfe
schreiben und die Texte von Angebotsentwürfen ändern. Er tut das mit einem
**Schlüssel** und darf genau das, was der Schlüssel darf — nicht mehr.

Neue Schlüssel **schlagen nur vor** (siehe [Freigabe](#freigabe-nur-vorschlagen)):
der Assistent liest, aber jede Änderung wartet, bis ein Mensch sie annimmt.

Die Adresse ist

```
https://ihre-adresse.de/mcp
```

Der Server spricht „Streamable HTTP“ (Protokollversion 2025-06-18, ältere
Versionen 2025-03-26 und 2024-11-05 werden ausgehandelt) und antwortet auf
jede Nachricht mit JSON. Einen Strom vom Server aus und Sitzungen gibt es
nicht: jede Anfrage trägt den Schlüssel.

## Schlüssel anlegen

Unter **Team → Schlüssel**, wie in [schnittstelle.md](schnittstelle.md)
beschrieben. Für einen Assistenten empfiehlt sich ein eigener Schlüssel mit
nur den Rechten, die er braucht:

| Damit der Assistent …             | braucht der Schlüssel                                   |
| --------------------------------- | ------------------------------------------------------- |
| suchen und lesen kann             | `company:view`, `contact:view`, `deal:view`             |
| Notizen anlegen kann              | Schreibrecht auf die Art der Akte, etwa `company:write` |
| Aufgaben anlegen kann             | `task:write`                                            |
| Geschäfte anlegen und ändern kann | `deal:write`                                            |
| Angebote lesen kann               | `quote:view`                                            |

Ein Schlüssel nur mit Leserechten ist ein guter Anfang: der Assistent kann
dann nichts ändern, auch wenn er es versucht. Im Modus „nur vorschlagen“
braucht der Schlüssel ohnehin nur Leserechte — geschrieben wird beim
Annehmen mit den Rechten des Menschen.

## Einrichten

### Claude Code

```
claude mcp add --transport http stegwerk https://ihre-adresse.de/mcp \
  --header "Authorization: Bearer swk_…"
```

Danach zeigt `/mcp` in Claude Code den Server und seine elf Werkzeuge.

### Claude Desktop

Claude Desktop bindet entfernte Server mit eigenem Kopf über die Brücke
`mcp-remote` an. In `claude_desktop_config.json` (unter **Einstellungen →
Entwickler → Konfiguration bearbeiten**):

```json
{
  "mcpServers": {
    "stegwerk": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://ihre-adresse.de/mcp",
        "--header",
        "Authorization:${STEGWERK_SCHLUESSEL}"
      ],
      "env": { "STEGWERK_SCHLUESSEL": "Bearer swk_…" }
    }
  }
}
```

Der Schlüssel steht in `env` und nicht in `args`, weil manche Systeme
Leerzeichen in Argumenten zerlegen. Setzen Sie hinter `mcp-remote` eine feste
Version (`mcp-remote@x.y.z`), die Sie geprüft haben — sonst lädt `npx` bei
jedem Start die jeweils neueste. Claude Desktop danach neu starten.

### Andere Programme

Jedes Programm, das MCP über HTTP mit eigenem `Authorization`-Kopf
unterstützt, geht genauso: Adresse `…/mcp`, Kopf
`Authorization: Bearer swk_…`. Programme im Browser müssen von der Adresse
der Anwendung selbst kommen; eine fremde `Origin` wird abgewiesen.

## Werkzeuge

| Werkzeug             | Was es tut                                                                 |
| -------------------- | -------------------------------------------------------------------------- |
| `search_records`     | sucht Firmen, Kontakte und Geschäfte nach Name, E-Mail oder Domain         |
| `get_record`         | liest eine Firma, einen Kontakt oder ein Geschäft mit Notizen und Aufgaben |
| `list_records`       | listet mit Filtern (wie die Filter der Listen), sortiert, seitenweise      |
| `create_note`        | legt eine Notiz an einer Akte an                                           |
| `create_task`        | legt eine Aufgabe an, wahlweise an einer Akte                              |
| `create_deal`        | legt ein Geschäft an                                                       |
| `update_deal`        | ändert ein Geschäft, etwa Phase, Betrag oder Abschlussdatum                |
| `list_quotes`        | listet Angebote, wahlweise einer Firma, eines Geschäfts oder eines Status  |
| `get_quote`          | liest ein Angebot mit Einleitung, Schluss und Positionen                   |
| `create_mail_draft`  | legt einen Mail-Entwurf an einer Akte an; verschickt wird er nie selbst    |
| `update_quote_texts` | ändert Einleitung, Schluss und Positionstexte eines Angebots im Entwurf    |

Die Beschreibungen der Werkzeuge und ihrer Felder liefert der Server selbst
(`tools/list`); der Assistent liest sie dort.

Eine Aufgabe ohne Zuständigen fällt der Person zu, die den Schlüssel angelegt
hat. Ein Mail-Entwurf gehört ebenfalls ihr: er steht in Stegwerk unter
Postfach → „Entwürfe zur Freigabe“, und sie schickt ihn aus ihrem Postfach ab.
`update_quote_texts` ändert keine Preise, Mengen oder Empfänger.

## Freigabe: nur vorschlagen

Jeder Schlüssel hat einen Modus (Team → Schlüssel):

- **Nur vorschlagen** (Vorgabe für neue Schlüssel): der Schlüssel liest mit
  seinen Rechten. Ein schreibendes Werkzeug wird geprüft wie sonst auch, aber
  nicht ausgeführt; Stegwerk legt einen Vorschlag mit dem Stand vorher und
  nachher ab und antwortet dem Assistenten `{"vorschlag": "…", "status":
"offen"}`. Auch über GraphQL am MCP-Server vorbei kann ein solcher Schlüssel
  nichts ändern: seine Rechte sind auf das Sehen beschränkt, und jede
  Mutation und jeder schreibende HTTP-Aufruf außer dem MCP-Einstieg wird
  abgelehnt — auch die, die kein Recht abfragen, etwa `sendMail` oder das
  Verbinden eines Postfachs. Bei gesperrtem Abo legt er keine Vorschläge an.
- **Direkt**: wie bisher, mit den Rechten des Schlüssels. Für Programme wie
  einen nächtlichen Import.

Vorschläge stehen unter **Mehr → KI-Vorschläge**. Sehen und entscheiden darf,
wessen Rolle das Recht `workspace:ki` („Vorschläge der KI freigeben“) hat; ein
Schlüssel bekommt es nie. Annehmen führt dieselbe Änderung aus, die das
Werkzeug sonst gemacht hätte — mit den Rechten, Feld- und Zeilenrechten der
Person, die annimmt. Haben sich die betroffenen Felder seit dem Vorschlag
geändert, zeigt Stegwerk den Stand von jetzt und fragt noch einmal. Jeder
Vorschlag wird höchstens einmal ausgeführt; scheitert das Annehmen (etwa ohne
Schreibrecht), bleibt er offen und nennt den Grund. Höchstens 500 Vorschläge
warten zugleich. In der Liste fehlen Felder, die die eigene Rolle nicht sehen
darf (Feldrechte), auch im Stand vorher und nachher.

## Was der Assistent darf

Jeder Werkzeugaufruf geht intern als gewöhnliche Anfrage durch dieselben
Prüfungen wie im Programm:

- **Rechte** des Schlüssels: ohne `deal:write` kein neues Geschäft.
- **Feldrechte** der Person, die den Schlüssel angelegt hat: verborgene
  Felder kommen nicht an, schreibgeschützte lassen sich nicht ändern.
- **Zeilenrechte**: wer nur eigene Geschäfte sieht, dessen Schlüssel sieht
  auch nur diese.
- **Abo**: ist der Arbeitsbereich abgelaufen, kann der Assistent lesen, aber
  nichts mehr ändern.

Was nicht erlaubt ist, kommt als Fehler des Werkzeugs zurück, mit derselben
deutschen Meldung wie im Programm. Bei der Suche fehlt eine Art einfach, wenn
der Schlüssel sie nicht lesen darf; die anderen kommen trotzdem.

## Grenzen und Protokoll

- Höchstens **60 Nachrichten je Minute** von einer IP-Adresse. Ein
  Assistent in einer Schleife bremst so nicht den ganzen Arbeitsbereich aus.
- Listen liefern höchstens 50 Einträge je Aufruf, die Suche höchstens 10 je
  Art.
- Im **Sicherheitsprotokoll** (Team → Sicherheit) steht jede Verbindung
  („KI-Assistent verbunden“, mit Programmname), jede Änderung („KI-Assistent
  hat etwas geändert“, mit Werkzeug und Schlüssel), jeder Vorschlag und wer
  ihn angenommen oder verworfen hat. Lesen wird nicht protokolliert.
- Wer einem Assistenten den Zugang nehmen will, widerruft den Schlüssel. Er
  ist sofort ungültig.

## Ausprobieren

Mit dem MCP Inspector:

```
npx @modelcontextprotocol/inspector
```

Dort „Streamable HTTP“ wählen, die Adresse eintragen und unter
„Authentication“ den Kopf `Authorization` mit `Bearer swk_…` setzen.

Oder ohne Programm:

```bash
curl -fsS https://ihre-adresse.de/mcp \
  -H "Authorization: Bearer $STEGWERK_SCHLUESSEL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"search_records","arguments":{"query":"Alpen"}}}'
```
