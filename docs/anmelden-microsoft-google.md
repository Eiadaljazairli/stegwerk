# Anmelden mit Google und Microsoft

Ohne diese Einrichtung melden sich alle mit E-Mail-Adresse und Passwort an.
Mit ihr erscheinen auf „Anmelden“ und „Registrieren“ die Knöpfe „Mit Google
anmelden“ und „Mit Microsoft anmelden“, und unter Team → Mein Konto der
Abschnitt „Anmelden mit Google und Microsoft“ zum Verknüpfen und Trennen.
Ein Anbieter erscheint nur, wenn Client-ID **und** Geheimnis gesetzt sind.

Es sind dieselben Kennungen wie für Postfach und Kalender (docs/oauth.md).
Wer die dort schon eingerichtet hat, trägt bei Google und Microsoft nur die
zweite Rückrufadresse ein (Schritt „Rückrufadresse“) — mehr nicht.

## Was dabei passiert

- OpenID Connect mit Authorization Code, PKCE (S256), `state` und `nonce`.
  Der Vorgang gilt zehn Minuten, genau einmal und nur im Browser, der ihn
  begonnen hat (Cookie `stegwerk_anmeldung`, Pfad `/oauth/anmelden`).
- Die Rückkehr gibt der Oberfläche eine Einlösemarke im Fragment der
  Adresse, fünf Minuten gültig. Eingelöst wird sie nur zusammen mit einem
  zweiten Cookie aus dem Rückruf (`stegwerk_einloesung`, Pfad `/graphql`):
  ein abgefangener und weitergereichter Link meldet niemanden an.
- Fehler kommen als Kennzeichen zurück (`?sso=fehler&grund=kein_konto`), den
  Satz dazu nimmt die Oberfläche aus einer festen Tabelle. Text aus der
  Adresse wird nie angezeigt.
- Stegwerk fragt nur `openid`, `email` und `profile` an: wer jemand ist,
  nichts aus Postfach oder Kalender. Zugriffstoken werden nicht gespeichert.
- Das `id_token` wird gegen die veröffentlichten Schlüssel des Anbieters
  geprüft (Signatur RS256, Aussteller, Empfänger = Client-ID, Ablauf, nonce).
- Ein Konto bei Google oder Microsoft wird an seiner festen Kennung erkannt
  (Google `sub`, Microsoft Mandant und Objekt-ID), nicht an der Adresse.
- Ein bestehendes Stegwerk-Konto wird beim ersten Anmelden mit Google nur
  verknüpft, wenn Google die Adresse als bestätigt meldet **und** die
  Adresse in Stegwerk bestätigt ist. Microsoft bestätigt Adressen nicht
  verlässlich (ein Mandant kann seinen Leuten jede Adresse eintragen); dort
  verknüpft die Person ihr Konto selbst, angemeldet und mit Passwort, unter
  Team → Mein Konto.
- Neue Konten über Google gelten als bestätigt; über Microsoft bekommen sie
  die übliche Bestätigungsmail. Konten ohne eigenes Passwort legen eines
  über einen Link per Mail fest. Setzt jemand über „Passwort vergessen“ das
  Passwort eines Kontos mit noch unbestätigter Adresse, werden dessen
  Verknüpfungen mit Google und Microsoft entfernt: so behält niemand, der
  ein Konto vorab mit fremder Adresse über Microsoft angelegt hat, einen Weg
  hinein.
- Ist die Zwei-Faktor-Anmeldung eingeschaltet, fragt Stegwerk danach auch
  hier nach dem Code. Die Zwei-Faktor-Pflicht eines Arbeitsbereichs gilt
  unverändert.
- Jede Anmeldung, Verknüpfung und Trennung steht im Sicherheitsprotokoll;
  bei einer neuen Verknüpfung geht eine Mail an die Kontoadresse.

## Rückrufadresse

```
<OAUTH_REDIRECT_ORIGIN>/oauth/anmelden/rueckruf
```

Ohne `OAUTH_REDIRECT_ORIGIN` gilt `WEB_ORIGIN`, im Betrieb also
`https://crm.example.com/oauth/anmelden/rueckruf` (nginx reicht `/oauth` an den
Server). Lokal mit Vite auf 5273 und der API auf 4000:
`OAUTH_REDIRECT_ORIGIN=http://localhost:4000`, Rückruf
`http://localhost:4000/oauth/anmelden/rueckruf`.

## Google

