import { useMutation, useQuery } from '@apollo/client';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  type BegleitbelegArt,
  begleitbelegBadge,
  type BegleitbelegKurz,
  begleitbelegTitel,
  formatMenge,
  type LieferstandZeile,
} from '../lib/begleitbelege';
import {
  AUFTRAGSBESTAETIGUNG_STELLEN,
  BEGLEITBELEGE,
  LIEFERSCHEIN_STELLEN,
  LIEFERSTAND,
} from '../lib/queries';
import { formatDate, parseQuantity, type QuoteStatus } from '../lib/types';
import { usePermissions } from '../lib/usePermissions';
import { IconQuotes } from './Icons';
import { RelatedList } from './RelatedList';
import { TableWrap } from './TableWrap';

export type BegleitbelegFilter = {
  angebotId?: string;
  dealId?: string;
  companyId?: string;
  art?: BegleitbelegArt;
};

export const BegleitbelegeTabelle = ({
  belege,
  mitAngebot = true,
}: {
  belege: BegleitbelegKurz[];
  mitAngebot?: boolean;
}) => (
  <TableWrap>
    <table>
      <thead>
        <tr>
          <th>Nummer</th>
          <th>Art</th>
          <th>Datum</th>
          {mitAngebot && <th>Angebot</th>}
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {belege.map((beleg) => {
          const badge = begleitbelegBadge(beleg);

          return (
            <tr key={beleg.id}>
              <td data-label="Nummer">
                <Link to={`/belege/${beleg.id}`}>{beleg.number}</Link>
              </td>
              <td data-label="Art">{begleitbelegTitel(beleg)}</td>
              <td data-label="Datum">{formatDate(beleg.issuedOn)}</td>
              {mitAngebot && (
                <td data-label="Angebot">
                  <Link to={`/angebote/${beleg.angebot.id}`}>
                    {beleg.angebot.number}
                  </Link>
                </td>
              )}
              <td data-label="Status">
                <span className={badge.className}>{badge.text}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </TableWrap>
);

export const BegleitbelegeKarte = ({
  filter,
  action,
  mitAngebot = true,
}: {
  filter: BegleitbelegFilter;
  action?: ReactNode;
  mitAngebot?: boolean;
}) => {
  const { can } = usePermissions();
  const { data } = useQuery<{ begleitbelege: BegleitbelegKurz[] }>(
    BEGLEITBELEGE,
    { variables: { filter }, skip: !can('quote:view') },
  );

  if (!can('quote:view')) {
    return null;
  }

  const belege = data?.begleitbelege ?? [];

  return (
    <RelatedList
      kind="quote"
      icon={IconQuotes}
      title="Auftragsbestätigungen und Lieferscheine"
      count={belege.length}
      action={action}
      empty="Noch keine Auftragsbestätigung und kein Lieferschein."
    >
      <BegleitbelegeTabelle belege={belege} mitAngebot={mitAngebot} />
    </RelatedList>
  );
};

const BelegDialog = ({
  titel,
  schliessen,
  children,
}: {
  titel: string;
  schliessen: () => void;
  children: ReactNode;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="dialog dialog--beleg"
      aria-label={titel}
      onCancel={(event) => {
        event.preventDefault();
        schliessen();
      }}
    >
      <div className="dialog__body">
        <div className="dialog__title">{titel}</div>
        {children}
      </div>
    </dialog>
  );
};

const fehlerText = (problem: unknown): string =>
  problem instanceof Error ? problem.message : 'Unbekannter Fehler.';

const AuftragsbestaetigungDialog = ({
  angebot,
  schliessen,
}: {
  angebot: { id: string; number: string };
  schliessen: () => void;
}) => {
  const navigate = useNavigate();
  const [liefertermin, setLiefertermin] = useState('');
  const [schluss, setSchluss] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [stellen, { loading }] = useMutation<{
    auftragsbestaetigungStellen: { id: string };
  }>(AUFTRAGSBESTAETIGUNG_STELLEN, { refetchQueries: [BEGLEITBELEGE] });

  return (
    <BelegDialog titel="Auftragsbestätigung stellen" schliessen={schliessen}>
      <p className="dialog__consequence">
        Positionen und Summen kommen aus dem Angebot {angebot.number}. Mit dem
        Stellen bekommt die Bestätigung ihre Nummer und lässt sich danach nicht
        mehr ändern, nur stornieren.
      </p>
      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
        </div>
      )}
      <div className="field">
        <label htmlFor="ab-liefertermin">Liefertermin</label>
        <input
          id="ab-liefertermin"
          type="date"
          value={liefertermin}
          onChange={(event) => setLiefertermin(event.target.value)}
        />
        <p className="field__hint">Leer gelassen: kein Termin auf dem Beleg.</p>
      </div>
      <div className="field">
        <label htmlFor="ab-schluss">Schlusstext</label>
        <textarea
          id="ab-schluss"
          rows={3}
          value={schluss}
          onChange={(event) => setSchluss(event.target.value)}
        />
      </div>
      <div className="dialog__actions">
        <button
          type="button"
          className="button button--ghost"
          onClick={schliessen}
        >
          Abbrechen
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={loading}
          onClick={() => {
            setFehler(null);
            void stellen({
              variables: {
                input: {
                  angebotId: angebot.id,
                  ...(liefertermin === '' ? {} : { liefertermin }),
                  ...(schluss.trim() === ''
                    ? {}
                    : { closingText: schluss.trim() }),
                },
              },
            })
              .then((result) => {
                const neu = result.data?.auftragsbestaetigungStellen;

                if (neu !== undefined) {
                  navigate(`/belege/${neu.id}`);
                }
              })
              .catch((problem: unknown) => setFehler(fehlerText(problem)));
          }}
        >
          {loading ? 'Wird gestellt…' : 'Auftragsbestätigung stellen'}
        </button>
      </div>
    </BelegDialog>
  );
};

const LieferscheinDialog = ({
  angebot,
  auftragsbestaetigungId,
  schliessen,
}: {
  angebot: { id: string; number: string; recipientAddress: string | null };
  auftragsbestaetigungId: string | null;
  schliessen: () => void;
}) => {
  const navigate = useNavigate();
  const { data, loading: laedt } = useQuery<{
    lieferstand: LieferstandZeile[];
  }>(LIEFERSTAND, {
    variables: { angebotId: angebot.id },
    fetchPolicy: 'network-only',
  });
  const zeilen = data?.lieferstand ?? [];
  const [mengen, setMengen] = useState<Record<string, string>>({});
  const [lieferadresse, setLieferadresse] = useState('');
  const [lieferdatum, setLieferdatum] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [stellen, { loading }] = useMutation<{
    lieferscheinStellen: { id: string };
  }>(LIEFERSCHEIN_STELLEN, { refetchQueries: [BEGLEITBELEGE, LIEFERSTAND] });

  useEffect(() => {
    if (data !== undefined) {
      setMengen(
        Object.fromEntries(
          data.lieferstand.map((zeile) => [
            zeile.angebotsPositionId,
            zeile.offen > 0 ? formatMenge(zeile.offen) : '',
          ]),
        ),
      );
    }
  }, [data]);

  const allesGeliefert =
    zeilen.length > 0 && zeilen.every((zeile) => zeile.offen <= 0);

  const abschicken = () => {
    setFehler(null);
    const positionen: { angebotsPositionId: string; menge: number }[] = [];

    for (const zeile of zeilen) {
      const roh = (mengen[zeile.angebotsPositionId] ?? '').trim();

      if (roh === '') {
        continue;
      }

      const menge = parseQuantity(roh);

      if (menge === null || menge < 0) {
        setFehler(`Die Menge bei „${zeile.name}“ ist keine Zahl.`);

        return;
      }

      if (menge > 0) {
        positionen.push({
          angebotsPositionId: zeile.angebotsPositionId,
          menge,
        });
      }
    }

    if (positionen.length === 0) {
      setFehler('Tragen Sie bei mindestens einer Position eine Menge ein.');

      return;
    }

    void stellen({
      variables: {
        input: {
          angebotId: angebot.id,
          ...(auftragsbestaetigungId === null
            ? {}
            : { auftragsbestaetigungId }),
          ...(lieferadresse.trim() === ''
            ? {}
            : { lieferadresse: lieferadresse.trim() }),
          ...(lieferdatum === '' ? {} : { liefertermin: lieferdatum }),
          positionen,
        },
      },
    })
      .then((result) => {
        const neu = result.data?.lieferscheinStellen;

        if (neu !== undefined) {
          navigate(`/belege/${neu.id}`);
        }
      })
      .catch((problem: unknown) => setFehler(fehlerText(problem)));
  };

  return (
    <BelegDialog titel="Lieferschein stellen" schliessen={schliessen}>
      <p className="dialog__consequence">
        Vorgeschlagen ist, was vom Angebot {angebot.number} noch offen ist. Für
        eine Teillieferung verringern Sie die Mengen; der Rest bleibt offen für
        den nächsten Lieferschein.
      </p>
      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
        </div>
      )}
      {allesGeliefert && (
        <div className="notice">
          Alles aus diesem Angebot ist schon geliefert.
        </div>
      )}
      {laedt && data === undefined ? (
        <p>Lieferstand wird geladen…</p>
      ) : (
        <TableWrap>
          <table className="list-table">
            <thead>
              <tr>
                <th>Position</th>
                <th className="numeric">Bestellt</th>
                <th className="numeric">Geliefert</th>
                <th className="numeric">Diesmal</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((zeile) => (
                <tr key={zeile.angebotsPositionId}>
                  <td data-label="Position">
                    {zeile.name}
                    {zeile.articleNumber !== null && (
                      <span className="field__hint">
                        {' '}
                        · {zeile.articleNumber}
                      </span>
                    )}
                  </td>
                  <td data-label="Bestellt" className="numeric">
                    {formatMenge(zeile.bestellt)} {zeile.unit}
                  </td>
                  <td data-label="Geliefert" className="numeric">
                    {formatMenge(zeile.geliefert)}
                  </td>
                  <td data-label="Diesmal" className="numeric">
                    <input
                      aria-label={`Menge für ${zeile.name}`}
                      inputMode="decimal"
                      className="beleg-menge"
                      disabled={zeile.offen <= 0}
                      value={mengen[zeile.angebotsPositionId] ?? ''}
                      onChange={(event) =>
                        setMengen({
                          ...mengen,
                          [zeile.angebotsPositionId]: event.target.value,
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <div className="field">
        <label htmlFor="ls-adresse">Lieferanschrift</label>
        <textarea
          id="ls-adresse"
          rows={4}
          placeholder={angebot.recipientAddress ?? ''}
          value={lieferadresse}
          onChange={(event) => setLieferadresse(event.target.value)}
        />
        <p className="field__hint">
          Leer gelassen: die Anschrift aus dem Angebot. Eine andere Anschrift
          steht im Fenster, die Rechnungsanschrift dann im Text darunter.
        </p>
      </div>
      <div className="field">
        <label htmlFor="ls-datum">Lieferdatum</label>
        <input
          id="ls-datum"
          type="date"
          value={lieferdatum}
          onChange={(event) => setLieferdatum(event.target.value)}
        />
      </div>
      <div className="dialog__actions">
        <button
          type="button"
          className="button button--ghost"
          onClick={schliessen}
        >
          Abbrechen
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={loading || allesGeliefert || zeilen.length === 0}
          onClick={abschicken}
        >
          {loading ? 'Wird gestellt…' : 'Lieferschein stellen'}
        </button>
      </div>
    </BelegDialog>
  );
};

export const AngebotBelege = ({
  angebot,
}: {
  angebot: {
    id: string;
    number: string;
    status: QuoteStatus;
    recipientAddress: string | null;
  };
}) => {
  const { can } = usePermissions();
  const [offen, setOffen] = useState<'ab' | 'ls' | null>(null);
  const { data } = useQuery<{ begleitbelege: BegleitbelegKurz[] }>(
    BEGLEITBELEGE,
    {
      variables: { filter: { angebotId: angebot.id } },
      skip: !can('quote:view'),
    },
  );

  if (!can('quote:view')) {
    return null;
  }

  const belege = data?.begleitbelege ?? [];
  const gueltigeAb =
    belege.find(
      (beleg) =>
        beleg.art === 'AUFTRAGSBESTAETIGUNG' &&
        beleg.status === 'GESTELLT' &&
        beleg.stornoVonId === null,
    ) ?? null;
  const darfStellen =
    can('quote:send') &&
    (angebot.status === 'SENT' || angebot.status === 'ACCEPTED');

  return (
    <>
      {offen === 'ab' && (
        <AuftragsbestaetigungDialog
          angebot={angebot}
          schliessen={() => setOffen(null)}
        />
      )}
      {offen === 'ls' && (
        <LieferscheinDialog
          angebot={angebot}
          auftragsbestaetigungId={gueltigeAb?.id ?? null}
          schliessen={() => setOffen(null)}
        />
      )}
      <div className="beleg-karte">
        <RelatedList
          kind="quote"
          icon={IconQuotes}
          title="Auftragsbestätigung und Lieferscheine"
          count={belege.length}
          empty={
            darfStellen
              ? 'Hat der Kunde bestellt, bestätigen Sie den Auftrag oder stellen gleich einen Lieferschein.'
              : 'Noch keine Auftragsbestätigung und kein Lieferschein.'
          }
          action={
            darfStellen ? (
              <span className="related__knoepfe">
                {gueltigeAb === null && (
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => setOffen('ab')}
                  >
                    Auftrag bestätigen
                  </button>
                )}
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => setOffen('ls')}
                >
                  Lieferschein
                </button>
              </span>
            ) : undefined
          }
        >
          <BegleitbelegeTabelle belege={belege} mitAngebot={false} />
        </RelatedList>
      </div>
    </>
  );
};
