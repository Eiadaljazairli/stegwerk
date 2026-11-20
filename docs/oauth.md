# Postfach und Kalender über Google und Microsoft (OAuth)

Ohne diese Einrichtung verbinden Kundinnen und Kunden Postfach und Kalender
mit IMAP/SMTP bzw. CalDAV und einem App-Passwort. Mit ihr erscheinen in
„Postfach“ und im Kalender-Dialog die Knöpfe „Mit Google verbinden“ und
„Mit Microsoft verbinden“. Ein Anbieter erscheint nur, wenn Client-ID **und**
Geheimnis gesetzt sind.

Dieselben Kennungen dienen auch zum Anmelden bei Stegwerk mit Google oder
Microsoft; dafür kommt eine zweite Rückrufadresse dazu
(docs/anmelden-microsoft-google.md).

## Was dabei passiert

- Anmeldung mit Authorization Code, PKCE (S256) und `state`. Der Vorgang gilt
  zehn Minuten, genau einmal und nur im Browser, der ihn begonnen hat
  (Cookie `stegwerk_oauth`, Pfad `/oauth`).
- Zugriffs- und Erneuerungstoken liegen versiegelt in `oauth_zugaenge`, mit
  demselben Schlüssel wie Postfach-Passwörter (`MAIL_ENCRYPTION_KEY`).
- Postfach: IMAP und SMTP mit XOAUTH2 gegen feste Server
  (`imap.gmail.com`/`smtp.gmail.com`, `outlook.office365.com`/`smtp.office365.com`).
- Kalender: Google über CalDAV (`apidata.googleusercontent.com`) mit Token,
  Microsoft über Graph (`graph.microsoft.com`). Abgleich wie bei CalDAV:
  beide Richtungen, alle zehn Minuten, die jüngere Änderung gewinnt.
- Serien in Outlook: einzeln geänderte und ausgefallene Tage liest Stegwerk
  über den Abruf der Serie (`cancelledOccurrences`, `exceptionOccurrences`)
  und schreibt sie auf die jeweilige Instanz (PATCH bzw. DELETE). Die
  Wiederholung selbst wird nur geschrieben, wenn sie sich ändert, weil
  Outlook dabei alle einzeln geänderten Tage verwirft; danach werden sie neu
  gesetzt. Ein in Outlook gelöschter Tag lässt sich über Graph nicht
  wiederherstellen.
- Lehnt der Anbieter das Erneuern ab (Zugriff widerrufen, Passwort geändert,
  Konto gesperrt), steht am Postfach bzw. Kalender „Bitte neu verbinden“.

## Rückrufadresse

```
<OAUTH_REDIRECT_ORIGIN>/oauth/rueckruf
```

Ohne `OAUTH_REDIRECT_ORIGIN` gilt `WEB_ORIGIN`, im Betrieb also z. B.
`https://crm.example.com/oauth/rueckruf` (nginx reicht `/oauth` an den Server).
Lokal mit Vite auf 5273 und der API auf 4000:
`OAUTH_REDIRECT_ORIGIN=http://localhost:4000`.

## Google

1. Google Cloud Console → neues Projekt.
2. „APIs & Dienste“ → Bibliothek: **Gmail API** und **Google Calendar API**
   aktivieren.
3. „OAuth-Zustimmungsbildschirm“: Typ *Extern*, App-Name, Support-Adresse,
   Domain, Links zu Datenschutz und Impressum. Bereiche:
   `openid`, `email`, `https://mail.google.com/`,
   `https://www.googleapis.com/auth/calendar`.
4. „Anmeldedaten“ → OAuth-Client-ID → *Webanwendung*, autorisierte
   Weiterleitungs-URI: die Rückrufadresse oben.
5. `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET` in `.env` setzen.

`mail.google.com` und `calendar` sind *eingeschränkte* bzw. *sensible*
Bereiche. Solange die App im Testmodus ist, können nur eingetragene
Testnutzer (höchstens 100) verbinden, und die Freigabe läuft nach sieben
Tagen ab. Für alle Kunden braucht es die Überprüfung durch Google, für
`mail.google.com` zusätzlich ein Sicherheitsgutachten (CASA).

## Microsoft

1. Microsoft Entra Admin Center → App-Registrierungen → Neue Registrierung.
2. Kontotypen: „Konten in einem beliebigen Organisationsverzeichnis und
   persönliche Microsoft-Konten“ (dann `MICROSOFT_TENANT=common`) oder nur
   Firmenkonten (`organizations`).
3. Umleitungs-URI, Plattform *Web*: die Rückrufadresse oben.
4. API-Berechtigungen (delegiert): `openid`, `email`, `offline_access`,
   Office 365 Exchange Online `IMAP.AccessAsUser.All` und `SMTP.Send`,
   Microsoft Graph `Calendars.ReadWrite`.
5. „Zertifikate & Geheimnisse“ → neuer geheimer Clientschlüssel (läuft ab,
   spätestens nach 24 Monaten — Termin notieren).
6. `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT`
   in `.env` setzen.

In Microsoft 365 muss SMTP AUTH für das Postfach erlaubt sein (in vielen
Mandanten standardmäßig aus); sonst liest Stegwerk, sendet aber nicht.
Manche Mandanten verlangen außerdem die Zustimmung eines Administrators.

## Danach

`cd /opt/stegwerk && bash scripts/vps-deploy.sh` — die Migration
`1792304100000-OAuthZugaenge` läuft mit. Die Knöpfe erscheinen sofort.
