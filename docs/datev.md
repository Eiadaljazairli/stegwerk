# DATEV-Export

Rechnungen → **DATEV-Export** → Monat wählen → Herunterladen. Oder
`GET /invoices/datev?from=2026-10-01&to=2026-10-31`.

## Einrichten

Im Briefkopf, Abschnitt **DATEV**: Beraternummer (4–7 Ziffern) und
Mandantennummer (1–5 Ziffern) von der Kanzlei, dazu der Kontenrahmen. Ohne
die Nummern gibt es keinen Export, weil DATEV einen Stapel ohne sie ablehnt.

## Was in der Datei steht

DATEV-Format (EXTF), Version 700, Kategorie 21 „Buchungsstapel“,
Formatversion 13. Windows-1252, Zeilenende CRLF, Sachkontenlänge 4.

Eine Buchung je Rechnung und Steuersatz, **brutto** vom Sammeldebitor 10000
auf das Erlöskonto:

| | SKR03 | SKR04 |
|---|---|---|
| 19 % | 8400 | 4400 |
| 7 % | 8300 | 4300 |
| 0 % ohne Grund (wird nicht mehr gestellt) und Nullsatz § 12 Abs. 3 | 8200 | 4200 |
| 0 %, Reverse Charge im Inland (§ 13b UStG) | 8337 | 4337 |
| 0 %, Reverse Charge ins EU-Ausland (§ 3a Abs. 2 UStG) | 8338 | 4338 |
| 0 %, innergemeinschaftliche Lieferung (§ 4 Nr. 1b UStG) | 8125 | 4125 |
| 0 %, Ausfuhr ins Drittland (§ 4 Nr. 1a UStG) | 8120 | 4120 |
| 0 %, sonstige steuerfreie Umsätze (§ 4 Nr. 8 ff. UStG) | 8100 | 4100 |
| Kleinunternehmer (§ 19 UStG) | 8195 | 4185 |

Welches 0-%-Konto, entscheidet der Grund der Steuerbefreiung auf der
Rechnung. Auch diese Konten sind in den DATEV-Standardkontenrahmen
Automatikkonten mit eigener Zeile in Voranmeldung bzw. ZM; ein
BU-Schlüssel ist deshalb auch hier nicht gesetzt. Für den Nullsatz nach
§ 12 Abs. 3 gibt es kein belegtes eigenes Konto; er geht auf 8200/4200, die
Kanzlei ordnet zu.

8400/4400 und 8300/4300 sind Automatikkonten: DATEV rechnet die Steuer
selbst heraus, ein BU-Schlüssel ist nicht nötig. Belegfeld 1 ist die
Rechnungsnummer, Buchungstext der Kunde. Eine Rechnungskorrektur steht mit
„H“ statt „S“ darin, nicht mit negativem Betrag. Stornierte Rechnungen und
ihre Korrekturen sind beide enthalten; zusammen ergeben sie null.

Gefüllt sind die ersten vierzehn Felder einer Buchung; die übrigen sind
optional.

## Grenzen

- Ein Stapel umfasst ein Wirtschaftsjahr, angenommen als Kalenderjahr.
- Keine Debitorennummern je Kunde; die Kanzlei ordnet über das Belegfeld zu.
- Geprüft gegen die Feldbeschreibung, nicht gegen DATEV selbst: DATEV gibt
  es nur in der Kanzlei. Vor dem ersten echten Monat einen Probeimport bei
  der Kanzlei machen lassen.
