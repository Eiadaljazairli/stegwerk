import { useMutation, useQuery } from '@apollo/client';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import {
  BENACHRICHTIGUNGEN,
  MAIL_ENTWUERFE,
  MAIL_ENTWURF_AENDERN,
  MAIL_ENTWURF_SENDEN,
  MAIL_ENTWURF_VERWERFEN,
  UNGELESENE_BENACHRICHTIGUNGEN,
} from '../lib/queries';
import { adressListe } from '../lib/mailEntwurf';
import { useToast } from './Toast';

type Entwurf = {
  id: string;
  an: string[];
  cc: string[];
  betreff: string;
  rumpf: string;
  companyId: string | null;
  contactId: string | null;
  dealId: string | null;
  quelle: 'automation' | 'ki' | 'hand';
  status: 'entwurf' | 'sendet' | 'gesendet' | 'verworfen';
  createdAt: string;
};

const QUELLE: Record<Entwurf['quelle'], string> = {
  automation: 'von einer Automation',
  ki: 'von einem KI-Assistenten',
  hand: 'über die Schnittstelle',
};

const ZEIT = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'short',
  timeStyle: 'short',
});

const akte = (e: Entwurf): { pfad: string; name: string } | null =>
  e.dealId !== null
    ? { pfad: `/geschaefte/${e.dealId}`, name: 'Geschäft öffnen' }
    : e.contactId !== null
      ? { pfad: `/kontakte/${e.contactId}`, name: 'Kontakt öffnen' }
      : e.companyId !== null
        ? { pfad: `/firmen/${e.companyId}`, name: 'Firma öffnen' }
        : null;

