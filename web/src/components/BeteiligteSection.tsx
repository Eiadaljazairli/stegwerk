import { useMutation, useQuery } from '@apollo/client';
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';

import { kontaktTitel, nameTeilen } from '../lib/auswahl';
import {
  CREATE_CONTACT,
  DEAL_KONTAKT_ENTFERNEN,
  DEAL_KONTAKT_HINZUFUEGEN,
  DEAL_KONTAKT_ROLLE,
  DEAL_KONTAKT_ZUM_HAUPTKONTAKT,
  DEAL_ROLLEN,
} from '../lib/queries';
import { type DealBeteiligter, type DealDetail } from '../lib/types';
import { DatensatzAuswahl } from './DatensatzAuswahl';
import { IconContacts } from './Icons';
import { NichtSichtbar } from './NichtSichtbar';
import { ObjectTile } from './ObjectTile';

export const kontaktAusText = (text: string) => {
  const name = nameTeilen(text);

  if (name === null) {
    throw new Error('Bitte Vor- und Nachnamen eingeben, etwa „Eva Schulz“.');
  }

  return name;
};

const Rolle = ({
  zeile,
  vorschlaege,
  darfAendern,
  onChanged,
}: {
  zeile: DealBeteiligter;
  vorschlaege: string;
  darfAendern: boolean;
  onChanged: () => void;
}) => {
  const [text, setText] = useState(zeile.rolle ?? '');
  const [speichern, { error }] = useMutation(DEAL_KONTAKT_ROLLE);

  useEffect(() => setText(zeile.rolle ?? ''), [zeile.rolle]);

  if (!darfAendern) {
    return <span>{zeile.rolle ?? '—'}</span>;
  }

  const sichern = () => {
    if (text.trim() !== (zeile.rolle ?? '')) {
      void speichern({ variables: { id: zeile.id, rolle: text.trim() } })
        .then(onChanged)
        .catch(() => null);
    }
  };

  return (
    <>
      <input
        className="beteiligte__rolle"
        aria-label="Rolle"
        list={vorschlaege}
        maxLength={60}
        placeholder="Rolle"
        value={text}
        onChange={(ereignis) => setText(ereignis.target.value)}
        onBlur={sichern}
        onKeyDown={(ereignis) => {
          if (ereignis.key === 'Enter') {
            ereignis.currentTarget.blur();
          }
        }}
      />
      {error !== undefined && (
        <span className="field__error" role="alert">
          {error.message}
        </span>
      )}
    </>
  );
};

export const BeteiligteSection = ({
  deal,
  darfAendern,
  onChanged,
}: {
  deal: DealDetail;
  darfAendern: boolean;
  onChanged: () => void;
}) => {
  const vorschlaege = useId();
  const [hinzu, setHinzu] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const { data: rollen } = useQuery<{ dealRollen: string[] }>(DEAL_ROLLEN);
  const [hinzufuegen] = useMutation(DEAL_KONTAKT_HINZUFUEGEN);
  const [anlegen] = useMutation<{ createContact: { id: string } }>(
    CREATE_CONTACT,
  );
  const [entfernen] = useMutation(DEAL_KONTAKT_ENTFERNEN);
  const [zumHaupt] = useMutation(DEAL_KONTAKT_ZUM_HAUPTKONTAKT);

  const verknuepfte = [
    ...(deal.primaryContactId == null ? [] : [deal.primaryContactId]),
    ...deal.beteiligte.map((zeile) => zeile.contactId),
  ];
  const anzahl = verknuepfte.length;

  const mitFehler = async (tun: () => Promise<unknown>) => {
    setFehler(null);

    try {
      await tun();
      onChanged();
    } catch (problem) {
      setFehler(problem instanceof Error ? problem.message : 'Das ging nicht.');
    }
  };

  return (
    <section className="related beteiligte">
      <header className="related__head">
        <ObjectTile kind="contact" icon={IconContacts} size="md" />
        <h2 className="related__title">
          Beteiligte
          <span className="related__count">{anzahl}</span>
        </h2>
        {darfAendern && !hinzu && (
          <div className="related__action">
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => setHinzu(true)}
            >
              Kontakt hinzufügen
            </button>
          </div>
        )}
      </header>

      <datalist id={vorschlaege}>
        {(rollen?.dealRollen ?? []).map((rolle) => (
          <option key={rolle} value={rolle} />
        ))}
      </datalist>

      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
        </div>
      )}

      {hinzu && (
        <div className="beteiligte__hinzu">
          <DatensatzAuswahl
            art="kontakt"
            label="Kontakt für dieses Geschäft"
            ausser={verknuepfte}
            onWaehlen={async (treffer) => {
              await hinzufuegen({
                variables: { dealId: deal.id, contactId: treffer.id },
              });
              setHinzu(false);
              onChanged();
            }}
            onNeu={async (text) => {
              const name = kontaktAusText(text);
              const { data } = await anlegen({
                variables: {
                  input: {
                    ...name,
                    ...(deal.companyId == null
                      ? {}
                      : { companyId: deal.companyId }),
                  },
                },
              });

              if (data === null || data === undefined) {
                return;
              }

              await hinzufuegen({
                variables: {
                  dealId: deal.id,
                  contactId: data.createContact.id,
                },
              });
              setHinzu(false);
              onChanged();
            }}
            onAbbrechen={() => setHinzu(false)}
          />
        </div>
      )}

      {anzahl === 0 && !hinzu ? (
        <p className="related__empty">Noch niemand an diesem Geschäft.</p>
      ) : (
        <ul className="beteiligte__liste">
          {deal.primaryContactId != null && (
            <li className="beteiligte__eintrag">
              <span className="beteiligte__name">
                {deal.primaryContact === null ? (
                  <NichtSichtbar was="Kontakt" />
                ) : (
                  <Link to={`/kontakte/${deal.primaryContact.id}`}>
                    {kontaktTitel(deal.primaryContact)}
                  </Link>
                )}
              </span>
              <span className="badge badge--active">Hauptkontakt</span>
            </li>
          )}
          {deal.beteiligte.map((zeile) => (
            <li key={zeile.id} className="beteiligte__eintrag">
              <span className="beteiligte__name">
                {zeile.contact === null ? (
                  <NichtSichtbar was="Kontakt" />
                ) : (
                  <Link to={`/kontakte/${zeile.contact.id}`}>
                    {kontaktTitel(zeile.contact)}
                  </Link>
                )}
                {zeile.contact?.jobTitle != null &&
                  zeile.contact.jobTitle !== '' && (
                    <span className="beteiligte__position">
                      {zeile.contact.jobTitle}
                    </span>
                  )}
              </span>
              <Rolle
                zeile={zeile}
                vorschlaege={vorschlaege}
                darfAendern={darfAendern}
                onChanged={onChanged}
              />
              {darfAendern && (
                <span className="beteiligte__aktionen">
                  {zeile.contact !== null && (
                    <button
                      type="button"
                      className="feed__link"
                      onClick={() =>
                        void mitFehler(() =>
                          zumHaupt({ variables: { id: zeile.id } }),
                        )
                      }
                    >
                      Zum Hauptkontakt
                    </button>
                  )}
                  <button
                    type="button"
                    className="feed__link feed__link--danger"
                    aria-label={`${zeile.contact === null ? 'Kontakt' : kontaktTitel(zeile.contact)} vom Geschäft entfernen`}
                    onClick={() =>
                      void mitFehler(() =>
                        entfernen({ variables: { id: zeile.id } }),
                      )
                    }
                  >
                    Entfernen
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
