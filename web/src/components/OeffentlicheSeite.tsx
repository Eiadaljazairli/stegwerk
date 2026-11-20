import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { useSeitenkopf } from '../lib/seitenkopf';
import { Wordmark } from './Wordmark';

export const OEFFENTLICHE_LINKS = [
  { to: '/funktionen', label: 'Funktionen' },
  { to: '/sicherheit', label: 'Sicherheit' },
  { to: '/unterauftragsverarbeiter', label: 'Unterauftragsverarbeiter' },
  { to: '/neuigkeiten', label: 'Neuigkeiten' },
  { to: '/hilfe/fehlerbehebung', label: 'Fehlerbehebung' },
  { to: '/entwickler', label: 'Entwickler' },
  { to: '/kontakt', label: 'Kontakt' },
  { to: '/datenschutz', label: 'Datenschutz' },
  { to: '/auftragsverarbeitung', label: 'Auftragsverarbeitung' },
  { to: '/impressum', label: 'Impressum' },
];

export const OeffentlicheSeite = ({
  titel,
  untertitel,
  beschreibung,
  children,
}: {
  titel: string;
  untertitel?: string;
  beschreibung: string;
  children: ReactNode;
}) => {
  useSeitenkopf(titel, beschreibung);

  return (
    <div className="auth">
      <div className="auth__card legal-page">
        <div className="auth__brand">
          <Link to="/" aria-label="Zur Startseite">
            <Wordmark size={16} />
          </Link>
        </div>

        <h1 className="auth__title">{titel}</h1>
        {untertitel !== undefined && (
          <p className="auth__subtitle">{untertitel}</p>
        )}

        {children}

        <nav
          className="auth__switch oeffentlich__links"
          aria-label="Weitere Seiten"
        >
          {OEFFENTLICHE_LINKS.map((link) => (
            <Link key={link.to} to={link.to}>
              {link.label}
            </Link>
          ))}
          <Link to="/anmelden">Anmelden</Link>
        </nav>
      </div>
    </div>
  );
};
