# Webhooks

Team → Webhooks → **Neuer Webhook**: Adresse (https) und Ereignisse wählen.
Das Geheimnis zum Prüfen der Signatur wird einmal angezeigt.

## Ereignisse

Für jedes Objekt die vier Grundereignisse:
`<objekt>.created`, `<objekt>.updated`, `<objekt>.deleted`,
`<objekt>.restored` mit `<objekt>` = `company`, `contact`, `deal`, `note`,
`task`, `appointment`, `quote`, `invoice`. Wiederhergestellt werden kann
nur, was im Papierkorb liegt (Firma, Kontakt, Geschäft, Aufgabe).

Dazu wie bisher:

| Ereignis | Wann |
|---|---|
| `deal.stage_changed` | ein Geschäft wechselt die Phase (`data.previousStage`) |
| `deal.won`, `deal.lost` | zusätzlich, wenn die neue Phase gewonnen oder verloren ist |
| `deal.contact_added`, `deal.contact_removed` | ein weiterer Kontakt kommt an ein Geschäft oder geht (`data.dealId`, `data.contactId`, `data.rolle`) |
| `quote.accepted`, `quote.declined` | im Programm oder vom Kunden über den Link (`data.online`) |
| `invoice.issued`, `invoice.paid` | Rechnung gestellt oder als bezahlt gebucht |
| `order_confirmation.issued`, `order_confirmation.cancelled` | Auftragsbestätigung gestellt oder storniert (beim Storno mit `data.stornoNumber`) |
| `delivery_note.issued`, `delivery_note.cancelled` | Lieferschein gestellt oder storniert |

## Zustellung

`POST` mit JSON:

```json
{ "id": "…", "event": "deal.won", "createdAt": "2026-10-18T04:47:22.035Z", "data": { "…": "…" } }
```

Bei `….updated` steht zusätzlich `changes` dabei, Feld für Feld mit dem
Wert vorher und nachher; eigene Felder als `customFields.<schlüssel>`:

```json
{
  "event": "deal.updated",
  "data": { "id": "…", "name": "Wartung 2027", "amount": "4800.00", "…": "…" },
  "changes": { "amount": { "before": "4000.00", "after": "4800.00" } }
}
```

`….deleted` liefert den Stand vor dem Löschen. Bei Terminen kommt
`data.scope` mit (`ONE`, `FOLLOWING`, `SERIES` oder `null`); wird „nur dieser
Termin“ geändert, entsteht ein eigener Einzeltermin und es kommt
`appointment.created` für ihn.

## Was ein Webhook sieht

Ein Webhook liefert, was die Person sehen darf, die ihn angelegt hat — wie
ein Schlüssel:

- Felder, die ihre Rolle verbirgt (etwa den Betrag), fehlen in `data` und in
  `changes`.
- Datensätze, die ihre Zeilenrechte nicht zeigen („nur eigene“), werden gar
  nicht gemeldet; was an einer Akte hängt (Notiz, Aufgabe, Termin, Angebot,
  Rechnung), nach dieser Akte.
- Verlässt die Person das Team, gehen ihre Webhooks an den Nachfolger. Ein
  Webhook ganz ohne Anleger liefert nur Unzugeordnetes und ohne die heiklen
  Felder (Betrag, Wahrscheinlichkeit, Umsatz, E-Mail, Telefon, Anschrift).

Webhooks von vor dieser Regel gehören dem ältesten Inhaber des Bereichs und
liefern deshalb weiter alles.

Kopfzeilen: `X-Stegwerk-Event`, `X-Stegwerk-Timestamp` (Unix-Sekunden),
`X-Stegwerk-Signature: sha256=<hex>`. Antwortet der Empfänger nicht mit
2xx, folgen zwei weitere Versuche (nach 2 und 15 Sekunden). Nach zwanzig
Fehlschlägen hintereinander schaltet sich der Webhook ab; „Einschalten“
setzt die Zählung zurück. Weiterleitungen werden nicht verfolgt.