1. [Google Cloud Console](https://console.cloud.google.com/) öffnen und
   oben ein Projekt wählen oder ein neues anlegen (z. B. „Stegwerk“).
2. „APIs & Dienste“ → „OAuth-Zustimmungsbildschirm“:
   - Nutzertyp **Extern**.
   - App-Name „Stegwerk“, Support-Adresse, Logo nach Wunsch.
   - Autorisierte Domain: `crm.example.com`.
   - Links zur Datenschutzerklärung (`https://crm.example.com/datenschutz`) und
     zum Impressum bzw. den Bedingungen.
   - Bereiche: `openid`, `.../auth/userinfo.email`,
     `.../auth/userinfo.profile`. Diese drei gehören nicht zu den sensiblen
     Bereichen.
   - Veröffentlichungsstatus auf **In Produktion** stellen. Im Status
     „Testen“ können sich nur eingetragene Testnutzer anmelden.
3. „APIs & Dienste“ → „Anmeldedaten“ → „Anmeldedaten erstellen“ →
   „OAuth-Client-ID“:
   - Anwendungstyp **Webanwendung**, Name z. B. „Stegwerk“.
   - Autorisierte Weiterleitungs-URIs:
     `https://crm.example.com/oauth/anmelden/rueckruf`
     (und, falls Postfach/Kalender genutzt werden,
     `https://crm.example.com/oauth/rueckruf`).
   - „Erstellen“ zeigt Client-ID und Clientschlüssel.
4. Beide in `.env.prod` eintragen (siehe unten).

## Microsoft (Entra)

1. [Microsoft Entra Admin Center](https://entra.microsoft.com/) →
   „Identität“ → „Anwendungen“ → „App-Registrierungen“ → „Neue
   Registrierung“.
2. Name „Stegwerk“. Unterstützte Kontotypen: **Konten in einem beliebigen
   Organisationsverzeichnis (beliebiger Microsoft Entra ID-Mandant –
   mehrinstanzenfähig) und persönliche Microsoft-Konten**. Dazu gehört
   `MICROSOFT_TENANT=common`.
   - Nur Firmenkonten: „beliebiges Organisationsverzeichnis“ und
     `MICROSOFT_TENANT=organizations`.
   - Nur das eigene Unternehmen: „nur dieses Organisationsverzeichnis“ und
     als `MICROSOFT_TENANT` die Verzeichnis-ID (Mandanten-ID) aus der
     Übersicht.
3. Umleitungs-URI: Plattform **Web**,
   `https://crm.example.com/oauth/anmelden/rueckruf`. „Registrieren“.
4. In der Übersicht die **Anwendungs-ID (Client-ID)** notieren.
5. „Zertifikate & Geheimnisse“ → „Neuer geheimer Clientschlüssel“, Ablauf
   wählen (höchstens 24 Monate — Termin notieren, vorher erneuern). Den
   **Wert** (nicht die Geheimnis-ID) sofort kopieren; er wird nur einmal
   angezeigt.
6. „API-Berechtigungen“: delegiert `openid`, `email`, `profile` (Microsoft
   Graph). `User.Read` ist schon da und darf bleiben.
7. „Tokenkonfiguration“ → „Optionalen Anspruch hinzufügen“ → Tokentyp
   **ID** → `email`. Ohne ihn nennt Microsoft bei manchen Firmenkonten die
   Adresse nur als Benutzername.
8. Wer Postfach und Kalender schon über diese App-Registrierung verbindet,
   ergänzt unter „Authentifizierung“ nur die zweite Umleitungs-URI.

## In .env.prod

Auf dem Server in `/opt/stegwerk/.env.prod`:

```
GOOGLE_CLIENT_ID=…apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=…
MICROSOFT_CLIENT_ID=…
MICROSOFT_CLIENT_SECRET=…
MICROSOFT_TENANT=common
# Nur, wenn der Server nicht unter WEB_ORIGIN erreichbar ist:
OAUTH_REDIRECT_ORIGIN=
```

`MAIL_ENCRYPTION_KEY` muss gesetzt sein (der PKCE-Verifier liegt für die
zehn Minuten versiegelt in der Datenbank). Danach
`cd /opt/stegwerk && bash scripts/vps-deploy.sh` — die Migration
`1792600010000-AnmeldenMitGoogleMicrosoft` läuft mit, die Knöpfe erscheinen
sofort.

## Prüfen

1. Abgemeldet `https://crm.example.com/anmelden` öffnen: die Knöpfe stehen über
   dem Formular.
2. „Mit Google anmelden“ mit einem Konto, das es in Stegwerk noch nicht gibt:
   Stegwerk meldet, dass zuerst registriert werden muss.
3. Unter „Registrieren“ einen Arbeitsbereich eintragen, „Mit Google
   registrieren“: man landet angemeldet in der Übersicht.
4. Unter Team → Mein Konto → „Anmelden mit Google und Microsoft“ Microsoft
   verknüpfen, abmelden, mit Microsoft wieder anmelden.

Scheitert der Rückruf mit „redirect_uri_mismatch“ (Google) oder „AADSTS50011“
(Microsoft), stimmt die eingetragene Rückrufadresse nicht genau mit der oben
überein — auf `https`, Schrägstriche und Schreibweise achten.
