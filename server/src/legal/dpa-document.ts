import {
  PAPIERKORB_TAGE,
  PAPIERKORB_TAGE_MAX,
  PAPIERKORB_TAGE_MIN,
} from '../papierkorb/frist';
import { type PrivacyFacts } from '../privacy/privacy-facts';

export type DpaBlock =
  | { kind: 'text'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'gap'; text: string; variable: string };

export type DpaSection = {
  label: string;
  title: string;
  blocks: DpaBlock[];
};

export type DpaDocument = {
  title: string;
  reviewed: boolean;
  processorName: string | null;
  sections: DpaSection[];
  annexes: DpaSection[];
};

const text = (value: string): DpaBlock => ({ kind: 'text', text: value });
const list = (items: string[]): DpaBlock => ({ kind: 'list', items });
const gap = (variable: string, value: string): DpaBlock => ({
  kind: 'gap',
  variable,
  text: value,
});

const DATENARTEN = [
  'Konto- und Zugangsdaten der Nutzer: Name, E-Mail-Adresse, Passwort-Hash, Rolle und Zugehörigkeit zum Arbeitsbereich',
  'Stammdaten zu Firmen: Name, Anschrift, Branche, Kennzahlen und eigene Felder des Auftraggebers',
  'Kontaktdaten natürlicher Personen: Name, Position, E-Mail-Adresse, Telefonnummer, Zuordnung zu einer Firma',
  'Vertriebsdaten: Geschäfte mit Wert und Stand, Aufgaben, Notizen, gespeicherte Ansichten',
  'Termindaten: Titel, Zeitraum, Ort, Teilnehmer und deren Zu- oder Absage',
  'Belegdaten: Angebote und Rechnungen mit Empfängeranschrift, Positionen, Beträgen und Zahlungsstand',
  'Artikelstammdaten und Briefkopf des Auftraggebers',
  'Protokolldaten: welcher Nutzer wann welchen Datensatz angelegt, geändert oder gelöscht hat',
];

const BETROFFENE = [
  'Beschäftigte des Auftraggebers, die Stegwerk nutzen',
  'Kunden, Interessenten und deren Ansprechpartner, soweit der Auftraggeber sie erfasst',
  'Empfänger von Angeboten und Rechnungen des Auftraggebers',
];

