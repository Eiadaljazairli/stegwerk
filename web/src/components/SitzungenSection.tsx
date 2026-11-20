import { gql, useMutation, useQuery } from '@apollo/client';

import { useToast } from './Toast';

const MEINE_SITZUNGEN = gql`
  query MeineSitzungen {
    meineSitzungen {
      id
      geraet
      ipGekuerzt
      angemeldetAm
      zuletztAktiv
      dieses
      angemeldetBleiben
    }
  }
`;

const SITZUNG_BEENDEN = gql`
  mutation SitzungBeenden($id: ID!) {
    sitzungBeenden(id: $id)
  }
`;

const ANDERE_BEENDEN = gql`
  mutation AndereSitzungenBeenden {
    andereSitzungenBeenden
  }
`;

type Sitzung = {
  id: string;
  geraet: string | null;
  ipGekuerzt: string | null;
  angemeldetAm: string;
  zuletztAktiv: string;
  dieses: boolean;
  angemeldetBleiben: boolean;
};

const ZEIT = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export const SitzungenSection = () => {
  const { zeige } = useToast();
  const { data, loading } = useQuery<{ meineSitzungen: Sitzung[] }>(
    MEINE_SITZUNGEN,
    { fetchPolicy: 'cache-and-network' },
  );
  const [beenden] = useMutation(SITZUNG_BEENDEN, {
    refetchQueries: [MEINE_SITZUNGEN],
  });
  const [andere, { loading: beendetAndere }] = useMutation<{
    andereSitzungenBeenden: number;
  }>(ANDERE_BEENDEN, { refetchQueries: [MEINE_SITZUNGEN] });

  const sitzungen = data?.meineSitzungen ?? [];
  const fremde = sitzungen.filter((s) => !s.dieses).length;

  return (
    <section className="card sitzungen">
      <div className="sitzungen__kopf">
        <h2>Angemeldete Geräte</h2>
        {fremde > 0 && (
          <button
            type="button"
            className="button button--ghost"
            disabled={beendetAndere}
            onClick={() =>
              void andere()
                .then(() =>
                  zeige({ text: 'Alle anderen Geräte sind abgemeldet.' }),
                )
                .catch((fehler: Error) => zeige({ text: fehler.message }))
            }
          >
            Alle anderen abmelden
          </button>
        )}
      </div>
      <p className="field__hint">
        Kennen Sie ein Gerät nicht, melden Sie es ab und ändern Sie Ihr
        Passwort. Ein abgemeldetes Gerät verliert den Zugang spätestens nach 15
        Minuten.
      </p>

      {loading && sitzungen.length === 0 ? (
        <p className="field__hint">Wird geladen…</p>
      ) : (
        <ul className="sitzungen__liste">
          {sitzungen.map((s) => (
            <li key={s.id}>
              <div className="sitzungen__text">
                <strong>
                  {s.geraet ?? 'Unbekanntes Gerät'}
                  {s.dieses && (
                    <span className="sitzungen__dieses">Dieses Gerät</span>
                  )}
                </strong>
                <span className="field__hint">
                  {s.ipGekuerzt === null ? '' : `IP ${s.ipGekuerzt} · `}
                  angemeldet {ZEIT.format(new Date(s.angemeldetAm))} · zuletzt
                  aktiv {ZEIT.format(new Date(s.zuletztAktiv))}
                  {s.angemeldetBleiben
                    ? ''
                    : ' · endet mit dem Schließen des Browsers'}
                </span>
              </div>
              {!s.dieses && (
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() =>
                    void beenden({ variables: { id: s.id } })
                      .then(() => zeige({ text: 'Das Gerät ist abgemeldet.' }))
                      .catch((fehler: Error) => zeige({ text: fehler.message }))
                  }
                >
                  Abmelden
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
