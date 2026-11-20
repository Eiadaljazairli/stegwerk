export const FUNKTIONEN_TITEL = 'Funktionen';
export const FUNKTIONEN_BESCHREIBUNG =
  'Was Stegwerk kann: E-Rechnung, DATEV-Export, Angebote online annehmen, Postfach und Kalender, Automationen, Rechte und Datenschutz, Handy, Umstieg von Excel.';

export type Produktseite = {
  slug: string;
  titel: string;
  seitentitel: string;
  beschreibung: string;
  einleitung: string;
  abschnitte: { ueberschrift: string; absaetze: string[] }[];
  bild?: { src: string; alt: string; breite: number; hoehe: number };
};

export const PRODUKTSEITEN: Produktseite[] = [
  {
    slug: 'e-rechnung',
    titel: 'E-Rechnung mit ZUGFeRD und XRechnung',
    seitentitel: 'E-Rechnung (ZUGFeRD, XRechnung)',
    beschreibung:
      'Rechnungen nach § 14 UStG, deren PDF zugleich E-Rechnung im Format ZUGFeRD (EN 16931) ist, dazu die reine XRechnung für Behörden.',
    einleitung:
      'Seit 2025 muss jedes Unternehmen in Deutschland E-Rechnungen empfangen können; ab 2027 und 2028 wird sie auch beim Ausstellen Pflicht. In Stegwerk ist das PDF einer gestellten Rechnung zugleich E-Rechnung.',
    abschnitte: [
      {
        ueberschrift: 'Ein PDF, das ein Programm lesen kann',
        absaetze: [
          'Im PDF steckt die Rechnung als Datei im Format ZUGFeRD, Profil EN 16931. Das Buchhaltungsprogramm Ihres Kunden liest sie ein, Ihr Kunde sieht das gewohnte Papier mit Ihrem Briefkopf. Der Knopf heißt dann „PDF (ZUGFeRD)“.',
          'Daneben gibt es die reine XRechnung als XML-Datei, wie sie etwa Behörden verlangen. Die Käuferreferenz oder Leitweg-ID tragen Sie im Entwurf der Rechnung ein.',
        ],
      },
      {
        ueberschrift: 'Was fehlt, steht da',
        absaetze: [
          'Fehlt eine Pflichtangabe, etwa die IBAN im Briefkopf oder die Rechnungs-E-Mail der Firma, sagt die Rechnung, welche und wo. Bis dahin bleibt das PDF ein gewöhnliches PDF, statt dass Ihr Kunde eine ungültige E-Rechnung bekommt.',
        ],
      },
      {
        ueberschrift: 'Rechnungen, wie die GoBD sie verlangen',
        absaetze: [
          'Eine Rechnung ist zuerst ein Entwurf ohne Nummer. Mit „Rechnung stellen“ bekommt sie ihre fortlaufende Nummer und lässt sich danach nicht mehr ändern. Fehler korrigieren Sie mit „Stornieren“: dabei entsteht eine Rechnungskorrektur mit eigener Nummer.',
          'Auf einer offenen Rechnung mit IBAN im Briefkopf steht ein GiroCode. Den scannt Ihr Kunde mit der Banking-App, und Betrag, Empfänger und Verwendungszweck sind ausgefüllt.',
          'Eine wiederkehrende Rechnung legt monatlich, vierteljährlich oder jährlich einen neuen Entwurf an. Prüfen und stellen tun Sie ihn selbst.',
        ],
      },
    ],
  },
  {
    slug: 'datev-export',
    titel: 'DATEV-Export für die Steuerkanzlei',
    seitentitel: 'DATEV-Export',
    beschreibung:
      'Alle gestellten Rechnungen eines Monats als DATEV-Buchungsstapel für die Steuerkanzlei, mit SKR03 oder SKR04, auch stornierte und ihre Korrekturen.',
    einleitung:
      'Am Monatsanfang geht der Vormonat an die Kanzlei. Unter „Rechnungen“ wählen Sie den Monat und laden den Buchungsstapel herunter.',
    abschnitte: [
      {
        ueberschrift: 'Was in der Datei steht',
        absaetze: [
          'Eine Datei im DATEV-Format (EXTF) mit einer Buchung je Rechnung und Steuersatz, brutto auf das Erlöskonto des gewählten Kontenrahmens. Belegfeld ist die Rechnungsnummer, Buchungstext der Kunde.',
          'Stornierte Rechnungen und ihre Korrekturen sind beide enthalten; zusammen ergeben sie null. Steuerfreie Umsätze gehen je nach Grund der Steuerbefreiung auf das passende Konto.',
        ],
      },
      {
        ueberschrift: 'Einrichten',
        absaetze: [
          'Berater- und Mandantennummer von der Kanzlei sowie den Kontenrahmen (SKR03 oder SKR04) tragen Sie im Briefkopf ein. Fehlt etwas davon, sagt der Export es, bevor er eine Datei erzeugt.',
          'Lassen Sie vor dem ersten echten Monat einen Probeimport bei Ihrer Kanzlei machen: geprüft ist die Datei gegen die Feldbeschreibung von DATEV, DATEV selbst gibt es nur in der Kanzlei.',
        ],
      },
    ],
  },
  {
    slug: 'angebote-online-annehmen',
    titel: 'Angebote, die Ihr Kunde online annimmt',
    seitentitel: 'Angebote online annehmen',
    beschreibung:
      'Angebote aus dem Artikelstamm als PDF unter Ihrem Briefkopf. Per Link sieht Ihr Kunde das Angebot im Browser und nimmt es an oder lehnt es ab.',
    einleitung:
      'Ein Angebot besteht aus Positionen, gern aus Ihren Artikeln, und geht als PDF nach DIN 5008 unter Ihrem Briefkopf hinaus.',
    abschnitte: [
      {
        ueberschrift: 'Annehmen per Link',
        absaetze: [
          'Mit dem Kundenlink sieht Ihr Kunde das Angebot im Browser und nimmt es an oder lehnt es ab, ohne Konto und ohne Ausdruck. Annehmen geht bis zum letzten Gültigkeitstag.',
          'Wer den Link erzeugt hat, bekommt die Antwort per Mail; im Angebot steht, wer wann entschieden hat.',
        ],
      },
      {
        ueberschrift: 'Vom Angebot zur Rechnung',
        absaetze: [
          'Aus einem versendeten oder angenommenen Angebot macht „Rechnung erstellen“ einen Rechnungsentwurf mit denselben Positionen. Abgetippt wird nichts.',
          'Fehlt eine Pflichtangabe, sagt Stegwerk es vor dem Versand.',
        ],
      },
    ],
  },
  {
    slug: 'postfach-und-kalender',
    titel: 'Postfach und Kalender an den Akten',
    seitentitel: 'Postfach und Kalender',
    beschreibung:
      'Das eigene Postfach per IMAP anbinden: Mails erscheinen bei Firma und Kontakt. Termine per Abo oder per CalDAV in beide Richtungen im eigenen Kalender.',
    einleitung:
      'Ihr bestehendes Postfach bleibt, wo es ist. Stegwerk liest mit und legt jede Mail zu der Firma und dem Kontakt, zu denen sie gehört.',
    abschnitte: [
      {
        ueberschrift: 'Postfach',
        absaetze: [
          'Verbinden Sie Ihr Postfach per IMAP, bei jedem Anbieter. Stegwerk liest nur: nichts wird als gelesen markiert, verschoben oder gelöscht. Neue Mails werden etwa alle zehn Minuten abgeholt und über die Absenderadresse, die Adressen in An und Kopie und zuletzt über die Domain der Firma zugeordnet.',
          'Mit dem Postausgang (SMTP) schreiben Sie direkt aus der Akte, mit Kopie, Blindkopie, Dateien der Akte als Anhang, Ihrer Signatur und Mailvorlagen.',
          'Gezeigt wird immer der Text einer Mail, nie ihr HTML: so lädt keine Mail Bilder von fremden Servern nach oder führt etwas aus.',
        ],
      },
      {
        ueberschrift: 'Kalender',
        absaetze: [
          'Termine legen Sie im Kalender oder in einer Akte an, mit Teilnehmenden und als Serie. Über das Kalender-Abo erscheinen sie in Outlook, Google oder Apple Kalender.',
          '„Kalender verbinden“ gleicht per CalDAV in beide Richtungen ab, etwa mit Nextcloud, IONOS, mailbox.org, iCloud oder Fastmail. Was Sie dort eintragen, kommt alle zehn Minuten hierher.',
          'Google Kalender und Microsoft 365 lassen sich über die Anmeldung beim Anbieter verbinden, sobald der Betreiber Ihrer Installation das eingerichtet hat.',
        ],
      },
    ],
    bild: {
      src: '/startseite/kalender.webp',
      alt: 'Der Kalender in Stegwerk in der Monatsansicht mit Terminen des Teams',
      breite: 2560,
      hoehe: 1600,
    },
  },
  {
    slug: 'automationen',
    titel: 'Automationen: der nächste Schritt von selbst',
    seitentitel: 'Automationen',
    beschreibung:
      'Wenn-Dann-Regeln für Geschäfte, Kontakte und Firmen: Aufgaben anlegen, Felder setzen, Mailvorlagen senden, reihum verteilen, nach Zeitplan oder per Eingangsadresse.',
    einleitung:
      'Eine Automation erledigt den nächsten Schritt von selbst, etwa „Gewonnen → Rechnung schreiben“ als Aufgabe für die verantwortliche Person.',
    abschnitte: [
      {
        ueberschrift: 'Wann eine Regel läuft',
        absaetze: [
          'Wenn ein Geschäft, ein Kontakt oder eine Firma angelegt oder geändert wird, ein Geschäft die Phase wechselt, sich an einem offenen Geschäft eine Anzahl Tage nichts tut, eine Anfrage übers Webformular kommt, jemand den Knopf am Datensatz drückt, nach Zeitplan oder wenn ein fremder Dienst die geheime Eingangsadresse der Regel aufruft.',
          'Bedingungen grenzen eine Regel ein, mit denselben Vergleichen wie die Filter der Listen.',
        ],
      },
      {
        ueberschrift: 'Was sie tut',
        absaetze: [
          'Sie legt eine Aufgabe, Notiz oder einen Termin an, setzt ein Feld, benachrichtigt den Verantwortlichen, schickt dem Kontakt eine Mailvorlage, verteilt neue Einträge reihum im Team, sucht oder ergänzt Datensätze oder schickt eine HTTP-Anfrage an einen anderen Dienst. Bis zu fünf Schritte folgen nacheinander.',
          '„Probelauf“ führt eine Regel einmal an einem Beispiel aus, ohne etwas zu speichern oder zu verschicken. Das Protokoll zeigt bei jeder Regel, was sie getan, übersprungen oder nicht geschafft hat, und warum.',
        ],
      },
      {
        ueberschrift: 'Mit den Rechten ihres Erstellers',
        absaetze: [
          'Jede Regel läuft mit den Rechten dessen, der sie angelegt oder zuletzt geändert hat: sie sieht und ändert nur, was diese Person sehen und ändern darf. Was eine Automation selbst ändert, löst keine weitere aus.',
        ],
      },
    ],
  },
  {
    slug: 'rechte-und-datenschutz',
    titel: 'Rollen, Rechte und Datenschutz',
    seitentitel: 'Rechte und Datenschutz',
    beschreibung:
      'Eigene Rollen, Feldrechte, „nur eigene Datensätze“, Zwei-Faktor-Anmeldung, Protokoll jeder Änderung, Vertrag zur Auftragsverarbeitung und Export aller Daten.',
    einleitung:
      'Jede Person im Team hat eine Rolle: Inhaber, Administrator, Mitglied, Nur Lesen oder eine eigene Rolle mit genau den Rechten, die Sie ihr geben.',
    abschnitte: [
      {
        ueberschrift: 'Wer was sieht',
        absaetze: [
          'Einzelne Felder lassen sich je Rolle einschränken: verborgen oder nur lesbar, etwa der Betrag eines Geschäfts oder die Telefonnummer eines Kontakts. Ein verborgenes Feld fehlt in Listen, Akten, Export und Filtern.',
          'Eine Rolle kann bei Firmen, Kontakten und Geschäften auf „nur eigene“ gestellt werden: sie sieht dann nur, wofür die Person verantwortlich ist, und was niemandem zugeordnet ist, samt allem, was daran hängt.',
        ],
      },
      {
        ueberschrift: 'Anmeldung und Protokoll',
        absaetze: [
          'Die Zwei-Faktor-Anmeldung schützt ein Konto mit einem Code aus einer Authenticator-App; Administratoren können sie für das ganze Team verlangen. Unter „Angemeldete Geräte“ melden Sie einzelne oder alle anderen Geräte ab.',
          'Das Sicherheitsprotokoll zeigt Anmeldungen, Fehlversuche, Änderungen am zweiten Faktor, an Rollen und Schlüsseln sowie Exporte. Das Protokoll des Bereichs hält fest, wer was wann geändert hat.',
        ],
      },
      {
        ueberschrift: 'Ihre Daten bleiben Ihre',
        absaetze: [
          'Der Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO ist Teil des Programms. Unter „Daten“ lädt der Inhaber alles, was zum Arbeitsbereich gespeichert ist, als eine Datei herunter (Art. 15 und 20 DSGVO), und kann den Arbeitsbereich dort auch unwiderruflich löschen.',
          'Wo die Daten liegen und welche Maßnahmen gelten, steht auf der Seite „Sicherheit“.',
        ],
      },
    ],
  },
  {
    slug: 'handy',
    titel: 'Stegwerk auf dem Handy',
    seitentitel: 'Auf dem Handy',
    beschreibung:
      'Stegwerk im Browser des Handys: Listen als Karten, die Suche in der Leiste unten, Geschäfte auf dem Board per Finger verschieben, ohne App aus dem Store.',
    einleitung:
      'Stegwerk läuft im Browser, auf dem Handy wie am Rechner. Eine App aus dem Store braucht es nicht; die Seite lässt sich auf den Startbildschirm legen.',
    abschnitte: [
      {
        ueberschrift: 'Für den kleinen Bildschirm gebaut',
        absaetze: [
          'Auf dem Handy wird jede Zeile einer Liste eine Karte: oben der Name, darunter die übrigen Spalten. Niemand muss eine Tabelle seitlich schieben.',
          'Die Suche liegt in der Leiste unten, zusammen mit Übersicht, Aufgaben, Geschäften und „Mehr“ für alle anderen Bereiche.',
          'Auf dem Board halten Sie eine Karte kurz gedrückt, bis sie sich löst, und ziehen sie in die nächste Phase; ein schnelles Wischen scrollt wie gewohnt.',
        ],
      },
      {
        ueberschrift: 'Ohne Store, mit Verbindung',
        absaetze: [
          'Über „Zum Startbildschirm hinzufügen“ im Browser erscheint Stegwerk mit eigenem Symbol wie eine App. Es braucht dabei eine Verbindung: Stegwerk hält absichtlich keine alte Fassung zwischengespeichert.',
        ],
      },
    ],
  },
  {
    slug: 'umstieg-von-excel',
    titel: 'Umstieg von Excel und Outlook',
    seitentitel: 'Umstieg von Excel',
    beschreibung:
      'Firmen, Kontakte und Geschäfte aus Excel oder einer CSV-Datei übernehmen: Spalten zuordnen, Vorschau prüfen, dann übernehmen. Auch Kontakte aus Outlook.',
    einleitung:
      'Der Import liest Firmen, Kontakte, Geschäfte, Notizen, Aufgaben und Artikel aus einer CSV- oder Excel-Datei. Gespeichert wird erst, wenn Sie „Übernehmen“ wählen.',
    abschnitte: [
      {
        ueberschrift: 'So geht es',
        absaetze: [
          'Reihenfolge: erst Firmen, dann Kontakte, dann Geschäfte. Kontakte und Geschäfte finden ihre Firma über deren Namen; gibt es sie schon, wird sie verbunden statt doppelt angelegt.',
          'Excel: die Tabelle so lassen, wie sie ist, und die .xlsx-Datei direkt hochladen. Gelesen wird das erste Blatt; steht über den Spaltennamen noch ein Titel, wählen Sie die richtige Zeile aus.',
          'Outlook: Kontakte als „Kommagetrennte Werte“ exportieren. Spalten wie „Vorname“, „Nachname“, „E-Mail-Adresse“ und „Firma“ werden von selbst zugeordnet.',
        ],
      },
      {
        ueberschrift: 'Erst ansehen, dann übernehmen',
        absaetze: [
          'Die Vorschau zeigt, welche Zeilen abgelehnt würden und warum. Korrigieren Sie sie dort und prüfen Sie erneut; die Datei selbst bleibt, wie sie ist.',
          'Und zurück geht es genauso: jede Liste lässt sich als CSV herunterladen, so wie sie gerade gefiltert ist.',
        ],
      },
    ],
    bild: {
      src: '/startseite/uebersicht.webp',
      alt: 'Die Übersicht in Stegwerk mit offener Pipeline, Phasen und offenen Aufgaben',
      breite: 2560,
      hoehe: 1600,
    },
  },
];

export const produktseite = (slug: string | undefined): Produktseite | null =>
  PRODUKTSEITEN.find((seite) => seite.slug === slug) ?? null;
