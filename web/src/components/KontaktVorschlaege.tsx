import { useApolloClient, useQuery } from '@apollo/client';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import {
  CREATE_COMPANY,
  CREATE_CONTACT,
  KONTAKT_VORSCHLAEGE,
} from '../lib/queries';
import { usePermissions } from '../lib/usePermissions';

type Vorschlag = {
  adresse: string;
  vorname: string;
  nachname: string;
  firmaId: string | null;
  firmaVorschlag: string | null;
  domain: string | null;
  anzahl: number;
  zuletzt: string;
};

export const KontaktVorschlaege = (): JSX.Element | null => {
  const client = useApolloClient();
  const rechte = usePermissions();
  const { data, refetch } = useQuery<{ kontaktVorschlaege: Vorschlag[] }>(
    KONTAKT_VORSCHLAEGE,
  );
  const [arbeitet, setArbeitet] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [angelegt, setAngelegt] = useState<{ id: string; name: string }[]>([]);

  const liste = data?.kontaktVorschlaege ?? [];

  if (liste.length === 0 && angelegt.length === 0) {
    return null;
  }

  const anlegen = async (vorschlag: Vorschlag): Promise<void> => {
    setFehler(null);
    setArbeitet(vorschlag.adresse);

    try {
      let companyId = vorschlag.firmaId;

      if (
        companyId === null &&
        vorschlag.firmaVorschlag !== null &&
        rechte.can('company:write')
      ) {
        const firma = await client.mutate<{ createCompany: { id: string } }>({
          mutation: CREATE_COMPANY,
          variables: {
            input: {
              name: vorschlag.firmaVorschlag,
              herkunft: 'mail',
              ...(vorschlag.domain === null
                ? {}
                : { domain: vorschlag.domain }),
            },
          },
        });

        companyId = firma.data?.createCompany.id ?? null;
      }

      const kontakt = await client.mutate<{ createContact: { id: string } }>({
        mutation: CREATE_CONTACT,
        variables: {
          input: {
            firstName: vorschlag.vorname === '' ? '—' : vorschlag.vorname,
            lastName:
              vorschlag.nachname === ''
                ? vorschlag.adresse
                : vorschlag.nachname,
            email: vorschlag.adresse,
            herkunft: 'mail',
            ...(companyId === null ? {} : { companyId }),
          },
        },
      });
      const id = kontakt.data?.createContact.id;

      if (id !== undefined) {
        setAngelegt((vorher) => [
          ...vorher,
          { id, name: `${vorschlag.vorname} ${vorschlag.nachname}`.trim() },
        ]);
      }

      await refetch();
    } catch (problem) {
      setFehler(
        problem instanceof Error ? problem.message : 'Unbekannter Fehler.',
      );
    } finally {
      setArbeitet(null);
    }
  };

  return (
    <section className="card kontakt-vorschlaege">
      <h2>Noch keine Kontakte</h2>
      <p className="field__hint">
        Diese Absender haben Ihnen in den letzten 30 Tagen geschrieben und sind
        noch nicht in Stegwerk. Nur aus Ihrem eigenen Postfach.
      </p>

      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
        </div>
      )}

      {angelegt.length > 0 && (
        <p className="notice notice--positive" role="status">
          Angelegt:{' '}
          {angelegt.map((kontakt, index) => (
            <span key={kontakt.id}>
              {index > 0 && ', '}
              <Link to={`/kontakte/${kontakt.id}`}>{kontakt.name}</Link>
            </span>
          ))}
        </p>
      )}

      {liste.length > 0 && (
        <ul className="kontakt-vorschlaege__liste">
          {liste.map((vorschlag) => (
            <li key={vorschlag.adresse}>
              <div>
                <strong>
                  {`${vorschlag.vorname} ${vorschlag.nachname}`.trim() ||
                    vorschlag.adresse}
                </strong>
                <span className="field__hint">
                  {' '}
                  {vorschlag.adresse} · {vorschlag.anzahl}{' '}
                  {vorschlag.anzahl === 1 ? 'Nachricht' : 'Nachrichten'}
                  {vorschlag.firmaVorschlag !== null &&
                    ` · Firma „${vorschlag.firmaVorschlag}“ wird mit angelegt`}
                </span>
              </div>
              <button
                type="button"
                className="button button--ghost button--small"
                disabled={arbeitet !== null || !rechte.can('contact:write')}
                onClick={() => void anlegen(vorschlag)}
              >
                {arbeitet === vorschlag.adresse
                  ? 'Wird angelegt…'
                  : 'Als Kontakt anlegen'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
