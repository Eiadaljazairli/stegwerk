import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { MailFormular } from '../components/MailFormular';
import { Verlauf } from '../components/MessageList';
import { LoadingAnnouncement } from '../components/Skeleton';
import { personName, useTeam } from '../components/Verantwortlich';
import { useAuth } from '../lib/auth';
import {
  antwortAn,
  antwortBetreff,
  type Faden,
  gruppiereFaeden,
} from '../lib/mail-threads';
import {
  gespraechStand,
  kannSendenAus,
  POSTFACH_FILTER,
  type PostfachFilter,
  postfachName,
} from '../lib/postfaecher';
import {
  POSTFACH_ERLEDIGT,
  POSTFACH_GESPRAECH,
  POSTFACH_GESPRAECHE,
  POSTFACH_ZUWEISEN,
  POSTFAECHER,
} from '../lib/queries';
import {
  type Mailbox,
  type MailMessage,
  type PostfachGespraech,
} from '../lib/types';

const zeitpunkt = (wert: string): string =>
  new Date(wert).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const PostfachEingangPage = (): JSX.Element => {
  const { id = '' } = useParams<{ id: string }>();
  const { session } = useAuth();
  const ich = session?.user.id ?? null;
  const [filter, setFilter] = useState<PostfachFilter>('offen');
  const [offen, setOffen] = useState<string | null>(null);
  const { data: postfachDaten, loading: laedtPostfach } = useQuery<{
    postfaecher: Mailbox[];
  }>(POSTFAECHER);
  const postfach =
    postfachDaten?.postfaecher.find((eintrag) => eintrag.id === id) ?? null;
  const { data, loading, error, refetch } = useQuery<{
    postfachGespraeche: PostfachGespraech[];
  }>(POSTFACH_GESPRAECHE, {
    variables: { mailboxId: id, filter },
    skip: id === '',
    fetchPolicy: 'cache-and-network',
  });
  const team = useTeam();
  const namen = new Map(team.map((person) => [person.id, personName(person)]));
  const gespraeche = data?.postfachGespraeche ?? [];

  if (laedtPostfach) {
    return <LoadingAnnouncement />;
  }

  return (
    <>
      <div className="page__header">
        <div>
          <p className="page__subtitle">
            <Link to="/postfach">Postfach</Link>
          </p>
          <h1>{postfach === null ? 'Posteingang' : postfachName(postfach)}</h1>
          <p className="page__subtitle">
            {postfach?.art === 'gemeinsam'
              ? 'Gemeinsames Postfach. Übernehmen Sie ein Gespräch, antworten Sie aus dem Postfach und markieren Sie es als erledigt.'
              : 'Ihr Posteingang, je Gespräch.'}
          </p>
        </div>
      </div>

      <div className="status-tabs" role="tablist" aria-label="Gespräche">
        {POSTFACH_FILTER.map((eintrag) => (
          <button
            key={eintrag.wert}
            type="button"
            role="tab"
            aria-selected={filter === eintrag.wert}
            className={
              filter === eintrag.wert
                ? 'status-tabs__tab is-active'
                : 'status-tabs__tab'
            }
            onClick={() => {
              setFilter(eintrag.wert);
              setOffen(null);
            }}
          >
            <span className="status-tabs__label">{eintrag.text}</span>
          </button>
        ))}
      </div>

      {error !== undefined && (
        <div className="error-banner" role="alert">
          {error.message}
        </div>
      )}

      {loading && gespraeche.length === 0 ? (
        <LoadingAnnouncement />
      ) : gespraeche.length === 0 && error === undefined ? (
        <p className="field__hint" role="status">
          {filter === 'offen'
            ? 'Nichts Offenes. Neue Post erscheint nach dem nächsten Abruf.'
            : filter === 'mir'
              ? 'Ihnen ist gerade nichts Offenes zugewiesen.'
              : 'Hier steht noch nichts.'}
        </p>
      ) : (
        <ul className="postfach-eingang">
          {gespraeche.map((gespraech) => {
            const istOffen = offen === gespraech.threadKey;
            const stand = gespraechStand(gespraech, namen, ich);

            return (
              <li
                key={gespraech.threadKey}
                className={
                  gespraech.offen
                    ? 'postfach-eingang__eintrag'
                    : 'postfach-eingang__eintrag postfach-eingang__eintrag--erledigt'
                }
              >
                <button
                  type="button"
                  className="postfach-eingang__kopf"
                  aria-expanded={istOffen}
                  onClick={() =>
                    setOffen(istOffen ? null : gespraech.threadKey)
                  }
                >
                  <span className="postfach-eingang__zeile">
                    <span className="postfach-eingang__von">
                      {gespraech.ausgehend
                        ? 'Von uns'
                        : (gespraech.vonName ?? gespraech.vonAdresse)}
                    </span>
                    {gespraech.anzahl > 1 && (
                      <span className="messages__anzahl">
                        {gespraech.anzahl}
                      </span>
                    )}
                    <span className="postfach-eingang__zeit">
                      {zeitpunkt(gespraech.zuletzt)}
                    </span>
                  </span>
                  <span className="postfach-eingang__betreff">
                    {gespraech.betreff ?? '(kein Betreff)'}
                  </span>
                  <span className="postfach-eingang__stand">{stand}</span>
                </button>

                {istOffen && postfach !== null && (
                  <Gespraech
                    postfach={postfach}
                    gespraech={gespraech}
                    ich={ich}
                    aktualisieren={refetch}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
};

const Gespraech = ({
  postfach,
  gespraech,
  ich,
  aktualisieren,
}: {
  postfach: Mailbox;
  gespraech: PostfachGespraech;
  ich: string | null;
  aktualisieren: () => Promise<unknown>;
}): JSX.Element => {
  const team = useTeam();
  const { data, refetch } = useQuery<{ postfachGespraech: MailMessage[] }>(
    POSTFACH_GESPRAECH,
    {
      variables: { mailboxId: postfach.id, threadKey: gespraech.threadKey },
    },
  );
  const [zuweisen, { loading: weistZu }] = useMutation(POSTFACH_ZUWEISEN);
  const [erledigen, { loading: erledigt }] = useMutation(POSTFACH_ERLEDIGT);
  const [fehler, setFehler] = useState<string | null>(null);
  const [antworten, setAntworten] = useState(false);
  const faden: Faden | undefined = gruppiereFaeden(
    data?.postfachGespraech ?? [],
  )[0];
  const kandidaten =
    postfach.art === 'gemeinsam'
      ? team.filter((person) => (postfach.mitglieder ?? []).includes(person.id))
      : team.filter((person) => person.id === ich);
  const kennung = `gespraech-${gespraech.nachrichtId}`;

  const versuche = async (schritt: () => Promise<unknown>): Promise<void> => {
    setFehler(null);

    try {
      await schritt();
      await aktualisieren();
    } catch (problem) {
      setFehler(
        problem instanceof Error ? problem.message : 'Unbekannter Fehler.',
      );
    }
  };

  const ziel =
    gespraech.contactId !== null
      ? { contactId: gespraech.contactId }
      : gespraech.companyId !== null
        ? { companyId: gespraech.companyId }
        : undefined;

  return (
    <div className="postfach-eingang__verlauf">
      {fehler !== null && (
        <div className="error-banner" role="alert">
          {fehler}
        </div>
      )}

      <div className="postfach-eingang__aktionen">
        <div className="field">
          <label htmlFor={`${kennung}-zuweisen`}>Zugewiesen an</label>
          <select
            id={`${kennung}-zuweisen`}
            value={gespraech.zugewiesenAnId ?? ''}
            disabled={weistZu}
            onChange={(event) =>
              void versuche(() =>
                zuweisen({
                  variables: {
                    mailboxId: postfach.id,
                    threadKey: gespraech.threadKey,
                    userId:
                      event.target.value === '' ? null : event.target.value,
                  },
                }),
              )
            }
          >
            <option value="">Niemand</option>
            {kandidaten.map((person) => (
              <option key={person.id} value={person.id}>
                {person.id === ich
                  ? `${personName(person)} (ich)`
                  : personName(person)}
              </option>
            ))}
          </select>
        </div>
        <div className="row-actions">
          {ich !== null && gespraech.zugewiesenAnId !== ich && (
            <button
              type="button"
              className="button button--ghost"
              disabled={weistZu || !kandidaten.some((p) => p.id === ich)}
              onClick={() =>
                void versuche(() =>
                  zuweisen({
                    variables: {
                      mailboxId: postfach.id,
                      threadKey: gespraech.threadKey,
                      userId: ich,
                    },
                  }),
                )
              }
            >
              Übernehmen
            </button>
          )}
          <button
            type="button"
            className="button"
            disabled={erledigt}
            onClick={() =>
              void versuche(() =>
                erledigen({
                  variables: {
                    mailboxId: postfach.id,
                    threadKey: gespraech.threadKey,
                    erledigt: gespraech.offen,
                  },
                }),
              )
            }
          >
            {gespraech.offen ? 'Erledigt' : 'Wieder öffnen'}
          </button>
          {gespraech.contactId !== null && (
            <Link
              className="button button--quiet"
              to={`/kontakte/${gespraech.contactId}`}
            >
              Zum Kontakt
            </Link>
          )}
          {gespraech.contactId === null && gespraech.companyId !== null && (
            <Link
              className="button button--quiet"
              to={`/firmen/${gespraech.companyId}`}
            >
              Zur Firma
            </Link>
          )}
        </div>
      </div>

      {faden === undefined ? (
        <LoadingAnnouncement />
      ) : (
        <>
          <Verlauf faden={faden} />

          {kannSendenAus(postfach) &&
            (antworten ? (
              <div className="antwort">
                <MailFormular
                  kennung={kennung}
                  {...(ziel === undefined ? {} : { ziel })}
                  werte={{}}
                  vorgabeAn={antwortAn(faden, postfach.username).join(', ')}
                  vorgabeBetreff={antwortBetreff(faden.betreff)}
                  antwortAuf={faden.neueste.id}
                  postfachId={postfach.id}
                  gesendet={async () => {
                    setAntworten(false);
                    await refetch();
                    await aktualisieren();
                  }}
                  abbrechen={() => setAntworten(false)}
                />
              </div>
            ) : (
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setAntworten(true)}
              >
                Antworten
              </button>
            ))}
        </>
      )}
    </div>
  );
};
