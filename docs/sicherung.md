# Sicherungen

Jede Nacht um 03:20 sichert der Server die Datenbank nach
`/var/backups/stegwerk` (14 Tage). Ist die Sicherung außer Haus eingerichtet,
entsteht dazu eine **verschlüsselte** Kopie — Datenbank und `.env.prod` —, die
ein Rechner im Büro jeden Tag abholt (die letzten 30 bleiben dort).

## Einmal einrichten (Abholen auf einen Windows-Rechner)

1. Auf dem Server:

   ```
   cd /opt/stegwerk && bash scripts/sicherung-einrichten.sh
   ```

   Es zeigt einmal den **geheimen Schlüssel** (`AGE-SECRET-KEY-…`). Sicher
   aufbewahren (Passwortmanager oder ausgedruckt), dann Enter. Er wird danach
   vom Server gelöscht; ohne ihn lässt sich keine Sicherung öffnen.

2. Das Skript zeigt einen Block für PowerShell. Auf dem Rechner im Büro:
   Start-Menü → „PowerShell“ → einfügen → Enter. Er legt einen SSH-Schlüssel
   an, das Abholskript und eine tägliche Aufgabe (9 Uhr, holt nach, wenn der
   Rechner aus war).

3. PowerShell zeigt danach eine gelbe Zeile
   `bash scripts/sicherung-einrichten.sh freigeben '…'` — die auf dem Server
   in `/opt/stegwerk` ausführen.

4. Prüfen: in PowerShell `Start-ScheduledTask Stegwerk-Sicherung`. Auf dem
   Desktop erscheint `Stegwerk-Sicherungen` mit den Dateien und einer
   `protokoll.txt`.

Der Rechner holt mit dem Benutzer `sicherung`: nur SFTP, nur lesen, kein
Kennwort, keine Shell.

## Zurückholen

Mit `age` (https://github.com/FiloSottile/age/releases) und dem geheimen
Schlüssel in `schluessel.txt`:

```
age -d -i schluessel.txt stegwerk-DATUM.tar.age > sicherung.tar
tar -xf sicherung.tar
# ergibt datenbank.dump und env.prod
```

`datenbank.dump` auf den Server kopieren und mit
`stegwerk-zurueckspielen datenbank.dump` einspielen; `env.prod` nach
`/opt/stegwerk/.env.prod` (nur bei einem neuen Server).

## Alternativ: auf ein Webhosting-Konto hochladen

```
bash scripts/sicherung-einrichten.sh hosting BENUTZER@ADRESSE 65002
```

## Stand auf der Betriebsseite

Nach jedem Lauf schreibt `stegwerk-sichern` den Stand nach
`/var/lib/stegwerk/stand/sicherung-stand.json` (Zeit, Größe, Prüfung,
Zahl der Sicherungen, ob und wie viele verschlüsselte Kopien außer Haus
bereitliegen). Scheitert ein Lauf, steht der Grund in
`sicherung-fehler.json`. Das Verzeichnis ist schreibgeschützt in den
API-Container eingehängt; darin stehen keine Daten, nur Zeiten und Zahlen.

Mehr → Betrieb zeigt unter „Sicherung“ die letzte Sicherung, die Kopien
außer Haus und den letzten Wiederherstellungstest und warnt,

- wenn die letzte Sicherung älter als 26 Stunden ist,
- wenn der letzte Lauf gescheitert ist,
- wenn keine Kopie den Server verlässt,
- wenn der letzte Wiederherstellungstest älter als acht Tage ist oder
  gescheitert ist.

Ob der Rechner im Büro die Kopie wirklich abgeholt hat, sieht der Server
nicht; das steht in `protokoll.txt` auf dem Büro-Rechner.

## Wiederherstellungstest

Jeden Sonntag um 04:30 spielt `stegwerk-probe` (scripts/sicherung-probe.sh)
die neueste Sicherung in einen frischen Postgres-Container ohne Netz ein,
mit demselben Abbild wie im Betrieb. Danach vergleicht es die Zeilenzahlen
von `workspaces`, `users`, `memberships`, `companies`, `contacts`, `deals`
und `invoices` mit dem Betrieb und schreibt Ergebnis und Dauer nach
`sicherung-probe.json`. Der Container wird danach entfernt; die Datenbank
des Betriebs wird nur gelesen.

Von Hand: `systemctl start stegwerk-probe`, Ausgabe mit
`journalctl -u stegwerk-probe -n 30`.

Die gemessene Dauer ist die Zeit für das Einspielen der Datenbank allein.
Eine echte Wiederherstellung braucht dazu den Weg der Datei auf den Server
und das Neustarten der Anwendung.

## Textvorschlag für LEGAL_BACKUP_DESCRIPTION

Die Angabe im AVV (Anlage 2, Wiederherstellbarkeit) bleibt leer, bis der
Betreiber sie in `.env.prod` einträgt. Ein Vorschlag, der nur beschreibt, was
diese Anlage tatsächlich tut — erst eintragen, wenn die Abholung auf den
Büro-Rechner eingerichtet ist und der erste Wiederherstellungstest
bestanden hat:

> Die Datenbank wird täglich gesichert; jede Sicherung wird nach dem
> Schreiben auf Lesbarkeit geprüft. Auf dem Server werden die Sicherungen
> 14 Tage aufbewahrt, eine verschlüsselte Kopie wird täglich auf einen
> gesonderten Rechner übertragen; dort bleiben die letzten 30 Kopien. Die
> Wiederherstellung der jeweils neuesten Sicherung wird wöchentlich
> automatisch erprobt.