const EntwurfKarte = ({
  entwurf,
  hervorheben,
}: {
  entwurf: Entwurf;
  hervorheben: boolean;
}) => {
  const { zeige } = useToast();
  const ref = useRef<HTMLElement>(null);
  const [an, setAn] = useState(entwurf.an.join(', '));
  const [cc, setCc] = useState(entwurf.cc.join(', '));
  const [betreff, setBetreff] = useState(entwurf.betreff);
  const [rumpf, setRumpf] = useState(entwurf.rumpf);
  const [fehler, setFehler] = useState<string | null>(null);
  const nachher = {
    refetchQueries: [
      MAIL_ENTWUERFE,
      UNGELESENE_BENACHRICHTIGUNGEN,
      BENACHRICHTIGUNGEN,
    ],
  };
  const [senden, { loading: sendet }] = useMutation(
    MAIL_ENTWURF_SENDEN,
    nachher,
  );
  const [speichern, { loading: speichert }] = useMutation(
    MAIL_ENTWURF_AENDERN,
    nachher,
  );
  const [verwerfen, { loading: verwirft }] = useMutation(
    MAIL_ENTWURF_VERWERFEN,
    nachher,
  );
  const beschaeftigt = sendet || speichert || verwirft;
  const kennung = `entwurf-${entwurf.id}`;
  const geaendert =
    an !== entwurf.an.join(', ') ||
    cc !== entwurf.cc.join(', ') ||
    betreff !== entwurf.betreff ||
    rumpf !== entwurf.rumpf;

  useEffect(() => {
    if (hervorheben) {
      ref.current?.scrollIntoView({ block: 'center' });
      ref.current?.focus();
    }
  }, [hervorheben]);

  const felder = () => ({
    an: adressListe(an),
    cc: adressListe(cc),
    betreff: betreff.trim(),
    rumpf,
  });

  const tun = async (
    was: () => Promise<unknown>,
    erfolg: string,
  ): Promise<void> => {
    setFehler(null);

    try {
      await was();
      zeige({ text: erfolg });
    } catch (problem) {
      setFehler(problem instanceof Error ? problem.message : 'Das ging nicht.');
    }
  };

  const ziel = akte(entwurf);

  return (
    <article
      ref={ref}
      tabIndex={-1}
      className={`card mail-entwurf${hervorheben ? ' is-hervorgehoben' : ''}`}
      aria-labelledby={`${kennung}-titel`}
    >
      <h3 id={`${kennung}-titel`} className="mail-entwurf__titel">
        {entwurf.betreff}
      </h3>
      <p className="field__hint">
        Geschrieben {QUELLE[entwurf.quelle]} am{' '}
        {ZEIT.format(new Date(entwurf.createdAt))}
        {ziel !== null && (
          <>
            {' · '}
            <Link to={ziel.pfad}>{ziel.name}</Link>
          </>
        )}
      </p>

      {entwurf.status === 'sendet' ? (
        <p className="banner banner--warning" role="status">
          Wird gerade gesendet. Lädt die Seite neu, steht er danach unter
          „Gesendet“ an der Akte.
        </p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void tun(
              () => senden({ variables: { id: entwurf.id, input: felder() } }),
              'Mail gesendet.',
            );
          }}
        >
          <div className="field">
            <label htmlFor={`${kennung}-an`}>An</label>
            <input
              id={`${kennung}-an`}
              required
              value={an}
              onChange={(e) => setAn(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`${kennung}-cc`}>Kopie (Cc)</label>
            <input
              id={`${kennung}-cc`}
              value={cc}
              onChange={(e) => setCc(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`${kennung}-betreff`}>Betreff</label>
            <input
              id={`${kennung}-betreff`}
              required
              maxLength={200}
              value={betreff}
              onChange={(e) => setBetreff(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`${kennung}-text`}>Text</label>
            <textarea
              id={`${kennung}-text`}
              required
              rows={8}
              value={rumpf}
              onChange={(e) => setRumpf(e.target.value)}
            />
          </div>

          {fehler !== null && (
            <div className="error-banner" role="alert">
              {fehler}
            </div>
          )}

          <div className="row-actions">
            <button type="submit" className="button" disabled={beschaeftigt}>
              {sendet ? 'Wird gesendet…' : 'Prüfen und senden'}
            </button>
            <button
              type="button"
              className="button button--ghost"
              disabled={beschaeftigt || !geaendert}
              onClick={() =>
                void tun(
                  () =>
                    speichern({
                      variables: { id: entwurf.id, input: felder() },
                    }),
                  'Entwurf gespeichert.',
                )
              }
            >
              Speichern
            </button>
            <button
              type="button"
              className="button button--quiet"
              disabled={beschaeftigt}
              onClick={() =>
                void tun(
                  () => verwerfen({ variables: { id: entwurf.id } }),
                  'Entwurf verworfen.',
                )
              }
            >
              Verwerfen
            </button>
          </div>
        </form>
      )}
    </article>
  );
};

export const MailEntwuerfeSection = () => {
  const [params] = useSearchParams();
  const { data, error } = useQuery<{ mailEntwuerfe: Entwurf[] }>(
    MAIL_ENTWUERFE,
    { fetchPolicy: 'cache-and-network' },
  );
  const entwuerfe = data?.mailEntwuerfe ?? [];
  const gesucht = params.get('entwurf');

  if (error !== undefined) {
    return <div className="error-banner">{error.message}</div>;
  }

  if (entwuerfe.length === 0 && gesucht === null) {
    return null;
  }

  return (
    <section className="card" aria-labelledby="entwuerfe-titel">
      <h2 id="entwuerfe-titel">Entwürfe zur Freigabe ({entwuerfe.length})</h2>
      <p className="field__hint">
        Hier liegen Mails, die eine Automation oder ein KI-Assistent für Sie
        geschrieben hat. Nichts davon ist verschickt: prüfen Sie Empfänger und
        Text, und schicken Sie ab, was passt. Gesendet wird aus Ihrem Postfach.
      </p>
      {entwuerfe.length === 0 ? (
        <p className="state">
          Dieser Entwurf ist schon gesendet oder verworfen.
        </p>
      ) : (
        entwuerfe.map((entwurf) => (
          <EntwurfKarte
            key={`${entwurf.id}-${entwurf.status}`}
            entwurf={entwurf}
            hervorheben={entwurf.id === gesucht}
          />
        ))
      )}
    </section>
  );
};
