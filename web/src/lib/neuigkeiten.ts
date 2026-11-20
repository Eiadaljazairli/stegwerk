export type Neuigkeit = {
  id: string;
  datum: string;
  titel: string;
  punkte: string[];
  hilfe?: string;
};

export const NEUIGKEITEN: Neuigkeit[] = [
  {
    id: '2026-10-28-welle5b',
    datum: '2026-10-28',
    titel:
      'Gemeinsame Postfächer, Board und Kalender für alles, Änderungen sofort sehen',
    punkte: [
      'Gemeinsame Postfächer wie info@ oder vertrieb@: festlegen, wer im Team sie liest, Gespräche zuweisen und als erledigt markieren. Jede Person kann mehrere eigene Postfächer verbinden und unter „Von“ den Absender wählen.',
      'Firmen, Kontakte, Geschäfte und Aufgaben gibt es auch als Board oder Kalender; Karten ziehen ändert Status, Branche, Verantwortliche oder das Datum. Angebote zusätzlich als Board nach Status.',
      'Was Kollegen ändern, sehen Sie sofort, ohne Neuladen. In einer offenen Akte sagt ein Hinweis, wer sie gerade geändert hat.',
      'Unter Einstellungen → Objekte benennen Sie Firmen, Kontakte, Geschäfte, Aufgaben und Angebote um, etwa „Aufträge“ statt „Geschäfte“.',
      'Eigene Felder können auf andere Datensätze verweisen, etwa „Partnerfirma“ am Kontakt; die Gegenseite zeigt, wer auf sie verweist.',
      'Einzelne Firmen, Kontakte und Geschäfte geben Sie Kollegen zum Lesen oder Bearbeiten frei. Notizen und Aufgaben können zugleich an Firma, Kontakt und Geschäft hängen.',
    ],
  },
  {
    id: '2026-10-28-welle5a',
    datum: '2026-10-28',
    titel:
      'Neuer Look, KI mit eigenem Schlüssel, Firmendaten aus dem Impressum',
    punkte: [
      'Stegwerk hat einen neuen Look: die Schrift Inter, ruhige Grautöne, einheitliche Abstände und klare Symbole. Die Schrift kommt von unserem eigenen Server.',
      'KI mit dem eigenen Schlüssel Ihres Kontos bei Anthropic oder OpenAI: „KI fragen“ beantwortet Fragen zu Ihren Daten nur mit Ihren Rechten, „Entwurf mit KI“ hilft bei Mails und Angebotstexten. Änderungen schlägt sie nur zur Freigabe vor.',
      '„Daten ergänzen“ in der Firmenakte liest das Impressum der Firmenwebsite und schlägt Anschrift, Telefon, Handelsregister und USt-IdNr. vor; übernommen wird nur, was Sie anhaken. Das Logo der Website lässt sich einmal holen.',
      'Beim Anmelden wählen Sie „Angemeldet bleiben“; ohne Haken endet die Sitzung mit dem Browser. Leicht zu erratende Passwörter werden abgelehnt, und Einladungen lassen sich auf die Domains der eigenen Firma beschränken.',
    ],
  },
  {
    id: '2026-10-26-welle4',
    datum: '2026-10-26',
    titel:
      'Freigabe für KI und Automationen, Board direkt bearbeiten, Hilfe bei Problemen',
    punkte: [
      'Ein KI-Assistent kann auf Wunsch nur vorschlagen: Änderungen und Mail-Entwürfe warten unter „KI-Vorschläge“ auf Ihre Freigabe. Automationen legen Kundenmails auf Wunsch als Entwurf ab und schreiben in Kanäle von Slack oder Microsoft Teams.',
      'Private Termine sehen Kollegen nur als „belegt“; Termine aus dem verbundenen Kalender ordnen sich Kunden und Geschäften selbst zu. Neu sind Verteiler für Serienmails und eine Prüfung der Zustellbarkeit Ihrer Absenderdomain.',
      'Auf dem Board ändern Sie Betrag, Abschluss und Felder direkt auf der Karte und wählen die Kennzahl über jeder Spalte. Ansichten merken sich Liste oder Board, Filter lassen sich per Klick ändern, „+ Neu“ legt Datensätze gleich in der Tabelle an.',
      'Eigene Felder bekommen Hinweise, Standardwerte und Abschnitte; kaum genutzte Felder treten zurück. Zur Postleitzahl ergänzt Stegwerk den Ort, ohne fremden Dienst.',
      '„Wenn etwas nicht klappt“ erklärt die häufigsten Probleme; Fehlermeldungen führen mit „So beheben Sie das“ direkt dorthin. Neu sind Seiten zu jeder Funktion und eine Doku für Entwickler.',
      'Registrierung und Webformular schützt eine Rechenaufgabe, die der Browser selbst löst, ohne Bilderrätsel. Beim Einladen schlägt Stegwerk Kollegen vor; eine Kachel zeigt den Umsatz aus gestellten Rechnungen.',
    ],
  },
  {
    id: '2026-10-22-welle3',
    datum: '2026-10-22',
    titel: 'Eigene Dashboards, bessere Suche, mehr Automationen',
    punkte: [
      'Legen Sie mehrere Dashboards an, für sich oder fürs Team; ein Klick auf einen Balken öffnet die passende Liste.',
      'Die Suche findet „Müller“ auch als „Mueller“ oder „Muller“, verzeiht Tippfehler und zeigt die besten Treffer zuerst. Unter „Einstellungen“ steht alles an einem Ort.',
      'Automationen starten auch per Knopf am Datensatz, nach Zeitplan oder von außen, mit mehreren Schritten und Probelauf; bestehende Regeln lassen sich bearbeiten.',
      'Aus einem Angebot erstellen Sie Auftragsbestätigung und Lieferschein, auch für Teillieferungen.',
      'KI-Assistenten wie Claude greifen mit einem API-Schlüssel auf Ihre Daten zu, mit genau dessen Rechten.',
      'Neu für Verantwortliche: Abmelden nach Leerlauf, ein Protokoll des ganzen Bereichs und eigene Rechte für Schnittstellen.',
      'Zum Ausprobieren lassen sich Beispieldaten laden und mit einem Klick wieder entfernen.',
    ],
  },
  {
    id: '2026-10-22-welle2',
    datum: '2026-10-22',
    titel: 'Gruppieren, Erwähnen, mehrere Ansprechpartner',
    punkte: [
      'Listen lassen sich nach Phase, Verantwortlichen, Branche, Stadt oder eigenen Feldern gruppieren, mit Anzahl und Summe je Gruppe.',
      'Filter verknüpfen Sie mit „und“ oder „oder“ und auch über die Firma, etwa Kontakte, deren Firma in Hamburg sitzt. Der Export übernimmt genau diese Auswahl.',
      'Notizen und Aufgaben mit Überschriften, Listen und Checklisten; mit @Name erwähnen Sie Kolleginnen und Kollegen, die dann eine Nachricht bekommen.',
      'Ein Geschäft kann mehrere Ansprechpartner mit Rolle haben; in der Firmenakte sehen Sie auch, was bei ihren Kontakten passiert.',
      'Mails stehen in ganzer Länge in der Akte; Anhänge legen Sie mit einem Klick an der Akte ab.',
      'Neue Feldarten Anschrift, Links und Prozent, Muttergesellschaft und Tochterfirmen, und an jedem Datensatz steht, woher er kam.',
      'Beim Import wählen Sie die Kopfzeile, ordnen Werte zu und korrigieren abgelehnte Zeilen direkt; auch Notizen, Aufgaben und Artikel lassen sich importieren.',
    ],
  },
  {
    id: '2026-10-21-offene-punkte',
    datum: '2026-10-21',
    titel: 'ZUGFeRD, Serientermine, Board per Tastatur',
    punkte: [
      'Das PDF einer gestellten Rechnung ist jetzt zugleich E-Rechnung (ZUGFeRD, Profil EN 16931). Ihr Kunde kann es lesen oder direkt in seine Buchhaltung übernehmen.',
      'Bei Serienterminen ändern, verschieben, absagen oder löschen Sie auch nur einen Tag oder alle ab einem Tag, auch im Kalender-Abo und über CalDAV.',
      'Im Papierkorb legen Sie fest, nach wie vielen Tagen Gelöschtes endgültig verschwindet (1 bis 365).',
      'Bis zu neun doppelte Firmen oder Kontakte führen Sie in einem Schritt zusammen, mit Vorschau.',
      'Karten im Board verschieben Sie auch per Tastatur und mit dem Finger; alle Texte sind in hell und dunkel gut lesbar.',
      'Beim Öffnen einer Seite stellt die App nur noch etwa ein Drittel so viele Anfragen an den Server.',
    ],
  },
  {
    id: '2026-10-21-pruefung',
    datum: '2026-10-21',
    titel: 'Gründlich geprüft: Rechte, Belege und Fehlerfälle',
    punkte: [
      'Wer nur die eigenen Kunden sieht, sieht auch Aufgaben, Termine, Dateien, Post, Angebote und Rechnungen fremder Kunden nicht mehr.',
      'Rechnungen und Angebote rechnen centgenau; Datum und Nummer folgen der deutschen Zeit, auch kurz vor Mitternacht.',
      'Steuerfreie Positionen (z. B. innergemeinschaftliche Lieferung, Reverse Charge) mit Hinweistext, passender E-Rechnung und DATEV-Konto.',
      'Lange Belege: der Tabellenkopf steht auf jeder Seite, nichts läuft mehr in die Fußzeile.',
      'Beträge mit Komma („2500,50“) werden beim Import richtig gelesen; Fehlermeldungen sind durchgehend deutsch und verständlich.',
    ],
  },
  {
    id: '2026-10-21-uebergabe',
    datum: '2026-10-21',
    titel: 'Saubere Übergabe, wenn jemand das Team verlässt',
    punkte: [
      'Beim Entfernen wählen Sie, wer offene Aufgaben, Kunden, künftige Termine und offene Angebote übernimmt.',
      'Postfach und Kalender der ausscheidenden Person werden getrennt; die gelesene Post bleibt an den Akten.',
    ],
    hilfe: 'team',
  },
  {
    id: '2026-10-21-visitenkarte',
    datum: '2026-10-21',
    titel: 'Signatur, Funktion und Durchwahl',
    punkte: [
      'Unter „Mein Konto“ hinterlegen Sie eine E-Mail-Signatur; sie steht unter jeder neuen Mail aus der Akte.',
      'Funktion und Durchwahl stehen mit Ihrem Namen als „Ihr Ansprechpartner“ auf den Angeboten, die Sie anlegen.',
      'Platzhalter kennen einen Ersatz: „Hallo {{vorname|zusammen}}“ schreibt „zusammen“, wo der Vorname fehlt.',
      'In der Kontaktliste starten Sie Mail und Anruf mit einem Klick.',
    ],
    hilfe: 'team',
  },
  {
    id: '2026-10-21-aufgaben',
    datum: '2026-10-21',
    titel: 'Aufgaben in Arbeit, mit Uhrzeit und mit Dateien',
    punkte: [
      'Aufgaben haben jetzt drei Stände: offen, in Arbeit, erledigt. Die Aufgabenliste hat dafür einen eigenen Reiter.',
      'Zur Fälligkeit lässt sich eine Uhrzeit angeben; überfällig ist eine Aufgabe dann ab dieser Minute.',
      'Dateien hängen Sie auch an Aufgaben und Notizen.',
      'Termine nehmen einen Link zur Videokonferenz auf, der in Einladung und Erinnerung mitgeht.',
      'Die Zeitleiste einer Akte lässt sich auf Notizen, Dateien oder Änderungen eingrenzen.',
    ],
    hilfe: 'aufgaben',
  },
  {
    id: '2026-10-20-oauth',
    datum: '2026-10-20',
    titel: 'Postfach und Kalender von Google und Microsoft',
    punkte: [
      'Gmail, Google Kalender und Microsoft 365 lassen sich mit der Anmeldung beim Anbieter verbinden, ohne App-Passwort — sobald der Betreiber diese Anbindung eingerichtet hat.',
    ],
    hilfe: 'postfach',
  },
  {
    id: '2026-10-20-uebersicht',
    datum: '2026-10-20',
    titel: 'Die Übersicht nach Ihrem Geschmack',
    punkte: [
      'Unter „Anpassen“ stellen Sie Ihre Übersicht aus Kacheln zusammen: Kennzahlen, Balken, Listen, Pipeline und Prognose.',
      'Jede Person hat ihre eigene Anordnung; ohne Anpassung bleibt alles wie gewohnt.',
    ],
    hilfe: 'uebersicht-anpassen',
  },
  {
    id: '2026-10-20-kontaktwege',
    datum: '2026-10-20',
    titel: 'Mehrere E-Mail-Adressen und Telefonnummern',
    punkte: [
      'Ein Kontakt kann weitere Adressen und Nummern haben, jeweils mit Art wie Arbeit, Privat oder Mobil.',
      'Post von einer Zweitadresse landet trotzdem beim richtigen Kontakt.',
      'Telefonnummern werden einheitlich gespeichert und sind direkt anwählbar.',
    ],
    hilfe: 'firmen-kontakte',
  },
  {
    id: '2026-10-20-ansichten',
    datum: '2026-10-20',
    titel: 'Ansichten nur für Sie, und als Link zum Teilen',
    punkte: [
      'Ansichten lassen sich „nur für mich“ speichern.',
      'Eine geöffnete Ansicht aktualisieren Sie mit einem Klick, statt sie neu anzulegen.',
      'Listen öffnen mit der zuletzt genutzten Ansicht.',
      '„Link kopieren“ schickt Kollegen genau die Auswahl, die Sie sehen.',
    ],
    hilfe: 'ansichten',
  },
  {
    id: '2026-10-20-listen',
    datum: '2026-10-20',
    titel: 'Schneller durch Listen und Akten',
    punkte: [
      'In der Akte blättern Sie mit ‹ und › zum nächsten Eintrag der Liste.',
      'Ausgewählte Zeilen lassen sich gezielt als CSV exportieren.',
      'Dateien ziehen Sie einfach auf den Abschnitt „Dateien“.',
      'Inhaber werden drei Tage vor Ende der Testphase erinnert.',
    ],
    hilfe: 'mehrfachauswahl',
  },
  {
    id: '2026-10-20-kalender',
    datum: '2026-10-20',
    titel: 'Kalender in beide Richtungen',
    punkte: [
      'Kalender über CalDAV verbinden, etwa Nextcloud, IONOS, mailbox.org oder iCloud: Termine gehen hin und zurück.',
      'Einladungen kommen als echte Kalendereinladungen an; Zu- und Absagen werden am Termin vermerkt.',
    ],
    hilfe: 'kalender',
  },
  {
    id: '2026-10-20-pipelines',
    datum: '2026-10-20',
    titel: 'Mehrere Pipelines und Phasenfarben',
    punkte: [
      'Getrennte Abläufe, etwa Neukunden und Wartung, bekommen je eine eigene Pipeline.',
      'Phasen haben Farben und lassen sich je Pipeline ausblenden.',
    ],
    hilfe: 'geschaefte',
  },
  {
    id: '2026-10-20-serienmails',
    datum: '2026-10-20',
    titel: 'Serienmails',
    punkte: [
      'Ein Text an viele Kontakte, persönlich angesprochen und über Ihr eigenes Postfach verschickt.',
      'Jede Mail enthält einen Abmeldelink; wer sich abgemeldet hat, sehen Sie in einer eigenen Liste und am Kontakt.',
    ],
    hilfe: 'serienmails',
  },
  {
    id: '2026-10-20-rechte',
    datum: '2026-10-20',
    titel: 'Feinere Rechte',
    punkte: [
      'Rollen können auf die eigenen Datensätze beschränkt werden.',
      'Einzelne Felder, etwa der Betrag, lassen sich je Rolle verbergen oder nur lesbar machen — auch in Summen, Auswertungen und Export.',
    ],
    hilfe: 'team',
  },
  {
    id: '2026-10-20-konto',
    datum: '2026-10-20',
    titel: 'Mehr Kontrolle über das eigene Konto',
    punkte: [
      'Anmelde-Adresse ändern und das eigene Konto löschen.',
      'Eine Nachricht, wenn sich jemand von einem neuen Gerät anmeldet.',
      'Wer das Team verwaltet, setzt den zweiten Faktor eines Kollegen zurück, der sein Telefon verloren hat.',
    ],
  },
  {
    id: '2026-10-20-automationen',
    datum: '2026-10-20',
    titel: 'Automationen',
    punkte: [
      'Wenn-Dann-Regeln mit Bedingungen, Verzögerung, E-Mail und Verteilung reihum.',
      'Ein Protokoll zeigt, was jede Regel getan hat.',
    ],
    hilfe: 'automationen',
  },
  {
    id: '2026-10-20-import',
    datum: '2026-10-20',
    titel: 'Leichterer Umstieg',
    punkte: [
      'Excel-Dateien direkt importieren; CSV aus deutschem Excel mit Umlauten wird richtig gelesen.',
      'Spalten aus Outlook, Pipedrive oder HubSpot werden von selbst zugeordnet; eine Beispieldatei zeigt das Format.',
    ],
    hilfe: 'import-export',
  },
  {
    id: '2026-10-20-felder',
    datum: '2026-10-20',
    titel: 'Eigene Felder und Listen',
    punkte: [
      'Neue Feldarten: farbige Auswahl, Mehrfachauswahl, Betrag, Link, E-Mail, Telefon, Bewertung, eindeutige Werte.',
      'Werte direkt in der Liste bearbeiten, Summenzeile unter der Liste, Filter mit relativen Zeiträumen.',
    ],
    hilfe: 'felder',
  },
  {
    id: '2026-10-20-auswertungen',
    datum: '2026-10-20',
    titel: 'Auswertungen und ruhende Geschäfte',
    punkte: [
      'Gewonnen und verloren je Monat, Abschlussquote, Zahlen je Verkäufer und Verlustgründe.',
      'Geschäfte ohne Aktivität werden als ruhend markiert.',
    ],
    hilfe: 'auswertungen',
  },
];

export const neuesteNeuigkeit = (eintraege: Neuigkeit[]): string =>
  eintraege.reduce(
    (neueste, eintrag) => (eintrag.datum > neueste ? eintrag.datum : neueste),
    '',
  );

export const ungelesen = (
  eintraege: Neuigkeit[],
  zuletzt: string | null,
): number => {
  if (zuletzt === null) {
    const neueste = neuesteNeuigkeit(eintraege);

    return eintraege.filter((eintrag) => eintrag.datum === neueste).length;
  }

  return eintraege.filter((eintrag) => eintrag.datum > zuletzt).length;
};

const schluessel = (userId: string) => `stegwerk.neuigkeiten.${userId}`;

export const zuletztGesehen = (userId: string): string | null => {
  try {
    return window.localStorage.getItem(schluessel(userId));
  } catch {
    return null;
  }
};

export const alsGesehenMerken = (userId: string, datum: string): void => {
  try {
    window.localStorage.setItem(schluessel(userId), datum);
  } catch {}
};
