import { useQuery } from '@apollo/client';
import { useState } from 'react';

import {
  antwortAn,
  antwortBetreff,
  type Faden,
  gruppiereFaeden,
} from '../lib/mail-threads';
import { type Platzhalter } from '../lib/mail-vorlage';
import {
  COMPANY_MESSAGES,
  CONTACT_MESSAGES,
  DEAL_MESSAGES,
  MAIL_INHALTE,
} from '../lib/queries';
import { type MailInhalt, type MailMessage } from '../lib/types';
import { type AttachmentZiel } from './AttachmentsSection';
import { IconAttachment, IconMailbox } from './Icons';
import { MailFormular } from './MailFormular';
import { MailText } from './MailText';
import { useKannSenden } from './NeueMail';
import { RelatedList } from './RelatedList';

type Ziel =
  | { kind: 'contact'; contactId: string }
  | { kind: 'company'; companyId: string }
  | { kind: 'deal'; dealId: string };

const anhangZiel = (ziel: Ziel): AttachmentZiel =>
  ziel.kind === 'contact'
    ? { contactId: ziel.contactId }
    : ziel.kind === 'company'
      ? { companyId: ziel.companyId }
      : { dealId: ziel.dealId };

const ABFRAGE = {
  contact: CONTACT_MESSAGES,
  company: COMPANY_MESSAGES,
  deal: DEAL_MESSAGES,
} as const;

const tag = (wert: string): string =>
  new Date(wert).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const zeitpunkt = (wert: string): string =>
  new Date(wert).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const absender = (nachricht: MailMessage): string =>
  nachricht.outgoing
    ? 'Von uns'
    : (nachricht.fromName ?? nachricht.fromAddress);

export const Verlauf = ({ faden }: { faden: Faden }): JSX.Element => {
  const { data } = useQuery<{ mailInhalte: MailInhalt[] }>(MAIL_INHALTE, {
    variables: { ids: faden.nachrichten.map((nachricht) => nachricht.id) },
  });
  const nachId = new Map(
    (data?.mailInhalte ?? []).map((inhalt) => [inhalt.id, inhalt]),
  );

  return (
    <>
      {faden.nachrichten.map((nachricht) => (
        <article key={nachricht.id} className="messages__eintrag">
          <div className="messages__line">
            <span
              className={
                nachricht.outgoing
                  ? 'messages__from messages__from--out'
                  : 'messages__from'
              }
            >
              {absender(nachricht)}
            </span>
            <span className="messages__date">
              {zeitpunkt(nachricht.sentAt)}
            </span>
          </div>
          {nachricht.inhaltVerborgen === true ? (
            <p className="messages__snippet messages__snippet--verborgen">
              Der Text bleibt im Postfach der Kollegin oder des Kollegen.
            </p>
          ) : (
            <MailText
              inhalt={nachId.get(nachricht.id)}
              ersatz={nachricht.snippet}
            />
          )}
        </article>
      ))}
    </>
  );
};

const Antwort = ({
  faden,
  eigeneAdresse,
  aktualisieren,
  werte,
  ziel,
}: {
  faden: Faden;
  eigeneAdresse: string;
  aktualisieren: () => Promise<unknown>;
  werte: Platzhalter;
  ziel: AttachmentZiel;
}): JSX.Element => {
  const [gesendet, setGesendet] = useState(false);

  if (gesendet) {
    return (
      <div className="antwort">
        <p className="field__hint">
          Verschickt. Sie steht jetzt im Verlauf.{' '}
          <button
            type="button"
            className="button button--ghost"
            onClick={() => {
              setGesendet(false);
            }}
          >
            Noch eine schreiben
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="antwort">
      <MailFormular
        kennung={faden.key}
        ziel={ziel}
        werte={werte}
        vorgabeAn={antwortAn(faden, eigeneAdresse).join(', ')}
        vorgabeBetreff={antwortBetreff(faden.betreff)}
        antwortAuf={faden.neueste.id}
        postfachId={faden.neueste.mailboxId}
        gesendet={async () => {
          setGesendet(true);
          await aktualisieren();
        }}
      />
    </div>
  );
};

export const MessageList = ({
  ziel,
  werte = {},
}: {
  ziel: Ziel;
  werte?: Platzhalter;
}): JSX.Element => {
  const [offen, setOffen] = useState<string | null>(null);

  const { data, refetch } = useQuery<{
    contactMessages?: MailMessage[];
    companyMessages?: MailMessage[];
    dealMessages?: MailMessage[];
  }>(ABFRAGE[ziel.kind], {
    variables:
      ziel.kind === 'contact'
        ? { contactId: ziel.contactId }
        : ziel.kind === 'company'
          ? { companyId: ziel.companyId }
          : { dealId: ziel.dealId },
  });

  const { kannSenden, postfach } = useKannSenden();

  const nachrichten =
    (ziel.kind === 'contact'
      ? data?.contactMessages
      : ziel.kind === 'company'
        ? data?.companyMessages
        : data?.dealMessages) ?? [];
  const faeden = gruppiereFaeden(nachrichten);

  return (
    <RelatedList
      kind="mailbox"
      icon={IconMailbox}
      title="Nachrichten"
      count={faeden.length}
      empty={
        ziel.kind === 'deal'
          ? 'Noch nichts mit den Kontakten oder der Firma dieses Geschäfts.'
          : 'Noch nichts gelesen. Ein Postfach verbinden Sie unter Mehr, Postfach.'
      }
    >
      <ul className="messages">
        {faeden.map((faden) => {
          const istOffen = offen === faden.key;

          return (
            <li key={faden.key} className="messages__item">
              <button
                type="button"
                className="messages__kopf"
                aria-expanded={istOffen}
                onClick={() => {
                  setOffen(istOffen ? null : faden.key);
                }}
              >
                <div className="messages__line">
                  <span
                    className={
                      faden.neueste.outgoing
                        ? 'messages__from messages__from--out'
                        : 'messages__from'
                    }
                  >
                    {absender(faden.neueste)}
                  </span>
                  {faden.nachrichten.length > 1 && (
                    <span className="messages__anzahl">
                      {faden.nachrichten.length}
                    </span>
                  )}
                  {faden.nachrichten.some(
                    (nachricht) => (nachricht.anhangAnzahl ?? 0) > 0,
                  ) && (
                    <span
                      className="messages__anhang"
                      title="Mit Anhang"
                      aria-label="Mit Anhang"
                    >
                      <IconAttachment size={14} />
                    </span>
                  )}
                  <span className="messages__date">{tag(faden.zuletzt)}</span>
                </div>
                <p className="messages__subject">
                  {faden.betreff ?? '(kein Betreff)'}
                </p>
                {!istOffen &&
                  faden.neueste.snippet !== null &&
                  faden.neueste.snippet !== '' && (
                    <p className="messages__snippet">{faden.neueste.snippet}</p>
                  )}
              </button>

              {istOffen && (
                <div className="messages__verlauf">
                  <Verlauf faden={faden} />

                  {kannSenden ? (
                    <Antwort
                      faden={faden}
                      eigeneAdresse={postfach?.username ?? ''}
                      aktualisieren={refetch}
                      werte={werte}
                      ziel={anhangZiel(ziel)}
                    />
                  ) : (
                    <p className="field__hint">
                      Zum Antworten von hier aus tragen Sie unter Mehr, Postfach
                      einen Postausgang ein.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </RelatedList>
  );
};
