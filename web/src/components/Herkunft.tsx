import { useQuery } from '@apollo/client';

import { HERKUNFT_LABELS } from '../lib/herkunft';
import { HERKUNFT } from '../lib/queries';

type HerkunftData = {
  herkunft: {
    erstelltVon: string | null;
    erstelltAm: string | null;
    geaendertVon: string | null;
    geaendertAm: string | null;
    quelle: string | null;
  };
};

const datum = (iso: string): string =>
  new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));

const artVon = (target: {
  companyId?: string;
  contactId?: string;
  dealId?: string;
}): string =>
  target.companyId !== undefined
    ? 'Company'
    : target.contactId !== undefined
      ? 'Contact'
      : 'Deal';

export const Herkunft = ({
  recordId,
  target,
}: {
  recordId: string;
  target: { companyId?: string; contactId?: string; dealId?: string };
}) => {
  const { data } = useQuery<HerkunftData>(HERKUNFT, {
    variables: { entityType: artVon(target), entityId: recordId },
  });
  const h = data?.herkunft;

  if (h === undefined || (h.erstelltAm === null && h.geaendertAm === null)) {
    return null;
  }

  return (
    <p className="herkunft">
      {h.erstelltAm !== null && (
        <span>
          Angelegt von {h.erstelltVon}, {datum(h.erstelltAm)}
          {h.quelle !== null &&
            h.quelle !== 'manuell' &&
            ` · ${HERKUNFT_LABELS[h.quelle] ?? h.quelle}`}
        </span>
      )}
      {h.geaendertAm !== null && (
        <span>
          Zuletzt geändert von {h.geaendertVon}, {datum(h.geaendertAm)}
        </span>
      )}
    </p>
  );
};
