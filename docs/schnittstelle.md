# Zugang für Programme

Ein Programm kann sich nicht anmelden. Es hat kein Telefon für den zweiten
Faktor und niemanden, der ein Passwort tippt. Dafür gibt es Schlüssel.

Ein Schlüssel gehört dem **Arbeitsbereich** und nicht der Person, die ihn
angelegt hat — sonst verlöre ein Betrieb seine nächtliche Auftragsübernahme in
dem Moment, in dem jemand kündigt.

## Einen anlegen

Unter **Team → Schlüssel**. Dafür braucht man das Recht „API-Schlüssel und
Webhooks“ (`workspace:api`).

Beim Anlegen wählt man, was der Schlüssel darf. Angeboten wird nur, was man
selbst darf: ein Schlüssel kann nie mehr als die Person, die ihn anlegt.

Der vollständige Schlüssel erscheint **genau einmal**. Danach steht er
nirgends mehr — auch nicht in der Datenbank, in der nur sein Hash liegt. Wer
ihn verliert, widerruft ihn und legt einen neuen an.

Er sieht so aus:

```
swk_0gyKnbEQ_HlqeB2SbviE19A9mBfNv8HFi4me0SP1YyfmVYrAvCw
```

Das Präfix `swk_` steht davor, damit ein Schlüssel als solcher zu erkennen
ist, wenn er dort auftaucht, wo er nicht hingehört — in einem öffentlichen
Verzeichnis, in einer Fehlermeldung, in der Zwischenablage.

## Benutzen

Derselbe Kopf, den ein angemeldeter Browser schickt:

```
Authorization: Bearer swk_0gyKnbEQ_Hlqe…
```

Damit gehen GraphQL unter `/graphql` und die Endpunkte, die Dateien
ausliefern: `/export/<art>`, `/quotes/<id>/pdf`, `/invoices/<id>/pdf`,
`/appointments/<id>/ics` und die Anhänge.

Ein Beispiel — alle Firmen als CSV:

```bash
curl -fsS https://ihre-adresse.de/export/company \
  -H "Authorization: Bearer $STEGWERK_SCHLUESSEL" \
  -o firmen.csv
```

Und eine Firma anlegen:

```bash
curl -fsS https://ihre-adresse.de/graphql \
  -H "Authorization: Bearer $STEGWERK_SCHLUESSEL" \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation($i:CreateCompanyInput!){createCompany(input:$i){id name}}",
       "variables":{"i":{"name":"Seewind Logistik GmbH","city":"Kiel"}}}'
```

Das vollständige Schema steht unter `/graphql` zur Verfügung.

## Viele auf einmal

Für Programme, die einen Bestand abgleichen, gibt es je Firma, Kontakt und
Geschäft drei Mutationen mit einer Liste von bis zu 100 Zeilen:

| Mutation                                           | tut                                        |
| -------------------------------------------------- | ------------------------------------------ |
| `createCompanies`, `createContacts`, `createDeals` | legt jede Zeile neu an                     |
| `updateCompanies`, `updateContacts`, `updateDeals` | ändert je Zeile den Datensatz mit der `id` |
| `upsertCompanies`, `upsertContacts`, `upsertDeals` | ändert, wenn es ihn gibt, sonst neu        |

Zugeordnet wird beim Upsert über die `id`, sonst bei Firmen über die Domain
(`https://www.acme.de/` und `acme.de` sind dieselbe) und bei Kontakten über
die E-Mail-Adresse. Geschäfte haben kein solches Merkmal; ohne `id` entsteht
ein neues. Trifft eine Zeile auf einen Datensatz, den der Schlüssel nicht
sehen darf, wird sie abgelehnt statt doppelt angelegt.

Alles läuft in einer Transaktion, jede Zeile mit eigenem Savepoint: eine
fehlerhafte Zeile kostet nur sich selbst. Jede Zeile nimmt denselben Weg wie
einzeln — Rechte, Feld- und Zeilenrechte, Pflichtfelder je Phase,
Protokoll und Webhooks gelten unverändert. Die Antwort sagt je Zeile, was
geschah:

```bash
curl -fsS https://ihre-adresse.de/graphql \
  -H "Authorization: Bearer $STEGWERK_SCHLUESSEL" \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation($z:[UpsertContactInput!]!){upsertContacts(inputs:$z){created updated rejected rows{index id action error}}}",
       "variables":{"z":[{"firstName":"Eva","lastName":"Berg","email":"eva@seewind.de"},
                         {"firstName":"Jan","lastName":"Kurz","email":"kein-at"}]}}'
```

```json
{
  "created": 1,
  "updated": 0,
  "rejected": 1,
  "rows": [
    { "index": 0, "id": "…", "action": "created", "error": null },
    {
      "index": 1,
      "id": null,
      "action": null,
      "error": "E-Mail: bitte eine gültige E-Mail-Adresse."
    }
  ]
}
```

## Was ein Schlüssel nicht kann

Nicht alles im Programm ist eine Frage von Rechten. Diese Dinge setzen einen
Menschen mit einem eigenen Konto voraus und werden abgewiesen, gleich welche
Rechte der Schlüssel trägt:

- den zweiten Faktor einrichten oder abschalten
- die eigene E-Mail-Adresse bestätigen
- den Arbeitsbereich wechseln
- einen Tarif bestellen oder das Kundenportal öffnen
- die eigene Aufgabenerinnerung einstellen
- ein eigenes Postfach verbinden, abrufen, einstellen oder darüber Mails
  senden; die Post in den Akten lesen kann ein Schlüssel mit den Rechten dafür
- eine Einladung annehmen
- den Arbeitsbereich exportieren oder löschen — das darf nur der Inhaber
- eine Auftragsbestätigung oder einen Lieferschein als Anhang ans Angebot
  legen; das PDF gibt es über `/begleitbelege/<id>/pdf`
- **weitere Schlüssel anlegen** — sonst erneuerte ein Schlüssel sich selbst
  und liefe nie ab

## Widerrufen

Unter **Team → Schlüssel**, und es wirkt sofort: geprüft wird bei jeder
einzelnen Anfrage, nicht beim Aufbau einer Sitzung. Es gibt keine Sitzung, die
noch eine Weile weiterliefe.

Die Zeile bleibt in der Liste stehen. Das Änderungsprotokoll verweist auf sie,
und ein Eintrag, der auf nichts zeigt, ist schlimmer als einer, der auf etwas
Abgeschaltetes zeigt.

## Ratschläge

- **Nur geben, was gebraucht wird.** Ein Schlüssel für die Auftragsübernahme
  braucht `company:write` und sonst nichts; er soll keine Rechnungen sehen.
- **Eine Frist setzen**, wenn absehbar ist, wie lange er gebraucht wird.
- **In eine Umgebungsvariable**, nicht in den Quelltext und nicht in eine
  Datei, die in die Versionsverwaltung wandert.
- **Einen je Programm.** Zwei Programme an einem Schlüssel heißt: beide
  stehen still, wenn man ihn für eines widerrufen muss.
- Die Spalte **Zuletzt benutzt** sagt, woran noch etwas hängt. Was seit einem
  Jahr nicht mehr vorgezeigt wurde, gehört widerrufen.

## Grenzen

- Höchstens 25 gültige Schlüssel je Arbeitsbereich. Widerrufene zählen nicht
  mit.
- Es gilt dieselbe Drosselung wie für alle anderen Anfragen.

## KI-Assistenten

Wie man Claude und andere Assistenten über MCP anbindet, steht in
[mcp.md](mcp.md).
