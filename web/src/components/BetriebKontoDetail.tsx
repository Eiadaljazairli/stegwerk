import { useQuery } from '@apollo/client';
import { useEffect, useRef } from 'react';

import { BETRIEB_KONTO } from '../lib/queries';
import { formatDate } from '../lib/types';
import { LoadingAnnouncement } from './Skeleton';
import { TableWrap } from './TableWrap';

type Detail = {
  id: string;
  email: string;
  name: string;
  bestaetigt: boolean;
  zweiFaktor: boolean;
  zuletztGesehen: string | null;
  angelegt: string;
  anmeldungen: string[];
  anmeldungen30: number;
  nutzung: {
    bereich: string;
    angesehen: number;
    geaendert: number;
    tage: number;
    zuletzt: string;
  }[];
  tage: { tag: string; anzahl: number }[];
  aenderungen: { aktion: string; art: string; bereich: string; wann: string }[];
};

const ZEITPUNKT = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const zeitpunkt = (iso: string | null): string =>
  iso === null ? 'nie' : ZEITPUNKT.format(new Date(iso));

const ART: Record<string, string> = {
  Company: 'Firma',
  Contact: 'Kontakt',
  Deal: 'Geschäft',
  Note: 'Notiz',
  Task: 'Aufgabe',
};

const AKTION: Record<string, string> = {
  created: 'angelegt',
  updated: 'geändert',
  deleted: 'gelöscht',
};

const dreissigTage = (tage: Detail['tage']) => {
  const je = new Map(tage.map((t) => [t.tag, t.anzahl]));

  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();

    d.setDate(d.getDate() - (29 - i));

    const tag = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    return { tag, anzahl: je.get(tag) ?? 0 };
  });
};

export const BetriebKontoDetail = ({
  id,
  onClose,
  zuletzt,
}: {
  id: string;
  onClose: () => void;
  zuletzt: (iso: string | null) => string;
}) => {
  const ref = useRef<HTMLElement>(null);
  const { data, loading, error } = useQuery<{ betriebKonto: Detail }>(
    BETRIEB_KONTO,
    { variables: { id }, fetchPolicy: 'cache-and-network' },
  );

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [id, data !== undefined]);

  if (loading && data === undefined) {
    return <LoadingAnnouncement />;
  }

  if (error !== undefined) {
    return <div className="error-banner">{error.message}</div>;
  }

  if (data === undefined) {
    return null;
  }

  const konto = data.betriebKonto;
  const verlauf = dreissigTage(konto.tage);
  const hoechster = Math.max(1, ...verlauf.map((t) => t.anzahl));
  const aktiveTage = verlauf.filter((t) => t.anzahl > 0).length;

  return (
    <section
      ref={ref}
      className="card betrieb-detail"
      aria-label="Konto im Einzelnen"
    >
      <div className="betrieb-detail__kopf">
        <div>
          <h2>{konto.name === '' ? konto.email : konto.name}</h2>
          <div className="field__hint">
            {konto.email} · seit {formatDate(konto.angelegt)} ·{' '}
            {konto.bestaetigt ? 'Adresse bestätigt' : 'Adresse nicht bestätigt'}{' '}
            · {konto.zweiFaktor ? 'mit 2FA' : 'ohne 2FA'}
          </div>
        </div>
        <button
          type="button"
          className="button button--ghost"
          onClick={onClose}
        >
          Schließen
        </button>
      </div>

      <div className="betrieb-detail__fakten">
        <div>
          <div className="metric__label">Zuletzt online</div>
          <div className="betrieb-detail__wert">
            {zeitpunkt(konto.zuletztGesehen)}
          </div>
          <div className="field__hint">{zuletzt(konto.zuletztGesehen)}</div>
        </div>
        <div>
          <div className="metric__label">Anmeldungen in 30 Tagen</div>
          <div className="betrieb-detail__wert">{konto.anmeldungen30}</div>
          <div className="field__hint">
            zuletzt {zeitpunkt(konto.anmeldungen[0] ?? null)}
          </div>
        </div>
        <div>
          <div className="metric__label">Aktive Tage (30)</div>
          <div className="betrieb-detail__wert">{aktiveTage}</div>
          <div className="field__hint">Tage mit mindestens einem Aufruf</div>
        </div>
      </div>

      <h3>Aufrufe je Tag, letzte 30 Tage</h3>
      <div
        className="betrieb-verlauf"
        role="img"
        aria-label={`An ${aktiveTage} von 30 Tagen aktiv`}
      >
        {verlauf.map((t) => (
          <div
            key={t.tag}
            className="betrieb-verlauf__balken"
            title={`${formatDate(t.tag)}: ${t.anzahl} Aufrufe`}
            style={{ height: `${Math.max(2, (t.anzahl / hoechster) * 100)}%` }}
            data-leer={t.anzahl === 0}
          />
        ))}
      </div>

      <h3>Genutzte Bereiche</h3>
      {konto.nutzung.length === 0 ? (
        <p className="field__hint">
          Noch nichts aufgezeichnet. Gezählt wird seit diesem Update.
        </p>
      ) : (
        <TableWrap>
          <table className="list-table">
            <thead>
              <tr>
                <th>Bereich</th>
                <th className="numeric">Angesehen</th>
                <th className="numeric">Geändert</th>
                <th className="numeric">Tage</th>
                <th>Zuletzt</th>
              </tr>
            </thead>
            <tbody>
              {konto.nutzung.map((n) => (
                <tr key={n.bereich}>
                  <td data-label="Bereich">{n.bereich}</td>
                  <td data-label="Angesehen" className="numeric">
                    {n.angesehen}
                  </td>
                  <td data-label="Geändert" className="numeric">
                    {n.geaendert}
                  </td>
                  <td data-label="Tage" className="numeric">
                    {n.tage}
                  </td>
                  <td data-label="Zuletzt">{formatDate(n.zuletzt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      <div className="betrieb-detail__spalten">
        <div>
          <h3>Letzte Änderungen</h3>
          {konto.aenderungen.length === 0 ? (
            <p className="field__hint">Keine.</p>
          ) : (
            <ul className="betrieb-liste">
              {konto.aenderungen.map((a) => (
                <li key={`${a.wann}-${a.art}-${a.aktion}`}>
                  <span>
                    {ART[a.art] ?? a.art} {AKTION[a.aktion] ?? a.aktion}
                  </span>
                  <span className="field__hint">
                    {a.bereich} · {zeitpunkt(a.wann)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>Letzte Anmeldungen</h3>
          {konto.anmeldungen.length === 0 ? (
            <p className="field__hint">Keine.</p>
          ) : (
            <ul className="betrieb-liste">
              {konto.anmeldungen.map((wann) => (
                <li key={wann}>
                  <span>{zeitpunkt(wann)}</span>
                  <span className="field__hint">{zuletzt(wann)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};
