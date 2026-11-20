import { useQuery } from '@apollo/client';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { downloadFromApi } from '../lib/download';
import { Dialogfenster } from './Dialogfenster';
import { DATEV_LUECKEN } from '../lib/queries';

const vormonat = (): string => {
  const heute = new Date();
  const monat = new Date(heute.getFullYear(), heute.getMonth() - 1, 1);

  return `${String(monat.getFullYear())}-${String(monat.getMonth() + 1).padStart(2, '0')}`;
};

const letzterTag = (monat: string): string => {
  const [jahr, mm] = monat.split('-').map(Number);
  const tag = new Date(jahr, mm, 0).getDate();

  return `${monat}-${String(tag).padStart(2, '0')}`;
};

export const DatevExport = () => {
  const [offen, setOffen] = useState(false);
  const [monat, setMonat] = useState(vormonat);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);

  const { data } = useQuery<{ datevLuecken: string[] }>(DATEV_LUECKEN, {
    skip: !offen,
    fetchPolicy: 'network-only',
  });
  const luecken = data?.datevLuecken ?? [];

  const herunterladen = () => {
    setFehler(null);
    setLaedt(true);

    void downloadFromApi(
      `/invoices/datev?from=${monat}-01&to=${letzterTag(monat)}`,
      `EXTF_Buchungsstapel_${monat}.csv`,
    )
      .catch((problem: Error) => setFehler(problem.message))
      .finally(() => setLaedt(false));
  };

  return (
    <div className="datev">
      <button
        type="button"
        className={
          offen ? 'button button--ghost is-open' : 'button button--ghost'
        }
        aria-haspopup="dialog"
        aria-expanded={offen}
        onClick={() => setOffen(!offen)}
      >
        DATEV-Export
      </button>

      {offen && (
        <Dialogfenster titel="DATEV-Export" onClose={() => setOffen(false)}>
          <p className="field__hint">
            Alle gestellten Rechnungen eines Monats als Buchungsstapel für Ihre
            Steuerkanzlei, auch stornierte und ihre Korrekturen.
          </p>

          {luecken.length > 0 ? (
            <p className="banner banner--warning">
              Im <Link to="/briefkopf">Briefkopf</Link> fehlt noch:{' '}
              {luecken.join(', ')}.
            </p>
          ) : (
            <div className="datev__row">
              <div className="field">
                <label htmlFor="datev-monat">Monat</label>
                <input
                  id="datev-monat"
                  type="month"
                  value={monat}
                  onChange={(event) => setMonat(event.target.value)}
                />
              </div>
              <button
                type="button"
                className="button"
                disabled={laedt || monat === ''}
                onClick={herunterladen}
              >
                {laedt ? 'Wird erstellt…' : 'Herunterladen'}
              </button>
            </div>
          )}

          {fehler !== null && (
            <div className="error-banner" role="alert">
              {fehler}
            </div>
          )}
        </Dialogfenster>
      )}
    </div>
  );
};
