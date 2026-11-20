# E-Rechnung (ZUGFeRD und XRechnung)

Eine gestellte Rechnung ist auf zwei Wegen eine E-Rechnung:

- **ZUGFeRD**: Das PDF der Rechnung (`GET /invoices/:id/pdf`, Knopf
  „PDF (ZUGFeRD)“) ist ein PDF/A-3b mit eingebetteter `factur-x.xml` im
  Profil EN 16931. Das geht auch an Mahnungen und überall sonst hin, wo das
  PDF verwendet wird.
- **XRechnung**: die reine XML-Datei in UBL, Knopf „XRechnung“ oder
  `GET /invoices/:id/xrechnung`. Behörden verlangen sie.

## Warum

| Seit | Pflicht |
|---|---|
| 1. 1. 2025 | Jedes Unternehmen in Deutschland muss E-Rechnungen **empfangen** können. |
| 1. 1. 2027 | Wer im Vorjahr mehr als 800 000 € Umsatz hatte, muss sie im B2B-Geschäft **ausstellen**. |
| 1. 1. 2028 | Alle müssen sie ausstellen. |

Ein PDF ist danach keine Rechnung im Sinne von § 14 UStG mehr, sondern nur
eine Ansicht. Gemeint ist ein strukturiertes Format nach EN 16931. XRechnung
ist die deutsche Ausprägung davon; Behörden verlangen sie, und jede
Buchhaltung nimmt sie an.

## Was hineingeht

| Quelle | Felder |
|---|---|
| Rechnung | Nummer, Datum, Leistungsdatum, Fälligkeit, Positionen, Summen, Einleitung und Schluss als Hinweise, Käuferreferenz |
| Briefkopf | Name, Anschrift, E-Mail, Telefon, Vertreter als Ansprechpartner, USt-IdNr. und/oder Steuernummer, Registereintrag, IBAN und BIC |
| Anschriftfeld der Rechnung | Name, Straße, PLZ, Ort, Land des Empfängers (gelesen nach DIN 5008, sonst aus der Firma) |
| Firma | Rechnungs-E-Mail, sonst die E-Mail des Ansprechpartners |

Die Summen kommen aus derselben Funktion wie PDF und Bildschirm
(`quoteTotals`). Rabatte stehen als Abschlag auf der Zeile, der Preis bleibt
der aus dem Artikelstamm. Eine Rechnungskorrektur ist Typ 384 mit Verweis
auf die Ursprungsrechnung und negativen Beträgen, wie auf dem PDF.
Kleinunternehmer stehen mit Kategorie E und der Begründung nach § 19 UStG
darin.

## Steuerbefreiung (0 %)

Positionen mit 0 % stehen in der Kategorie des Befreiungsgrunds, den die
Rechnung trägt (`server/src/quotes/steuerbefreiung.ts`):

| Grund | Kategorie (BT-118/151) | BT-121 | BT-120 |
|---|---|---|---|
| Reverse Charge Inland (§ 13b) | AE | VATEX-EU-AE | Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG). |
| Reverse Charge EU-Ausland | AE | VATEX-EU-AE | Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge) … |
| Innergemeinschaftliche Lieferung | K | VATEX-EU-IC | Steuerfreie innergemeinschaftliche Lieferung (§ 4 Nr. 1 Buchst. b i. V. m. § 6a UStG). |
| Ausfuhr | G | VATEX-EU-G | Steuerfreie Ausfuhrlieferung (§ 4 Nr. 1 Buchst. a i. V. m. § 6 UStG). |
| Sonstiger steuerfreier Umsatz | E | — | Steuerfreier Umsatz: *Rechtsgrundlage aus der Rechnung*. |
| Nullsatz § 12 Abs. 3 | Z | — | — (BR-Z-10 verbietet einen Grund) |

