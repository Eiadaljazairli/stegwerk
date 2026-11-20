import { useQuery } from '@apollo/client';
import { Link, useLocation } from 'react-router-dom';

import { abrufHinweise } from '../lib/abruf-hinweis';
import { buchhaltungHinweis } from '../lib/buchhaltung';
import {
  BUCHHALTUNG_VERBINDUNG,
  KALENDER_VERBINDUNG,
  MY_MAILBOX,
} from '../lib/queries';
import {
  type BuchhaltungVerbindung,
  type KalenderVerbindung,
  type Mailbox,
} from '../lib/types';
import { usePermissions } from '../lib/usePermissions';
import { AbhilfeLink } from './AbhilfeLink';

export const PostfachBanner = () => {
  const { pathname } = useLocation();
  const { data } = useQuery<{ myMailbox: Mailbox | null }>(MY_MAILBOX);
  const { data: kalender } = useQuery<{
    kalenderVerbindung: KalenderVerbindung | null;
  }>(KALENDER_VERBINDUNG);
  const { can } = usePermissions();
  const betrifft = can('workspace:api') || can('invoice:issue');
  const { data: buchhaltung } = useQuery<{
    buchhaltungVerbindung: BuchhaltungVerbindung | null;
  }>(BUCHHALTUNG_VERBINDUNG, { skip: !betrifft });
  const hinweise = abrufHinweise(
    data?.myMailbox ?? null,
    kalender?.kalenderVerbindung ?? null,
    pathname,
  );
  const beleg = buchhaltungHinweis(
    betrifft ? (buchhaltung?.buchhaltungVerbindung ?? null) : null,
    pathname,
  );

  if (hinweise.length === 0 && beleg === null) {
    return null;
  }

  return (
    <>
      {hinweise.map((hinweis) => (
        <div
          key={hinweis.art}
          className="banner banner--warning postfach-banner"
          role="status"
        >
          <span>
            {hinweis.text}
            <AbhilfeLink meldung={hinweis.meldung} />
          </span>
          <Link to={hinweis.link}>{hinweis.linkText}</Link>
        </div>
      ))}
      {beleg !== null && (
        <div className="banner banner--warning postfach-banner" role="status">
          <span>{beleg.text}</span>
          <Link to={beleg.link}>{beleg.linkText}</Link>
        </div>
      )}
    </>
  );
};
