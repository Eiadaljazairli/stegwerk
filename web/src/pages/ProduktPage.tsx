import { Link, Navigate, useParams } from 'react-router-dom';

import { Vitrine } from '../components/Vitrine';
import {
  FUNKTIONEN_BESCHREIBUNG,
  FUNKTIONEN_TITEL,
  PRODUKTSEITEN,
  produktseite,
} from '../lib/produktseiten';
import { useSeitenkopf } from '../lib/seitenkopf';

export const FunktionenPage = () => {
  useSeitenkopf(FUNKTIONEN_TITEL, FUNKTIONEN_BESCHREIBUNG);

  return (
    <Vitrine>
      <section className="landing__hero produkt__kopf">
        <div className="landing__inner">
          <h1 className="landing__title">Funktionen</h1>
          <p className="landing__lede">
            Firmen, Kontakte und Geschäfte, Angebote und Rechnungen, Kalender
            und Postfach in einem Programm. Hier steht je Bereich, was es genau
            tut.
          </p>
        </div>
      </section>
      <section className="landing__section">
        <div className="landing__inner landing__grid">
          {PRODUKTSEITEN.map((seite) => (
            <article key={seite.slug} className="landing__feature">
              <h2 className="produkt__kachel-titel">
                <Link to={`/funktionen/${seite.slug}`}>{seite.titel}</Link>
              </h2>
              <p>{seite.beschreibung}</p>
            </article>
          ))}
        </div>
      </section>
    </Vitrine>
  );
};

export const ProduktPage = () => {
  const { slug } = useParams();
  const seite = produktseite(slug);

  useSeitenkopf(
    seite?.seitentitel ?? FUNKTIONEN_TITEL,
    seite?.beschreibung ?? FUNKTIONEN_BESCHREIBUNG,
  );

  if (seite === null) {
    return <Navigate to="/funktionen" replace />;
  }

  const weitere = PRODUKTSEITEN.filter((andere) => andere.slug !== seite.slug);

  return (
    <Vitrine>
      <section className="landing__hero produkt__kopf">
        <div className="landing__inner">
          <nav aria-label="Brotkrumen" className="produkt__krumen">
            <Link to="/">Stegwerk</Link> ›{' '}
            <Link to="/funktionen">Funktionen</Link>
          </nav>
          <h1 className="landing__title">{seite.titel}</h1>
          <p className="landing__lede">{seite.einleitung}</p>
        </div>
      </section>

      <section className="landing__section">
        <div className="landing__inner produkt__text">
          {seite.abschnitte.map((abschnitt) => (
            <section key={abschnitt.ueberschrift}>
              <h2 className="landing__h2">{abschnitt.ueberschrift}</h2>
              {abschnitt.absaetze.map((absatz) => (
                <p key={absatz}>{absatz}</p>
              ))}
            </section>
          ))}

          {seite.bild !== undefined && (
            <figure className="landing__shot">
              <img
                src={seite.bild.src}
                width={seite.bild.breite}
                height={seite.bild.hoehe}
                loading="lazy"
                alt={seite.bild.alt}
              />
            </figure>
          )}
        </div>
      </section>

      <section className="landing__section landing__section--alt">
        <div className="landing__inner">
          <h2 className="landing__h2">Weitere Funktionen</h2>
          <ul className="landing__mehr">
            {weitere.map((andere) => (
              <li key={andere.slug}>
                <Link to={`/funktionen/${andere.slug}`}>{andere.titel}</Link>
              </li>
            ))}
          </ul>
          <p className="produkt__weiter">
            Wie es sich im Einzelnen bedienen lässt, beschreibt nach der
            Anmeldung das Handbuch unter „Hilfe“. Für Programme gibt es die{' '}
            <Link to="/entwickler">Doku für Entwickler</Link>.
          </p>
          <Link to="/registrieren" className="button button--lg">
            Konto anlegen
          </Link>
        </div>
      </section>
    </Vitrine>
  );
};
