# Betrieb: Zustand, geplante Läufe, Wartung, Protokolle

Alles hier ist nur für den Betreiber (`BETREIBER_EMAILS`, mit 2FA) unter
*Mehr → Betrieb* zu sehen.

## Systemzustand

Oben auf der Betriebsseite:

| Kachel | Bedeutung |
|---|---|
| Datenbank | Antwortet sie, und wie schnell (eine `SELECT 1`). |
| Migrationen | Migrationen, die der Code kennt, die Datenbank aber nicht hat. Sollte immer „aktuell“ sein — der `migrate`-Container läuft vor der API. |
| Mailversand | `SMTP` oder „nur Datei“: ohne `SMTP_HOST` landet Post im Container unter `var/mail`. |
| Geplante Läufe | Anzahl der Läufe mit Fehler oder ohne Start (siehe unten). |
| Postfächer / Kalender mit Fehler | Verbundene Postfächer und Kalender, deren letzter Abruf scheiterte. Wessen, steht hier bewusst nicht. |
| Google/Microsoft neu verbinden | OAuth-Zugänge, die der Anbieter widerrufen hat. |
| Freier Speicher | Auf dem Datenträger, auf dem die API schreibt. Die Sicherungen liegen außerhalb des Containers; ihren Platz zeigt `vps-deploy.sh`. |

Darunter: die laufende Fassung (`APP_VERSION`, vom Ausrollskript gesetzt:
Stand des Quelltexts und Bauzeit), der Startzeitpunkt und die
Protokollfristen.

## Geplante Läufe

Jeder Zeitgeber (Papierkorb, Postfach-Abruf, Kalender-Abgleich, Erinnerungen,
Serienmails, Serienrechnungen, Automationen, Testphase-Hinweis,
Protokolle aufräumen, Bereiche nach Ablauf löschen) meldet sich beim Start an
und vermerkt jeden Lauf in `geplante_laeufe`: Start, Ende, Dauer, Erfolg oder
Fehler, Fehler in Folge.

| Zustand | Bedeutung |
|---|---|
| läuft | Letzter Lauf erfolgreich. |
| noch nicht gelaufen | Seit dem Start der API noch kein Intervall um. |
| Fehler | Der letzte Lauf warf einen Fehler; der Text steht daneben. |
| ausgeblieben | Seit mehr als zwei Intervallen (plus 5 Minuten) kein Start. Der Zeitgeber steht, oder die API läuft nicht. |
| abgeschaltet | Absichtlich aus (z. B. `RETENTION_SWEEP_ENABLED` nicht gesetzt). |

Postfach-Abruf und Kalender-Abgleich fangen Fehler einzelner Postfächer selbst
ab; dort zeigt „Fehler“ nur, wenn die ganze Runde scheitert. Einzelne
Postfächer stehen in der Kachel „Postfächer mit Fehler“.

## Ankündigung und Wartung

Unter „Ankündigung an alle“: Text, Zeitraum (höchstens vier Wochen) und
optional „Wartung“.

- **Hinweis**: erscheint oben bei allen Angemeldeten im Zeitraum; lässt sich
  wegklicken.
- **Wartung**: zusätzlich nimmt Stegwerk im Zeitraum keine Änderungen an.
  GraphQL-Mutationen und schreibende REST-Aufrufe antworten mit 503 und dem
  Text der Ankündigung. Weiter gehen: Lesen, An- und Abmelden, Passwort
  zurücksetzen, Sitzungen beenden, die öffentlichen Wege unter `/public`
  (Angebot annehmen, Webformular, Abmelden) und `/billing` (Stripe). Der
  Betreiber selbst ist ausgenommen.
- **Beenden** setzt das Ende auf jetzt; eine noch nicht begonnene Ankündigung
  verschwindet ganz.

Notfall ohne Oberfläche: `WARTUNGSMODUS=true` in `.env.prod` und neu
ausrollen. Gilt, bis es wieder entfernt wird.

Der Stand wird 15 Sekunden zwischengespeichert; Ein- und Ausschalten wirkt
also mit bis zu einer Viertelminute Verzug.

## Neue Fassung in offenen Tabs

Der Web-Bau legt `version.json` mit `APP_VERSION` ab (nginx: nie
zwischengespeichert). Offene Tabs fragen beim Zurückkehren und alle fünf
Minuten nach und zeigen bei einer neuen Fassung „Neue Version — Neu laden“.
Sie laden nie selbst neu. Fehlt nach dem Ausrollen ein Teil des alten
Bündels, erscheint derselbe Hinweis statt einer leeren Seite.

## Aufbewahrung der Protokolle

Alle sechs Stunden (Lauf „Protokolle aufräumen“):

| Protokoll | Frist | Variable | Mindestens |
|---|---|---|---|
| Änderungsprotokoll: Änderungen, Löschungen, Wiederherstellungen | 24 Monate | `PROTOKOLL_AENDERUNGEN_MONATE` | 6 |
| Änderungsprotokoll: Anlegen | bleibt, aber ohne die eingetragenen Werte | dieselbe | |
| Sicherheitsprotokoll | 12 Monate | `PROTOKOLL_SICHERHEIT_MONATE` | 3 |

Die Datenschutzerklärung nennt die eingestellten Werte. Folge für die
Auswertungen: die Verweildauer je Phase stützt sich auf das
Änderungsprotokoll und reicht damit höchstens so weit zurück wie die Frist.
