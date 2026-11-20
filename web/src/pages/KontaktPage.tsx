import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';

import { OeffentlicheSeite } from '../components/OeffentlicheSeite';
import { useAuth } from '../lib/auth';
import { LEGAL_ENTITY } from '../lib/queries';
import { type LegalEntity } from '../lib/types';

export const KontaktPage = () => {
  const { isSignedIn } = useAuth();
  const { data, loading } = useQuery<{ legalEntity: LegalEntity }>(
    LEGAL_ENTITY,
  );
  const legal = data?.legalEntity;

  return (
    <OeffentlicheSeite
      titel="Kontakt"
      untertitel="So erreichen Sie uns"
      beschreibung="Kontakt zu Stegwerk: E-Mail und Telefon für Fragen, Hilfe und Hinweise zur Sicherheit."
    >
      {loading ? (
        <p className="auth__subtitle">Wird geladen…</p>
      ) : legal?.configured !== true ||
        (legal.email === null && legal.phone === null) ? (
        <p>
          Die Kontaktangaben für diese Installation sind noch nicht
          veröffentlicht. Bitte wenden Sie sich an den Betreiber, von dem Sie
          den Zugang erhalten haben.
        </p>
      ) : (
        <dl className="impressum">
          <dt>Anbieter</dt>
          <dd>
            {legal.companyName}
            {legal.legalForm === null ? '' : ` ${legal.legalForm}`}
          </dd>

          {legal.email !== null && (
            <>
              <dt>E-Mail</dt>
              <dd>
                <a href={`mailto:${legal.email}`}>{legal.email}</a>
              </dd>
            </>
          )}

          {legal.phone !== null && (
            <>
              <dt>Telefon</dt>
              <dd>
                <a href={`tel:${legal.phone.replace(/[^\d+]/g, '')}`}>
                  {legal.phone}
                </a>
              </dd>
            </>
          )}
        </dl>
      )}

      <section>
        <h2>Bevor Sie schreiben</h2>
        <ul className="legal-page__list">
          {isSignedIn ? (
            <li>
              Viele Fragen beantwortet das <Link to="/hilfe">Handbuch</Link> in
              der App. Nennen Sie in Ihrer Nachricht bitte, auf welcher Seite
              Sie waren und was Sie erwartet hätten.
            </li>
          ) : (
            <li>
              Nach der Anmeldung finden Sie unter „Hilfe“ das Handbuch zu allen
              Funktionen.
            </li>
          )}
          <li>
            Wie Stegwerk Ihre Daten schützt, steht auf der Seite{' '}
            <Link to="/sicherheit">Sicherheit</Link>. Eine Schwachstelle melden
            Sie bitte über die Angaben oben.
          </li>
          <li>
            Fragen zum Datenschutz: siehe die{' '}
            <Link to="/datenschutz">Datenschutzerklärung</Link>.
          </li>
        </ul>
      </section>
    </OeffentlicheSeite>
  );
};
