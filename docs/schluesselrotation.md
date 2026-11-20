# Schlüssel rotieren

Stegwerk versiegelt fremde Zugangsdaten mit AES-256-GCM, bevor sie in die
Datenbank gehen. Zwei Schlüssel, getrennt nach Zweck:

| Schlüssel | Versiegelt |
|---|---|
| `MAIL_ENCRYPTION_KEY` | Postfach-Passwörter, OAuth-Token (Google/Microsoft), CalDAV-Passwörter, Webhook-Geheimnisse, Automationen (Eingangsgeheimnis, HTTP-Kopfzeilen, Adresse eines Slack- oder Teams-Kanals) |
| `TOTP_ENCRYPTION_KEY` | das Geheimnis der Zwei-Faktor-Anmeldung je Konto |

Seit Oktober 2026 trägt jeder versiegelte Wert die Kennung des Schlüssels,
mit dem er versiegelt wurde (`v2:<kennung>:…`, acht Hex-Zeichen aus dem
SHA-256 des Schlüssels). Ältere Werte (`v1:…`) bleiben lesbar.

## Wann rotieren

- Der Schlüssel könnte jemand anderem bekannt sein: `.env.prod` lag auf einem
  fremden Rechner, ein Mitarbeiter mit Serverzugang ist gegangen, eine
  Sicherung samt Einstellungsdatei ist abhandengekommen.
- Sonst nach eigenem Rhythmus, etwa jährlich.

Nicht nötig, wenn nur die Datenbank (ohne `.env.prod`) abhandengekommen ist:
die versiegelten Werte sind ohne Schlüssel nutzlos. Die betroffenen Zugänge
trotzdem beim Anbieter ändern lassen, wenn die Sicherung unverschlüsselt war.

## Ablauf

Alles auf dem Server, im Verzeichnis `/opt/stegwerk`. Vorher eine Sicherung
(`docs/sicherung.md`).

1. Neuen Schlüssel erzeugen:

   ```
   openssl rand -base64 32
   ```

2. In `.env.prod` den bisherigen Wert nach `MAIL_ENCRYPTION_KEY_ALT`
   verschieben und den neuen in `MAIL_ENCRYPTION_KEY` eintragen. Für den
   TOTP-Schlüssel genauso mit `TOTP_ENCRYPTION_KEY_ALT`. Mehrere alte
   Schlüssel stehen durch Komma getrennt.

3. Ausrollen wie immer:

   ```
   bash scripts/vps-deploy.sh
   ```

   Ab jetzt versiegelt der Server mit dem neuen Schlüssel und liest mit
   beiden. Nichts ist getrennt, niemand muss sich neu anmelden.

4. Erst zählen, dann umschlüsseln:

   ```
   docker compose --env-file .env.prod -f docker-compose.prod.yml exec api \
     node dist/database/umschluesseln.js --probe
   ```

   Im laufenden `api`-Container, weil der alle vier Schlüssel schon kennt.

   Die Ausgabe nennt je Spalte, wie viele Werte umzuschlüsseln, schon aktuell
   oder unlesbar sind. Ohne `--probe` wird geschrieben. Der Lauf schreibt einen
   Wert nur, wenn er sich in der Zwischenzeit nicht geändert hat, und lässt
   Unlesbares unverändert stehen.

5. Wieder mit `--probe` prüfen: alles „aktuell“, nichts „umzuschlüsseln“.

6. `MAIL_ENCRYPTION_KEY_ALT` und `TOTP_ENCRYPTION_KEY_ALT` leeren und noch
   einmal ausrollen. Erst jetzt ist der alte Schlüssel wertlos.

## Wenn etwas „unlesbar“ ist

Der Wert passt zu keinem der genannten Schlüssel — meist fehlt ein noch
älterer Schlüssel in `*_ALT`. Ist er nicht mehr da, bleibt nur: das Postfach
bzw. den Kalender neu verbinden, das Webhook-Geheimnis neu erzeugen, die
Zwei-Faktor-Anmeldung zurücksetzen. Der Server zeigt in diesen Fällen „Bitte
erneut verbinden“.

## Für Entwickler

- Neue versiegelte Spalten gehören in `VERSIEGELTE_SPALTEN`
  (`server/src/sicherheit/umschluesseln.ts`); ein Test prüft, dass jede dort
  genannte Spalte existiert.
  Versiegelte Werte im JSON einer Zeile (die HTTP-Kopfzeilen `wertSealed` und
  die Kanal-Adresse `kanalUrlSealed` in `aktionDaten` und `schritte[].daten`
  der Automationen) stehen nicht in dieser Liste; sie brauchen einen eigenen
  Durchgang wie `automationsKoepfe` und eine eigene Zeile im Bericht.
- Versiegeln immer über `seal` mit dem Bund aus `mailSchluessel(config)`
  bzw. `schluesselbund(…)`, öffnen über `open` mit demselben Bund.

Beliebig viele alte Schlüssel sind erlaubt, und das Umschlüsseln ist ein
eigener Befehl statt eines Upgrade-Schritts.