export const MASSNAHMEN_IM_PROGRAMM = [
  'Zugangskontrolle: Passwörter werden ausschließlich als bcrypt-Hash mit zwölf Runden gespeichert und nie im Klartext.',
  'Zweiter Faktor: Jedes Konto kann einen zweiten Faktor per Authenticator-App (TOTP) einschalten; ein Arbeitsbereich kann ihn für alle Mitglieder verlangen.',
  'Schutz vor Durchprobieren: Nach zehn Fehlversuchen innerhalb von fünfzehn Minuten wird die Anmeldung für das Konto vorübergehend gesperrt; Anfragen werden zusätzlich gedrosselt.',
  'Sitzungen: Zugangstoken sind kurzlebig (Voreinstellung 15 Minuten); der langlebige Erneuerungstoken liegt in einem httpOnly-Cookie, das kein Skript lesen kann, und ist widerrufbar, sodass ein Abmelden sofort wirkt. Ohne „Angemeldet bleiben“ endet eine Sitzung mit dem Schließen des Browsers und spätestens zwölf Stunden nach der letzten Nutzung. Aktive Sitzungen lassen sich einzeln beenden.',
  'Mandantentrennung: Jeder Datensatz trägt die Kennung seines Arbeitsbereichs, und jede Abfrage filtert darauf. Die Trennung ist Teil der Abfrage und nicht eine Prüfung, die vergessen werden kann.',
  'Rechteverwaltung: Zugriff wird über Rollen je Arbeitsbereich vergeben. Eine Rolle kann auf die eigenen Datensätze beschränkt werden, und einzelne Felder lassen sich je Rolle verbergen oder nur lesbar machen; beides wirkt auch in Export, Suche, Filtern und Summen.',
  'Verschlüsselung besonders schutzbedürftiger Daten: Zugangsdaten verbundener Postfächer und Kalender sowie Zugangstoken von Google und Microsoft werden mit aes-256-gcm verschlüsselt abgelegt und nie wieder angezeigt. Ohne hinterlegten Schlüssel verweigert das System die Speicherung, statt sie im Klartext abzulegen.',
  'Postfachzugriff beim Lesen ausschließlich lesend: Der Posteingang wird ohne Schreibrechte geöffnet. Nachrichten können nicht als gelesen markiert, verschoben oder gelöscht werden.',
  'Übertragung: Die Oberfläche wird über HTTPS ausgeliefert; steht die Datenbank außerhalb des eigenen Netzes, wird ihre Verbindung gegen ein hinterlegtes CA-Zertifikat geprüft.',
  'Absicherung im Browser: Die Anwendung setzt eine Content-Security-Policy, verbietet die Einbettung in fremde Seiten und bindet keine fremden Skripte oder Schriften ein. Cookies dienen nur technischen Zwecken: das Erneuerungs-Cookie der Sitzung, bei einer Anmeldung ohne „Angemeldet bleiben“ ein inhaltsloses Merkzeichen, das mit dem Browser verfällt, und, nur während ein Postfach oder Kalender über Google oder Microsoft verbunden wird, für höchstens zehn Minuten ein Cookie, das die Rückkehr vom Anbieter an den Browser bindet.',
  'Protokollierung: Änderungen an Datensätzen werden mit Nutzer, Zeitpunkt und Feldern festgehalten. Ein Sicherheitsprotokoll hält Anmeldungen, Fehlversuche, Änderungen am Zugang und Exporte fest; bei einer Anmeldung von einem neuen Gerät geht eine Nachricht an das Konto.',
  `Wiederherstellbarkeit im Alltag: Gelöschte Firmen, Kontakte, Geschäfte und Aufgaben liegen standardmäßig ${String(PAPIERKORB_TAGE)} Tage im Papierkorb, bevor sie endgültig entfernt werden; der Verantwortliche kann die Frist zwischen ${String(PAPIERKORB_TAGE_MIN)} und ${String(PAPIERKORB_TAGE_MAX)} Tagen einstellen.`,
  'Löschbarkeit: Der Auftraggeber kann den gesamten Arbeitsbereich mit allen Daten selbst und unwiderruflich löschen.',
  'Übertragbarkeit: Der Auftraggeber kann den gesamten Inhalt jederzeit selbst als maschinenlesbare Datei ausleiten.',
];

export const UNTERAUFTRAG_STAND = '2026-10-20';

export const weitereAuftragsverarbeiter = (fakten: PrivacyFacts): string[] => {
  const unterauftragnehmer: string[] = [];

  if (fakten.hosting !== null) {
    unterauftragnehmer.push(
      `Betrieb und Speicherung: ${fakten.hosting}. Verarbeitet sämtliche in Anlage 1 genannten Daten.`,
    );
  }

  if (fakten.outgoingMail) {
    unterauftragnehmer.push(
      'Versand ausgehender E-Mail. Verarbeitet Empfängeradresse und Inhalt der jeweiligen Nachricht.',
    );
  }

  if (fakten.billing) {
    unterauftragnehmer.push(
      'Zahlungsabwicklung über Stripe. Verarbeitet Zahlungs- und Rechnungsdaten des Auftraggebers; keine Daten aus dessen Arbeitsbereich.',
    );
  }

  if (fakten.errorReporting) {
    unterauftragnehmer.push(
      'Auswertung technischer Fehler. Erhält Fehlerberichte, aus denen Cookies, Kopfzeilen und Anfrageinhalte vor dem Versand entfernt werden.',
    );
  }

  return unterauftragnehmer;
};

