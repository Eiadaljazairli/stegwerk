import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';

import { LEGAL_ENTITY, PRIVACY_FACTS } from '../lib/queries';
import { type LegalEntity, type PrivacyFacts } from '../lib/types';
import { Wordmark } from '../components/Wordmark';
import { useSeitenkopf } from '../lib/seitenkopf';

export const DatenschutzPage = () => {
  useSeitenkopf(
    'Datenschutz',
    'Wie Stegwerk personenbezogene Daten verarbeitet.',
  );

  const { data: legalData, loading: legalLoading } = useQuery<{
    legalEntity: LegalEntity;
  }>(LEGAL_ENTITY);
  const { data: faktenData, loading: faktenLoading } = useQuery<{
    privacyFacts: PrivacyFacts;
  }>(PRIVACY_FACTS);

  const legal = legalData?.legalEntity;
  const fakten = faktenData?.privacyFacts;

  if (legalLoading || faktenLoading || fakten === undefined) {
    return (
      <div className="auth">
        <div className="auth__card legal-page">
          <div className="auth__title">Datenschutzerklärung</div>
          <p className="auth__subtitle">Wird geladen…</p>
        </div>
      </div>
    );
  }

  const anschrift =
    legal?.configured === true
      ? `${legal.companyName ?? ''}${
          legal.legalForm === null ? '' : ` ${legal.legalForm}`
        }, ${legal.street ?? ''}, ${legal.postalCode ?? ''} ${
          legal.city ?? ''
        }, ${legal.country ?? ''}`
      : null;

  return (
    <div className="auth">
      <div className="auth__card legal-page">
        <div className="auth__brand">
          <Wordmark size={16} />
        </div>

        <div className="auth__title">Datenschutzerklärung</div>

        {!fakten.reviewed && (
          <div className="legal-page__notice" role="note">
            <strong>Noch nicht rechtlich geprüft.</strong> Dieser Text
            beschreibt zutreffend, was die Anwendung verarbeitet, ersetzt aber
            keine anwaltliche Prüfung. Vor dem Einsatz mit echten Kundendaten
            prüfen lassen und anschließend{' '}
            <code>LEGAL_PRIVACY_REVIEWED=true</code> setzen, damit dieser
            Hinweis verschwindet.
          </div>
        )}

        <h2>1. Verantwortlicher</h2>
        {anschrift === null ? (
          <p className="legal-page__gap">
            Für diese Installation sind noch keine Anbieterangaben hinterlegt.
            Ohne sie fehlt der Erklärung ihr Verantwortlicher. Sie werden über{' '}
            <code>LEGAL_*</code> in der Umgebung gesetzt und stehen dann auch im{' '}
            <Link to="/impressum">Impressum</Link>.
          </p>
        ) : (
          <p>
            Verantwortlich im Sinne von Art. 4 Nr. 7 DSGVO ist {anschrift}.
            Weitere Angaben im <Link to="/impressum">Impressum</Link>.
          </p>
        )}

        <h2>2. Ansprechpartner für den Datenschutz</h2>
        {fakten.privacyContact === null ? (
          <p className="legal-page__gap">
            Noch nicht hinterlegt (<code>LEGAL_PRIVACY_CONTACT</code>). Bis
            dahin gilt die Kontaktadresse aus dem Impressum.
          </p>
        ) : (
          <p>
            Fragen zur Verarbeitung Ihrer Daten richten Sie an{' '}
            <a href={`mailto:${fakten.privacyContact}`}>
              {fakten.privacyContact}
            </a>
            .
          </p>
        )}

        <h2>3. Welche Daten verarbeitet werden</h2>

        <h3>Ihr Zugang</h3>
        <p>
          Zum Betrieb eines Kontos: Vor- und Nachname, E-Mail-Adresse, ein
          Passwort — gespeichert ausschließlich als Hash, nie im Klartext —, die
          Zugehörigkeit zu einem Arbeitsbereich und die dort vergebene Rolle.
          Dazu Anmeldesitzungen (Refresh-Token) mit Browser, Betriebssystem und
          gekürzter IP-Adresse, damit Sie Ihre angemeldeten Geräte sehen und
          abmelden können, und, falls angefordert, ein zeitlich begrenztes Token
          zum Zurücksetzen des Passworts.
        </p>
        <p>
          Änderungen an Datensätzen werden in einem Änderungsprotokoll
          festgehalten: wer wann welchen Datensatz angelegt, geändert oder
          gelöscht hat. Es dient der Nachvollziehbarkeit innerhalb des
          Arbeitsbereichs.
        </p>
        <p>
          Zum Schutz Ihres Zugangs führt Stegwerk ein Sicherheitsprotokoll:
          Anmeldungen und Fehlversuche, Änderungen am zweiten Faktor, an Rollen
          und API-Schlüsseln sowie Exporte, jeweils mit Zeitpunkt, Browser und
          gekürzter IP-Adresse. Sie sehen Ihre eigenen Einträge; wer Mitglieder
          verwalten darf, sieht die des Arbeitsbereichs.
        </p>
        <p>
          Verschickt ein Arbeitsbereich Serienmails, hält Stegwerk je Empfänger
          fest, ob die Nachricht gesendet oder warum sie übersprungen wurde.
          Jede Serienmail enthält einen Abmeldelink. Wer sich darüber abmeldet,
          wird mit E-Mail-Adresse, Thema und Zeitpunkt gespeichert, damit er
          keine weiteren Serienmails erhält; dieser Eintrag bleibt, solange der
          Arbeitsbereich besteht, auch wenn der Kontakt gelöscht wird.
        </p>
        <p>
          Nimmt der Inhaber eines Arbeitsbereichs den Vertrag über die
          Auftragsverarbeitung an, wird als Nachweis festgehalten: Name und
          E-Mail-Adresse der annehmenden Person, Zeitpunkt, gekürzte IP-Adresse,
          der Auftraggeber laut Briefkopf und eine Prüfsumme des Vertragstexts.
          Der Nachweis bleibt, solange der Arbeitsbereich besteht.
        </p>
        <p>
          Löschen Sie Ihr Konto selbst, werden Name, E-Mail-Adresse,
          Anmeldedaten, der zweite Faktor und private Postfächer entfernt und
          alle Sitzungen beendet. Einträge, die Sie in Arbeitsbereichen angelegt
          haben, gehören dem jeweiligen Bereich und bleiben ohne Ihren Namen
          erhalten. Beantragen Sie eine neue Anmelde-Adresse, wird sie bis zur
          Bestätigung höchstens 24 Stunden gespeichert.
        </p>
        <p>
          Für den Betrieb wird je Konto festgehalten, wann es zuletzt genutzt
          wurde, wann es sich angemeldet hat und wie oft es an einem Tag welche
          Bereiche von Stegwerk aufgerufen hat — etwa „Rechnungen: 12 Mal
          angesehen, 3 Mal geändert“. Nur Anzahlen, nie welcher Datensatz und
          nie ein Inhalt. Das sieht allein der Betreiber dieser Anlage, um
          Stegwerk zu verbessern und Fragen zu beantworten; es geht an niemanden
          sonst.
        </p>

        <h3>Ihre Inhalte</h3>
        <p>
          Alles, was Sie in Stegwerk eintragen: Firmen, Kontakte, Geschäfte,
          Aufgaben, Termine samt Teilnehmern, Notizen, Angebote, Rechnungen,
          Artikel und Briefkopf. Diese Daten gehören Ihnen. Enthalten sie
          personenbezogene Daten Dritter — und bei Kontaktdaten von Kunden tun
          sie das —, sind Sie dafür der Verantwortliche und der Betreiber dieser
          Anlage ist Ihr Auftragsverarbeiter nach Art. 28 DSGVO. Dafür ist ein
          Auftragsverarbeitungsvertrag erforderlich.
        </p>

        {fakten.mailboxes && (
          <>
            <h3>Verbundenes Postfach</h3>
            <p>
              Wenn Sie ein Postfach verbinden, liest Stegwerk über IMAP den
              Schriftwechsel und ordnet ihn den passenden Kontakten zu.
              Gespeichert werden Absender, Empfänger, Betreff, Zeitpunkt und ein
              Textauszug — nicht die vollständige Nachricht und keine Anhänge.
            </p>
            <p>
              Die Verbindung wird ausschließlich lesend geöffnet. Stegwerk kann
              Ihre Mail nicht als gelesen markieren, nicht verschieben und nicht
              löschen. Ihre Zugangsdaten werden verschlüsselt abgelegt und
              nirgends wieder angezeigt.
            </p>
            <p>
              Auf Wunsch wird zusätzlich der Ordner mit der gesendeten Post
              gelesen, mit denselben Angaben. Wer ein Postfach verbindet,
              bestimmt, ob Kolleginnen und Kollegen daraus alles, nur Betreff
              und Beteiligte oder nichts sehen. Beim Trennen wählt die Person,
              ob die gelesenen Nachrichten gelöscht oder behalten werden; die
              Zugangsdaten werden in jedem Fall gelöscht.
            </p>
            <p>
              Kommt eine Nachricht als unzustellbar zurück, wird der betroffene
              Kontakt mit Datum und dem Grund aus der Meldung des Mailservers
              markiert. Die Markierung entfällt, sobald von der Adresse wieder
              Post eintrifft oder sie geändert wird.
            </p>
          </>
        )}

        <h3>Verbundener Kalender</h3>
        <p>
          Wer seinen Kalender per CalDAV verbindet (etwa Nextcloud, mailbox.org,
          iCloud oder Fastmail), gibt Stegwerk Adresse, Benutzernamen und ein
          App-Passwort. Das Passwort wird verschlüsselt abgelegt und nirgends
          wieder angezeigt. Stegwerk legt die eigenen Termine dort ab, ändert
          und löscht sie, und liest alle zehn Minuten die Termine von 30 Tagen
          zurück bis 180 Tage voraus: Titel, Zeit, Ort, Beschreibung und die
          Teilnehmenden mit ihren Mailadressen. Teilnehmende, deren Adresse
          einem Kontakt gehört, werden mit diesem verknüpft. Beim Trennen werden
          Zugang und Zuordnungen gelöscht; übernommene Termine bleiben.
        </p>
        <p>
          Eine Einladung zu einem Termin geht nur auf ausdrücklichen Wunsch und
          über das eigene verbundene Postfach hinaus; Empfänger sind die
          Teilnehmenden mit Mailadresse. Antworten darauf werden beim Abruf des
          Postfachs gelesen und als Zusage oder Absage am Teilnehmer
          eingetragen.
        </p>

        <h3>Anmeldung über Google oder Microsoft</h3>
        <p>
          Wer Postfach oder Kalender über „Mit Google verbinden“ oder „Mit
          Microsoft verbinden“ einrichtet, meldet sich direkt beim Anbieter an;
          Stegwerk sieht das Passwort nie. Der Anbieter gibt Stegwerk ein
          Zugriffs- und ein Erneuerungstoken sowie die Mailadresse des Kontos.
          Beide Token werden verschlüsselt gespeichert. Erbeten werden nur die
          nötigen Berechtigungen: beim Postfach Lesen per IMAP und Senden per
          SMTP (Google: „mail.google.com“, Microsoft: IMAP.AccessAsUser.All und
          SMTP.Send), beim Kalender Lesen und Schreiben von Terminen (Google:
          „calendar“, Microsoft: Calendars.ReadWrite). Gelesen und geschrieben
          wird dasselbe wie oben beschrieben, nicht mehr.
        </p>
        <p>
          Google LLC und Microsoft Corporation haben ihren Sitz in den USA;
          beide sind nach dem EU-US Data Privacy Framework zertifiziert
          (Angemessenheitsbeschluss der EU-Kommission vom 10. Juli 2023). Die
          Daten liegen ohnehin bei diesen Anbietern; Stegwerk ruft sie dort nur
          im Auftrag der Person ab, die verbindet. Beim Trennen werden die Token
          gelöscht und bei Google zusätzlich zurückgegeben; bei Microsoft lässt
          sich der Zugriff unter myaccount.microsoft.com → Datenschutz → Apps
          widerrufen.
        </p>

        <h2>4. Was im Browser gespeichert wird</h2>
        <p>
          Keine Cookies zur Wiedererkennung oder Werbung, weder eigene noch
          fremde, und deshalb auch kein Zustimmungsbanner. Technisch nötig sind
          zwei eigene: die Anmeldesitzung (nur für die Schnittstelle lesbar)
          und, nur während Postfach oder Kalender über Google oder Microsoft
          verbunden wird, für höchstens zehn Minuten ein Cookie, das die
          Rückkehr vom Anbieter an Ihren Browser bindet. Melden Sie sich ohne
          „Angemeldet bleiben“ an, kommt ein drittes ohne Inhalt hinzu, das mit
          dem Schließen des Browsers verfällt und damit auch die Sitzung
          beendet.
        </p>
        <p>
          Im lokalen Speicher Ihres Browsers liegen vier Einträge: Ihre
          Anmeldesitzung, Ihre Wahl zwischen hellem und dunklem Erscheinungsbild
          und zwei Merkposten dafür, welche Ansicht Sie zuletzt geöffnet hatten.
          Dazu kommt Ihre letzte Wahl bei „Angemeldet bleiben“, damit die
          Anmeldemaske sie wieder vorschlägt. Sie verlassen Ihren Browser nicht
          und werden mit dem Abmelden beziehungsweise dem Leeren der
          Browserdaten entfernt.
        </p>
        <p>
          Kein Tracking durch Dritte, keine Analysedienste, keine
          Werbenetzwerke, keine eingebetteten Schriften oder Skripte von fremden
          Servern. Die Anwendung lädt ausschließlich von der Adresse, unter der
          Sie sie aufgerufen haben.
        </p>

        <h2>5. Rechtsgrundlagen</h2>
        <p>
          Die Verarbeitung Ihrer Konto- und Inhaltsdaten erfolgt zur Erfüllung
          des Vertrags über die Nutzung von Stegwerk, Art. 6 Abs. 1 lit. b
          DSGVO. Soweit Daten zum sicheren Betrieb verarbeitet werden — etwa das
          Änderungsprotokoll und die Nutzungszahlen je Konto —, stützt sich das
          auf das berechtigte Interesse an einem nachvollziehbaren und
          abgesicherten System, Art. 6 Abs. 1 lit. f DSGVO. Für Rechnungen
          gelten daneben die gesetzlichen Aufbewahrungspflichten, Art. 6 Abs. 1
          lit. c DSGVO.
        </p>

        <h2>6. Empfänger</h2>
        <p>
          {fakten.hosting === null ? (
            <span className="legal-page__gap">
              Der Betreiber der Anlage ist noch nicht angegeben (
              <code>LEGAL_HOSTING</code>). Wer die Server stellt und wo sie
              stehen, gehört an diese Stelle.
            </span>
          ) : (
            <>Betrieb und Speicherung erfolgen bei: {fakten.hosting}.</>
          )}
        </p>

        <ul className="legal-page__list">
          {fakten.outgoingMail ? (
            <li>
              <strong>E-Mail-Versand.</strong> Einladungen,
              Passwort-Zurücksetzungen und Erinnerungen werden über einen
              Mailserver verschickt. Dabei werden Empfängeradresse und Inhalt
              der Nachricht übermittelt.
            </li>
          ) : (
            <li>
              <strong>Kein E-Mail-Versand.</strong> In dieser Installation ist
              kein Mailserver eingerichtet. Ausgehende Nachrichten werden nicht
              versendet.
            </li>
          )}

          {fakten.billing && (
            <li>
              <strong>Zahlungsabwicklung.</strong> Für kostenpflichtige Tarife
              wird Stripe eingesetzt. Zahlungsdaten werden dort eingegeben und
              dort verarbeitet; Stegwerk speichert keine Kartendaten, sondern
              nur eine Kundennummer und den Status des Abonnements.
            </li>
          )}

          {fakten.errorReporting && (
            <li>
              <strong>Fehlerberichte.</strong> Tritt ein technischer Fehler auf,
              wird ein Bericht an einen Dienst zur Fehlerauswertung übermittelt.
              Cookies, Kopfzeilen und Anfrageinhalte werden vorher entfernt, und
              personenbezogene Angaben werden nicht mitgesendet.
            </li>
          )}

          {!fakten.billing && !fakten.errorReporting && (
            <li>
              Weder eine Zahlungsabwicklung noch eine Fehlerauswertung ist in
              dieser Installation eingerichtet.
            </li>
          )}
        </ul>

        <h2>7. Wie lange gespeichert wird</h2>
        <p>
          Die Nutzungszahlen je Tag werden nach 90 Tagen gelöscht, mit dem Konto
          auch früher. Das Sicherheitsprotokoll (Anmeldungen, Fehlversuche,
          Änderungen am Zugang, Exporte, jeweils mit Browser und gekürzter
          IP-Adresse) nach {fakten.protokollSicherheitMonate} Monaten.
        </p>
        <p>
          Im Änderungsprotokoll werden Änderungen und Löschungen nach{' '}
          {fakten.protokollAenderungenMonate} Monaten gelöscht. Vom Anlegen
          eines Datensatzes bleibt danach nur, wer ihn wann angelegt hat, ohne
          die damals eingetragenen Werte.
        </p>
        <p>
          Ihre Inhalte bleiben, solange Ihr Arbeitsbereich besteht. Sie können
          ihn jederzeit vollständig löschen; damit werden alle darin enthaltenen
          Daten unwiderruflich entfernt.
        </p>
        <p>
          {fakten.retentionEnabled ? (
            <>
              Endet der Zugang, wird der Arbeitsbereich nach{' '}
              {fakten.retentionDays} Tagen automatisch gelöscht. Vorher wird
              zweimal gewarnt: 30 Tage und 7 Tage vor dem Termin.
            </>
          ) : (
            <>
              Eine automatische Löschung nach Ende des Zugangs ist in dieser
              Installation nicht eingeschaltet. Daten werden dann erst gelöscht,
              wenn Sie es verlangen.
            </>
          )}
        </p>

        <h2>8. Ihre Rechte</h2>
        <p>
          Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16),
          Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18),
          Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21).
        </p>
        <p>
          Zwei davon brauchen keine Anfrage: Unter <em>Daten</em> in der
          Anwendung können Sie den gesamten Inhalt Ihres Arbeitsbereichs als
          maschinenlesbare Datei herunterladen und ihn dort ebenso vollständig
          löschen.
        </p>

        <h2>9. Beschwerderecht</h2>
        <p>
          Sie können sich bei einer Aufsichtsbehörde beschweren, Art. 77 DSGVO.
          {fakten.supervisoryAuthority === null ? (
            <span className="legal-page__gap">
              {' '}
              Die zuständige Behörde ist hier noch nicht benannt (
              <code>LEGAL_SUPERVISORY_AUTHORITY</code>).
            </span>
          ) : (
            <> Zuständig ist: {fakten.supervisoryAuthority}.</>
          )}
        </p>

        <p className="auth__switch">
          <Link to="/auftragsverarbeitung">Auftragsverarbeitung</Link> ·{' '}
          <Link to="/sicherheit">Sicherheit</Link> ·{' '}
          <Link to="/unterauftragsverarbeiter">Unterauftragsverarbeiter</Link> ·{' '}
          <Link to="/impressum">Impressum</Link> ·{' '}
          <Link to="/anmelden">Zurück zur Anmeldung</Link>
        </p>
      </div>
    </div>
  );
};
