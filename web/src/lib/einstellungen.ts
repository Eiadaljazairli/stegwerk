export type Einstellung = {
  to: string;
  titel: string;
  beschreibung: string;
  stichworte: string[];
  recht?: string;
  nurMitAbrechnung?: true;
};

export type EinstellungsGruppe = { titel: string; eintraege: Einstellung[] };

export const EINSTELLUNGEN: EinstellungsGruppe[] = [
  {
    titel: 'Mein Konto',
    eintraege: [
      {
        to: '/team#konto',
        titel: 'Profil und Signatur',
        beschreibung: 'Name, Funktion, Durchwahl, E-Mail-Signatur, Passwort',
        stichworte: ['name', 'passwort', 'signatur', 'durchwahl', 'profil'],
      },
      {
        to: '/team#anmelde-adresse',
        titel: 'Anmelde-Adresse ändern',
        beschreibung: 'Mit einer anderen E-Mail-Adresse anmelden',
        stichworte: ['email', 'adresse', 'login'],
      },
      {
        to: '/team#zwei-faktor',
        titel: 'Zwei-Faktor-Anmeldung',
        beschreibung: 'Ein Code aus einer App zusätzlich zum Passwort',
        stichworte: ['2fa', 'totp', 'authenticator', 'sicherheit'],
      },
      {
        to: '/team#geraete',
        titel: 'Angemeldete Geräte',
        beschreibung: 'Sitzungen sehen und abmelden',
        stichworte: ['sitzungen', 'abmelden', 'geräte'],
      },
      {
        to: '/team#sicherheitsprotokoll',
        titel: 'Sicherheitsprotokoll',
        beschreibung: 'Anmeldungen und Änderungen am Zugang',
        stichworte: ['protokoll', 'anmeldungen', 'audit'],
      },
      {
        to: '/team#erinnerungen',
        titel: 'Erinnerungen und Benachrichtigungen',
        beschreibung: 'Aufgaben-Mail am Morgen, Mail bei Erwähnung',
        stichworte: ['benachrichtigung', 'erwähnung', 'mail', 'morgens'],
      },
      {
        to: '/team#konto-loeschen',
        titel: 'Konto löschen',
        beschreibung: 'Das eigene Konto entfernen',
        stichworte: ['löschen', 'kündigen'],
      },
    ],
  },
  {
    titel: 'Team und Rechte',
    eintraege: [
      {
        to: '/team',
        titel: 'Mitglieder und Einladungen',
        beschreibung: 'Wer im Arbeitsbereich ist, Einladungen verschicken',
        stichworte: ['team', 'einladen', 'kollegen', 'nutzer'],
      },
      {
        to: '/team#rollen',
        titel: 'Rollen und Rechte',
        beschreibung: 'Was jede Rolle sehen und ändern darf',
        stichworte: ['rolle', 'rechte', 'berechtigung', 'feldrechte'],
      },
      {
        to: '/team#zwei-faktor-pflicht',
        titel: 'Zwei-Faktor-Pflicht',
        beschreibung: 'Zweiten Faktor für alle verlangen',
        stichworte: ['2fa', 'pflicht', 'sicherheit'],
        recht: 'workspace:fields',
      },
      {
        to: '/team#leerlauf',
        titel: 'Abmelden nach Leerlauf',
        beschreibung: 'Nach einer Zeit ohne Eingabe automatisch abmelden',
        stichworte: ['leerlauf', 'timeout', 'abmelden', 'sitzung'],
        recht: 'workspace:fields',
      },
      {
        to: '/team#einladungs-domains',
        titel: 'Einladungen nur an diese Domains',
        beschreibung: 'Nur Adressen der eigenen Firma einladen lassen',
        stichworte: ['domain', 'einladen', 'firma', 'adresse', 'sicherheit'],
        recht: 'workspace:members',
      },
      {
        to: '/protokoll',
        titel: 'Protokoll des Bereichs',
        beschreibung: 'Änderungen und Anmeldungen aller Personen, mit Filter',
        stichworte: ['protokoll', 'audit', 'änderungen', 'verlauf'],
        recht: 'workspace:audit',
      },
      {
        to: '/team#avv',
        titel: 'Auftragsverarbeitung (AVV)',
        beschreibung: 'Vertrag nach Art. 28 DSGVO annehmen und herunterladen',
        stichworte: ['avv', 'dsgvo', 'vertrag', 'datenschutz'],
      },
    ],
  },
  {
    titel: 'Daten',
    eintraege: [
      {
        to: '/felder',
        titel: 'Eigene Felder',
        beschreibung: 'Zusätzliche Felder an Firmen, Kontakten, Geschäften',
        stichworte: ['felder', 'feld', 'spalten', 'attribute'],
      },
      {
        to: '/objekte',
        titel: 'Objekte umbenennen',
        beschreibung: 'Eigene Namen, etwa Patienten statt Kontakte',
        stichworte: [
          'umbenennen',
          'bezeichnung',
          'objekte',
          'name',
          'einzahl',
          'mehrzahl',
        ],
      },
      {
        to: '/phasen',
        titel: 'Phasen und Pipelines',
        beschreibung: 'Phasen benennen, Wahrscheinlichkeit, Pflichtfelder',
        stichworte: ['phase', 'pipeline', 'vertrieb', 'stufen'],
      },
      {
        to: '/import',
        titel: 'Import',
        beschreibung: 'Firmen, Kontakte, Geschäfte aus CSV oder Excel',
        stichworte: ['import', 'csv', 'excel', 'umzug'],
      },
      {
        to: '/daten',
        titel: 'Daten exportieren und löschen',
        beschreibung: 'Export, Aufbewahrung, Auskunft, Arbeitsbereich löschen',
        stichworte: ['export', 'dsgvo', 'auskunft', 'aufbewahrung'],
      },
      {
        to: '/papierkorb',
        titel: 'Papierkorb',
        beschreibung: 'Gelöschtes wiederherstellen, Frist einstellen',
        stichworte: ['gelöscht', 'wiederherstellen', 'frist'],
      },
      {
        to: '/team#einstieg',
        titel: 'Beispieldaten und Branchenvorlagen',
        beschreibung: 'Zum Ausprobieren füllen und wieder entfernen',
        stichworte: ['beispiel', 'vorlage', 'branche', 'demo', 'start'],
        recht: 'workspace:fields',
      },
    ],
  },
  {
    titel: 'Belege und Abrechnung',
    eintraege: [
      {
        to: '/briefkopf',
        titel: 'Briefkopf',
        beschreibung: 'Absender, Logo, Bank, Steuernummer, DATEV',
        stichworte: ['logo', 'bank', 'iban', 'steuernummer', 'datev'],
      },
      {
        to: '/buchhaltung',
        titel: 'Buchhaltung',
        beschreibung: 'Lexware Office oder sevDesk mit eigenem API-Schlüssel',
        stichworte: [
          'lexware',
          'lexoffice',
          'sevdesk',
          'buchhaltung',
          'belege',
          'steuerberater',
        ],
        recht: 'workspace:api',
      },
      {
        to: '/team#erinnerungen',
        titel: 'Mahnungen und Verzugszinsen',
        beschreibung: 'Basiszinssatz für Mahnungen',
        stichworte: ['mahnung', 'zinsen', 'basiszins'],
      },
      {
        to: '/abrechnung',
        titel: 'Abrechnung',
        beschreibung: 'Tarif, Plätze, Rechnungen von Stegwerk',
        stichworte: ['abo', 'tarif', 'zahlung', 'rechnung'],
        nurMitAbrechnung: true,
      },
    ],
  },
  {
    titel: 'Post und Kalender',
    eintraege: [
      {
        to: '/postfach',
        titel: 'Postfach verbinden',
        beschreibung: 'IMAP, Gmail oder Microsoft 365, Sichtbarkeit, Aliase',
        stichworte: ['mail', 'imap', 'smtp', 'gmail', 'outlook'],
      },
      {
        to: '/postfach#mailvorlagen',
        titel: 'Mailvorlagen',
        beschreibung: 'Wiederkehrende Texte mit Platzhaltern',
        stichworte: ['vorlage', 'textbaustein', 'platzhalter'],
      },
      {
        to: '/postfach#sperrliste',
        titel: 'Sperrliste',
        beschreibung: 'Adressen, deren Post nicht übernommen wird',
        stichworte: ['sperren', 'ausschluss', 'newsletter'],
      },
      {
        to: '/kalender',
        titel: 'Kalender verbinden',
        beschreibung: 'CalDAV, Google, Microsoft und Kalender-Abo',
        stichworte: ['caldav', 'ics', 'abo', 'google', 'outlook'],
      },
      {
        to: '/serienmails',
        titel: 'Serienmails',
        beschreibung: 'Ein Text an viele Kontakte, Abmeldungen',
        stichworte: ['newsletter', 'kampagne', 'abmeldung'],
        recht: 'workspace:campaigns',
      },
    ],
  },
  {
    titel: 'Abläufe und Schnittstellen',
    eintraege: [
      {
        to: '/automationen',
        titel: 'Automationen',
        beschreibung: 'Wenn-Dann-Regeln, Verteilung reihum',
        stichworte: ['regel', 'workflow', 'automatisch'],
        recht: 'workspace:fields',
      },
      {
        to: '/webformular',
        titel: 'Webformular',
        beschreibung: 'Anfragen von der eigenen Website',
        stichworte: ['formular', 'website', 'lead', 'anfrage'],
        recht: 'workspace:fields',
      },
      {
        to: '/team#api-schluessel',
        titel: 'API-Schlüssel',
        beschreibung: 'Zugang für andere Programme',
        stichworte: ['api', 'schnittstelle', 'token', 'graphql', 'mcp'],
        recht: 'workspace:api',
      },
      {
        to: '/ki',
        titel: 'KI',
        beschreibung:
          'Chat und Entwürfe mit eigenem Schlüssel von Anthropic oder OpenAI',
        stichworte: [
          'ki',
          'ai',
          'claude',
          'anthropic',
          'openai',
          'chatgpt',
          'chat',
          'assistent',
          'entwurf',
        ],
      },
      {
        to: '/team#webhooks',
        titel: 'Webhooks',
        beschreibung: 'Andere Programme bei Änderungen benachrichtigen',
        stichworte: ['webhook', 'zapier', 'make', 'n8n'],
        recht: 'workspace:api',
      },
    ],
  },
];

