export const FEHLERBEHEBUNG_TITEL = 'Wenn etwas nicht klappt';
export const FEHLERBEHEBUNG_BESCHREIBUNG =
  'Fehlerbehebung für Stegwerk: Postfach holt keine Mails, Kalender-Abo aktualisiert nicht, Code abgelehnt, Konto gesperrt, Import- und E-Rechnungs-Fehler.';

export type Fehlerfall = {
  id: string;
  titel: string;
  meldungen: string[];
  ursachen: string[];
  schritte: string[];
  links?: { to: string; label: string }[];
};

export const FEHLERFAELLE = [
  {
    id: 'postfach-anmeldung',
    titel:
      'Das Postfach holt keine Mails oder sendet nicht: Anmeldung abgelehnt',
    meldungen: [
      'Anmeldung fehlgeschlagen. Benutzername oder Passwort stimmen nicht.',
      'Der Mailserver hat die Anmeldedaten des Postfachs abgelehnt.',
    ],
    ursachen: [
      'Das Passwort des Postfachs wurde geändert, in Stegwerk steht noch das alte.',
      'Der Anbieter verlangt ein App-Passwort, weil für das Konto eine Zwei-Faktor-Anmeldung eingeschaltet ist. Das normale Passwort wird dann für IMAP abgelehnt.',
      'IMAP ist beim Anbieter für dieses Postfach ausgeschaltet.',
      'Als Benutzer steht etwas anderes als die volle Adresse, die der Anbieter erwartet.',
    ],
    schritte: [
      'Unter „Postfach“ das Postfach trennen und mit den aktuellen Zugangsdaten neu verbinden. Die gelesene Post bleibt an den Akten.',
      'Beim Anbieter ein App-Passwort für Stegwerk erzeugen und dieses statt des Kontopassworts eintragen.',
      'In den Einstellungen des Anbieters prüfen, dass IMAP erlaubt ist.',
      'Gmail, Google Workspace und Microsoft 365 lassen sich, wo der Knopf angeboten wird, mit „Mit Google verbinden“ oder „Mit Microsoft verbinden“ ohne App-Passwort anbinden.',
    ],
    links: [{ to: '/postfach', label: 'Postfach' }],
  },
  {
    id: 'postfach-server',
    titel: 'Das Postfach erreicht den Server nicht',
    meldungen: [
      'Server nicht gefunden. Bitte den Hostnamen prüfen.',
      'Keine Verbindung zum Server. Bitte Port und Verschlüsselung prüfen.',
      'Das Zertifikat des Servers wurde nicht akzeptiert.',
      'Der Server hat die Verbindung nicht angenommen. Bitte Server, Port und Verschlüsselung prüfen.',
    ],
    ursachen: [
      'Ein Tippfehler im Servernamen, etwa imap.anbieter.de statt imap.anbieter.com.',
      'Port und Verschlüsselung passen nicht zusammen. Üblich ist IMAP auf Port 993 mit SSL/TLS und der Postausgang auf 587 (STARTTLS) oder 465 (SSL/TLS).',
      'Der Server zeigt ein Zertifikat, das nicht auf seinen Namen ausgestellt ist, etwa weil ein anderer Name als der des Anbieters eingetragen ist.',
    ],
    schritte: [
      'Unter „Postfach“ beim Verbinden den Anbieter anklicken, wenn er in der Liste steht: Server und Ports sind dann richtig eingetragen.',
      'Sonst die Angaben aus der Hilfe Ihres Anbieters übernehmen, für den Posteingang (IMAP) und den Postausgang (SMTP) getrennt.',
      'Beim Zertifikatsfehler den Servernamen eintragen, den der Anbieter nennt, nicht einen eigenen Namen, der auf denselben Rechner zeigt.',
    ],
    links: [{ to: '/postfach', label: 'Postfach' }],
  },
  {
    id: 'postfach-ordner',
    titel: 'Der Ordner des Postfachs wird nicht gefunden',
    meldungen: [
      'Der Ordner wurde nicht gefunden. Bei vielen Servern heißt er INBOX.',
    ],
    ursachen: [
      'Als Ordner steht ein Name, den es im Postfach nicht gibt, etwa „Posteingang“ statt „INBOX“.',
    ],
    schritte: [
      'Unter „Postfach“ als Ordner INBOX eintragen. Das ist bei fast allen Anbietern der Posteingang, auch wenn er im Mailprogramm anders heißt.',
    ],
    links: [{ to: '/postfach', label: 'Postfach' }],
  },
  {
    id: 'anbieter-verbindung',
    titel: 'Verbindung über Google oder Microsoft klappt nicht',
    meldungen: [
      'Der Anbieter hat die Anmeldung abgelehnt.',
      'Der Anbieter war nicht erreichbar.',
      'Der Anbieter hat keine E-Mail-Adresse genannt.',
      'Der Anbieter hat unverständlich geantwortet.',
      'Unerwartete Adresse des Anbieters.',
      'Der Kalenderanbieter hat den Zugriff abgelehnt. Bitte neu verbinden.',
      'Der Anbieter hat keinen dauerhaften Zugang erteilt. Bitte erneut verbinden und alle Berechtigungen bestätigen.',
      'Der Anmeldevorgang ist abgelaufen.',
      'Der Anmeldevorgang wurde in einem anderen Browser begonnen.',
      'Dieser Anmeldevorgang ist unbekannt oder schon benutzt.',
      'Die Anmeldung über den Anbieter ist auf diesem Server nicht eingerichtet.',
    ],
    ursachen: [
      'Der Zugriff wurde beim Anbieter widerrufen oder das Kontopasswort geändert; dann lehnt der Anbieter das Erneuern ab.',
      'Beim Bestätigen wurde nicht allen Berechtigungen zugestimmt.',
      'Zwischen dem Klick auf „Verbinden“ und der Rückkehr lagen mehr als zehn Minuten, oder der Vorgang wurde in einem anderen Browser beendet als begonnen.',
      'In manchen Firmenkonten muss ein Administrator der Anwendung erst zustimmen.',
    ],
    schritte: [
      'Unter „Postfach“ oder im Kalender-Dialog auf „neu verbinden“ klicken und alle angefragten Berechtigungen bestätigen, im selben Browser und ohne Pause.',
      'Bei Microsoft 365: den Administrator Ihres Firmenkontos bitten, der Anwendung zuzustimmen, und SMTP AUTH für das Postfach zu erlauben. Ohne SMTP AUTH liest Stegwerk die Post, kann aber nicht senden.',
      'Steht „auf diesem Server nicht eingerichtet“ da, fehlt die Einrichtung beim Betreiber; bis dahin verbinden Sie per IMAP mit App-Passwort.',
    ],
    links: [{ to: '/postfach', label: 'Postfach' }],
  },
  {
    id: 'mail-senden',
    titel: 'Eine Mail lässt sich nicht senden',
    meldungen: [
      'Der Mailserver erlaubt diese Absenderadresse nicht. Schalten Sie sie beim Anbieter frei („Senden als“) oder senden Sie mit der Hauptadresse.',
      'Die Nachricht ist dem Mailserver zu groß. Bitte weniger oder kleinere Anhänge mitschicken.',
      'Der Mailserver hat nicht rechtzeitig geantwortet.',
      'Der Mailserver war nicht erreichbar. Bitte Adresse und Port prüfen.',
      'Der Mailserver hat die Nachricht abgelehnt',
      'Die Nachricht konnte nicht versendet werden.',
    ],
    ursachen: [
      'Unter „Von“ ist eine weitere Absenderadresse gewählt, die der Anbieter für dieses Postfach nicht freigegeben hat.',
      'Die Anhänge zusammen sind größer, als der Mailserver annimmt.',
      'Der Postausgang (SMTP) fehlt oder ist mit falschem Port eingetragen.',
    ],
    schritte: [
      'Beim Anbieter die Adresse als „Senden als“ freischalten oder unter „Von“ die Hauptadresse wählen.',
      'Weniger oder kleinere Anhänge mitschicken.',
      'Unter „Postfach“ den Postausgang prüfen; ein Klick auf den Anbieter trägt Server und Port ein.',
    ],
    links: [{ to: '/postfach', label: 'Postfach' }],
  },
  {
    id: 'mail-spam',
    titel: 'Mails aus Stegwerk landen beim Empfänger im Spam',
    meldungen: [],
    ursachen: [
      'Mails, die Sie aus einer Akte schreiben, gehen über den Postausgang Ihres eigenen Postfachs hinaus. Ob der Empfänger sie annimmt, hängt dann an den Einträgen Ihrer Domain (SPF, DKIM, DMARC) bei Ihrem Mailanbieter, nicht an Stegwerk.',
      'Eine weitere Absenderadresse auf einer anderen Domain als das Postfach wirkt auf Spamfilter wie gefälscht, wenn deren Einträge den Server Ihres Postfachs nicht nennen.',
      'Kam früher Post an die Adresse als unzustellbar zurück, steht das beim Schreiben über dem Formular.',
    ],
    schritte: [
      'Bei Ihrem Mailanbieter nachsehen, ob SPF und DKIM für Ihre Domain eingerichtet sind; die meisten Anbieter zeigen das in ihrer Verwaltung an.',
      'Mit der Hauptadresse des Postfachs senden, wenn eine weitere Adresse auf einer fremden Domain liegt.',
      'Mails von Stegwerk selbst (Einladungen, Passwort, Erinnerungen) verschickt der Betreiber; landen diese im Spam, wenden Sie sich an ihn.',
    ],
  },
  {
    id: 'einladung',
    titel: 'Eine Einladung ins Team kommt nicht an oder gilt nicht',
    meldungen: [
      'Diese Einladung ist abgelaufen.',
      'Diese Einladung ist ungültig.',
      'Diese Einladung ging an eine andere E-Mail-Adresse. Melden Sie sich mit der Adresse an, an die sie geschickt wurde.',
    ],
    ursachen: [
      'Die Mail liegt beim Empfänger im Spam oder wurde von einem Filter zurückgehalten.',
      'Eine Einladung gilt sieben Tage.',
      'Die Einladung wurde erneut gesendet; der alte Link gilt dann nicht mehr.',
      'Wer den Link öffnet, ist mit einer anderen Adresse angemeldet als der, an die die Einladung ging.',
    ],
    schritte: [
      'Nach dem Einladen zeigt „Team“ den Link einmal an. Kopieren Sie ihn und geben Sie ihn selbst weiter, wenn die Mail nicht ankommt.',
      'Unter „Team“ eine offene Einladung erneut senden; danach gilt nur noch der neue Link.',
      'Den Link mit dem Konto öffnen, dessen Adresse eingeladen wurde, oder sich vorher abmelden.',
    ],
    links: [{ to: '/team', label: 'Team' }],
  },
  {
    id: 'anmeldung-gesperrt',
    titel: 'Anmeldung gesperrt nach zu vielen Versuchen',
    meldungen: [
      'Zu viele Fehlversuche für dieses Konto. Bitte warten Sie 15 Minuten.',
      'Zu viele Versuche in kurzer Zeit. Bitte warten Sie eine Minute und versuchen Sie es dann erneut.',
    ],
    ursachen: [
      'Nach zehn falschen Passwörtern oder Codes innerhalb einer Viertelstunde wartet das Konto, gleich von welchem Gerät die Versuche kamen. Das schützt vor jemandem, der Passwörter durchprobiert.',
      'Sehr viele Anfragen von derselben Adresse in kurzer Zeit werden ebenfalls kurz gebremst.',
    ],
    schritte: [
      'Die angegebene Zeit warten; die Sperre hebt sich von selbst.',
      'Ist das Passwort nicht mehr bekannt, über „Passwort vergessen?“ an der Anmeldung ein neues setzen.',
      'Kommen die Fehlversuche nicht von Ihnen, danach das Passwort ändern. Das Sicherheitsprotokoll unter „Team“ zeigt Anmeldungen und Fehlversuche.',
    ],
    links: [{ to: '/passwort-vergessen', label: 'Passwort vergessen' }],
  },
  {
    id: 'zwei-faktor-code',
    titel: 'Der Code für die Zwei-Faktor-Anmeldung wird abgelehnt',
    meldungen: [
      'Der Code stimmt nicht.',
      'Dieser Code wurde schon benutzt. Bitte den nächsten abwarten.',
    ],
    ursachen: [
      'Die Uhr des Telefons geht falsch. Der Code hängt an der Uhrzeit; weicht sie mehr als etwa eine halbe Minute ab, passt er nicht.',
      'Der Code war schon abgelaufen, als er abgeschickt wurde; jeder gilt nur dreißig Sekunden.',
      'Derselbe Code wurde ein zweites Mal eingegeben; jeder gilt nur einmal.',
      'In der Authenticator-App ist mehr als ein Eintrag für Stegwerk, und es wurde der falsche gewählt.',
    ],
    schritte: [
      'Am Telefon Datum und Uhrzeit auf „automatisch“ stellen und einen frischen Code eingeben.',
      'Statt des Codes einen der Wiederherstellungscodes eingeben, die beim Einrichten angezeigt wurden. Jeder gilt einmal.',
      'Ist das Telefon verloren und kein Wiederherstellungscode mehr da: ein Administrator setzt die Zwei-Faktor-Anmeldung in der Teamliste zurück.',
    ],
  },
  {
    id: 'kalender-abo',
    titel: 'Das Kalender-Abo zeigt neue Termine nicht',
    meldungen: [],
    ursachen: [
      'Outlook, Google Kalender und Apple Kalender holen ein Abo in eigenen Abständen ab, oft erst nach Stunden. Wie oft, bestimmt das Kalenderprogramm, nicht Stegwerk.',
      'Der Abo-Link wurde neu erzeugt oder das Abo beendet; der alte Link liefert dann nichts mehr.',
      'Ein Abo geht nur in eine Richtung: was Sie im fremden Kalender ändern, kommt nicht zurück.',
    ],
    schritte: [
      'Etwas warten oder im Kalenderprogramm das Abo von Hand aktualisieren, wo es das anbietet.',
      'Im Kalender unter „Abonnieren“ den aktuellen Link kopieren und das Abo damit neu anlegen.',
      'Wer in beide Richtungen abgleichen will, nimmt „Kalender verbinden“ statt des Abos.',
    ],
    links: [{ to: '/kalender', label: 'Kalender' }],
  },
  {
    id: 'kalender-verbindung',
    titel: 'Der verbundene Kalender gleicht nicht ab',
    meldungen: [
      'Der Kalenderserver hat die Anmeldung abgelehnt. Bitte Benutzer und App-Passwort prüfen.',
      'Der Kalenderserver antwortet nicht.',
      'Zu viele Weiterleitungen.',
      'Der Kalenderserver war nicht erreichbar.',
      'Die Kalender ließen sich nicht abrufen.',
      'Diesen Kalender gibt es in dem Konto nicht.',
      'Der Kalender hat den Termin nicht angenommen',
      'Der Kalender ließ sich nicht abfragen',
    ],
    ursachen: [
      'Die Serveradresse stimmt nicht; CalDAV-Adressen sind je Anbieter verschieden.',
      'Statt eines App-Passworts steht das Kontopasswort da, oder das App-Passwort wurde beim Anbieter gelöscht.',
      'Der gewählte Kalender wurde im Konto gelöscht oder umbenannt.',
    ],
    schritte: [
      'Im Kalender „Kalender verbunden“ öffnen, trennen und neu verbinden. Ein Klick auf den Anbieter trägt die Serveradresse ein.',
      'Beim Anbieter ein neues App-Passwort erzeugen und eintragen.',
      'Unter „Kalender“ im Dialog einen vorhandenen Kalender wählen und „Jetzt abgleichen“ drücken.',
    ],
    links: [{ to: '/kalender', label: 'Kalender' }],
  },
  {
    id: 'pdf-vorschau',
    titel: 'Die PDF-Vorschau bleibt leer',
    meldungen: [
      'Die Vorschau ließ sich nicht starten.',
      'Die Vorschau ließ sich nicht zeichnen.',
    ],
    ursachen: [
      'Der Browser hat das Programm für die Vorschau nicht geladen, etwa wegen einer unterbrochenen Verbindung oder einer Erweiterung, die Skripte blockiert.',
      'Ein sehr alter Browser kann die Vorschau nicht zeichnen.',
    ],
    schritte: [
      'Die Seite neu laden und die Vorschau mit „Anzeigen“ erneut öffnen.',
      'Das PDF über den Knopf „PDF“ herunterladen; das Dokument selbst ist davon nicht betroffen.',
      'Den Browser aktualisieren oder Erweiterungen für diese Seite abschalten.',
    ],
  },
  {
    id: 'e-rechnung',
    titel: 'Die E-Rechnung wird nicht erzeugt oder abgelehnt',
    meldungen: ['Für die E-Rechnung fehlt noch:', 'Es fehlt noch:'],
    ursachen: [
      'Für die E-Rechnung fehlen Pflichtangaben, etwa Telefon, USt-IdNr. oder Steuernummer und IBAN im Briefkopf oder die Rechnungs-E-Mail der Firma. Die Rechnung nennt, was fehlt und wo.',
      'Eine E-Rechnung gibt es erst, wenn die Rechnung gestellt ist; ein Entwurf hat noch keine Nummer.',
      'Ein Logo in CMYK darf nicht in das PDF der E-Rechnung.',
      'Behörden verlangen eine Leitweg-ID; ohne sie lehnt das Eingangsportal die XRechnung ab.',
    ],
    schritte: [
      'Die genannten Angaben im Briefkopf oder bei der Firma ergänzen; die Rechnung zeigt danach „PDF (ZUGFeRD)“.',
      'Im Entwurf unter „Käuferreferenz / Leitweg-ID“ die Kennung eintragen, die der Empfänger vorgibt, und dann die Rechnung stellen.',
      'Das Logo im Briefkopf als RGB-Bild neu hochladen.',
    ],
    links: [
      { to: '/briefkopf', label: 'Briefkopf' },
      { to: '/rechnungen', label: 'Rechnungen' },
    ],
  },
  {
    id: 'import',
    titel: 'Der Import lehnt Zeilen ab oder liest die Datei nicht',
    meldungen: [
      'Das ist keine Excel-Datei (.xlsx).',
      'Die Excel-Datei ist beschädigt.',
      'Die Excel-Datei ist zu groß.',
      'In der Excel-Datei steht keine Tabelle.',
    ],
    ursachen: [
      'Die Datei ist eine alte .xls oder eine andere Tabelle; gelesen werden CSV und .xlsx.',
      'Über den Spaltennamen steht noch ein Titel oder ein Datum, sodass die falsche Zeile als Kopf gilt.',
      'Einzelne Zeilen haben ungültige Werte, etwa eine E-Mail ohne @ oder eine Phase, die es nicht gibt.',
      'Bei Kontakten und Geschäften fehlt die Firma, weil die Firmen noch nicht importiert sind.',
    ],
    schritte: [
      'In Excel „Speichern unter“ → „Excel-Arbeitsmappe (.xlsx)“ oder „CSV UTF-8“ wählen und die neue Datei hochladen.',
      'In der Vorschau die Zeile mit den Spaltennamen auswählen.',
      'Abgelehnte Zeilen stehen mit Grund in der Vorschau; dort korrigieren und erneut prüfen. Gespeichert wird erst mit „Übernehmen“.',
      'Erst Firmen, dann Kontakte, dann Geschäfte importieren.',
    ],
    links: [{ to: '/import', label: 'Import' }],
  },
] as const satisfies readonly Fehlerfall[];

export type FehlerId = (typeof FEHLERFAELLE)[number]['id'];

export const abhilfePfad = (id: FehlerId): string =>
  `/hilfe/fehlerbehebung#${id}`;

const normal = (text: string): string =>
  text.toLowerCase().replace(/\s+/gu, ' ').trim();

export const abhilfeFuer = (
  meldung: string | null | undefined,
): FehlerId | null => {
  if (meldung === null || meldung === undefined || meldung.trim() === '') {
    return null;
  }

  const text = normal(meldung).replace(/^graphql error: /u, '');

  for (const fall of FEHLERFAELLE) {
    for (const satz of fall.meldungen as readonly string[]) {
      if (text.startsWith(normal(satz).replace(/[.:]$/u, ''))) {
        return fall.id;
      }
    }
  }

  return null;
};

export const fehlerfallPasst = (fall: Fehlerfall, begriff: string): boolean => {
  const suche = normal(begriff);

  if (suche === '') {
    return true;
  }

  const text = normal(
    [fall.titel, ...fall.meldungen, ...fall.ursachen, ...fall.schritte].join(
      ' ',
    ),
  );

  return suche.split(' ').every((wort) => text.includes(wort));
};