export const dpaDocument = (
  fakten: PrivacyFacts,
  processorName: string | null,
): DpaDocument => {
  const unterauftragnehmer = weitereAuftragsverarbeiter(fakten);

  return {
    title: 'Vertrag über die Verarbeitung personenbezogener Daten im Auftrag',
    reviewed: fakten.dpaReviewed,
    processorName,

    sections: [
      {
        label: '§ 1',
        title: 'Gegenstand und Dauer',
        blocks: [
          text(
            'Der Auftragnehmer verarbeitet personenbezogene Daten im Auftrag des Auftraggebers im Sinne von Art. 4 Nr. 8 und Art. 28 DSGVO. Gegenstand ist der Betrieb der Software Stegwerk als Kundenverwaltung für den Auftraggeber.',
          ),
          text(
            'Art, Zweck und Umfang der Verarbeitung, die Arten der Daten und die Kategorien betroffener Personen ergeben sich aus Anlage 1.',
          ),
          text(
            'Der Vertrag läuft für die Dauer des zugrunde liegenden Hauptvertrags. Er endet mit diesem, ohne dass es einer gesonderten Kündigung bedarf.',
          ),
        ],
      },
      {
        label: '§ 2',
        title: 'Weisungsbindung',
        blocks: [
          text(
            'Der Auftragnehmer verarbeitet die Daten ausschließlich auf dokumentierte Weisung des Auftraggebers. Dieser Vertrag und die Nutzung der Software durch den Auftraggeber sind die Weisung; darüber hinausgehende Weisungen erteilt der Auftraggeber in Textform.',
          ),
          text(
            'Der Auftragnehmer übermittelt die Daten nicht in ein Drittland, es sei denn, er ist dazu rechtlich verpflichtet. In diesem Fall teilt er dem Auftraggeber die rechtliche Verpflichtung vor der Verarbeitung mit, sofern das Recht dies nicht wegen eines wichtigen öffentlichen Interesses verbietet.',
          ),
          text(
            'Hält der Auftragnehmer eine Weisung für rechtswidrig, teilt er dies dem Auftraggeber unverzüglich mit und darf ihre Ausführung bis zur Bestätigung aussetzen.',
          ),
        ],
      },
      {
        label: '§ 3',
        title: 'Vertraulichkeit',
        blocks: [
          text(
            'Der Auftragnehmer setzt zur Verarbeitung nur Personen ein, die zur Vertraulichkeit verpflichtet sind oder einer angemessenen gesetzlichen Verschwiegenheitspflicht unterliegen. Die Verpflichtung besteht auch nach Beendigung ihrer Tätigkeit fort.',
          ),
        ],
      },
      {
        label: '§ 4',
        title: 'Technische und organisatorische Maßnahmen',
        blocks: [
          text(
            'Der Auftragnehmer trifft die in Anlage 2 beschriebenen Maßnahmen nach Art. 32 DSGVO und hält sie während der Vertragsdauer aufrecht.',
          ),
          text(
            'Maßnahmen dürfen weiterentwickelt werden, solange das Schutzniveau nicht unterschritten wird. Wesentliche Änderungen dokumentiert der Auftragnehmer.',
          ),
        ],
      },
      {
        label: '§ 5',
        title: 'Unterauftragsverarbeiter',
        blocks: [
          text(
            'Der Auftraggeber stimmt dem Einsatz der in Anlage 3 genannten weiteren Auftragsverarbeiter zu.',
          ),
          text(
            'Wechsel oder Hinzunahme teilt der Auftragnehmer rechtzeitig in Textform mit. Der Auftraggeber kann innerhalb von 14 Tagen aus einem wichtigen datenschutzrechtlichen Grund widersprechen; wird der Widerspruch erhoben und lässt sich die Leistung ohne den betreffenden Unterauftragnehmer nicht erbringen, steht beiden Seiten ein Sonderkündigungsrecht zu.',
          ),
          text(
            'Der Auftragnehmer erlegt jedem Unterauftragnehmer dieselben Pflichten auf, die ihn nach diesem Vertrag treffen.',
          ),
        ],
      },
      {
        label: '§ 6',
        title: 'Unterstützung des Auftraggebers',
        blocks: [
          text(
            'Der Auftragnehmer unterstützt den Auftraggeber bei der Beantwortung von Anträgen betroffener Personen nach Art. 12 bis 23 DSGVO. Auskunft, Herausgabe und Löschung kann der Auftraggeber über die Funktionen der Software weitgehend selbst vornehmen; Anlage 2 nennt sie.',
          ),
          text(
            'Wendet sich eine betroffene Person unmittelbar an den Auftragnehmer, leitet er das Anliegen unverzüglich an den Auftraggeber weiter und beantwortet es nicht selbst.',
          ),
          text(
            'Der Auftragnehmer unterstützt den Auftraggeber ferner bei den Pflichten nach Art. 32 bis 36 DSGVO, insbesondere bei der Meldung von Verletzungen des Schutzes personenbezogener Daten und bei einer Datenschutz-Folgenabschätzung.',
          ),
        ],
      },
      {
        label: '§ 7',
        title: 'Verletzungen des Schutzes personenbezogener Daten',
        blocks: [
          text(
            'Wird dem Auftragnehmer eine Verletzung des Schutzes personenbezogener Daten des Auftraggebers bekannt, meldet er sie dem Auftraggeber unverzüglich, spätestens innerhalb von 24 Stunden nach Kenntnis, in Textform.',
          ),
          text(
            'Die Meldung enthält, soweit bekannt: Art der Verletzung, betroffene Kategorien und ungefähre Zahl der Datensätze, wahrscheinliche Folgen und die ergriffenen oder vorgeschlagenen Maßnahmen. Fehlende Angaben reicht der Auftragnehmer unverzüglich nach.',
          ),
        ],
      },
      {
        label: '§ 8',
        title: 'Nachweise und Überprüfung',
        blocks: [
          text(
            'Der Auftragnehmer stellt dem Auftraggeber auf Anfrage die Informationen zur Verfügung, die zum Nachweis der Einhaltung dieses Vertrags erforderlich sind.',
          ),
          text(
            'Der Auftraggeber ist berechtigt, sich von der Einhaltung zu überzeugen, insbesondere durch Einholung von Auskünften und Einsicht in vorhandene Nachweise. Vor-Ort-Prüfungen sind mit angemessener Vorankündigung während der üblichen Geschäftszeiten und ohne Störung des Betriebsablaufs zulässig.',
          ),
        ],
      },
      {
        label: '§ 9',
        title: 'Löschung und Rückgabe',
        blocks: [
          text(
            'Nach Beendigung der Verarbeitung löscht der Auftragnehmer die Daten oder gibt sie nach Wahl des Auftraggebers zurück, sofern keine gesetzliche Aufbewahrungspflicht entgegensteht. Die Herausgabe erfolgt in einem gängigen maschinenlesbaren Format.',
          ),
          fakten.retentionEnabled
            ? text(
                `Endet der Zugang des Auftraggebers, werden seine Daten nach ${String(
                  fakten.retentionDays,
                )} Tagen automatisch gelöscht. Der Auftraggeber wird 30 und 7 Tage vor der Löschung gewarnt. Er kann die Löschung jederzeit selbst früher auslösen.`,
              )
            : text(
                'Eine automatische Löschung nach Ende des Zugangs ist in dieser Installation nicht eingeschaltet. Die Löschung erfolgt auf Verlangen des Auftraggebers oder durch ihn selbst über die Funktionen der Software.',
              ),
        ],
      },
      {
        label: '§ 10',
        title: 'Schlussbestimmungen',
        blocks: [
          text(
            'Änderungen und Ergänzungen bedürfen der Textform. Das gilt auch für die Abbedingung dieses Formerfordernisses.',
          ),
          text(
            'Sollte eine Bestimmung unwirksam sein, bleibt der übrige Vertrag wirksam. Widersprechen sich Hauptvertrag und dieser Vertrag, gilt für den Datenschutz dieser Vertrag.',
          ),
          text('Es gilt das Recht der Bundesrepublik Deutschland.'),
        ],
      },
    ],

    annexes: [
      {
        label: 'Anlage 1',
        title: 'Gegenstand, Art und Zweck der Verarbeitung',
        blocks: [
          text(
            'Art und Zweck: Bereitstellung und Betrieb einer Software zur Kundenverwaltung, einschließlich Speicherung, Auswertung und Ausgabe der vom Auftraggeber eingegebenen Daten sowie der Erstellung von Angeboten und Rechnungen.',
          ),
          text('Arten der verarbeiteten Daten:'),
          list(DATENARTEN),
          ...(fakten.mailboxes
            ? [
                text(
                  'Verbindet der Auftraggeber ein E-Mail-Postfach, kommen hinzu: Absender, Empfänger, Betreff, Zeitpunkt und ein Textauszug der Nachrichten in dem gewählten Ordner. Vollständige Nachrichtentexte und Anhänge werden nicht gespeichert.',
                ),
              ]
            : []),
          text('Kategorien betroffener Personen:'),
          list(BETROFFENE),
          text(
            'Dauer der Verarbeitung: für die Laufzeit des Hauptvertrags, anschließend nach § 9 dieses Vertrags.',
          ),
        ],
      },
      {
        label: 'Anlage 2',
        title: 'Technische und organisatorische Maßnahmen (Art. 32 DSGVO)',
        blocks: [
          text('Maßnahmen der Software:'),
          list(MASSNAHMEN_IM_PROGRAMM),
          text('Maßnahmen der Unterbringung:'),
          fakten.hosting === null
            ? gap(
                'LEGAL_HOSTING',
                'Wer die Anlage betreibt und wo sie steht, ist noch nicht angegeben. Ohne diese Angabe ist Anlage 2 unvollständig: Serverstandort, Zutrittskontrolle und Verfügbarkeit gehören dem Betrieb und nicht der Software.',
              )
            : text(
                `Betrieb und Speicherung erfolgen bei ${fakten.hosting}. Die dort getroffenen Maßnahmen zu Zutritt, Verfügbarkeit und Trennung ergeben sich aus dessen Nachweisen.`,
              ),
          fakten.backupDescription === null
            ? gap(
                'LEGAL_BACKUP_DESCRIPTION',
                'Verfügbarkeit und Wiederherstellbarkeit: Diese Angabe macht die Software nicht, weil sie sie nicht kennen kann. Hierhin gehört, wie oft gesichert wird, wie lange Sicherungen aufbewahrt werden und wann die Wiederherstellung zuletzt tatsächlich erprobt wurde. Eine Zusicherung, die ungeprüft eingetragen wird, ist eine vertragliche Zusage über etwas, das es möglicherweise nicht gibt.',
              )
            : text(
                `Verfügbarkeit und Wiederherstellbarkeit: ${fakten.backupDescription}`,
              ),
        ],
      },
      {
        label: 'Anlage 3',
        title: 'Weitere Auftragsverarbeiter',
        blocks:
          unterauftragnehmer.length === 0
            ? [
                text(
                  'In dieser Installation ist kein weiterer Auftragsverarbeiter eingebunden. Wird einer hinzugenommen, gilt § 5.',
                ),
              ]
            : [
                text(
                  'Der Auftraggeber stimmt dem Einsatz der folgenden weiteren Auftragsverarbeiter zu:',
                ),
                list(unterauftragnehmer),
              ],
      },
    ],
  };
};
