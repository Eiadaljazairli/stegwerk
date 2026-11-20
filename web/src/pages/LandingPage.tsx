import { type ComponentType } from 'react';
import { Link } from 'react-router-dom';

import {
  IconCalendar,
  IconDeals,
  IconInvoices,
  IconMailbox,
  IconQuotes,
  IconTeam,
} from '../components/Icons';
import { type ObjectKind, ObjectTile } from '../components/ObjectTile';
import { Vitrine } from '../components/Vitrine';
import { PRODUKTSEITEN } from '../lib/produktseiten';

type Leistung = {
  kind: ObjectKind;
  icon: ComponentType<{ size?: number }>;
  titel: string;
  text: string;
};

const LEISTUNGEN: Leistung[] = [
  {
    kind: 'deal',
    icon: IconDeals,
    titel: 'Geschäfte',
    text: 'Jedes Geschäft auf einem Board, von Kontakt bis Gewonnen. Mit Summen je Phase, Aufgaben und Verlauf an einer Stelle.',
  },
  {
    kind: 'quote',
    icon: IconQuotes,
    titel: 'Angebote',
    text: 'Aus dem Artikelstamm zusammengestellt, mit Ihrem Briefkopf als PDF. Fehlt eine Pflichtangabe, sagt Stegwerk es vor dem Versand.',
  },
  {
    kind: 'invoice',
    icon: IconInvoices,
    titel: 'Rechnungen und Mahnungen',
    text: 'Rechnungen nach § 14 UStG, lückenlos nummeriert und nach dem Stellen gesperrt, wie es die GoBD verlangen. Mahnstufen mit Verzugszinsen nach § 288 BGB.',
  },
  {
    kind: 'task',
    icon: IconCalendar,
    titel: 'Kalender',
    text: 'Termine für das ganze Team, mit Serien, Teilnehmern und Erinnerung per E-Mail. Als Datei in Outlook oder Apple Kalender übernehmen.',
  },
  {
    kind: 'mailbox',
    icon: IconMailbox,
    titel: 'Postfach',
    text: 'Ihr bestehendes Postfach per IMAP angebunden, bei jedem Anbieter. Jede Mail landet von selbst bei der richtigen Firma und dem richtigen Kontakt.',
  },
  {
    kind: 'team',
    icon: IconTeam,
    titel: 'Team und Rechte',
    text: 'Eigene Rollen mit genau den Rechten, die sie brauchen. Anmeldung mit zweitem Faktor, Protokoll jeder Änderung und eine Schnittstelle mit eigenen Schlüsseln.',
  },
];

const FRAGEN = [
  {
    frage: 'Wo liegen meine Daten?',
    antwort:
      'Dort, wo Sie Stegwerk betreiben: auf Ihrem eigenen Server oder bei einem Hoster Ihrer Wahl. Stegwerk ist Open Source unter der AGPL-3.0 und läuft mit Docker.',
  },
  {
    frage: 'Brauche ich ein zweites Programm für Rechnungen?',
    antwort:
      'Nein. Aus einem Geschäft wird ein Angebot und aus dem Angebot eine Rechnung, ohne dass etwas abgetippt wird. CRM-Programme schreiben üblicherweise keine Rechnungen, Rechnungsprogramme kennen keine Geschäfte; Stegwerk macht beides.',
  },
  {
    frage: 'Kann ich meine Daten wieder mitnehmen?',
    antwort:
      'Ja. Firmen, Kontakte und Geschäfte gehen als CSV-Datei heraus, und unter Daten lässt sich alles auf einmal herunterladen. Ein Import aus Ihrem bisherigen Programm geht ebenso per CSV.',
  },
  {
    frage: 'Was kostet Stegwerk?',
    antwort:
      'Nichts. Stegwerk ist Open Source, mit allen Funktionen und ohne Begrenzung der Teamgröße. Der Quelltext liegt offen auf GitHub.',
  },
];

const VERTRAUEN = [
  'Open Source (AGPL-3.0)',
  'Selbst betreiben mit Docker',
  'Keine Cookies, kein Tracking',
  'Rechnungen nach GoBD',
];