export const suchform = (text: string): string =>
  text
    .toLowerCase()
    .replace(/ß/gu, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ae/gu, 'a')
    .replace(/oe/gu, 'o')
    .replace(/ue/gu, 'u');

export const passtZu = (text: string, suche: string): boolean => {
  const ziel = suchform(text);

  return suchform(suche)
    .split(/\s+/u)
    .filter((wort) => wort !== '')
    .every((wort) => ziel.includes(wort));
};

export const sichtbareEinstellungen = (
  darf: (recht: string) => boolean,
  mitAbrechnung: boolean,
): EinstellungsGruppe[] =>
  EINSTELLUNGEN.map((gruppe) => ({
    ...gruppe,
    eintraege: gruppe.eintraege.filter(
      (eintrag) =>
        (eintrag.recht === undefined || darf(eintrag.recht)) &&
        (eintrag.nurMitAbrechnung !== true || mitAbrechnung),
    ),
  })).filter((gruppe) => gruppe.eintraege.length > 0);

export const einstellungenFuer = (
  gruppen: EinstellungsGruppe[],
  suche: string,
): (Einstellung & { gruppe: string })[] =>
  gruppen.flatMap((gruppe) =>
    gruppe.eintraege
      .filter((eintrag) =>
        passtZu(
          [
            eintrag.titel,
            eintrag.beschreibung,
            gruppe.titel,
            'einstellungen',
            ...eintrag.stichworte,
          ].join(' '),
          suche,
        ),
      )
      .map((eintrag) => ({ ...eintrag, gruppe: gruppe.titel })),
  );
