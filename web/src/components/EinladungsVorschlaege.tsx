import { useQuery } from '@apollo/client';

import { EINLADUNGS_VORSCHLAEGE } from '../lib/queries';

type Vorschlag = { email: string; name: string | null; anzahl: number };

export const EinladungsVorschlaege = ({
  gewaehlt,
  onWaehlen,
}: {
  gewaehlt: string;
  onWaehlen: (email: string) => void;
}) => {
  const { data } = useQuery<{ einladungsVorschlaege: Vorschlag[] }>(
    EINLADUNGS_VORSCHLAEGE,
    { fetchPolicy: 'cache-and-network' },
  );
  const vorschlaege = data?.einladungsVorschlaege ?? [];

  if (vorschlaege.length === 0) {
    return null;
  }

  return (
    <div
      className="einladungs-vorschlaege"
      role="group"
      aria-labelledby="einladungs-vorschlaege-titel"
    >
      <span className="field__hint" id="einladungs-vorschlaege-titel">
        Vorschläge aus Ihrem Postfach und Kalender:
      </span>
      <div className="einladungs-vorschlaege__liste">
        {vorschlaege.map((v) => (
          <button
            key={v.email}
            type="button"
            className="filter-chip"
            aria-pressed={gewaehlt.trim().toLowerCase() === v.email}
            title={`${String(v.anzahl)}× in Mails oder Terminen der letzten 90 Tage`}
            onClick={() => onWaehlen(v.email)}
          >
            {v.name === null ? v.email : `${v.name} · ${v.email}`}
          </button>
        ))}
      </div>
    </div>
  );
};
