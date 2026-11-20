import { useQuery } from '@apollo/client';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';

import { COMPANY_OPTIONS } from '../lib/queries';
import { verknuepft } from './NichtSichtbar';

export const Muttergesellschaft = ({
  firmaId,
  mutterId,
  mutter,
  toechter,
  nurLesen,
  onSave,
}: {
  firmaId: string;
  mutterId: string | null;
  mutter: { id: string; name: string } | null;
  toechter: { id: string }[];
  nurLesen: boolean;
  onSave: (mutterId: string | null) => Promise<unknown>;
}) => {
  const id = useId();
  const [waehlt, setWaehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const { data } = useQuery<{
    companies: { items: { id: string; name: string }[] };
  }>(COMPANY_OPTIONS, { skip: !waehlt });
  const ausgeschlossen = new Set([firmaId, ...toechter.map((t) => t.id)]);
  const auswahl = (data?.companies.items ?? []).filter(
    (firma) => !ausgeschlossen.has(firma.id),
  );

  const speichern = async (neu: string) => {
    try {
      await onSave(neu === '' ? null : neu);
      setWaehlt(false);
      setFehler(null);
    } catch (error) {
      setFehler((error as Error).message);
    }
  };

  return (
    <div className="detail-field">
      <label className="detail-field__label" htmlFor={id}>
        Muttergesellschaft
      </label>
      <div className="detail-field__value detail-field__value--static">
        {waehlt ? (
          <select
            id={id}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            value={mutterId ?? ''}
            onChange={(event) => void speichern(event.target.value)}
            onBlur={() => setWaehlt(false)}
          >
            <option value="">— keine —</option>
            {mutter !== null &&
              !auswahl.some((firma) => firma.id === mutter.id) && (
                <option value={mutter.id}>{mutter.name}</option>
              )}
            {auswahl.map((firma) => (
              <option key={firma.id} value={firma.id}>
                {firma.name}
              </option>
            ))}
          </select>
        ) : (
          <>
            {verknuepft(mutterId, mutter, 'Firma', () =>
              mutter === null ? null : (
                <Link to={`/firmen/${mutter.id}`}>{mutter.name}</Link>
              ),
            )}{' '}
            {!nurLesen && (
              <button
                id={id}
                type="button"
                className="link-button"
                onClick={() => setWaehlt(true)}
              >
                {mutterId === null ? 'Festlegen' : 'Ändern'}
              </button>
            )}
          </>
        )}
        {fehler !== null && <p className="field__error">{fehler}</p>}
      </div>
    </div>
  );
};
