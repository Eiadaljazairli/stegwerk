import { type DocumentNode, useQuery } from '@apollo/client';
import { type ReactNode, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

import { COMPANY_DETAIL, CONTACT_DETAIL, DEAL_DETAIL } from '../lib/queries';
import {
  type CompanyDetail,
  type ContactDetail,
  type DealDetail,
  formatCurrency,
  formatDate,
  type Note,
  type Task,
} from '../lib/types';
import { useStageLabel } from '../lib/stages';
import { FormatierterText } from './FormatierterText';
import { personName } from './Verantwortlich';
import { useFeldrechte } from '../lib/useFeldrechte';
import { artLabel } from '../lib/kontaktwege';
import { formatTelefon, telLink } from '../lib/telefon';
import { IconClose } from './Icons';

export type SchnellansichtArt = 'firma' | 'kontakt' | 'geschaeft';

type Feld = { label: string; wert: ReactNode; feld?: string };

const ABFRAGE: Record<SchnellansichtArt, DocumentNode> = {
  firma: COMPANY_DETAIL,
  kontakt: CONTACT_DETAIL,
  geschaeft: DEAL_DETAIL,
};

const PFAD: Record<SchnellansichtArt, string> = {
  firma: '/firmen',
  kontakt: '/kontakte',
  geschaeft: '/geschaefte',
};

const leer = (wert: string | number | null | undefined): ReactNode =>
  wert === null || wert === undefined || wert === '' ? '—' : wert;

export const Schnellansicht = ({
  art,
  id,
  onClose,
}: {
  art: SchnellansichtArt;
  id: string;
  onClose: () => void;
}) => {
  const ref = useRef<HTMLDialogElement>(null);
  const stageLabel = useStageLabel();
  const feldrechte = useFeldrechte();
  const { data, loading, error } = useQuery<{
    company?: CompanyDetail;
    contact?: ContactDetail;
    deal?: DealDetail;
  }>(ABFRAGE[art], { variables: { id } });

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  let titel = '';
  let felder: Feld[] = [];
  let notizen: Note[] = [];
  let aufgaben: Task[] = [];

  if (data?.company !== undefined) {
    const f = data.company;

    titel = f.name;
    felder = [
      { label: 'Branche', wert: leer(f.industry) },
      {
        label: 'Ort',
        wert: leer([f.postalCode, f.city].filter(Boolean).join(' ')),
      },
      { label: 'Verantwortlich', wert: personName(f.owner) },
      { label: 'Kontakte', wert: f.contacts.length },
      {
        label: 'Offene Geschäfte',
        wert: f.deals.filter((d) => d.stage !== 'WON' && d.stage !== 'LOST')
          .length,
      },
    ];
    notizen = f.notes;
    aufgaben = f.tasks;
  } else if (data?.contact !== undefined) {
    const k = data.contact;

    titel = `${k.firstName} ${k.lastName}`;
    felder = [
      { label: 'Position', wert: leer(k.jobTitle) },
      { label: 'Firma', wert: leer(k.company?.name) },
      {
        label: 'E-Mail',
        feld: 'contact.email',
        wert:
          k.email === null ? '—' : <a href={`mailto:${k.email}`}>{k.email}</a>,
      },
      {
        label: 'Telefon',
        feld: 'contact.phone',
        wert:
          k.phone === null ? (
            '—'
          ) : (
            <a href={telLink(k.phone)}>{formatTelefon(k.phone)}</a>
          ),
      },
      ...k.weitereEmails.map((eintrag) => ({
        label: `E-Mail ${artLabel(eintrag.art).toLowerCase()}`,
        feld: 'contact.email',
        wert: <a href={`mailto:${eintrag.wert}`}>{eintrag.wert}</a>,
      })),
      ...k.weitereTelefone.map((eintrag) => ({
        label: `Telefon ${artLabel(eintrag.art).toLowerCase()}`,
        feld: 'contact.phone',
        wert: <a href={telLink(eintrag.wert)}>{formatTelefon(eintrag.wert)}</a>,
      })),
      { label: 'Verantwortlich', wert: personName(k.owner) },
    ];
    notizen = k.notes;
    aufgaben = k.tasks;
  } else if (data?.deal !== undefined) {
    const g = data.deal;

    titel = g.name;
    felder = [
      {
        label: 'Betrag',
        feld: 'deal.amount',
        wert: formatCurrency(g.amount, g.currency),
      },
      { label: 'Phase', wert: stageLabel(g.stage) },
      { label: 'Abschluss', wert: formatDate(g.closeDate) },
      { label: 'Firma', wert: leer(g.company?.name) },
      { label: 'Verantwortlich', wert: personName(g.owner) },
    ];
    notizen = g.notes;
    aufgaben = g.tasks;
  }

  felder = felder.filter(
    (eintrag) =>
      eintrag.feld === undefined ||
      feldrechte.recht(eintrag.feld) !== 'verborgen',
  );

  const offen = aufgaben.filter((aufgabe) => aufgabe.completedAt === null);

  return (
    <dialog
      ref={ref}
      className="schnellansicht"
      aria-label={titel === '' ? 'Schnellansicht' : titel}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) {
          onClose();
        }
      }}
    >
      <div className="schnellansicht__inhalt">
        <header className="schnellansicht__kopf">
          <h2>{titel === '' ? 'Wird geladen…' : titel}</h2>
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={onClose}
            aria-label="Schließen"
          >
            <IconClose size={16} />
          </button>
        </header>

        {error !== undefined && (
          <div className="error-banner">{error.message}</div>
        )}

        {!loading && titel !== '' && (
          <>
            <Link className="button" to={`${PFAD[art]}/${id}`}>
              Akte öffnen
            </Link>

            <dl className="schnellansicht__felder">
              {felder.map((feld) => (
                <div key={feld.label}>
                  <dt>{feld.label}</dt>
                  <dd>{feld.wert}</dd>
                </div>
              ))}
            </dl>

            <h3>Offene Aufgaben ({offen.length})</h3>
            {offen.length === 0 ? (
              <p className="schnellansicht__leer">Nichts offen.</p>
            ) : (
              <ul className="schnellansicht__liste">
                {offen.slice(0, 5).map((aufgabe) => (
                  <li key={aufgabe.id}>
                    {aufgabe.title}
                    {aufgabe.dueDate !== null && (
                      <span
                        className={
                          aufgabe.isOverdue
                            ? 'schnellansicht__datum is-overdue'
                            : 'schnellansicht__datum'
                        }
                      >
                        {formatDate(aufgabe.dueDate)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <h3>Letzte Notizen</h3>
            {notizen.length === 0 ? (
              <p className="schnellansicht__leer">Noch keine Notizen.</p>
            ) : (
              <ul className="schnellansicht__liste">
                {notizen.slice(0, 3).map((notiz) => (
                  <li key={notiz.id}>
                    <span className="schnellansicht__meta">
                      {notiz.authorName}, {formatDate(notiz.createdAt)}
                    </span>
                    <FormatierterText text={notiz.body} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </dialog>
  );
};
