import { useApolloClient, useQuery } from '@apollo/client';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../lib/auth';
import { type Platzhalter } from '../lib/mail-vorlage';
import {
  COMPANY_MESSAGES,
  CONTACT_MESSAGES,
  DEAL_MESSAGES,
  POSTFAECHER,
} from '../lib/queries';
import { kannSendenAls } from '../lib/postfaecher';
import { type Mailbox } from '../lib/types';
import { type AttachmentZiel } from './AttachmentsSection';
import { IconMail } from './Icons';
import { MailFormular } from './MailFormular';
import { useToast } from './Toast';

export const useKannSenden = (): {
  kannSenden: boolean;
  postfach: Mailbox | null;
} => {
  const { session } = useAuth();
  const ich = session?.user.id ?? null;
  const { data } = useQuery<{ postfaecher: Mailbox[] }>(POSTFAECHER);
  const postfaecher = data?.postfaecher ?? [];

  return {
    kannSenden: postfaecher.some((postfach) => kannSendenAls(postfach, ich)),
    postfach: postfaecher.find((eintrag) => eintrag.haupt) ?? null,
  };
};

export const NeueMail = ({
  ziel,
  werte,
  an = [],
  vorschlaege = [],
}: {
  ziel: AttachmentZiel;
  werte: Platzhalter;
  an?: string[];
  vorschlaege?: string[];
}): JSX.Element => {
  const [offen, setOffen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="button button--ghost"
        onClick={() => {
          setOffen(true);
        }}
      >
        <IconMail />
        Neue E-Mail
      </button>

      {offen && (
        <NeueMailDialog
          ziel={ziel}
          werte={werte}
          an={an}
          vorschlaege={vorschlaege}
          schliessen={() => {
            setOffen(false);
          }}
        />
      )}
    </>
  );
};

const NeueMailDialog = ({
  ziel,
  werte,
  an,
  vorschlaege,
  schliessen,
}: {
  ziel: AttachmentZiel;
  werte: Platzhalter;
  an: string[];
  vorschlaege: string[];
  schliessen: () => void;
}): JSX.Element => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const client = useApolloClient();
  const { zeige } = useToast();
  const { kannSenden } = useKannSenden();
  const listeId = `neue-mail-vorschlaege-${Object.values(ziel).join('')}`;

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="dialog dialog--mail"
      aria-label="Neue E-Mail"
      onCancel={(event) => {
        event.preventDefault();
        schliessen();
      }}
    >
      <div className="dialog__body">
        <div className="dialog__title">Neue E-Mail</div>

        {kannSenden ? (
          <>
            <datalist id={listeId}>
              {vorschlaege.map((adresse) => (
                <option key={adresse} value={adresse} />
              ))}
            </datalist>
            <MailFormular
              kennung="neu"
              ziel={ziel}
              werte={werte}
              vorgabeAn={an.join(', ')}
              listeId={listeId}
              gesendet={async () => {
                schliessen();
                zeige({ text: 'Verschickt. Sie steht jetzt im Verlauf.' });
                await client.refetchQueries({
                  include: [CONTACT_MESSAGES, COMPANY_MESSAGES, DEAL_MESSAGES],
                });
              }}
              abbrechen={schliessen}
            />
          </>
        ) : (
          <>
            <p className="dialog__consequence">
              Für Ihr Postfach ist kein Postausgang eingetragen. Unter{' '}
              <Link to="/postfach" onClick={schliessen}>
                Postfach
              </Link>{' '}
              tragen Sie den SMTP-Server ein; danach schreiben Sie von hier aus,
              mit Vorlagen und den Dateien der Akte.
            </p>
            <div className="dialog__actions">
              {an.length > 0 && (
                <a
                  className="button button--ghost"
                  href={`mailto:${an.join(',')}`}
                >
                  Im Mailprogramm öffnen
                </a>
              )}
              <button
                type="button"
                className="button button--primary"
                onClick={schliessen}
              >
                Schließen
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
};
