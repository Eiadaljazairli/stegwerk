import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';

import { LEGAL_ENTITY } from '../lib/queries';
import { type LegalEntity } from '../lib/types';
import { Wordmark } from '../components/Wordmark';
import { useSeitenkopf } from '../lib/seitenkopf';

export const ImpressumPage = () => {
  useSeitenkopf('Impressum', 'Anbieterangaben nach § 5 DDG.');
  const { data, loading } = useQuery<{ legalEntity: LegalEntity }>(
    LEGAL_ENTITY,
  );

  const legal = data?.legalEntity;

  return (
    <div className="auth">
      <div className="auth__card legal-page" style={{ maxWidth: 520 }}>
        <div className="auth__brand">
          <Wordmark size={16} />
        </div>

        <div className="auth__title">Impressum</div>

        {loading ? (
          <p className="auth__subtitle">Wird geladen…</p>
        ) : legal?.configured !== true ? (
          <p className="auth__subtitle">
            Die Anbieterangaben für diese Installation sind noch nicht
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

            <dt>Anschrift</dt>
            <dd>
              {legal.street}
              <br />
              {legal.postalCode} {legal.city}
              <br />
              {legal.country}
            </dd>

            {legal.representative !== null && (
              <>
                <dt>Vertreten durch</dt>
                <dd>{legal.representative}</dd>
              </>
            )}

            <dt>Kontakt</dt>
            <dd>
              {legal.email !== null && (
                <a href={`mailto:${legal.email}`}>{legal.email}</a>
              )}
              {legal.phone !== null && (
                <>
                  <br />
                  {legal.phone}
                </>
              )}
            </dd>

            {legal.registerEntry !== null && (
              <>
                <dt>Registereintrag</dt>
                <dd>{legal.registerEntry}</dd>
              </>
            )}

            {legal.vatId !== null && (
              <>
                <dt>Umsatzsteuer-ID</dt>
                <dd>{legal.vatId}</dd>
              </>
            )}
          </dl>
        )}

        <p className="auth__subtitle">
          Orte zu Postleitzahlen: GeoNames (
          <a href="https://www.geonames.org/" rel="noreferrer noopener">
            www.geonames.org
          </a>
          ), lizenziert unter{' '}
          <a
            href="https://creativecommons.org/licenses/by/4.0/deed.de"
            rel="noreferrer noopener"
          >
            CC BY 4.0
          </a>
          , gefiltert und gekürzt.
        </p>

        <p className="auth__switch">
          <Link to="/kontakt">Kontakt</Link> ·{' '}
          <Link to="/sicherheit">Sicherheit</Link> ·{' '}
          <Link to="/anmelden">Zurück zur Anmeldung</Link>
        </p>
      </div>
    </div>
  );
};