Die USt-IdNr. des Empfängers steht als BT-48 beim Käufer. Bei K steht
zusätzlich ein Lieferort mit Land (BR-IC-12); angenommen wird die Anschrift
des Empfängers. Der Pflichtsatz steht außerdem als Hinweis (BT-22), wie auf
dem PDF. Ohne Grund stünde 0 % als Z; eine solche Rechnung lässt sich aber
nicht mehr stellen (`invoiceGaps`).

Geprüft mit dem KoSIT-Validator 1.5.0 und der Konfiguration XRechnung 3.0.2:
Beispiele für AE (Inland mit nur Steuernummer, EU), K, G und E sowie eine
aus der Anwendung gestellte Reverse-Charge-Rechnung und ihre Korrektur sind
**ACCEPTABLE**, ohne Warnung.

Fehlt eine Pflichtangabe, sagt die Rechnung vorher, welche und wo sie
nachzutragen ist (`xrechnungLuecken`). Die Datei wird dann nicht erzeugt,
statt beim Empfänger abgelehnt zu werden.

## Prüfen

Jede Änderung an `server/src/invoices/xrechnung.ts` wird gegen den Validator
der KoSIT geprüft, der Stelle, die XRechnung herausgibt. Die Unit-Tests
brauchen kein Java; sie können die Beispieldateien aber schreiben:

```sh
mkdir -p /tmp/xr/out
XRECHNUNG_AUSGABE=/tmp/xr/out npx jest src/invoices/xrechnung.spec.ts

# einmalig
curl -LO https://github.com/itplr-kosit/validator/releases/download/v1.5.0/validator-1.5.0-distribution.zip
curl -LO https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/release-2024-10-31/validator-configuration-xrechnung_3.0.2_2024-10-31.zip
unzip validator-1.5.0-distribution.zip -d validator
unzip validator-configuration-xrechnung_3.0.2_2024-10-31.zip -d config

java -jar validator/validationtool-1.5.0-standalone.jar \
  -s config/scenarios.xml -r config -o /tmp/xr/report /tmp/xr/out/*.xml
```

Stand bei Einführung: alle Beispiele (Rechnung, Korrektur,
Kleinunternehmer, null Prozent, Leitweg-ID, nur Steuernummer) und eine echte
Rechnungskorrektur aus der Anwendung **ACCEPTABLE**, ohne Fehler.

Zwei Regeln, an denen es beim Entwickeln hing, und warum der Code sie so
behandelt:

- **PEPPOL-EN16931-R010**: der Empfänger braucht eine elektronische Adresse.
  Deshalb gibt es an der Firma die Rechnungs-E-Mail. Eine gestellte
  Rechnung ist gesperrt, die Firma nicht; so bekommt auch eine Rechnung ohne
  Ansprechpartner nachträglich ihre E-Rechnung.
- **BR-CO-26**: der Verkäufer muss erkennbar sein, über USt-IdNr.,
  Registereintrag oder eine Kennung. Hat der Briefkopf nur eine
  Steuernummer, steht sie als Kennung (BT-29).

## ZUGFeRD

Umsetzung: `server/src/invoices/zugferd.ts` (die XML in CII) und
`server/src/documents/pdfa.ts` (PDF/A-3b, Einbettung, XMP). Referenz ist die
Factur-X-Spezifikation 1.0.07 (gleich ZUGFeRD 2.3), Profil EN 16931; Mustang
dient als zweite Meinung.

| Stelle | Umsetzung |
|---|---|
| XML | UN/CEFACT CII D16B, Kennung `urn:cen.eu:en16931:2017`, dieselbe Eingabe, Rundung, Rabatte und Steuerkategorien wie die XRechnung |
| Einbettung | `factur-x.xml`, `/Subtype /text#2Fxml`, Prüfsumme, Änderungsdatum, `/AFRelationship /Alternative` (deutsche Lesart), `/AF` im Katalog |
| XMP | pdfaid 3/B, Factur-X-Erweiterungsschema, `fx:DocumentType INVOICE`, `fx:DocumentFileName factur-x.xml`, `fx:Version 1.0`, `fx:ConformanceLevel EN 16931` |
| Farben | Ausgabebedingung sRGB IEC61966-2.1 (pdfkit) |
| Schriften | Liberation Sans eingebettet statt der eingebauten Helvetica, gleiche Laufweiten (SIL OFL 1.1, `server/src/documents/schriften/LICENSE.txt`) |

