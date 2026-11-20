import { useQuery } from '@apollo/client';
import { useState } from 'react';

import { LoadingAnnouncement } from '../components/Skeleton';
import { MY_MAILBOX, POSTFAECHER } from '../lib/queries';
import { KontaktVorschlaege } from '../components/KontaktVorschlaege';
import { type Mailbox } from '../lib/types';
import { MailTemplatesSection } from '../components/MailTemplatesSection';
import { MailSperrenSection } from '../components/MailSperrenSection';
import { MailEntwuerfeSection } from '../components/MailEntwuerfeSection';
import { PostfachEinstellungen } from '../components/PostfachEinstellungen';
import { useOAuthRueckmeldung } from '../components/OAuthAnmeldung';
import { Anker } from '../components/Anker';
import { AbhilfeLink } from '../components/AbhilfeLink';
import { PostfachKarte } from '../components/PostfachKarte';
import {
  PostfachVerbinden,
  type VerbindenArt,
} from '../components/PostfachVerbinden';
import { postfachName } from '../lib/postfaecher';
import { usePermissions } from '../lib/usePermissions';

type Data = { postfaecher: Mailbox[] };

export const MailboxPage = (): JSX.Element => {
  const { data, loading, refetch } = useQuery<Data>(POSTFAECHER);
  const { refetch: hauptNeu } = useQuery(MY_MAILBOX);
  const { can } = usePermissions();
  const rueckmeldung = useOAuthRueckmeldung();
  const [verbinden, setVerbinden] = useState<VerbindenArt | null>(null);
  const [gewaehltId, setGewaehltId] = useState<string | null>(null);

  const postfaecher = data?.postfaecher ?? [];
  const eigene = postfaecher.filter((eintrag) => eintrag.art === 'persoenlich');
  const gemeinsame = postfaecher.filter(
    (eintrag) => eintrag.art === 'gemeinsam',
  );
  const darfGemeinsame = can('workspace:postfaecher');
  const gewaehlt =
    postfaecher.find((eintrag) => eintrag.id === gewaehltId) ??
    eigene[0] ??
    gemeinsame[0] ??
    null;

  const neuLaden = async (): Promise<void> => {
    await Promise.all([refetch(), hauptNeu()]);
  };

  if (loading) {
    return <LoadingAnnouncement />;
  }

  return (
    <>
      <div className="page__header">
        <div>
          <h1>Postfach</h1>
          <p className="page__subtitle">
            Verbinden Sie Ihr Postfach, und der Schriftwechsel erscheint bei den
            Kunden, zu denen er gehört. Es wird nur gelesen: nichts wird als
            gelesen markiert, verschoben oder gelöscht.
          </p>
        </div>
      </div>

      {rueckmeldung !== null &&
        (rueckmeldung.ok ? (
          <div className="notice notice--positive" role="status">
            Postfach verbunden.
          </div>
        ) : (
          <div className="error-banner" role="alert">
            {rueckmeldung.text}
            <AbhilfeLink meldung={rueckmeldung.text} />
          </div>
        ))}

      <Anker id="entwuerfe" />
      <MailEntwuerfeSection />

      {eigene.length === 0 && verbinden === null && (
        <PostfachVerbinden art="haupt" verbunden={neuLaden} />
      )}

      {postfaecher.length > 0 && (
        <section className="card" aria-labelledby="postfaecher-titel">
          <h2 id="postfaecher-titel">Ihre Postfächer</h2>
          <ul className="postfach-liste">
            {postfaecher.map((postfach) => (
              <li key={postfach.id}>
                <button
                  type="button"
                  className="postfach-liste__eintrag"
                  aria-pressed={gewaehlt?.id === postfach.id}
                  onClick={() => {
                    setGewaehltId(postfach.id);
                    setVerbinden(null);
                  }}
                >
                  <span className="postfach-liste__name">
                    {postfachName(postfach)}
                  </span>
                  <span className="postfach-liste__art">
                    {postfach.art === 'gemeinsam'
                      ? 'Gemeinsam'
                      : postfach.haupt
                        ? 'Hauptpostfach'
                        : 'Eigenes'}
                    {postfach.lastError !== null && ' · Abruf gestört'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="row-actions">
            {eigene.length > 0 && (
              <button
                type="button"
                className="button button--ghost"
                aria-expanded={verbinden === 'weiteres'}
                onClick={() => setVerbinden('weiteres')}
              >
                Weiteres eigenes Postfach verbinden
              </button>
            )}
            {darfGemeinsame && (
              <button
                type="button"
                className="button button--ghost"
                aria-expanded={verbinden === 'gemeinsam'}
                onClick={() => setVerbinden('gemeinsam')}
              >
                Gemeinsames Postfach einrichten
              </button>
            )}
          </div>
        </section>
      )}

      {postfaecher.length === 0 && darfGemeinsame && verbinden === null && (
        <p className="field__hint">
          Ein gemeinsames Postfach wie info@ richten Sie ein, nachdem Ihr
          eigenes verbunden ist — oder gleich hier:{' '}
          <button
            type="button"
            className="button button--quiet"
            onClick={() => setVerbinden('gemeinsam')}
          >
            Gemeinsames Postfach einrichten
          </button>
        </p>
      )}

      {verbinden !== null && (
        <PostfachVerbinden
          key={verbinden}
          art={verbinden}
          verbunden={async () => {
            setVerbinden(null);
            await neuLaden();
          }}
          abbrechen={() => setVerbinden(null)}
        />
      )}

      {gewaehlt !== null && verbinden === null && (
        <>
          <PostfachKarte
            key={gewaehlt.id}
            mailbox={gewaehlt}
            geaendert={neuLaden}
          />
          {gewaehlt.darfVerwalten !== false && gewaehlt.getrennt !== true && (
            <PostfachEinstellungen
              key={`e-${gewaehlt.id}`}
              mailbox={gewaehlt}
            />
          )}
        </>
      )}

      {eigene.length > 0 && (
        <>
          <KontaktVorschlaege />

          <section className="card">
            <h2>Wie die Zuordnung entsteht</h2>
            <p className="field__hint">
              Zuerst wird die Absenderadresse mit den Kontakten verglichen,
              danach die Adressen in An und Kopie. Passt keine davon, wird die
              Domain mit den Firmen verglichen. Bei einer Freimailer Adresse
              unterbleibt das, damit nicht jede private Adresse bei derselben
              Firma landet.
            </p>
          </section>
        </>
      )}

      <Anker id="mailvorlagen" />
      <MailTemplatesSection />
      <Anker id="sperrliste" />
      <MailSperrenSection />
    </>
  );
};
