import { useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { ankerAusHash } from '../components/Anker';
import { LEGAL_ENTITY } from '../lib/queries';
import { IconArrowRight } from '../components/Icons';

type Abschnitt = {
  id: string;
  titel: string;
  absaetze: string[];
  links?: { to: string; label: string }[];
};

const taste = /Mac|iPhone|iPad/u.test(navigator.platform) ? '⌘ K' : 'Strg + K';

const ABSCHNITTE: Abschnitt[] = [
  {
    id: 'start',
    titel: 'Erste Schritte',
    absaetze: [
      'Die Übersicht zeigt, was zum Einrichten noch fehlt: Briefkopf, erste Kontakte, ein Geschäft, ein Angebot, das Postfach, das Team und die Zwei-Faktor-Anmeldung. Jeder Schritt führt zur passenden Seite und hakt sich selbst ab, sobald er erledigt ist.',
      'Darunter stehen Ihre offenen Aufgaben, die Pipeline nach Phasen und die Prognose für die nächsten Monate.',
      'Zum Ausprobieren lädt „Beispieldaten laden“ unter „Team“ vier erfundene Firmen mit Kontakten, Geschäften, Aufgaben und einer Notiz. Sie tragen die Herkunft „als Beispiel“, zählen nicht als erledigte erste Schritte und verschwinden mit „Beispieldaten entfernen“ wieder, samt Notizen, Aufgaben und Terminen daran. Eigene Datensätze bleiben; zeigten sie auf ein Beispiel, fällt nur dieser Verweis weg. Hängt an einem Beispiel ein Angebot, eine Rechnung oder eine Datei, wird nichts entfernt.',
      'Eine Branchenvorlage (Handwerk, Agentur, Großhandel) benennt die Phasen der Standard-Pipeline so, wie die Branche sie nennt, und legt ein paar übliche eigene Felder an. Vorhandene Felder mit gleichem Namen bleiben, wie sie sind; Phasennamen lassen sich danach jederzeit wieder ändern.',
    ],
    links: [
      { to: '/', label: 'Zur Übersicht' },
      { to: '/team#beispieldaten', label: 'Beispieldaten' },
    ],
  },
  {
    id: 'uebersicht-anpassen',
    titel: 'Übersicht anpassen',
    absaetze: [
      'Mit „Anpassen“ oben auf der Übersicht stellen Sie Ihre eigenen Kacheln zusammen: Kennzahlen (Anzahl, Summe oder Durchschnitt), Balken nach Phase, verantwortlicher Person, Branche, Herkunft, Verlustgrund oder einem eigenen Auswahlfeld, Balken über die Zeit nach Woche, Monat, Quartal oder Jahr, Listen wie ruhende oder neue Geschäfte, die Pipeline einer bestimmten Pipeline, die Prognose und Ihre offenen Aufgaben. So zeigt etwa „Geschäfte, Summe, nach Branche“ den Umsatz je Branche, „nach Herkunft“, ob er aus dem Webformular, einem Import oder von Hand kam. Mit den Pfeilen ändern Sie die Reihenfolge, mit dem Kreuz entfernen Sie eine Kachel.',
      'Für den tatsächlichen Umsatz wählen Sie bei „Was“ die Rechnungen: „Summe netto“ zählt alle gestellten Rechnungen ohne Entwürfe, eine Rechnungskorrektur zieht ihr storniertes Original wieder ab. Gruppiert wird nach Branche, Herkunft oder Kunde (über die Firma der Rechnung) oder nach dem Rechnungsdatum; „Offen“ und „Bezahlt“ grenzen weiter ein. Dafür braucht die Rolle das Recht, Rechnungen zu sehen.',
      'Ein Klick auf einen Balken öffnet die Liste mit genau diesen Datensätzen, als gefilterte Ansicht: etwa alle Geschäfte der Branche Bau oder alle Kontakte aus dem dritten Quartal. Die Branche eines Geschäfts oder Kontakts ist die seiner Firma; eine Firma, die Ihre Rolle nicht sehen darf, zählt wie keine.',
      'Neben der Übersicht legen Sie mit „Neues Dashboard“ weitere an, etwa „Vertrieb Nord“ für das Team oder „Meine Zahlen“ nur für sich. Ein geteiltes Dashboard sieht der ganze Bereich, jede Person darin aber nur, was ihre Rolle erlaubt; ändern, umbenennen und löschen dürfen, wer es angelegt hat, und die Verwaltung. Ob es privat ist, entscheidet nur, wer es angelegt hat. Auf Wunsch beginnt ein neues Dashboard mit den Kacheln Ihrer Übersicht. Über die Auswahl oben wechseln Sie zwischen den Dashboards; der Link in der Adresszeile führt direkt dorthin.',
      'Jede Kachel lässt sich eingrenzen: auf eine Phase oder einen Status, eine Pipeline, nur Ihre eigenen Datensätze und einen Zeitraum. Abschlüsse zählen nach dem Abschlussdatum, alles andere nach dem Anlegen. Hat ein gewonnenes oder verlorenes Geschäft kein Abschlussdatum, zählt der Tag seiner letzten Änderung; die Liste hinter dem Balken filtert dafür nach „Abschluss, sonst geändert am“ und zeigt so dieselbe Zahl. Zeiträume rechnen in ganzen Tagen bis heute: ein Abschluss, der erst in der Zukunft liegt, zählt bei „letzte 30 Tage“ noch nicht.',
      'Die Übersicht gehört nur Ihnen; das Team sieht sie nicht. Jede Kachel rechnet mit Ihren Rechten: was Ihre Rolle nicht sehen darf, bleibt leer, verborgene Beträge werden nicht summiert, und nach einem verborgenen Feld wird nicht gruppiert. „Standard wiederherstellen“ bringt die ursprüngliche Übersicht zurück. Höchstens 24 Kacheln passen auf eine Übersicht.',
    ],
    links: [{ to: '/', label: 'Zur Übersicht' }],
  },
  {
    id: 'firmen-kontakte',
    titel: 'Firmen und Kontakte',
    absaetze: [
      'Neue Datensätze legen Sie über den Knopf oben rechts in der Liste an. In der Akte bearbeiten Sie jedes Feld direkt mit einem Klick darauf; gespeichert wird beim Verlassen des Feldes.',
      'Rechts in der Akte stehen Notizen, Aufgaben, Termine und der Verlauf. Eine Notiz lässt sich nachträglich bearbeiten oder löschen; darunter steht dann, wer sie wann geändert hat. Notizen und Aufgaben können zugleich an einer Firma, einem Kontakt und einem Geschäft hängen: beim Schreiben einer Notiz am Geschäft kreuzen Sie „Auch zeigen bei“ Firma oder Hauptkontakt an, und unter jeder Notiz (bei Aufgaben im Bearbeiten-Fenster) fügen Sie mit „+ Firma“, „+ Kontakt“ oder „+ Geschäft“ eine weitere Akte hinzu oder lösen eine. Sichtbar ist die Notiz für alle, die mindestens eine dieser Akten sehen; ändern darf sie, wer jede sichtbare davon ändern darf. Ganz unten steht, wer den Datensatz angelegt und wer ihn zuletzt geändert hat. Über der Aktivität grenzen Sie die Zeitleiste auf Notizen, Dateien oder Änderungen ein; die Wahl merkt sich Ihr Browser.',
      'Unter den Feldern der Akte finden Sie Anhänge, verbundene Geschäfte und Kontakte sowie die Mails aus dem Postfach, die zu diesem Datensatz gehören.',
      'Verknüpfen ohne Umweg: Bei „Firma“ (am Kontakt und am Geschäft) und „Hauptkontakt“ wählt „Ändern“ einen anderen Datensatz, „Entfernen“ löst die Verbindung. In der Firmenakte hängen Sie über „Kontakt hinzufügen“ einen Kontakt an die Firma, „Lösen“ nimmt ihn wieder heraus; „Verknüpfen“ und „Neues Geschäft“ stehen bei den Geschäften, im Kontakt „Beteiligen“ und „Neues Geschäft“. In jeder Auswahl tippen Sie einen Namen; gibt es ihn noch nicht, legt „… anlegen“ ihn gleich an — ein neuer Kontakt braucht Vor- und Nachnamen.',
      'Die Firmenakte zeigt auf Wunsch auch, was an ihren Kontakten hängt: Notizen, Aufgaben und Termine, jeweils mit dem Namen des Kontakts. Der Schalter „Auch von Kontakten der Firma“ oben in der rechten Spalte blendet es aus; Ihr Browser merkt sich die Wahl. Mails der Kontakte stehen ohnehin bei der Firma. Was Ihre Rolle an einem Kontakt nicht sehen darf, erscheint auch hier nicht.',
      'PDFs und Bilder unter „Dateien“ öffnen Sie mit „Ansehen“ direkt in der Akte. Word-, Excel- und PowerPoint-Dateien laden Sie herunter: für eine Vorschau müssten sie an einen fremden Dienst gehen.',
      'Ein Kontakt hat eine Haupt-E-Mail und eine Hauptnummer; unter „Weitere Kontaktwege“ tragen Sie die private Adresse, das Handy, ein Fax und mehr ein, jeweils mit Art. „Zur Hauptadresse“ tauscht: die bisherige rückt in die Liste. Mails von und an eine weitere Adresse erscheinen genauso beim Kontakt, Dubletten werden auch über sie erkannt, und wer sich mit einer seiner Adressen von Serienmails abmeldet, bekommt keine mehr. Telefonnummern werden einheitlich gespeichert (+49 …) und lesbar angezeigt.',
      'Gefiltert wird nach jedem Feld, auch nach Betrag, Stadt, Branche oder „Angelegt am“: mit Vergleichen wie „beginnt mit“, „enthält nicht“, „größer als“ oder, bei Daten, „in den letzten 7 Tagen“ und „älter als 30 Tage“.',
      'Kontakte und Geschäfte filtern Sie auch nach den Feldern ihrer Firma, etwa „Firma: Stadt ist Hamburg“ oder „Firma: Branche ist Bau“. Eine Firma, die Ihre Rolle nicht sehen darf, zählt dabei wie keine.',
      'Ein Klick auf einen gesetzten Filter öffnet ihn zum Ändern: Vergleich und Wert stehen schon drin, „Übernehmen“ ändert die Bedingung an ihrer Stelle und in ihrer Gruppe, Escape schließt ohne Änderung. Das × daneben entfernt den Filter.',
      'Am Ende jeder Liste legt „+ Neue Firma“ (bzw. „+ Neuer Kontakt“, „+ Neues Geschäft“) einen Datensatz direkt in der Tabelle an: Namen tippen, Enter, und das Feld bleibt für den nächsten offen; Escape schließt es. Was die Liste gerade eingrenzt und — in einer gruppierten Liste — die Gruppe, in der Sie anlegen, wird übernommen. Ein neuer Eintrag bleibt oben stehen, auch wenn er nach Filter oder Sortierung woanders stünde. Ein Kontakt braucht Vor- und Nachnamen. Auf dem Handy und für alle übrigen Felder bleibt das Formular über den Knopf oben.',
      'Mehrere Bedingungen gelten zusammen. Über den Chips stellen Sie um auf „mindestens einer Bedingung“. Für „Bau und (Hamburg oder Bremen)“ legen Sie die beiden Städte beim Hinzufügen „in Gruppe 1“: Bedingungen einer Gruppe hängen mit dem jeweils anderen Wort zusammen, also mit „oder“, wenn oben alle gelten müssen, und mit „und“, wenn eine genügt. Bis zu zehn Bedingungen und fünf Gruppen.',
      'Mit „Gruppiert nach …“ teilen Sie die Liste in Gruppen, etwa Geschäfte nach Phase oder verantwortlicher Person, Firmen nach Branche oder Stadt, Kontakte nach Firma, oder nach einem eigenen Auswahlfeld. Jede Gruppe zeigt Anzahl und Summe aller Treffer und lässt sich auf- und zuklappen; Ihr Browser merkt sich, welche zu sind. Eine aufgeklappte Gruppe lädt ihre Zeilen selbst, „Weitere laden“ holt mehr.',
      'Ist die Liste eingegrenzt, übernimmt ein neuer Datensatz die eindeutigen Werte: wer „Branche ist Bau“ gefiltert hat, legt über „Neue Firma“ eine Firma im Bau an. Was Sie im Formular schon eingetragen haben, bleibt.',
      'Eine Firma kann weitere Domains haben, etwa nach einer Umbenennung: Post von dort landet genauso bei ihr. Website und LinkedIn-Profil öffnen Sie neben dem Feld mit „Öffnen“. Gehört eine Firma zu einem Konzern, wählen Sie die Muttergesellschaft; in deren Akte stehen dann die Tochterfirmen.',
      'Ein Kontakt hat eine eigene Anschrift und ein LinkedIn-Profil. Weil die Anschrift einer Person oft privat ist, lässt sie sich je Rolle verbergen.',
      'Unter dem Verlauf steht auch, woher ein Datensatz kam: von Hand, aus einem Import, über das Webformular, über die Schnittstelle oder aus einem Mailvorschlag. Nach der Herkunft lässt sich filtern; was vor dieser Angabe angelegt wurde, hat keine.',
      'Listen lassen sich durchsuchen, sortieren und filtern. Spalten wählen Sie über „Spalten“, eine Kombination aus Suche, Filter und Sortierung speichern Sie als Ansicht. „Export“ lädt genau die gefilterte Liste als CSV-Datei herunter.',
    ],
    links: [
      { to: '/firmen', label: 'Firmen' },
      { to: '/kontakte', label: 'Kontakte' },
    ],
  },
  {
    id: 'firmendaten',
    titel: 'Firmendaten ergänzen und Firmenlogo',
    absaetze: [
      '„Daten ergänzen“ in der Firmenakte liest das Impressum der Website, die an der Firma steht (sonst die Domain): Name, Anschrift, Telefon, E-Mail, wer die Firma vertritt, Registergericht und -nummer und die USt-IdNr. Sie sehen eine Vorschau; angehakt ist alles, was an der Firma noch leer ist, und jedes Feld lässt sich abwählen. Was schon eingetragen ist, wird nie überschrieben.',
      'Die Anfrage geht vom Stegwerk-Server direkt an die Website der Firma, an keinen anderen Dienst, und nur, wenn Sie den Dialog öffnen. Im Verlauf der Akte steht bei solchen Änderungen „Aus dem Impressum der Website übernommen“. Bitte prüfen Sie die Werte: ein Impressum ist von Menschen geschrieben.',
      'Im selben Dialog holt „Logo laden“ das Symbol der Website (PNG, JPEG, GIF, WebP oder ICO bis 200 KB; SVG wird nicht übernommen) und speichert es bei der Firma. Die Akte zeigt dann das Logo, sonst die Initialen. „Logo neu laden“ holt es erneut, „Logo entfernen“ nimmt es weg.',
      'Daten ergänzen und Logos laden darf, wer Firmen ändern darf. Je Arbeitsbereich ruft Stegwerk in der Stunde höchstens 300 Seiten und Bilder ab (jede Weiterleitung zählt mit), je Klick höchstens 10 in 30 Sekunden.',
    ],
    links: [{ to: '/firmen', label: 'Firmen' }],
  },
  {
    id: 'geschaefte',
    titel: 'Geschäfte, Board und Phasen',
    absaetze: [
      'Geschäfte sehen Sie als Liste oder als Board. Auf dem Board ziehen Sie eine Karte in die nächste Spalte, in der Akte klicken Sie auf die Phase in der Leiste oben.',
      'Auf Handy und Tablet halten Sie eine Karte kurz gedrückt, bis sie sich löst, und ziehen sie dann; ein schnelles Wischen scrollt das Board wie gewohnt. Ohne Ziehen geht es über das Menü ⋯ auf der Karte: „In Phase … verschieben“.',
      'Das „+“ im Kopf einer Spalte legt ein Geschäft gleich in dieser Phase an. Unter „Karten“ über dem Board wählen Sie, was jede Karte zeigt — Firma, Betrag, Abschluss, verantwortliche Person, Verlustgrund oder eigene Felder —, oder „Kompakt“ für nur den Namen. Die Wahl merkt sich Ihr Browser.',
      'Betrag, Abschluss, verantwortliche Person, Verlustgrund und die meisten eigenen Felder ändern Sie direkt auf der Karte: ein Klick (oder Enter) auf den Wert öffnet die Eingabe, Enter oder ein Klick daneben speichert, Escape verwirft. Solange Sie tippen, lässt sich die Karte nicht ziehen. Was Ihre Rolle nur lesen darf, bleibt Anzeige.',
      'Über jeder Spalte steht die Summe der Beträge. Ein Klick darauf wählt eine andere Kennzahl fürs ganze Board: gewichtete Summe (Betrag mal Wahrscheinlichkeit, wie in der Prognose), Durchschnitt, kleinster oder größter Betrag, wie viele noch keinen Betrag haben — oder dasselbe für ein eigenes Zahl- oder Betragsfeld. Verschiedene Währungen werden getrennt gezeigt; die Wahl merkt sich Ihr Browser.',
      'Suche, „Verantwortlich“ und die Filter über der Liste gelten auch fürs Board. Eine gespeicherte Ansicht merkt sich, ob sie als Liste, Board oder Kalender öffnet; im Board gespeichert, öffnet sie wieder im Board. Wie Board und Kalender für alle Listen gehen, steht unter „Board und Kalender“.',
      'Mit der Tastatur: Tab bis zur Karte, Leertaste (oder Enter) nimmt sie auf, Pfeil links und rechts wählen die Phase, Pos1 und Ende springen an den Rand, Leertaste legt ab, Escape bricht ab. Solange Sie nichts tragen, gehen die Pfeiltasten von Karte zu Karte. Ein Bildschirmleser sagt jeden Schritt an.',
      'Es gibt sechs Phasen: Kontakt, Qualifiziert, Angebot, Verhandlung, Gewonnen und Verloren. Unter „Phasen“ geben Sie ihnen eigene Namen, eine Farbe und legen fest, mit welcher Wahrscheinlichkeit ein Geschäft in dieser Phase abgeschlossen wird. Eine Phase, die Sie nicht brauchen, blenden Sie aus; Gewonnen und Verloren bleiben immer.',
      'Für getrennte Abläufe, etwa Neukunden und Wartungsverträge, legen Sie unter „Phasen“ weitere Pipelines an. Jede hat dieselben sechs Phasen, aber eigene Namen, Farben und Wahrscheinlichkeiten; was Sie nicht ändern, übernimmt sie von der Standard-Pipeline. Oben in Liste und Board wählen Sie die Pipeline, der Browser merkt sie sich, und eine gespeicherte Ansicht nimmt sie mit. In der Akte wechseln Sie ein Geschäft in eine andere Pipeline. Löschen lässt sich eine Pipeline erst, wenn sie leer ist oder ihre Geschäfte in eine andere verschoben werden; die Standard-Pipeline bleibt.',
      'Die Prognose auf der Übersicht rechnet Betrag mal Wahrscheinlichkeit und ordnet das nach dem Monat des geplanten Abschlusses. Die blasse Säule ist der volle Betrag, die kräftige der gewichtete.',
      'Ein offenes Geschäft, an dem sich 14 Tage nichts bewegt hat — keine Notiz, keine Aufgabe, kein Termin, kein Angebot —, gilt als ruhend. Die Übersicht zählt sie, der Filter „Ruhend“ in der Liste zeigt sie. In der Akte steht oben, wann zuletzt etwas geschah.',
      'Geht ein Geschäft verloren, halten Sie den Grund fest: aus der Vorschlagsliste oder in eigenen Worten. Der Grund steht als Spalte in der Liste.',
      'Neben dem Hauptkontakt können weitere Kontakte an einem Geschäft stehen, jeder mit seiner Rolle — Entscheider, Einkauf, Technik oder in eigenen Worten. Sie stehen unter „Beteiligte“ in der Akte; „Zum Hauptkontakt“ tauscht, der bisherige bleibt als Beteiligter. Angebot und Anrede nutzen weiter den Hauptkontakt; die Mails aller Beteiligten erscheinen am Geschäft, und in der Akte eines Kontakts steht jedes Geschäft, an dem er beteiligt ist, mit seiner Rolle. Im Import ordnen Sie dafür die Spalten „Hauptkontakt (E-Mail)“ und „Weitere Kontakte (E-Mails)“ zu; der Export enthält beide.',
    ],
    links: [
      { to: '/geschaefte', label: 'Geschäfte' },
      { to: '/phasen', label: 'Phasen' },
    ],
  },
  {
    id: 'board-kalender',
    titel: 'Board und Kalender',
    absaetze: [
      'Firmen, Kontakte, Geschäfte und Aufgaben zeigen Sie oben rechts als Liste, Board oder Kalender; Angebote als Liste oder Board. Suche, „Verantwortlich“ und die Filter über der Liste gelten für alle drei.',
      'Das Board bildet seine Spalten aus einem Auswahlfeld. Welches, wählen Sie in der Leiste: bei Firmen Branche oder verantwortliche Person, bei Kontakten die verantwortliche Person, bei Geschäften die Phase oder die verantwortliche Person, bei Aufgaben der Stand (offen, in Arbeit, erledigt) oder wer zuständig ist — und überall jedes eigene Auswahlfeld. Eine Karte in eine andere Spalte ziehen setzt das Feld; die Spalte „Ohne …“ leert es. Das Board zeigt bis zu 200 Einträge; was darüber hinausgeht, sagt ein Hinweis.',
      'Der Kalender legt jede Karte an den Tag ihres Datums: bei Geschäften das Abschlussdatum, bei Aufgaben die Fälligkeit, und überall jedes eigene Datumsfeld. Ziehen Sie eine Karte auf einen anderen Tag, ändert sich das Datum; eine Uhrzeit bleibt. Mit ‹ und › blättern Sie die Monate, „Heute“ springt zurück. Hat ein Tag mehr als drei Einträge, zeigt „+ … weitere“ den Rest. Einträge ohne Datum stehen nur in der Liste.',
      'Ziehen geht mit Maus, Stift und Finger (auf Handy und Tablet kurz gedrückt halten) und mit der Tastatur: Tab bis zur Karte, Leertaste nimmt sie auf. Im Board wählen Pfeil links und rechts die Spalte, im Kalender gehen sie einen Tag weiter, Pfeil hoch und runter eine Woche. Leertaste legt ab, Escape bricht ab; ein Bildschirmleser sagt jeden Schritt an. Im Board geht es auch über das Menü ⋯ auf der Karte.',
      'Verschieben darf, wer den Datensatz ändern darf und das Feld nicht nur lesen darf; sonst bleibt die Karte, wo sie ist, und Sie können nur schauen. Felder, die Ihre Rolle nicht sehen darf, stehen gar nicht zur Wahl. Lehnt Stegwerk eine Änderung ab, springt die Karte zurück, und der Grund steht da.',
      'Angebote gehen im Board nur nach vorn: vom Entwurf zu „Versendet“ (dafür braucht Ihre Rolle das Recht, Angebote zu versenden) und von dort zu „Angenommen“ oder „Abgelehnt“. Jeder dieser Schritte lässt sich nicht zurücknehmen; Stegwerk fragt deshalb vorher nach.',
      'Eine gespeicherte Ansicht nimmt die Darstellung und das Feld mit: „Aufgaben nach Stand“ öffnet als Board mit den Spalten offen, in Arbeit, erledigt, „Verträge, die auslaufen“ als Kalender nach dem Vertragsende. Ohne Ansicht merkt sich Ihr Browser die Wahl je Liste.',
    ],
    links: [
      { to: '/firmen', label: 'Firmen' },
      { to: '/aufgaben', label: 'Aufgaben' },
      { to: '/felder', label: 'Eigene Felder' },
    ],
  },
  {
    id: 'verantwortlich',
    titel: 'Verantwortlich und „Meine“',
    absaetze: [
      'Firmen, Kontakte und Geschäfte haben eine verantwortliche Person aus dem Team. Sie setzen sie in der Akte oder für mehrere Datensätze auf einmal über die Mehrfachauswahl.',
      'Der Filter „Meine“ in den Listen zeigt nur, wofür Sie verantwortlich sind. Sie können auch nach jeder anderen Person im Team filtern.',
    ],
  },
  {
    id: 'freigaben',
    titel: 'Datensätze für Kollegen freigeben',
    absaetze: [
      'Sieht eine Rolle bei Firmen, Kontakten oder Geschäften nur eigene, geben Sie einzelne Datensätze trotzdem für bestimmte Kollegen frei: in der Akte unter „Freigaben“ die Person wählen und „Lesen“ oder „Bearbeiten“. Mit „Lesen“ sieht sie den Datensatz samt Notizen, Aufgaben, Terminen und Dateien. Ändern, löschen, wiederherstellen, das Logo tauschen, Dateien, Notizen und Aufgaben daran anlegen oder ändern kann sie dann nicht; Termine, Angebote, Rechnungen und Mails zu dem Datensatz kann sie, soweit ihre Rolle das erlaubt, weiterhin anlegen. Mit „Bearbeiten“ ändert sie ihn wie einen eigenen — nur den Verantwortlichen setzt weiter, wer den Datensatz verantwortet. In der Akte steht „Freigegeben für …“, und jede Freigabe lässt sich dort wieder entziehen. Wer eine Freigabe bekommen hat, kann sie selbst zurückgeben.',
      'Freigeben darf, wer den Datensatz verantwortet oder alle dieser Art sieht und ihn ändern darf; eine Freigabe zum Bearbeiten reicht dafür nicht. Eine Freigabe öffnet nur den Datensatz, nicht mehr Rechte: was die Rolle nicht erlaubt (etwa Geschäfte überhaupt zu sehen oder zu löschen), erlaubt auch die Freigabe nicht. Sie gilt nur in diesem Arbeitsbereich und überall dort, wo die Rolle Datensätze sieht — in Listen, Suche, Export, Übersicht, Auswertungen, Webhooks und über API-Schlüssel. Entzogen wirkt sofort; wer das Team verlässt, verliert seine Freigaben.',
      'Wer Mitglieder oder Rollen verwaltet, sieht unter „Freigaben“ den Knopf „Wer sieht das?“: eine Liste aller Mitglieder mit Rolle, ob sie den Datensatz sehen und ändern dürfen, und warum — Inhaber, Rolle sieht alle, verantwortlich, niemandem zugeordnet oder freigegeben.',
    ],
  },
  {
    id: 'favoriten',
    titel: 'Favoriten',
    absaetze: [
      'Mit dem Stern im Kopf einer Firma, eines Kontakts oder eines Geschäfts merken Sie sich den Datensatz. Ihre Favoriten stehen auf der Übersicht und ganz oben in der Suche, solange das Suchfeld leer ist.',
      'Favoriten gehören nur Ihnen; das Team sieht sie nicht. Was im Papierkorb liegt, verschwindet aus den Favoriten und kommt beim Wiederherstellen zurück.',
    ],
  },
  {
    id: 'mehrfachauswahl',
    titel: 'Mehrfachauswahl',
    absaetze: [
      'In den Listen von Firmen, Kontakten und Geschäften wählen Sie Zeilen über das Kästchen am Anfang aus. Die Leiste darüber setzt für alle ausgewählten Datensätze die verantwortliche Person, exportiert genau diese Zeilen als CSV oder legt sie in den Papierkorb.',
      'Öffnen Sie einen Eintrag aus einer Liste, blättern Sie oben rechts in der Akte mit ‹ und › zum vorigen oder nächsten Eintrag derselben Liste, ohne zurückzuspringen.',
      'Dateien hängen Sie an, indem Sie sie aus dem Explorer oder Finder auf den Abschnitt „Dateien“ einer Akte ziehen.',
    ],
  },
  {
    id: 'tastatur-listen',
    titel: 'Listen mit der Tastatur',
    absaetze: [
      'Eine Liste ist ein einziger Halt für die Tab-Taste. Darin wandern die Pfeiltasten von Zelle zu Zelle, Pos1 und Ende springen an den Anfang oder das Ende der Zeile, mit Strg an den Anfang oder das Ende der Liste, Bild auf und Bild ab um zehn Zeilen.',
      'Enter öffnet, was in der Zelle steht, etwa den Namen als Akte, oder beginnt die Bearbeitung einer Zelle, die sich direkt ändern lässt. Dort können Sie auch einfach lostippen; Enter speichert, Esc verwirft. Strg + Enter öffnet die Akte der Zeile von jeder Zelle aus.',
      'Die Leertaste wählt die Zeile für die Mehrfachauswahl aus oder ab. In der Zelle mit den Knöpfen am Zeilenende führt Enter hinein, Tab geht von Knopf zu Knopf, Esc zurück in die Liste.',
    ],
  },
  {
    id: 'ansichten',
    titel: 'Ansichten',
    absaetze: [
      'Über einer Liste speichern Sie Suche, Filter (mit UND/ODER und Gruppen), Sortierung, Gruppierung und Spalten als Ansicht — dazu, ob sie als Liste, Board oder Kalender öffnet und nach welchem Feld. Mit „Nur für mich“ sieht sie niemand sonst; ohne das Häkchen gehört sie dem ganzen Team. Der Stern macht eine Ansicht zu Ihrem Startpunkt.',
      'Ändern Sie etwas an einer geöffneten Ansicht, überschreibt „… aktualisieren“ sie mit dem neuen Stand. Ansichten des Teams ändern und löschen nur, wer sie angelegt hat, und Administratoren.',
      'Die Liste öffnet sich mit der zuletzt genutzten Ansicht; „Ohne Ansicht“ zeigt wieder alles. „Link kopieren“ erzeugt einen Link mit genau dieser Auswahl, den Sie Kollegen schicken können — sie sehen davon nur, was sie ohnehin sehen dürfen.',
    ],
  },
  {
    id: 'live',
    titel: 'Änderungen von Kollegen sofort sehen',
    absaetze: [
      'Ändert jemand aus Ihrem Team eine Firma, einen Kontakt, ein Geschäft, eine Aufgabe, einen Termin, ein Angebot oder eine Rechnung, aktualisieren sich Listen, Board und offene Akten bei allen anderen nach ein, zwei Sekunden — ohne Neuladen.',
      'Sie erfahren nur, was Sie ohnehin sehen dürfen: Datensätze außerhalb Ihrer Zeilenrechte und Änderungen nur an Feldern, die Ihre Rolle verbirgt, lösen bei Ihnen nichts aus. Nachgeladen wird mit Ihren eigenen Rechten, genau wie beim Öffnen der Seite.',
      'Ist eine Akte offen, sagt ein Hinweis oben, wer sie gerade geändert hat; war es eine Automation oder ein Programm mit Schlüssel, heißt es „an anderer Stelle“. Bearbeiten Sie währenddessen selbst ein Feld, das jemand anderes geändert hat, bleibt Ihre Eingabe stehen und darunter erscheint der neue Wert: „Neuen Wert übernehmen“ setzt ihn ein (auch per Tab erreichbar), Esc verwirft Ihre Eingabe, Enter speichert Ihre Fassung bewusst darüber. Verlassen Sie das Feld, ohne etwas geändert zu haben, bleibt der neue Wert stehen.',
      'Bricht die Verbindung ab, etwa im Zug, verbindet sich Stegwerk von selbst neu und lädt dann einmal alles nach, was Sie gerade sehen.',
    ],
  },
  {
    id: 'wartung',
    titel: 'Wartung und neue Version',
    absaetze: [
      'Kündigt der Betreiber eine Wartung an, steht oben ein Hinweis mit dem Zeitraum. Solange eine Wartung läuft, nimmt Stegwerk keine Änderungen an; Lesen und Exportieren gehen weiter, und Ihre Eingabe wird mit einem klaren Hinweis abgelehnt statt halb gespeichert.',
      'Wurde Stegwerk aktualisiert, während Sie arbeiten, erscheint „Neue Version von Stegwerk“. Speichern Sie offene Eingaben und klicken Sie dann auf „Neu laden“ — Stegwerk lädt nie von selbst neu.',
    ],
  },
  {
    id: 'papierkorb',
    titel: 'Papierkorb',
    absaetze: [
      'Gelöschte Firmen, Kontakte, Geschäfte und Aufgaben landen zuerst im Papierkorb. Direkt nach dem Löschen können Sie es in der Meldung unten mit „Rückgängig“ zurücknehmen.',
      'Im Papierkorb bleibt alles standardmäßig 30 Tage lang wiederherstellbar, danach wird es endgültig gelöscht. Sie sehen dort nur, was Ihre Rolle auch löschen dürfte; was Ihnen nur zum Lesen freigegeben ist, steht dort nicht.',
      'Wer den Arbeitsbereich einrichtet, stellt die Frist oben im Papierkorb zwischen 1 und 365 Tagen ein. Sie gilt auch für schon Gelöschtes: Wird sie verkürzt, ist, was länger liegt, innerhalb einer Stunde endgültig weg — Stegwerk fragt vorher nach. Die Änderung steht im Sicherheitsprotokoll.',
    ],
    links: [{ to: '/papierkorb', label: 'Papierkorb' }],
  },
  {
    id: 'dubletten',
    titel: 'Dubletten',
    absaetze: [
      'Beim Anlegen weist Stegwerk auf Firmen und Kontakte hin, die es vielleicht schon gibt, etwa mit gleichem Namen, gleicher Domain oder gleicher E-Mail-Adresse.',
      'In der Akte führen Sie unter „Dubletten“ einen oder mehrere wahrscheinliche Doppelgänger in den geöffneten Datensatz. In der Liste wählen Sie zwei bis neun Firmen oder Kontakte aus und klicken in der Leiste auf „Zusammenführen“; dort bestimmen Sie, welcher bleibt. Das geschieht nur von Hand, nie automatisch.',
      'Bevor Sie bestätigen, zeigt eine Vorschau, welche leeren Felder aus welchem Datensatz ergänzt werden und was umgehängt wird — Kontakte, Geschäfte, Aufgaben, Notizen, Termine, Dateien, Angebote, Rechnungen, Mails, Favoriten und Ansichten. Bei Kontakten bleiben alle E-Mail-Adressen und Nummern erhalten. Die übrigen Datensätze landen im Papierkorb.',
    ],
  },
  {
    id: 'tastatur',
    titel: 'Bedienung per Tastatur',
    absaetze: [
      'Mit der Tab-Taste erreichen Sie jedes Bedienelement. Als Erstes auf jeder Seite steht „Zum Inhalt springen“: Enter überspringt Kopfleiste und Bereiche und setzt Sie an den Anfang des Inhalts.',
      `${taste} öffnet von überall die Suche. Die Pfeiltasten wählen einen Treffer, Enter öffnet ihn, Esc schließt sie. Ein Bildschirmleser sagt an, wie viele Treffer es gibt und welcher gewählt ist.`,
      'Dialoge wie DATEV-Export, Kalender-Abo, Kalender verbinden oder Mitglied entfernen schließt Esc. Solange einer offen ist, bleibt die Tab-Taste in ihm; danach steht der Fokus wieder auf dem Knopf, der ihn geöffnet hat.',
      'Wie Listen, Boards und Kalender der Listen mit der Tastatur gehen, steht unter „Listen mit der Tastatur“ und „Board und Kalender“. In der Wochenansicht des Kalenders lässt sich ein Termin nur mit der Maus ziehen; mit der Tastatur öffnen Sie ihn und ändern Tag und Uhrzeit im Formular.',
    ],
    links: [
      { to: '/hilfe#tastatur-listen', label: 'Listen mit der Tastatur' },
      { to: '/hilfe#board-kalender', label: 'Board und Kalender' },
    ],
  },
  {
    id: 'fehlerbehebung',
    titel: 'Wenn etwas nicht klappt',
    absaetze: [
      'Für typische Fehler — das Postfach holt keine Mails, das Kalender-Abo zeigt neue Termine nicht, der Code der Zwei-Faktor-Anmeldung wird abgelehnt, das Konto ist nach Fehlversuchen gesperrt, der Import lehnt Zeilen ab, die E-Rechnung fehlt — gibt es eine eigene Seite mit Ursachen und Abhilfe. Wo in der App eine solche Meldung steht, führt „So beheben Sie das“ direkt zum passenden Abschnitt.',
      'Die Seite ist auch ohne Anmeldung erreichbar, etwa wenn die Anmeldung selbst nicht klappt. In der Suche finden Sie die Abschnitte unter „Fehlerbehebung“.',
    ],
    links: [{ to: '/hilfe/fehlerbehebung', label: 'Fehlerbehebung' }],
  },
  {
    id: 'suche',
    titel: `Suche (${taste})`,
    absaetze: [
      `${taste} oder das Suchfeld oben öffnet die Suche. Ab zwei Buchstaben findet sie Firmen, Kontakte, Geschäfte, Aufgaben, Notizen, Mails, Angebote und Rechnungen.`,
      'Firmen, Kontakte und Geschäfte stehen gemischt unter „Treffer“, die passendsten zuerst: ein genau passender Name vor einem, der so beginnt, und der vor allem anderen. Umlaute, Akzente und ß sind gleichgültig — „Mueller“, „Muller“ und „Müller“ finden dasselbe, „Cafe“ findet „Café“. Bei Wörtern ab vier Buchstaben verzeiht die Suche einen Tippfehler: „Schmitt“ findet auch „Schmidt“. Mehrere Wörter müssen alle vorkommen, egal in welchem Feld, also findet „Max Müller“ den Kontakt mit Vor- und Nachnamen.',
      'Die Suche in einer Liste behandelt Umlaute und mehrere Wörter genauso, verzeiht aber keine Tippfehler: die Liste zeigt, was dasteht.',
      'Auch Einstellungen finden Sie hier: „Webhooks“, „Zwei-Faktor“ oder „Signatur“ führt direkt an die richtige Stelle. Befehle und Einstellungen erscheinen nur, soweit Ihre Rolle sie nutzen darf.',
      'Mit leerem Feld zeigt sie Ihre Favoriten, die zuletzt geöffneten Datensätze und Befehle wie „Neue Firma“ oder „Gehe zu Offene Posten“. Mit den Pfeiltasten wählen, mit Enter öffnen, mit Esc schließen.',
      'Auf dem Handy liegt die Suche in der Leiste unten, zusammen mit Übersicht, Aufgaben, Geschäften und „Mehr“ für alle anderen Bereiche.',
    ],
  },
  {
    id: 'einstellungen',
    titel: 'Einstellungen',
    absaetze: [
      'Unter „Mehr“ → „Einstellungen“ steht alles, was Sie einrichten, an einem Ort: Ihr Konto (Profil, Signatur, Passwort, Zwei-Faktor, Geräte, Benachrichtigungen), Team und Rechte, Felder, Phasen, Import und Datenschutz, Briefkopf und Abrechnung, Postfach und Kalender sowie Automationen, Webformular, API-Schlüssel und Webhooks.',
      'Ein Eintrag führt direkt zum passenden Abschnitt, auch wenn der auf einer längeren Seite weiter unten steht. Was Ihre Rolle nicht einstellen darf, steht nicht da. Die Seiten selbst haben ihre gewohnten Adressen behalten, Lesezeichen gelten also weiter.',
    ],
    links: [{ to: '/einstellungen', label: 'Zu den Einstellungen' }],
  },
  {
    id: 'aufgaben',
    titel: 'Aufgaben',
    absaetze: [
      'Aufgaben haben ein Fälligkeitsdatum und eine zuständige Person und hängen meist an einer Firma, einem Kontakt oder einem Geschäft. Die Seite „Aufgaben“ zeigt die offenen Aufgaben, die Übersicht Ihre eigenen.',
      'Unter „Team“ schalten Sie eine morgendliche Erinnerung ein: eine Mail am Tag, nur wenn etwas überfällig ist oder heute ansteht.',
      'Eine Aufgabe ist offen, in Arbeit oder erledigt. Mit „Beginnen“ zeigen Sie, dass Sie daran sitzen; der Reiter „In Arbeit“ auf der Seite „Aufgaben“ zeigt alle angefangenen.',
      'Zur Fälligkeit können Sie eine Uhrzeit angeben. Dann ist die Aufgabe ab dieser Minute überfällig und steht im Kalender und im Kalender-Abo zu dieser Zeit; ohne Uhrzeit gilt der ganze Tag.',
      'Dateien hängen Sie im Bearbeiten-Fenster einer Aufgabe an, an Notizen über „Dateien“ unter der Notiz. Sehen darf sie, wer die Akte dahinter sehen darf.',
    ],
    links: [{ to: '/aufgaben', label: 'Aufgaben' }],
  },
  {
    id: 'notizen-formatieren',
    titel: 'Notizen formatieren und Kollegen erwähnen',
    absaetze: [
      'Notizen und Aufgabenbeschreibungen lassen sich formatieren: **fett**, *kursiv*, Überschriften mit #, Listen mit „- “ oder „1. “ und Checklisten mit „- [ ] “. Die Knöpfe über dem Textfeld setzen die Zeichen für Sie, Strg + B und Strg + I ebenso. „Vorschau“ zeigt, wie der Text aussehen wird.',
      'Links schreiben Sie als [Text](https://…) oder einfach als Adresse; erlaubt sind Links ins Netz, mailto: und tel:. Die Kästchen einer Checkliste haken Sie direkt in der Notiz ab.',
      'Mit @ erwähnen Sie jemanden aus dem Team: nach dem @ ein paar Buchstaben tippen und die Person mit Enter übernehmen. Sie erfährt es unter der Glocke oben rechts und, wenn sie es nicht abgeschaltet hat, per Mail. Die Mail nennt nur, wer sie wo erwähnt hat, nicht den Text.',
      'Wer die Akte nicht sehen darf, an der die Notiz steht, sieht unter der Glocke nur, dass er erwähnt wurde, aber nicht, was dort steht. Eine Erwähnung öffnet keine Akte, die einem die eigene Rolle nicht zeigt.',
      'Die Mail bei Erwähnungen schalten Sie unter „Team“ bei den Erinnerungen ab.',
    ],
  },
  {
    id: 'kalender',
    titel: 'Kalender, Abo und Kalender verbinden',
    absaetze: [
      'Termine legen Sie im Kalender oder in einer Akte an, auch mit Teilnehmenden und als Serie. In der Monatsansicht stehen auch Ihre fälligen Aufgaben am jeweiligen Tag.',
      'Bei einem Serientermin fragt Stegwerk beim Ändern, Verschieben, Absagen und Löschen, welche Termine gemeint sind – wie Google und Outlook: „Nur dieser Termin“, „Dieser und alle folgenden“ (die Serie wird an diesem Tag geteilt) oder „Alle Termine“. Ein einzeln geänderter Tag bleibt mit seiner Serie verbunden und erscheint im Abo und im verbundenen Kalender – auch in Outlook über Microsoft 365 – als Ausnahme derselben Serie, nicht als zweiter Termin. Umgekehrt kommt ein in Outlook einzeln verschobener, geänderter oder gelöschter Tag hier als solcher an. Einen in Outlook gelöschten Tag kann Stegwerk dort nicht wiederherstellen; nehmen Sie ihn hier wieder auf, gilt er nur hier. Ein einzeln abgesagter Tag bleibt durchgestrichen sichtbar und lässt sich wieder aufnehmen. Ändern Sie bei „Alle Termine“ den Rhythmus oder den ersten Tag, gelten einzeln geänderte und ausgefallene Tage nicht mehr; andere Änderungen (Titel, Ort) übernehmen sie, sofern dort nichts Eigenes stand.',
      'Über das Kalender-Abo erscheinen Ihre Termine in Outlook, Google oder Apple Kalender. Der Link gilt nur für Sie; Änderungen im fremden Kalender kommen nicht zurück. Sie können den Link jederzeit erneuern, dann hört der alte auf zu funktionieren.',
      '„Kalender verbinden“ gleicht in beide Richtungen ab, per CalDAV mit Nextcloud, IONOS, mailbox.org, iCloud, Fastmail und anderen. Sie brauchen die Serveradresse, Ihren Benutzer und ein App-Passwort. Ihre Termine gehen sofort hinüber; was Sie dort eintragen, kommt alle zehn Minuten hierher und ist mit „aus Kalender“ gekennzeichnet. Ändern beide Seiten denselben Termin, gilt die jüngere Änderung. Google Kalender und Microsoft 365 verbinden Sie mit „Mit Google verbinden“ bzw. „Mit Microsoft verbinden“ — ohne App-Passwort, über die Anmeldung beim Anbieter. Die Knöpfe erscheinen, sobald der Betreiber diese Anmeldung eingerichtet hat; bis dahin bleibt das Abo.',
      'Einen Link zur Videokonferenz (Teams, Zoom, Jitsi, Meet) tragen Sie im Termin unter „Videokonferenz“ ein; er muss mit https:// beginnen. Er steht in der Einladung, im Abo und im verbundenen Kalender, und in Stegwerk öffnet „Videokonferenz beitreten“ ihn direkt.',
      'Mit „Einladung senden“ im Termin geht eine Einladung aus Ihrem verbundenen Postfach an alle Teilnehmenden mit Mailadresse. Sagen sie in Outlook, Apple oder Google zu oder ab, steht die Antwort nach dem nächsten Abruf am Teilnehmer. Wird ein eingeladener Termin abgesagt, erhalten alle eine Absage.',
      'Private Termine: Setzen Sie im Termin den Haken „Privat“, sehen Kollegen nur, dass die Zeit belegt ist — ohne Titel, Ort, Notiz und Teilnehmer; ändern kann ihn nur, in wessen Kalender er steht. Was im verbundenen Kalender als privat markiert ist (Outlook und Google „Privat“), kommt so herein. Unter „Kalender verbunden“ wählen Sie außerdem, was das Team von Terminen aus Ihrem Kalender sieht: „Nur belegt“ (Vorgabe für neue Verbindungen) oder alles. Termine, die an einem Kunden oder Geschäft hängen, bleiben dabei sichtbar. Bei der Warnung vor Doppelbelegung zählt ein privater Termin trotzdem mit.',
      'Termine aus dem verbundenen Kalender ordnet Stegwerk selbst zu: an das eine offene Geschäft der Teilnehmenden, sonst an den einen Kontakt oder an die gemeinsame Firma. Kollegen in der Runde erscheinen als Kollegen. Steht ein Teilnehmer erst später als Kontakt in Stegwerk, wird er nachträglich zugeordnet. In der Akte eines Kontakts, seiner Firma und seiner Geschäfte stehen auch die Termine, bei denen er nur Teilnehmer ist.',
    ],
    links: [{ to: '/kalender', label: 'Kalender' }],
  },
  {
    id: 'angebote',
    titel: 'Angebote und Online-Annahme',
    absaetze: [
      'Ein Angebot besteht aus Positionen, gern aus Ihren Artikeln. Es geht als PDF nach DIN 5008 unter Ihrem Briefkopf hinaus.',
      'Mit dem Kundenlink kann Ihr Kunde das Angebot im Browser ansehen und annehmen oder ablehnen. Annehmen geht bis zum letzten Gültigkeitstag. Wer den Link erzeugt hat, bekommt die Antwort per Mail; im Angebot steht, wer wann entschieden hat.',
      'Aus einem versendeten oder angenommenen Angebot macht „Rechnung erstellen“ einen Rechnungsentwurf mit denselben Positionen.',
    ],
    links: [
      { to: '/angebote', label: 'Angebote' },
      { to: '/artikel', label: 'Artikel' },
    ],
  },
  {
    id: 'belege',
    titel: 'Auftragsbestätigung und Lieferschein',
    absaetze: [
      'Hat Ihr Kunde bestellt, bestätigen Sie den Auftrag im Angebot mit „Auftrag bestätigen“. Das geht bei einem versendeten oder angenommenen Angebot. Positionen und Summen kommen aus dem Angebot, dazu auf Wunsch ein Liefertermin. Die Auftragsbestätigung bekommt eine eigene Nummer (AB-Jahr-laufende Nummer) und lässt sich danach nicht mehr ändern. Je Angebot gibt es eine gültige Auftragsbestätigung.',
      'Mit „Lieferschein“ im Angebot stellen Sie einen Lieferschein (LS-Jahr-laufende Nummer). Er zeigt Menge, Einheit und Artikelnummer, aber keine Preise, und hat ein Feld, in dem der Empfang quittiert wird. Weicht die Lieferanschrift von der Rechnungsanschrift ab, tragen Sie sie ein; sie steht dann im Adressfenster. Für eine Teillieferung verringern Sie die Mengen: der Rest bleibt offen, steht als „Noch offen“ auf dem Lieferschein und wird beim nächsten Lieferschein vorgeschlagen.',
      'Absender, Empfänger und Positionen sind mit dem Stellen eingefroren; ein späterer Briefkopf ändert alte Belege nicht. Gelöscht wird nichts. „Stornieren“ legt einen Stornobeleg mit eigener Nummer an und markiert den alten als storniert; die Mengen eines stornierten Lieferscheins gelten wieder als offen. Eine Auftragsbestätigung lässt sich erst stornieren, wenn ihre Lieferscheine storniert sind.',
      '„Per E-Mail senden“ legt das PDF als Datei an das Angebot und öffnet das Mailformular mit dem Anhang, Ihren Vorlagen und Ihrer Signatur. Wer Angebote sehen darf, sieht auch diese Belege; stellen, stornieren und verschicken darf, wer Angebote versenden darf. Rechnungen, DATEV-Export und Export bleiben davon unberührt.',
    ],
    links: [
      { to: '/belege', label: 'Auftragsbestätigungen und Lieferscheine' },
    ],
  },
  {
    id: 'rechnungen',
    titel: 'Rechnungen, E-Rechnung und GiroCode',
    absaetze: [
      'Eine Rechnung ist zuerst ein Entwurf ohne Nummer. Mit „Rechnung stellen“ bekommt sie ihre fortlaufende Nummer und ist ab dann ein Beleg, der sich nicht mehr ändern lässt. Fehler korrigieren Sie mit „Stornieren“: dabei entsteht eine Rechnungskorrektur mit eigener Nummer.',
      'Das PDF einer gestellten Rechnung ist zugleich E-Rechnung: In ihm steckt die Rechnung als Datei im Format ZUGFeRD (Profil EN 16931), die das Buchhaltungsprogramm Ihres Kunden einliest, während Ihr Kunde das gewohnte Papier sieht. Der Knopf heißt dann „PDF (ZUGFeRD)“. Daneben gibt es die reine XRechnung, wie sie etwa Behörden verlangen. Fehlen für eine der beiden Angaben, sagt die Rechnung, welche.',
      'Auf einer offenen Rechnung mit IBAN im Briefkopf steht ein GiroCode. Den scannt Ihr Kunde mit der Banking-App, und Betrag, Empfänger und Verwendungszweck sind ausgefüllt.',
      'Eine wiederkehrende Rechnung (Serie) legt im gewählten Takt – monatlich, vierteljährlich oder jährlich – einen neuen Entwurf an. Prüfen und stellen tun Sie ihn selbst.',
    ],
    links: [{ to: '/rechnungen', label: 'Rechnungen' }],
  },
  {
    id: 'steuerbefreiung',
    titel: 'Positionen ohne Umsatzsteuer',
    absaetze: [
      'Steht eine Position auf 0 %, verlangt das Gesetz den Grund dafür auf dem Beleg (§ 14 Abs. 4 Nr. 8 UStG). Wählen Sie ihn im Angebot oder in der Rechnung unter „Steuerbefreiung für Positionen mit 0 %“: Reverse Charge im Inland (§ 13b UStG) oder an Unternehmer im EU-Ausland, innergemeinschaftliche Lieferung, Ausfuhr ins Drittland, Nullsteuersatz nach § 12 Abs. 3 UStG oder einen sonstigen steuerfreien Umsatz mit Rechtsgrundlage. Der Grund gilt für alle 0-%-Positionen des Belegs; Positionen mit 7 oder 19 % daneben bleiben unverändert.',
      'Bei Reverse Charge und innergemeinschaftlicher Lieferung gehört die USt-IdNr. Ihres Kunden auf die Rechnung (§ 14a UStG), bei Leistungen ins EU-Ausland auch Ihre eigene im Briefkopf. Fehlt etwas davon oder fehlt der Grund ganz, lässt sich die Rechnung nicht stellen, und die Rechnung sagt, was fehlt. Kleinunternehmer nach § 19 UStG brauchen keinen Grund.',
      'Den Pflichtsatz und die USt-IdNr. druckt Stegwerk auf PDF und Kundenansicht. In der E-Rechnung stehen die passende Steuerkategorie und der Befreiungsgrund, im DATEV-Export das passende Erlöskonto. Mit dem Stellen ist der Grund eingefroren; eine Rechnungskorrektur übernimmt ihn.',
    ],
    links: [{ to: '/rechnungen', label: 'Rechnungen' }],
  },
  {
    id: 'offene-posten',
    titel: 'Offene Posten und Mahnungen',
    absaetze: [
      'Offene Posten listet die gestellten Rechnungen, die überfällig und noch nicht bezahlt sind. Den Zahlungseingang buchen Sie in der Rechnung mit „Als bezahlt buchen“.',
      'Für Überfälliges schlägt Stegwerk die nächste Stufe vor: Zahlungserinnerung, erste Mahnung, letzte Mahnung. Sie sehen den Text vorher und verschicken ihn selbst; von allein mahnt Stegwerk nie.',
      'Verzugszinsen erscheinen nur, wenn unter „Team“ der aktuelle Basiszinssatz eingetragen ist.',
    ],
    links: [{ to: '/offene-posten', label: 'Offene Posten' }],
  },
  {
    id: 'datev',
    titel: 'DATEV-Export',
    absaetze: [
      'Unter „Rechnungen“ exportieren Sie alle gestellten Rechnungen eines Monats als DATEV-Buchungsstapel für Ihre Steuerkanzlei, auch stornierte und ihre Korrekturen.',
      'Berater- und Mandantennummer sowie den Kontenrahmen (SKR03 oder SKR04) tragen Sie im Briefkopf ein.',
    ],
  },
  {
    id: 'buchhaltung',
    titel: 'Buchhaltung: Lexware Office und sevDesk',
    absaetze: [
      'Unter Einstellungen → „Buchhaltung“ verbinden Sie Ihren Bereich mit Lexware Office (früher lexoffice) oder sevDesk, mit dem API-Schlüssel aus Ihrem eigenen Konto dort. Je Bereich gibt es eine Buchhaltung. Den Schlüssel erzeugen Sie bei Lexware Office unter app.lexware.de/addons/public-api; dürfen Sie dort seine Rechte wählen, braucht er Zugriff auf Kontakte, Belege, Dateien und Zahlungen. Bei sevDesk hat jeder Administrator einen API-Token aus 32 Zeichen, zu finden in den Einstellungen unter „Benutzer“. Stegwerk prüft den Schlüssel sofort, zeigt den Firmennamen des Kontos (bei sevDesk nur „sevDesk“, die Schnittstelle nennt ihn nicht) und speichert den Schlüssel verschlüsselt; angezeigt wird er nie wieder.',
      'Stegwerk bleibt das Programm, das Ihre Rechnungen stellt, mit eigener Nummer und E-Rechnung. In die Buchhaltung geht jede gestellte Rechnung als Beleg: Nummer, Datum, Leistungsdatum, Fälligkeit, die Beträge je Steuersatz und das PDF (mit vollständigem Briefkopf eine E-Rechnung im ZUGFeRD-Format). Eine zweite Rechnungsnummer entsteht dort nicht. Der Kunde ist die Firma der Rechnung, sonst der Kontakt; gibt es ihn in der Buchhaltung schon mit genau diesem Namen, wird er verknüpft, sonst angelegt (bei Lexware Office mit Anschrift und Mail, bei sevDesk nur mit Name und USt-IdNr.). Ohne Firma und Kontakt geht der Beleg an den Sammelkunden. Nach dem Verbinden mit einem anderen Konto sucht Stegwerk die Kunden dort neu.',
      'Ist „von selbst übertragen“ eingeschaltet (so beginnt jede Verbindung), geht eine Rechnung beim Stellen in die Warteschlange und wenige Sekunden später hinaus. An der Rechnung steht der Stand: noch nicht übertragen, wird übertragen, übertragen am …, oder der Fehler mit „Erneut versuchen“. „An Lexware Office senden“ bzw. „An sevDesk senden“ schickt eine einzelne Rechnung, auch eine, die vor dem Verbinden gestellt wurde; „Noch nicht übertragene senden“ auf der Seite Buchhaltung alle auf einmal. Eine Rechnung geht nie zweimal hinaus, auch nicht nach einem zweiten Klick.',
      'Ein Storno geht als Rechnungskorrektur zur ursprünglichen Rechnung hinüber: bei Lexware Office als Gutschrift-Beleg, bei sevDesk als Beleg mit negativen Beträgen. Gebucht wird je Steuersatz auf das passende Erlöskonto; bei Kleinunternehmern, innergemeinschaftlicher Lieferung, Ausfuhr und Reverse Charge nach § 13b auf das Konto dafür. Für Befreiungen, für die Lexware Office keine eindeutige Kategorie nennt, liegt der Beleg dort unter „Zu prüfen“, und Ihre Buchhaltung wählt die Kategorie. Eine sonstige Leistung an ein Unternehmen im EU-Ausland (Reverse Charge nach § 18b UStG) nimmt sevDesk über die Schnittstelle nicht an; sie bleibt an der Rechnung mit diesem Hinweis stehen und gehört dort von Hand erfasst.',
      'Ist der Anbieter gerade nicht erreichbar oder überlastet, versucht Stegwerk es wieder, mit wachsendem Abstand und höchstens zwei Anfragen je Sekunde. Lehnt er den Schlüssel ab, weil er widerrufen oder neu erzeugt wurde, erscheint oben ein Hinweis, und nichts geht mehr hinaus, bis jemand mit einem neuen Schlüssel neu verbindet; wartende Rechnungen gehen danach von selbst. Fehlen dem Schlüssel nur Rechte für einen Schritt, steht das an der Rechnung; nach dem Neu-Verbinden mit einem passenden Schlüssel „Erneut versuchen“. Ohne laufendes Abo wird nichts übertragen.',
      'Zurück kommt nur der Zahlungsstand: meldet die Buchhaltung einen Beleg als bezahlt (etwa nach dem Bankabgleich), bucht Stegwerk die Rechnung mit diesem Datum als bezahlt, und die offenen Posten stimmen. Das lässt sich abschalten. Belege aus der Buchhaltung holt Stegwerk nicht.',
      'Verbinden und einstellen darf, wessen Rolle API-Schlüssel und Webhooks verwaltet, Rechnungen sehen und bearbeiten darf und alle Firmen, Kontakte und Geschäfte samt ihren Feldern sieht: die Buchhaltung bekommt jede Rechnung des Bereichs. Trennen darf, wer API-Schlüssel verwaltet; senden, wer Rechnungen stellen darf, und mit „Noch nicht übertragene senden“ nur die Rechnungen, die er sieht. Verbinden und Trennen stehen im Sicherheitsprotokoll. Beim Trennen wird der Schlüssel gelöscht; was übertragen ist, bleibt in der Buchhaltung und an der Rechnung vermerkt.',
    ],
    links: [
      { to: '/buchhaltung', label: 'Buchhaltung' },
      { to: '/rechnungen', label: 'Rechnungen' },
    ],
  },
  {
    id: 'briefkopf',
    titel: 'Briefkopf und Logo',
    absaetze: [
      'Der Briefkopf ist Ihr Absender auf Angeboten und Rechnungen: Anschrift, Pflichtangaben nach § 35a GmbHG, Steuernummer oder USt-IdNr. und Bankverbindung. Die Seite sagt, was noch fehlt.',
      'Ein Logo (PNG oder JPEG, höchstens 1 MB) steht oben rechts auf jedem Angebot und jeder Rechnung.',
    ],
    links: [{ to: '/briefkopf', label: 'Briefkopf' }],
  },
  {
    id: 'postfach',
    titel: 'Postfach und Mailvorlagen',
    absaetze: [
      'Verbinden Sie Ihr Postfach per IMAP, und Ihr Schriftwechsel erscheint bei den Kunden, zu denen er gehört. Stegwerk liest nur: nichts wird als gelesen markiert, verschoben oder gelöscht. Neue Mails werden etwa alle zehn Minuten abgeholt.',
      'Gmail, Google Workspace und Microsoft 365 verbinden Sie, wo angeboten, mit „Mit Google verbinden“ oder „Mit Microsoft verbinden“: Sie melden sich beim Anbieter an, Server und Postausgang sind dann schon eingetragen. Widerrufen Sie den Zugriff dort, erscheint der Hinweis zum Neu-Verbinden.',
      'Zugeordnet wird über die Absenderadresse, dann über die Adressen in An und Kopie, zuletzt über die Domain der Firma.',
      'Sie können mehrere eigene Postfächer verbinden („Weiteres eigenes Postfach verbinden“). Eines davon ist Ihr Hauptpostfach: aus ihm gehen Termineinladungen, Serienmails und Automationen. Beim Schreiben wählen Sie unter „Von“, aus welchem Postfach und unter welcher Adresse die Mail hinausgeht; eine Antwort geht vorgabemäßig aus dem Postfach, in dem die Nachricht ankam.',
      'Ein gemeinsames Postfach wie info@ oder vertrieb@ richtet ein, wer das Recht „Gemeinsame Postfächer einrichten“ hat (Inhaber und Administratoren). Es wird einmal verbunden; lesen, antworten und Gespräche übernehmen dürfen die Mitglieder, die unter Postfach eingetragen sind. In den Akten sehen die Post zunächst nur sie; unter „Wer die Post dieses Postfachs in den Akten sieht“ lässt sich das erweitern. Im Posteingang des Postfachs steht jedes Gespräch als offen oder erledigt, mit der Person, der es zugewiesen ist. Wer aus dem gemeinsamen Postfach antwortet, übernimmt ein Gespräch, um das sich noch niemand kümmert; schreibt der Kunde wieder, ist es von selbst wieder offen. Verlässt jemand das Team, übernimmt die Nachfolgerin oder der Nachfolger die gemeinsamen Postfächer und die zugewiesenen Gespräche.',
      'Tragen Sie auch den Postausgang (SMTP) ein, schreiben Sie Mails direkt aus der Akte: „Neue E-Mail“ an Firma, Kontakt und Geschäft, mit Kopie (Cc), Blindkopie (Bcc) und Dateien der Akte als Anhang. Ihre Signatur, Funktion und Durchwahl tragen Sie unter Team → Mein Konto ein: die Signatur steht unter jeder neuen Mail, Funktion und Durchwahl stehen mit Ihrem Namen als „Ihr Ansprechpartner“ auf den Angeboten, die Sie anlegen. Mailvorlagen kennen die Platzhalter {{vorname}}, {{nachname}} und {{firma}}; mit {{vorname|zusammen}} steht „zusammen“ da, wo der Vorname fehlt.',
      'Am Geschäft erscheinen die Mails mit dem Hauptkontakt und der Firma. Adressen oder ganze Domains auf der Sperrliste werden beim Abruf übergangen — etwa Newsletter oder private Kontakte. Kann das Postfach nicht mehr abgerufen werden, erscheint oben ein Hinweis zum Neu-Verbinden.',
      'Klappen Sie ein Gespräch in der Akte auf, steht jede Mail im ganzen Text da; Zitat und Signatur sind eingeklappt. Gezeigt wird immer Text, nie das HTML der Mail: so lädt keine Mail Bilder von fremden Servern nach oder führt etwas aus. Anhänge stehen mit Namen und Größe darunter. „An Akte speichern“ holt einen Anhang aus dem Postfach und legt ihn bei den Dateien des Kontakts ab (ohne Kontakt bei der Firma). Unter Postfach lässt sich einstellen, dass Anhänge zugeordneter Post bis zu einer Größe von selbst an die Akte kommen — nur wenn das Team Ihre Post ganz sieht.',
      'Unter Postfach legen Sie fest, was nicht in die Akten kommt: Post nur unter Kollegen und Newsletter (beides von Anfang an aus), auf Wunsch auch Post von Sammeladressen wie info@ oder kontakt@ und Post nur mit privaten Adressen wie gmx.de. Dort tragen Sie auch weitere Absenderadressen ein (etwa vertrieb@); beim Schreiben wählen Sie sie unter „Von“. Der Mailserver muss die Adresse für Ihr Postfach freigeben („Senden als“) — sonst meldet Stegwerk es beim Senden.',
      'Bei Gmail lässt Stegwerk weg, was Gmail selbst unter Werbung, Soziale Netzwerke, Foren und Benachrichtigungen einsortiert; der Schalter dafür steht unter Postfach. Was im Reiter „Allgemein“ landet, kommt weiter in die Akten.',
      'Klemmt der Abruf, versucht Stegwerk es von selbst wieder: nach einem kurzen Netzaussetzer bald und dann seltener, nach einem falschen Passwort stündlich. Der Hinweis oben auf jeder Seite erscheint bei einem Netzaussetzer erst nach dem dritten Fehlversuch, bei einem falschen Passwort sofort; dasselbe gilt für den verbundenen Kalender. Steht der Abruf seit einem Tag, bekommen Sie einmal eine Mail.',
      'Unter Postfach → Zustellbarkeit prüft Stegwerk im öffentlichen DNS Ihrer Absenderdomain, ob SPF und DMARC eingerichtet sind. Fehlen sie, landen Serienmails oft im Spam; vor einer Serienmail steht dann ein Hinweis. Den passenden Eintrag nennt Ihr Mail-Anbieter.',
    ],
    links: [{ to: '/postfach', label: 'Postfach' }],
  },
  {
    id: 'auswertungen',
    titel: 'Auswertungen',
    absaetze: [
      'Die Auswertungen zeigen für einen Zeitraum, was aus den Geschäften wurde: gewonnen und verloren mit Summe, Abschlussquote, durchschnittlicher Auftragswert und Dauer bis zum Abschluss, dazu ein Diagramm je Monat.',
      'Darunter stehen die Zahlen je Verkäufer und die Verlustgründe. Oben wählen Sie den Zeitraum und ob Sie das ganze Team, nur sich selbst oder eine bestimmte Person sehen, und bei mehreren Pipelines, ob alle zusammen oder nur eine zählen.',
    ],
    links: [{ to: '/auswertungen', label: 'Auswertungen' }],
  },
  {
    id: 'automationen',
    titel: 'Automationen',
    absaetze: [
      'Eine Automation erledigt den nächsten Schritt von selbst. Auslöser sind: ein Geschäft, ein Kontakt oder eine Firma wird angelegt oder geändert, ein Geschäft wechselt die Phase, an einem offenen Geschäft tut sich eine Anzahl Tage nichts, eine Anfrage kommt übers Webformular, jemand drückt den Knopf am Datensatz, ein Zeitplan (täglich, wöchentlich oder monatlich zu einer Uhrzeit deutscher Zeit, wahlweise für jeden Datensatz, auf den die Bedingungen zutreffen) oder ein fremder Dienst ruft die geheime Eingangsadresse der Regel auf.',
      'Dann legt sie eine Aufgabe, Notiz oder einen Termin an, setzt ein Feld (Phase, Wahrscheinlichkeit, Verantwortlich oder ein eigenes Feld), schickt dem Verantwortlichen eine Benachrichtigung oder dem Kontakt eine Mailvorlage aus dem Postfach des Verantwortlichen (wahlweise erst als Entwurf zur Freigabe), verteilt neue Einträge reihum im Team, sucht Datensätze, legt einen Kontakt, eine Firma oder ein Geschäft an oder ergänzt den vorhandenen (erkannt an E-Mail, Domain oder Name), schickt eine HTTP-Anfrage an einen anderen Dienst oder eine Nachricht in einen Kanal von Slack oder Microsoft Teams.',
      'Für Slack und Teams tragen Sie die Webhook-Adresse des Kanals ein: in Slack über die App „Incoming Webhooks“ (oder einen Workflow mit Webhook-Auslöser), in Teams über die App „Workflows“ mit der Vorlage „Bei Empfang einer Webhookanfrage in einem Kanal posten“. Stegwerk nimmt nur Adressen dieser Dienste an, speichert sie verschlüsselt und zeigt danach nur noch den Rechner. Teams bekommt die Nachricht als Karte mit Knopf zur Akte, Slack als Text mit Link.',
      'Eine Regel kann bis zu fünf Schritte nacheinander haben. Ab dem zweiten wählen Sie, ob er am auslösenden Datensatz arbeitet oder an dem, den ein früherer Schritt gefunden oder angelegt hat. In Texten setzen Variablen Werte ein: {{ausloeser.name}} oder {{ausloeser.felder.budget}} aus dem Auslöser, {{schritt1.anzahl}} und {{schritt1.erster.email}} aus einer Suche, {{schritt2.status}} und {{schritt2.json.feld}} aus einer HTTP-Antwort. Variablen sind nur Platzhalter, kein Code; zu lange Werte werden gekürzt.',
      'Ein Knopf erscheint oben in der Akte bei allen, die solche Datensätze ändern dürfen, und fragt vor dem Ausführen nach. Jede Regel läuft mit den Rechten dessen, der sie angelegt oder zuletzt geändert hat: sie sieht und ändert nur, was diese Person sehen und ändern darf.',
      '„Bearbeiten“ in der Liste öffnet eine Regel mit allen Feldern: Auslöser, Bedingungen, Schritte, Variablen und Kopfzeilen. Die Änderung gilt ab dem nächsten Lauf; ein Zeitplan rechnet seinen nächsten Lauf neu. Werte gespeicherter Kopfzeilen zeigt Stegwerk nie wieder an — lassen Sie das Feld leer, bleibt der Wert, solange die Adresse zum selben Dienst zeigt; ändert sich der Dienst, geben Sie den Wert neu ein. Nach dem Speichern prüft „Probelauf“ im Formular die neue Fassung. Anlegen, Ändern, Löschen und eine neue Eingangsadresse stehen im Bereichsprotokoll.',
      '„Probelauf“ führt eine Regel einmal an einem Beispiel aus, ohne etwas zu speichern, zu verschicken oder eine Anfrage nach außen zu senden; das Protokoll zeigt, was geschehen wäre. Im Protokoll lassen sich fehlgeschlagene oder übersprungene Läufe wiederholen und vorgemerkte abbrechen; jeder Schritt zeigt dort seine Ein- und Ausgabe, Geheimnisse wie Kopfzeilen nie.',
      'Für den Eingang erzeugen Sie in der Liste unter „Eingang“ eine Adresse, wahlweise mit Signatur. Der fremde Dienst schickt per POST ein JSON-Objekt dorthin; mit Signatur zusätzlich die Kopfzeilen X-Stegwerk-Zeitstempel und X-Stegwerk-Signatur (sha256=HMAC über „Zeitstempel.Inhalt“), genau wie bei unseren ausgehenden Webhooks. Adresse und Geheimnis werden nur einmal angezeigt.',
      'Bedingungen grenzen eine Regel ein, mit denselben Vergleichen wie die Filter der Listen — etwa „Betrag größer als 10.000“ oder „Pipeline ist Wartung“. Eine Aktion kann sofort oder erst nach einigen Tagen laufen; liegt der Eintrag dann im Papierkorb oder trifft eine Bedingung nicht mehr zu, entfällt sie. Ein ruhendes Geschäft meldet jede Regel einmal, bis sich wieder etwas tut.',
      'Für den Anfang gibt es Vorlagen, etwa „Gewonnen → Rechnung schreiben“. Unter „Protokoll“ steht bei jeder Regel, was sie zuletzt getan, übersprungen oder nicht geschafft hat, und warum.',
      'Was eine Automation selbst ändert, löst keine weitere aus. Schlägt eine fehl, bleibt die ursprüngliche Änderung trotzdem gespeichert.',
    ],
    links: [{ to: '/automationen', label: 'Automationen' }],
  },
  {
    id: 'serienmails',
    titel: 'Serienmails',
    absaetze: [
      'Unter „Serienmails“ schreiben Sie vielen Kontakten auf einmal, jeden mit eigenem Namen: {{vorname}}, {{nachname}} und {{firma}} werden beim Versand ersetzt. Empfänger sind alle Kontakte, eine gespeicherte Kontaktansicht oder die in der Kontaktliste markierten („Serienmail“ in der Leiste über der Liste).',
      'Übersprungen werden Kontakte ohne oder mit unzustellbarer Adresse, wer sich abgemeldet hat, wer auf der Sperrliste steht und doppelte Adressen; die Liste zeigt jeweils den Grund. Vor dem Start sehen Sie eine Vorschau und können sich eine Testmail schicken.',
      'Verschickt wird über Ihr eigenes Postfach, in kleinen Paketen: höchstens 30 je Minute und 500 am Tag, damit der Mailserver Ihr Postfach nicht sperrt. Jede Mail enthält einen Abmeldelink, und Mailprogramme bieten das Abmelden mit einem Klick an. Wer sich abmeldet, bekommt keine Serienmails dieses Themas mehr.',
      'Unter „Abmeldungen“ auf derselben Seite sehen Sie, wer sich wovon abgemeldet hat; an der Kontaktakte steht es ebenfalls. Zurücknehmen kann eine Abmeldung nur die Person selbst.',
      'Das Recht „Serienmails verschicken“ haben Inhaber und Administratoren; anderen Rollen geben Sie es unter Team → Rollen.',
    ],
    links: [{ to: '/serienmails', label: 'Serienmails' }],
  },
  {
    id: 'verteiler',
    titel: 'Verteiler',
    absaetze: [
      'Ein Verteiler ist eine feste Liste von Kontakten, etwa „Weihnachtskarte 2026“ oder „Einladung Hausmesse“. Markieren Sie in der Kontaktliste die Empfänger und wählen Sie „Zu Verteiler hinzufügen“ — in einen vorhandenen oder einen neuen Verteiler. Unter „Verteiler“ sehen Sie die Mitglieder und nehmen einzelne wieder heraus; an der Kontaktakte steht, in welchen Verteilern jemand ist.',
      'Bei einer Serienmail wählen Sie unter „Wer bekommt sie?“ einen Verteiler. Wer sich abgemeldet hat, bleibt im Verteiler sichtbar (als „abgemeldet“), bekommt aber keine Serienmail. Soll sich die Liste von selbst aktuell halten, nehmen Sie statt eines Verteilers eine gespeicherte Kontaktansicht.',
      'Verteiler sieht, wer Kontakte sehen darf; anlegen und füllen darf, wer Kontakte bearbeiten darf. Wer nur eigene Kontakte sieht, sieht und verschickt auch im Verteiler nur diese.',
    ],
    links: [{ to: '/verteiler', label: 'Verteiler' }],
  },
  {
    id: 'webformular',
    titel: 'Webformular',
    absaetze: [
      'Ein Kontaktformular für Ihre Website. Jede Anfrage legt einen Kontakt an, die Firma dazu (oder nimmt eine vorhandene gleichen Namens), auf Wunsch ein Geschäft und eine Aufgabe „Anfrage beantworten“ für heute. Sie binden das Formular mit einem Schnipsel ein oder verlinken es direkt.',
      'Zum Schutz vor Missbrauch nimmt das Formular höchstens 200 Anfragen am Tag an. Vor dem Absenden rechnet der Browser der Besucher kurz eine kleine Aufgabe, ohne Bilderrätsel und ohne fremden Dienst; Programme, die das Formular in Sekundenbruchteilen oder massenhaft abschicken, kommen so nicht durch. Dieselbe Prüfung steht vor der Registrierung und vor „Passwort vergessen“.',
    ],
    links: [{ to: '/webformular', label: 'Webformular' }],
  },
  {
    id: 'webhooks',
    titel: 'Webhooks und API-Schlüssel',
    absaetze: [
      'Webhooks melden Ereignisse an eine Adresse Ihrer Wahl: für Firmen, Kontakte, Geschäfte, Notizen, Aufgaben, Termine, Angebote und Rechnungen jeweils angelegt, geändert, gelöscht und wiederhergestellt, dazu Phasenwechsel, gewonnen, verloren, Angebot angenommen oder abgelehnt, Rechnung gestellt oder bezahlt. Bei Änderungen steht dabei, welches Feld vorher und nachher welchen Wert hatte. Jede Meldung ist mit HMAC-SHA256 signiert.',
      'Ein Webhook sieht, was die Person sieht, die ihn angelegt hat: verborgene Felder und Datensätze, die sie nicht sehen darf, werden nicht gemeldet.',
      'API-Schlüssel erlauben anderen Programmen den Zugriff, mit genau den Rechten, die Sie beim Anlegen ankreuzen. Ein Schlüssel wird nur einmal angezeigt; bewahren Sie ihn sicher auf. Über die Schnittstelle lassen sich bis zu 100 Firmen, Kontakte oder Geschäfte in einem Aufruf anlegen, ändern oder abgleichen; jede Zeile meldet ihr eigenes Ergebnis.',
      'Mit einem Schlüssel können auch KI-Assistenten wie Claude auf Stegwerk zugreifen (Adresse …/mcp): suchen, lesen, Notizen und Aufgaben anlegen, Geschäfte anlegen und ändern, Mail-Entwürfe schreiben und die Texte von Angebotsentwürfen ändern — nur im Rahmen der Rechte des Schlüssels. Verbindungen und Änderungen stehen im Sicherheitsprotokoll. Neue Schlüssel „schlagen nur vor“: was der Assistent ändern will, wartet unter „KI-Vorschläge“ auf Ihre Freigabe (siehe unten).',
      'Schlüssel und Webhooks verwaltet nur, wessen Rolle das Recht „API-Schlüssel und Webhooks“ hat. Es ist vom Verwalten des Teams getrennt, damit etwa eine Agentur Schnittstellen einrichten kann, ohne Mitglieder einladen zu dürfen.',
      'Wer ein Programm anbindet, findet unter „Für Entwickler“ die Anleitung mit Beispielen, die Prüfung der Webhook-Signatur und die Referenz aller Abfragen und Mutationen, die ein Schlüssel aufrufen darf. Die Seiten sind auch ohne Anmeldung lesbar, etwa für eine Agentur, die noch kein Konto hat.',
    ],
    links: [
      { to: '/team', label: 'Team' },
      { to: '/entwickler', label: 'Für Entwickler' },
    ],
  },
  {
    id: 'ki-vorschlaege',
    titel: 'Freigabe: Mail-Entwürfe und Vorschläge der KI',
    absaetze: [
      'Ein API-Schlüssel hat einen Modus: „direkt“ oder „nur vorschlagen“. Ein vorschlagender Schlüssel liest mit seinen Rechten, ändert aber nichts — auch nicht über die Schnittstelle am MCP-Server vorbei. Was ein KI-Assistent ändern will (eine Notiz, eine Aufgabe, ein Geschäft, Angebotstexte, einen Mail-Entwurf), steht unter Mehr → „KI-Vorschläge“ mit dem Stand vorher und nachher. Neue Schlüssel schlagen nur vor; umstellen lässt sich das unter Team → Schlüssel.',
      'Annehmen führt die Änderung mit Ihren eigenen Rechten aus, nicht mit denen des Schlüssels: was Sie nicht ändern dürfen, können Sie auch nicht annehmen. Hat sich ein betroffenes Feld seit dem Vorschlag geändert, zeigt Stegwerk den Stand von jetzt und fragt noch einmal. Mehrere Vorschläge lassen sich auf einmal annehmen oder verwerfen; jeder wird nur einmal ausgeführt. An der Akte steht ein Hinweis, wenn dort ein Vorschlag wartet, und die Glocke zählt die offenen.',
      'Vorschläge sieht, wessen Rolle das Recht „Vorschläge der KI freigeben“ hat — Inhaber und Administratoren von Anfang an. Zeilenrechte gelten: wer nur eigene Geschäfte sieht, sieht auch nur die Vorschläge dazu.',
      'Mail-Entwürfe schreiben Automationen (Schritt „E-Mail senden“ an den Kontakt mit „Erst als Entwurf zur Freigabe ablegen“) und KI-Assistenten. Ein Entwurf gehört der Person, aus deren Postfach er hinausgeht: dem Verantwortlichen der Akte oder der Person, die den Schlüssel angelegt hat. Er steht unter Postfach → „Entwürfe zur Freigabe“, die Glocke meldet ihn. Dort ändern Sie Empfänger, Betreff und Text und schicken ihn ab — mit denselben Prüfungen wie jede Mail aus der Akte und nie zweimal. Nichts davon wird ohne Sie verschickt.',
      'Vorschläge kommen von einem Assistenten, den Sie mit einem API-Schlüssel über MCP verbinden, oder aus dem Chat „KI fragen“ in Stegwerk, wenn Ihr Bereich eine KI eingerichtet hat. Bei Vorschlägen aus dem Chat steht als Absender „KI-Chat“ mit dem Namen der Person, die gefragt hat.',
    ],
    links: [
      { to: '/ki-vorschlaege', label: 'KI-Vorschläge' },
      { to: '/postfach#entwuerfe', label: 'Entwürfe im Postfach' },
    ],
  },
  {
    id: 'ki',
    titel: 'KI in Stegwerk: Chat und Entwürfe',
    absaetze: [
      'Unter Einstellungen → „KI“ richtet eine Person mit dem Recht „Vorschläge der KI freigeben“ eine KI für den ganzen Bereich ein: Anbieter (Anthropic mit Claude oder OpenAI), Modell und den API-Schlüssel aus Ihrem eigenen Konto dort. Stegwerk prüft Schlüssel und Modell sofort beim Anbieter, ohne dabei Text zu erzeugen, und speichert den Schlüssel verschlüsselt; angezeigt wird er nie wieder. Die Kosten rechnet der Anbieter direkt mit Ihnen ab; Stegwerk hat keinen eigenen Schlüssel und berechnet dafür nichts.',
      'Oben rechts steht dann „KI fragen“. Der Chat beantwortet Fragen zu Firmen, Kontakten, Geschäften und Angeboten und schlägt dafür in Stegwerk nach — über dieselben Wege wie die Oberfläche und mit Ihren Rechten, Zeilen- und Feldrechten. Was Sie nicht sehen, sieht die KI auch nicht. Stehen Sie auf einer Akte, darf sich die Frage auf sie beziehen („dieses Geschäft“). Unter jeder Antwort steht, was nachgeschlagen wurde.',
      'Die KI ändert nichts selbst. Bitten Sie sie um eine Änderung (eine Notiz, eine Aufgabe, eine Phase, Angebotstexte, einen Mail-Entwurf), legt sie einen Vorschlag unter „KI-Vorschläge“ ab; angenommen wird er dort von einer Person mit dem Recht dazu, mit deren Rechten.',
      'Beim Schreiben einer Mail aus der Akte und bei Einleitung und Schluss eines Angebots im Entwurf gibt es „Entwurf mit KI“: eine kurze Anweisung hinein, der Entwurf erscheint zur Ansicht. Steht schon Text im Feld, wird er überarbeitet. Ins Feld kommt der Entwurf erst mit „Übernehmen“; gesendet wird nur, wenn Sie selbst auf „Senden“ klicken.',
      'Ihre Frage und die Daten, die die KI dafür nachschlägt, gehen an den gewählten Anbieter, unter dem Vertrag Ihres Bereichs mit ihm. Stegwerk speichert die Chats nicht: der Verlauf liegt nur in Ihrem Browser, bis Sie „Neuer Chat“ wählen, die Seite neu laden oder sich abmelden. Wer die KI nutzen darf (alle Mitglieder oder nur Personen mit dem KI-Recht), stellen Sie unter Einstellungen → „KI“ ein. Damit niemand das Guthaben beim Anbieter in kurzer Zeit verbraucht, gilt je Person und je Bereich eine Obergrenze an Fragen. Ohne laufendes Abo ist die KI aus. Einrichten, Ändern und Entfernen stehen im Sicherheitsprotokoll.',
    ],
    links: [
      { to: '/ki', label: 'KI einrichten' },
      { to: '/ki-vorschlaege', label: 'KI-Vorschläge' },
    ],
  },
  {
    id: 'import-export',
    titel: 'Import und Export',
    absaetze: [
      'Der Import liest Firmen, Kontakte, Geschäfte, Notizen, Aufgaben oder Artikel aus einer CSV- oder Excel-Datei. Sie ordnen die Spalten zu, sehen eine Vorschau, in der noch nichts gespeichert ist, und übernehmen dann. Bei Geschäften ordnet die Spalte „Pipeline (Name)“ jedes Geschäft seiner Pipeline zu; ohne sie landet es in der Standard-Pipeline.',
      'Steht über den Spaltennamen noch ein Titel oder ein Datum, wählen Sie die Zeile mit den Spaltennamen aus. Zeigt eine Spalte auf die Phase, ein Auswahlfeld, die Einheit oder den Steuersatz, ordnen Sie darunter jeden Wert der Datei zu, etwa „Offen“ zu „Kontakt“; gleiche Schreibweisen sind schon zugeordnet.',
      'Abgelehnte Zeilen stehen mit Grund und ihren Werten in der Vorschau. Korrigieren Sie sie dort und prüfen Sie erneut; die Datei selbst bleibt, wie sie ist.',
      'Notizen und Aufgaben hängen Sie über „Firma (Name)“, „Kontakt (E-Mail)“ oder „Geschäft (Bezeichnung)“ an vorhandene Datensätze; angelegt wird dabei nichts. „Verantwortlich (E-Mail)“ und „Zuständig (E-Mail)“ ordnen ein Mitglied über seine Anmeldeadresse zu. Artikel mit derselben Artikelnummer werden beim zweiten Import aktualisiert.',
      'Jede Liste lässt sich über „Export“ als CSV herunterladen, so wie sie gerade gefiltert ist.',
    ],
    links: [{ to: '/import', label: 'Import' }],
  },
  {
    id: 'umstieg',
    titel: 'Umstieg von Excel, Outlook und anderen Programmen',
    absaetze: [
      'Reihenfolge: erst Firmen, dann Kontakte, dann Geschäfte. Kontakte und Geschäfte finden ihre Firma über deren Namen; gibt es sie schon, wird sie verbunden statt doppelt angelegt.',
      'Excel: die Tabelle so lassen, wie sie ist, und die .xlsx-Datei direkt unter „Import“ hochladen. Gelesen wird das erste Blatt; die erste Zeile muss die Spaltennamen enthalten.',
      'Outlook: unter Datei → Öffnen und Exportieren → Importieren/Exportieren → „In Datei exportieren“ → „Kommagetrennte Werte“ den Ordner Kontakte wählen. Spalten wie „Vorname“, „Nachname“, „E-Mail-Adresse“, „Firma“ und „Telefon geschäftlich“ werden beim Import von selbst zugeordnet, „E-Mail 2“, „Mobiltelefon“ und „Fax“ als weitere Kontaktwege.',
      'Pipedrive, HubSpot und andere Programme: Personen, Organisationen und Deals jeweils als CSV oder Excel exportieren. Englische Spaltennamen wie „First Name“, „Company“, „Deal Value“ oder „Expected close date“ erkennt die Zuordnung ebenfalls.',
      'Vor dem Übernehmen zeigt die Vorschau, welche Zeilen abgelehnt würden und warum. Es wird erst gespeichert, wenn Sie „Übernehmen“ wählen. Eigene Felder legen Sie vorher unter „Felder“ an, dann erscheinen sie in der Zuordnung.',
    ],
    links: [
      { to: '/import', label: 'Import' },
      { to: '/felder', label: 'Felder' },
    ],
  },
  {
    id: 'felder',
    titel: 'Eigene Felder',
    absaetze: [
      'Unter „Felder“ ergänzen Sie Firmen, Kontakte und Geschäfte um eigene Felder: Text, Zahl, Betrag mit Währung, Datum, Ja/Nein, Auswahl (auf Wunsch farbig), Mehrfachauswahl, Link, mehrere Links mit Bezeichnung, E-Mail, Telefon, Anschrift, Bewertung mit Sternen oder eine Verknüpfung zu anderen Datensätzen. Sie erscheinen in der Akte, als Spalte in der Liste und als Filter.',
      'Eine Zahl zeigen Sie mit fester Zahl an Nachkommastellen oder als Prozent („12,5 %“), ein Datum als Tag oder relativ („in 3 Wochen“). Das ändert nur die Anzeige, nicht den gespeicherten Wert. Eine Anschrift durchsucht der Filter in allen Teilen, die Liste sortiert sie nach dem Ort.',
      'Ein Feld lässt sich als eindeutig markieren, etwa eine Kundennummer: dann kann derselbe Wert nicht zweimal vorkommen, auch nicht beim Import.',
      'Ein Hinweis für Ihr Team erklärt, was in ein Feld gehört („Kundennummer aus DATEV“). In der Akte steht dafür ein kleines i neben dem Feld; beim Bearbeiten steht der Hinweis darunter.',
      'Ein Standardwert füllt das Feld bei jedem neuen Datensatz — auch beim Import, aus dem Webformular und bei Aufgaben aus Automationen. Was beim Anlegen schon eingetragen ist, geht vor; vorhandene Datensätze bleiben, wie sie sind. Eindeutige Felder, Anschriften und Links haben keinen Standardwert.',
      'Unter „Abschnitte in der Akte“ fassen Sie Felder unter Überschriften wie „Vertrag“ oder „Technik“ zusammen und wählen am Feld, wohin es gehört. In der Akte lässt sich jeder Abschnitt zuklappen; Felder ohne Abschnitt stehen unter „Weitere Angaben“. Leere Felder stehen hinter „leere Felder anzeigen“, außer Pflichtfeldern. Beides merkt sich Ihr Browser. Ein Feld, das in weniger als einem Zehntel der Datensätze gefüllt ist, ist in der Verwaltung als „kaum genutzt“ markiert.',
      'Eine Verknüpfung verweist auf eine Firma, einen Kontakt oder ein Geschäft — auf Wunsch auf mehrere, etwa „Partnerfirma“ an einem Kontakt oder „Beteiligte Firmen“ an einem Geschäft. Beim Anlegen entsteht auf der anderen Seite ein Gegenfeld: die Firma zeigt dann alle Kontakte, die sie als Partnerfirma nennen. In der Akte wählen Sie mit Suche, die Namen führen zur Akte. Gefiltert wird mit „ist“, „ist nicht“ und „leer“. Export und Import schreiben und lesen Namen statt Kennungen; ein Name, den es mehrfach gibt, lehnt die Zeile ab. Was Ihre Rolle nicht sieht, steht als „Nicht sichtbar“ da und bleibt beim Ändern erhalten. Liegt das Ziel im Papierkorb, ist es ausgeblendet; endgültig gelöscht, verschwindet der Verweis, und beim Zusammenführen zeigt er auf den behaltenen Datensatz.',
      'Tippen Sie in einer Anschrift oder bei einer Firma eine deutsche Postleitzahl ein, ergänzt Stegwerk den Ort, wenn er noch leer ist; gehören mehrere Orte dazu, wählen Sie einen aus. Nachgeschlagen wird in einer Liste auf dem Stegwerk-Server; es geht keine Anfrage an einen fremden Dienst.',
    ],
    links: [{ to: '/felder', label: 'Felder' }],
  },
  {
    id: 'objekte',
    titel: 'Objekte umbenennen',
    absaetze: [
      'Unter „Einstellungen → Objekte umbenennen“ geben Sie Firmen, Kontakten, Geschäften, Aufgaben und Angeboten eigene Namen, etwa Patienten statt Kontakte oder Aufträge statt Geschäfte. Sie tragen Einzahl und Mehrzahl ein und wählen das Geschlecht des Wortes, damit Knöpfe wie „Neuer Patient“ oder „Neue Praxis“ richtig heißen; darunter steht, wie es aussehen wird.',
      'Die neuen Namen erscheinen für alle im Bereich in der Navigation, in den Köpfen und leeren Zuständen der Listen, in der Akte, in der Suche, bei den Spalten und im Dateinamen des Exports. Angebote, Rechnungen, Mahnungen, Mails an Kunden und die Schnittstelle bleiben bei den Fachbegriffen, denn dort liest jemand außerhalb des Bereichs mit.',
      "Höchstens 30 Zeichen, Buchstaben, Ziffern, Leerzeichen und - . & / ' sind erlaubt; zwei Objekte dürfen nicht gleich heißen, und ein Objekt nicht wie eine andere Seite (etwa Rechnungen oder Kalender). „Zurücksetzen“ stellt ein Objekt oder alle wieder auf den Namen im Programm. Ändern darf, wer Felder einrichtet; jede Änderung steht im Protokoll des Bereichs.",
    ],
    links: [{ to: '/objekte', label: 'Objekte umbenennen' }],
  },
  {
    id: 'team',
    titel: 'Team, Rollen und Sicherheit',
    absaetze: [
      'Unter „Team“ laden Sie Mitglieder per Mail ein. Jede Person hat eine Rolle: Inhaber, Administrator, Mitglied, Nur Lesen oder eine eigene Rolle mit genau den Rechten, die Sie ihr geben.',
      'Beim Einladen schlägt Stegwerk Kolleginnen und Kollegen vor, mit denen Sie in den letzten 90 Tagen Mails getauscht oder Termine hatten: nur Adressen mit derselben Domain wie Ihre Anmeldung, ohne Sammeladressen wie info@ und ohne alle, die schon im Team oder eingeladen sind. Ausgewertet werden nur Ihr eigenes Postfach und Ihr eigener Kalender. Ein Klick trägt die Adresse ein; eingeladen wird erst mit „Einladung erstellen“.',
      'Verlässt jemand das Team, wählen Sie beim Entfernen, wer übernimmt: offene Aufgaben, Firmen, Kontakte und Geschäfte, künftige Termine und offene Angebote gehen an diese Person. Postfach und Kalender der ausscheidenden Person werden getrennt; die gelesene Post bleibt an den Akten.',
      'Unter „Mein Konto“ ändern Sie Ihren Namen, Ihr Passwort und Ihre Anmelde-Adresse; die neue Adresse gilt, sobald Sie den Link in der Mail an sie geöffnet haben. Ganz unten löschen Sie Ihr Konto. Meldet sich jemand von einem unbekannten Gerät an oder wird der zweite Faktor abgeschaltet, bekommen Sie eine Mail. Hat ein Kollege sein Telefon verloren, setzt ein Administrator seine Zwei-Faktor-Anmeldung in der Teamliste zurück. Nach dem Ändern des Passworts werden alle anderen Geräte abgemeldet. Eine offene Einladung können Sie erneut senden; der alte Link verliert dann seine Gültigkeit.',
      'Einzelne Felder lassen sich je Rolle einschränken: verborgen oder nur lesbar, etwa der Betrag eines Geschäfts oder die Telefonnummer eines Kontakts. Ein verborgenes Feld fehlt in Listen, Akten, Export und Filtern; ein nur lesbares lässt sich weder bearbeiten noch importieren. Die Inhaber-Rolle sieht immer alles.',
      'Eine Rolle kann bei Firmen, Kontakten und Geschäften auf „nur eigene“ gestellt werden: sie sieht dann nur, wofür die Person verantwortlich ist, und was niemandem zugeordnet ist — samt allem, was daran hängt. Gehört das eigene Geschäft zu einer fremden Firma, steht dort „Nicht sichtbar“ statt des Namens, auch im Export; die Verknüpfung selbst bleibt erhalten.',
      'Die Zwei-Faktor-Anmeldung schützt Ihr Konto mit einem Code aus einer Authenticator-App. Bewahren Sie die Wiederherstellungscodes auf; sie helfen, wenn das Telefon fehlt. Administratoren können sie für das ganze Team verlangen: wer sie dann noch nicht hat, wird nach der Anmeldung zur Einrichtung geführt und sieht bis dahin keine Daten.',
      'Hat der Betreiber es eingerichtet, melden Sie sich auch mit Google oder Microsoft an, und beim Registrieren legen Sie so Konto und Arbeitsbereich an. Wiedererkannt wird das Google- oder Microsoft-Konto an seiner festen Kennung, nicht an der Adresse. Ein bestehendes Stegwerk-Konto verknüpft Google beim ersten Anmelden nur, wenn beide Seiten dieselbe Adresse bestätigt haben; Microsoft verknüpfen Sie immer selbst unter „Mein Konto“ → „Anmelden mit Google und Microsoft“, mit Ihrem Passwort. Dort trennen Sie eine Verknüpfung auch wieder. Der zweite Faktor gilt bei diesem Weg genauso. Wer sein Konto mit Google oder Microsoft angelegt hat, legt unter „Mein Konto“ über einen Link per Mail ein eigenes Passwort fest; vorher lässt sich die letzte Verknüpfung nicht trennen.',
      'Unter „Angemeldete Geräte“ sehen Sie, wo Ihr Konto angemeldet ist, und melden einzelne oder alle anderen Geräte ab. Das Sicherheitsprotokoll zeigt Anmeldungen, Fehlversuche, Änderungen am zweiten Faktor, an Rollen und Schlüsseln sowie Exporte; es wird ein Jahr lang aufbewahrt.',
      'Beim Anmelden entscheiden Sie mit „Angemeldet bleiben“, wie lange die Sitzung hält. Ohne Haken endet sie, sobald Sie den Browser schließen, spätestens aber zwölf Stunden nach der letzten Nutzung — gut für fremde oder geteilte Rechner. Mit Haken bleiben Sie bis zu 30 Tage angemeldet. Das Abmelden nach Leerlauf des Bereichs gilt in beiden Fällen. Unter „Angemeldete Geräte“ steht bei jeder Sitzung, ob sie mit dem Browser endet.',
      'Passwörter brauchen mindestens 12 Zeichen. Stegwerk lehnt außerdem solche ab, die leicht zu erraten sind: bekannte Wörter wie „Passwort“ oder „Sommer“, Zahlen- und Tastaturfolgen, Jahreszahlen und Ihr eigener Name oder Ihre Adresse. Geprüft wird auf unserem Server, ohne das Passwort an einen fremden Dienst zu schicken. Nach zehn falschen Versuchen in einer Viertelstunde wird die Anmeldung für dieses Konto 15 Minuten gesperrt, und Sie bekommen eine Mail.',
      'Wer Mitglieder verwaltet, kann unter „Einladungen nur an diese Domains“ festlegen, dass nur Adressen der eigenen Firma eingeladen werden, etwa beispiel.de. Wer schon im Team ist, bleibt es; offene Einladungen an andere Domains lassen sich nicht mehr annehmen.',
      'Unter „Abmelden nach Leerlauf“ legt ein Administrator fest, nach wie viel Zeit ohne Eingabe (30 Minuten bis 8 Stunden) alle abgemeldet werden. Eine Minute vorher fragt ein Hinweis „Noch da?“; eine Eingabe in irgendeinem Tab zählt für alle. Der Server prüft die Frist auch selbst, wenn der Browser geschlossen war.',
    ],
    links: [{ to: '/team', label: 'Team' }],
  },
  {
    id: 'protokoll',
    titel: 'Protokoll des Bereichs',
    absaetze: [
      'Unter „Mehr“ → „Protokoll“ steht für den ganzen Bereich, wer wann welchen Datensatz angelegt, geändert, gelöscht oder wiederhergestellt hat, und was am Zugang geschah: Anmeldungen, Fehlversuche, Rollen, Schlüssel, Exporte. Filtern Sie nach Person, Quelle, Objekt und Zeitraum; „Als CSV“ lädt dieselbe Auswahl herunter, höchstens 5000 Zeilen, und der Export selbst wird protokolliert.',
      'Sehen darf das nur eine Rolle mit dem Recht „Protokoll des Bereichs sehen“. Auch hier gelten die Zeilen- und Feldrechte: was die Rolle nicht sehen darf, fehlt im Protokoll. Einträge werden nur so lange aufbewahrt, wie es oben auf der Seite steht.',
    ],
    links: [{ to: '/protokoll', label: 'Protokoll' }],
  },
  {
    id: 'daten',
    titel: 'Daten und Datenschutz',
    absaetze: [
      'Unter „Daten“ lädt der Inhaber alles, was zu diesem Arbeitsbereich gespeichert ist, als eine JSON-Datei herunter (DSGVO Art. 15 und 20). Passwörter und Sitzungsschlüssel sind nicht enthalten.',
      'Dort lässt sich der Arbeitsbereich auch unwiderruflich löschen, mit seinem Namen und Ihrem Passwort zur Bestätigung. Exportieren Sie vorher.',
      'Impressum, Datenschutzerklärung und Auftragsverarbeitungsvertrag finden Sie im Menü unter Ihrem Namen.',
    ],
    links: [{ to: '/daten', label: 'Daten' }],
  },
];

const passt = (abschnitt: Abschnitt, begriff: string): boolean => {
  if (begriff === '') {
    return true;
  }

  const text = [abschnitt.titel, ...abschnitt.absaetze].join(' ').toLowerCase();

  return begriff
    .toLowerCase()
    .split(/\s+/u)
    .every((wort) => text.includes(wort));
};

export const HilfePage = () => {
  const [suche, setSuche] = useState('');
  const { data } = useQuery<{
    legalEntity: { configured: boolean; email: string | null } | null;
  }>(LEGAL_ENTITY);

  const { hash } = useLocation();

  useEffect(() => {
    const anker = ankerAusHash(hash);
    if (anker) {
      document.getElementById(anker)?.scrollIntoView({ block: 'start' });
    }
  }, [hash]);

  const begriff = suche.trim();
  const treffer = ABSCHNITTE.filter((abschnitt) => passt(abschnitt, begriff));
  const supportMail = data?.legalEntity?.email ?? null;

  return (
    <>
      <div className="page__header">
        <div>
          <h1>Hilfe</h1>
          <p className="page__subtitle">
            Das Handbuch zu Stegwerk: was es gibt und wo Sie es finden.
          </p>
        </div>
      </div>

      <div className="hilfe">
        <aside className="hilfe__seite">
          <input
            type="search"
            className="hilfe__suche"
            placeholder="Im Handbuch suchen…"
            aria-label="Im Handbuch suchen"
            value={suche}
            onChange={(event) => setSuche(event.target.value)}
          />

          <nav aria-label="Inhalt" className="hilfe__inhalt">
            <ol>
              {treffer.map((abschnitt) => (
                <li key={abschnitt.id}>
                  <a href={`#${abschnitt.id}`}>{abschnitt.titel}</a>
                </li>
              ))}
            </ol>
          </nav>

          <section className="card hilfe__support" aria-labelledby="support">
            <h2 id="support">Fragen?</h2>
            {supportMail !== null && supportMail !== '' ? (
              <p>
                Schreiben Sie uns an{' '}
                <a href={`mailto:${supportMail}`}>{supportMail}</a>. Nennen Sie
                dabei bitte, auf welcher Seite Sie waren und was Sie erwartet
                hätten.
              </p>
            ) : (
              <p>
                Wenden Sie sich an die Person, die Stegwerk in Ihrem Unternehmen
                eingerichtet hat. Die Anschrift des Betreibers steht im{' '}
                <Link to="/impressum">Impressum</Link>.
              </p>
            )}
          </section>
        </aside>

        <div className="hilfe__text">
          {treffer.length === 0 && (
            <p className="state">Nichts gefunden für „{begriff}“.</p>
          )}

          {treffer.map((abschnitt) => (
            <section
              key={abschnitt.id}
              id={abschnitt.id}
              className="card hilfe__abschnitt"
            >
              <h2>{abschnitt.titel}</h2>
              {abschnitt.absaetze.map((absatz) => (
                <p key={absatz}>{absatz}</p>
              ))}
              {abschnitt.links !== undefined && (
                <p className="hilfe__links">
                  {abschnitt.links.map((link) => (
                    <Link key={link.to} to={link.to}>
                      {link.label} <IconArrowRight size={14} />
                    </Link>
                  ))}
                </p>
              )}
            </section>
          ))}
        </div>
      </div>
    </>
  );
};