Nur eine gestellte Rechnung bekommt die Datei; ein Entwurf bleibt ein
gewöhnliches PDF. EN 16931 verlangt weniger als XRechnung
(`zugferdLuecken`): Firmenname und USt-IdNr. oder Steuernummer im Briefkopf
und den Namen des Empfängers. E-Mail, Telefon und IBAN kommen hinein, wenn es
sie gibt. Ein Logo als CMYK-JPEG darf nicht in ein PDF/A mit sRGB; dann
sagt die Rechnung, dass das Logo als RGB gebraucht wird. Fehlt etwas, bleibt
das PDF ohne eingebettete Datei, statt eine ungültige E-Rechnung zu sein.

Zwei Stellen, an denen pdfkit 0.15 allein nicht reicht:

- pdfkit schreibt Titel und Autor ungeschützt ins XMP. Ein „&“ im
  Firmennamen machte das XMP ungültig; `pdfa.ts` schreibt diesen Teil
  geschützt selbst.
- pdfkit hängt im PDF/A-Modus an jede Schrift ein festes CIDSet, das nicht
  zur Teilschrift passt (veraPDF: ISO 19005-3, 6.2.11.4.2). Die Schriften
  werden deshalb ohne den Modus eingebettet; PDF/A-3 verlangt kein CIDSet.

### Geprüft

Stand bei Einführung (21.10.2026):

- **XML**: alle Beispiele aus `zugferd.spec.ts` (Rechnung, Korrektur 384,
  Kleinunternehmer, nur Steuernummer, ohne Bank/E-Mail/Telefon, AE Inland,
  AE EU, K, G, E, Z) gültig gegen das XSD und das Schematron des Profils
  EN 16931 aus dem Python-Paket `factur-x` 7.7 (Dateien „Factur-X 1.09“)
  und gegen die
  EN-16931-CII-Regeln 1.3.12 der KoSIT. Dieselben Dateien mit der Kennung der
  XRechnung: KoSIT-Validator 1.5.0, XRechnung 3.0.2 (CII) **ACCEPTABLE** —
  außer dem Beispiel ohne Bank/E-Mail, das XRechnung bewusst nicht erfüllt.
- **PDF**: veraPDF 1.30.3, Profil PDF/A-3B, **PASS** für eine Rechnung und
  für eine mehrseitige mit Logo (PNG mit Transparenz).
- **Gesamt**: Mustang 2.26.0 (`--action validate`, ZUGFeRD-2.5-Regeln):
  PDF valid, XML valid, Profil EN 16931 — für die Testdateien und für drei
  aus der laufenden Anwendung geladene Rechnungen (gestellt, storniert,
  Rechnungskorrektur).

Nachprüfen:

```sh
mkdir -p /tmp/zf/out
ZUGFERD_AUSGABE=/tmp/zf/out npx jest src/invoices/zugferd.spec.ts src/documents/pdfa.spec.ts

# XML: Factur-X-XSD und Schematron (aus dem PyPI-Paket factur-x)
xmllint --noout --schema facturx/xsd_and_schematron/facturx-en16931/Factur-X_EN16931.xsd /tmp/zf/out/normal.xml
java -cp Saxon-HE.jar net.sf.saxon.Transform -s:/tmp/zf/out/normal.xml \
  -xsl:facturx/xsd_and_schematron/facturx-en16931/FACTUR-X_EN16931.xslt

# PDF und alles zusammen
verapdf --flavour 3b /tmp/zf/out/zugferd.pdf
java -jar Mustang-CLI-2.26.0.jar --action validate --source /tmp/zf/out/zugferd.pdf
```