export const LandingPage = () => (
  <Vitrine startseite>
    <section className="landing__hero">
      <div className="landing__inner">
        <div className="landing__eyebrow">
          CRM für Vertriebsteams in Deutschland
        </div>
        <h1 className="landing__title">
          Vom ersten Kontakt bis zur bezahlten Rechnung.
        </h1>
        <p className="landing__lede">
          Firmen, Kontakte und Geschäfte, Angebote und Rechnungen nach § 14
          UStG, Kalender und Postfach. In einem Programm statt in zweien.
        </p>
        <div className="landing__cta">
          <Link to="/registrieren" className="button button--lg">
            Kostenlos starten
          </Link>
          <span className="landing__cta-note">
            Open Source. Ohne Kreditkarte. Ohne Begrenzung.
          </span>
        </div>
        <ul className="landing__trust">
          {VERTRAUEN.map((punkt) => (
            <li key={punkt}>{punkt}</li>
          ))}
        </ul>
      </div>
      <div className="landing__inner">
        <figure className="landing__shot landing__shot--hero">
          <img
            src="/startseite/board.webp"
            width={2560}
            height={1300}
            alt="Das Board der Geschäfte in Stegwerk: fünf Phasen mit Karten, Beträgen und Summen je Phase"
          />
        </figure>
      </div>
    </section>

    <section className="landing__section" id="funktionen">
      <div className="landing__inner">
        <h2 className="landing__h2">
          Alles, was zwischen Kontakt und Zahlung liegt
        </h2>
        <p className="landing__sub">
          Sechs Bereiche, die sonst auf zwei oder drei Programme verteilt sind,
          und die hier voneinander wissen.
        </p>
        <div className="landing__grid">
          {LEISTUNGEN.map((leistung) => (
            <article key={leistung.titel} className="landing__feature">
              <ObjectTile kind={leistung.kind} icon={leistung.icon} />
              <h3>{leistung.titel}</h3>
              <p>{leistung.text}</p>
            </article>
          ))}
        </div>
        <h3 className="landing__mehr-titel">Mehr zu einzelnen Funktionen</h3>
        <ul className="landing__mehr">
          {PRODUKTSEITEN.map((seite) => (
            <li key={seite.slug}>
              <Link to={`/funktionen/${seite.slug}`}>{seite.titel}</Link>
            </li>
          ))}
        </ul>
      </div>
    </section>

    <section className="landing__section landing__section--alt">
      <div className="landing__inner landing__pair">
        <div>
          <h2 className="landing__h2">Auf einen Blick, was offen ist</h2>
          <p className="landing__sub">
            Die Übersicht zeigt die offene Pipeline nach Phase, Ihre Aufgaben
            und was überfällig ist. Der Kalender zeigt, wer im Team wann wo ist.
          </p>
        </div>
        <figure className="landing__shot">
          <img
            src="/startseite/uebersicht.webp"
            width={2560}
            height={1600}
            loading="lazy"
            alt="Die Übersicht in Stegwerk mit offener Pipeline, Phasen und offenen Aufgaben"
          />
        </figure>
        <figure className="landing__shot">
          <img
            src="/startseite/kalender.webp"
            width={2560}
            height={1600}
            loading="lazy"
            alt="Der Kalender in Stegwerk in der Monatsansicht mit Terminen des Teams"
          />
        </figure>
      </div>
    </section>

    <section className="landing__section landing__section--alt" id="fragen">
      <div className="landing__inner landing__faq">
        <h2 className="landing__h2">Häufige Fragen</h2>
        {FRAGEN.map((eintrag) => (
          <details key={eintrag.frage} className="landing__q">
            <summary>{eintrag.frage}</summary>
            <p>{eintrag.antwort}</p>
          </details>
        ))}
      </div>
    </section>

    <section className="landing__section landing__closing">
      <div className="landing__inner">
        <h2 className="landing__h2">In wenigen Minuten eingerichtet</h2>
        <p className="landing__sub">
          Registrieren, Briefkopf eintragen, Kontakte importieren.
        </p>
        <Link to="/registrieren" className="button button--lg">
          Kostenlos starten
        </Link>
      </div>
    </section>
  </Vitrine>
);
