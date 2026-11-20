import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { useAngemeldet } from '../lib/auth-kontext';
import { PRODUKTSEITEN } from '../lib/produktseiten';
import { Wordmark } from './Wordmark';

export const Vitrine = ({
  startseite = false,
  children,
}: {
  startseite?: boolean;
  children: ReactNode;
}) => {
  const angemeldet = useAngemeldet();

  return (
    <div className="landing">
      <a className="sprunglink" href="#inhalt">
        Zum Inhalt springen
      </a>
      <header className="landing__bar">
        <div className="landing__inner landing__bar-inner">
          <Link to="/" className="landing__brand" aria-label="Stegwerk">
            <Wordmark size={16} />
          </Link>
          <nav className="landing__nav" aria-label="Seite">
            {startseite ? (
              <>
                <a href="#funktionen">Funktionen</a>
                <a href="#fragen">Fragen</a>
              </>
            ) : (
              <>
                <Link to="/funktionen">Funktionen</Link>
                <Link to="/entwickler">Entwickler</Link>
              </>
            )}
          </nav>
          <div className="landing__bar-actions">
            {angemeldet ? (
              <Link to="/" className="button">
                Zur App
              </Link>
            ) : (
              <>
                <Link to="/anmelden" className="button button--ghost">
                  Anmelden
                </Link>
                <Link to="/registrieren" className="button">
                  {startseite ? 'Kostenlos starten' : 'Konto anlegen'}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="inhalt" tabIndex={-1}>
        {children}
      </main>

      <footer className="landing__footer">
        <nav
          className="landing__inner landing__footer-funktionen"
          aria-label="Funktionen"
        >
          {PRODUKTSEITEN.map((seite) => (
            <Link key={seite.slug} to={`/funktionen/${seite.slug}`}>
              {seite.seitentitel}
            </Link>
          ))}
        </nav>
        <div className="landing__inner landing__footer-inner">
          <Wordmark size={14} />
          <nav aria-label="Rechtliches">
            <Link to="/impressum">Impressum</Link>
            <Link to="/datenschutz">Datenschutz</Link>
            <Link to="/auftragsverarbeitung">Auftragsverarbeitung</Link>
            <Link to="/sicherheit">Sicherheit</Link>
            <Link to="/neuigkeiten">Neuigkeiten</Link>
            <Link to="/entwickler">Entwickler</Link>
            <Link to="/hilfe/fehlerbehebung">Fehlerbehebung</Link>
            <Link to="/kontakt">Kontakt</Link>
            {angemeldet ? (
              <Link to="/">Zur App</Link>
            ) : (
              <Link to="/anmelden">Anmelden</Link>
            )}
          </nav>
        </div>
      </footer>
    </div>
  );
};