## Signatur prüfen

HMAC-SHA256 mit dem Geheimnis über `<Zeitstempel>.<Rumpf>`, genau so, wie
der Rumpf ankam:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

const gueltig = (geheimnis, zeitstempel, rumpf, signatur) => {
  const erwartet = `sha256=${createHmac('sha256', geheimnis)
    .update(`${zeitstempel}.${rumpf}`)
    .digest('hex')}`;

  return (
    erwartet.length === signatur.length &&
    timingSafeEqual(Buffer.from(erwartet), Buffer.from(signatur)) &&
    Math.abs(Date.now() / 1000 - Number(zeitstempel)) < 300
  );
};
```

## Sicherheit

Nur https. Adressen, die auf interne Netze zeigen (127/8, 10/8, 172.16/12,
192.168/16, 169.254/16, ::1, fc00::/7 …), werden beim Anlegen und vor
jeder Zustellung abgelehnt, auch wenn sich der DNS-Eintrag später ändert.
Ausnahme nur bei `NODE_ENV=development` oder `test`, zum Ausprobieren auf
dem eigenen Rechner. Das Geheimnis liegt verschlüsselt in der Datenbank
(derselbe Schlüssel wie für die Postfach-Zugangsdaten, `MAIL_ENCRYPTION_KEY`).

# Eingehend: Automationen mit fremdem Auslöser

Automationen → Auslöser „ein fremder Dienst die Eingangsadresse aufruft“ →
in der Liste **Eingang** → **Adresse erzeugen**. Adresse und (mit „Signatur
verlangen“) Geheimnis erscheinen einmal; gespeichert wird von der Adresse
nur der SHA-256-Hash, vom Geheimnis nur die verschlüsselte Form. „Neue
Adresse erzeugen“ macht die alte sofort ungültig.

```
POST https://<api>/public/automationen/<43 Zeichen>
Content-Type: application/json

{ "email": "kunde@example.com", "vorname": "Ada", "bestellung": { "nr": "4711" } }
```

Die Felder stehen den Schritten als `{{ausloeser.email}}`,
`{{ausloeser.bestellung.nr}}` zur Verfügung. Antwort `202 {"ok":true}`;
die Regel läuft danach, ihr Ergebnis steht im Protokoll.

Mit Signatur: Kopfzeilen `X-Stegwerk-Zeitstempel` (Unix-Sekunden, höchstens
fünf Minuten Abweichung) und `X-Stegwerk-Signatur: sha256=<hex>`, gerechnet
wie oben (`HMAC-SHA256(geheimnis, "<zeitstempel>.<rumpf>")`).

## Sicherheit des Eingangs

- Öffentlicher Weg ohne Anmeldung, daher: Drossel 30 Aufrufe je Minute und
  Absender (zusätzlich zur globalen), höchstens 60 Läufe je Regel und
  Minute, Rumpf höchstens 64 KB, nur ein JSON-Objekt, Tiefe begrenzt.
- Unbekannte Adresse, abgeschaltete Regel und falsche Signatur antworten
  gleich (`404`), damit sich von außen nichts abtasten lässt.
- Läuft das Abo des Bereichs nicht mehr, lehnt der Eingang ab wie das
  Webformular.
- Die Regel läuft mit den Rechten ihres Erstellers: sie sieht und ändert
  nur, was er sehen und ändern darf, Feldrechte eingeschlossen.
- Schleifen: Was eine Automation ändert, löst keine weitere aus. Eine
  HTTP-Anfrage einer Automation trägt `X-Stegwerk-Automation-Tiefe`; ein
  Eingang, der so oft schon weitergereicht wurde (ab 3), wird abgelehnt.
- HTTP-Anfragen aus Automationen nutzen denselben Schutz gegen interne
  Adressen wie die ausgehenden Webhooks, höchstens 10 Sekunden und 64 KB
  Antwort. Werte von Kopfzeilen liegen verschlüsselt in der Datenbank und
  erscheinen weder in der Oberfläche noch im Protokoll.
