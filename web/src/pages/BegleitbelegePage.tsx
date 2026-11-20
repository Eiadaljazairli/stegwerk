import { useQuery } from '@apollo/client';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { EmptyState } from '../components/EmptyState';
import { IconQuotes } from '../components/Icons';
import { ObjectHeader } from '../components/ObjectHeader';
import { RowMenu, type RowMenuItem } from '../components/RowMenu';
import { LoadingAnnouncement, SkeletonTable } from '../components/Skeleton';
import { type StatusTab, StatusTabs } from '../components/StatusTabs';
import { TableWrap } from '../components/TableWrap';
import {
  BEGLEITBELEG_DATEI,
  begleitbelegBadge,
  type BegleitbelegKurz,
  begleitbelegTitel,
} from '../lib/begleitbelege';
import { downloadBegleitbelegPdf } from '../lib/download';
import { BEGLEITBELEGE } from '../lib/queries';
import { formatDate, formatMoney } from '../lib/types';

export const BegleitbelegePage = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const reiterWahl = params.get('art') ?? '';
  const setReiter = (key: string) =>
    setParams(key === '' ? {} : { art: key }, { replace: true });
  const [fehler, setFehler] = useState<string | null>(null);

  const { data, loading, error } = useQuery<{
    begleitbelege: BegleitbelegKurz[];
  }>(BEGLEITBELEGE);
  const belege = data?.begleitbelege ?? [];

  const auftraege = belege.filter(
    (beleg) =>
      beleg.art === 'AUFTRAGSBESTAETIGUNG' && beleg.stornoVonId === null,
  );
  const lieferscheine = belege.filter(
    (beleg) => beleg.art === 'LIEFERSCHEIN' && beleg.stornoVonId === null,
  );
  const stornos = belege.filter(
    (beleg) => beleg.stornoVonId !== null || beleg.status === 'STORNIERT',
  );

  const reiter: StatusTab[] = [
    { key: '', label: 'Alle', count: belege.length },
    {
      key: 'AUFTRAGSBESTAETIGUNG',
      label: 'Auftragsbestätigungen',
      count: auftraege.length,
      sumCents: auftraege
        .filter((beleg) => beleg.status === 'GESTELLT')
        .reduce((summe, beleg) => summe + (beleg.totals?.grossCents ?? 0), 0),
    },
    {
      key: 'LIEFERSCHEIN',
      label: 'Lieferscheine',
      count: lieferscheine.length,
    },
    { key: 'STORNO', label: 'Storniert', count: stornos.length },
  ];

  const gezeigt =
    reiterWahl === 'AUFTRAGSBESTAETIGUNG'
      ? auftraege
      : reiterWahl === 'LIEFERSCHEIN'
        ? lieferscheine
        : reiterWahl === 'STORNO'
          ? stornos
          : belege;

  const aktionen = (beleg: BegleitbelegKurz): RowMenuItem[] => [
    { label: 'Öffnen', onSelect: () => navigate(`/belege/${beleg.id}`) },
    {
      label: 'PDF herunterladen',
      onSelect: () =>
        void downloadBegleitbelegPdf(
          beleg.id,
          `${BEGLEITBELEG_DATEI[beleg.art]}-${beleg.number}.pdf`,
        ).catch((problem: unknown) =>
          setFehler(problem instanceof Error ? problem.message : 'Fehler.'),
        ),
    },
    {
      label: 'Zum Angebot',
      onSelect: () => navigate(`/angebote/${beleg.angebot.id}`),
    },
  ];

  return (
    <>
      <ObjectHeader
        hilfe="belege"
        kind="quote"
        icon={IconQuotes}
        label="Auftragsbestätigungen und Lieferscheine"
        anzahl={belege.length}
        actions={
          <Link className="button button--ghost" to="/angebote">
            Angebote
          </Link>
        }
      />

      <StatusTabs tabs={reiter} active={reiterWahl} onChange={setReiter} />

      {error !== undefined && (
        <div className="error-banner">{error.message}</div>
      )}
      {fehler !== null && <div className="error-banner">{fehler}</div>}

      {loading && data === undefined ? (
        <>
          <LoadingAnnouncement />
          <SkeletonTable columns={6} />
        </>
      ) : gezeigt.length === 0 ? (
        reiterWahl === '' ? (
          <EmptyState
            title="Noch keine Belege"
            description="Auftragsbestätigungen und Lieferscheine entstehen aus einem versendeten oder angenommenen Angebot. Öffnen Sie das Angebot und bestätigen Sie dort den Auftrag."
            action={
              <Link className="button" to="/angebote?status=ACCEPTED">
                Angenommene Angebote
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="Keine Treffer"
            description="Unter diesem Reiter liegt gerade nichts."
          />
        )
      ) : (
        <TableWrap>
          <table className="list-table">
            <thead>
              <tr>
                <th>Nummer</th>
                <th>Art</th>
                <th>Firma</th>
                <th>Angebot</th>
                <th>Datum</th>
                <th className="numeric">Brutto</th>
                <th>Status</th>
                <th>
                  <span className="visually-hidden">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {gezeigt.map((beleg) => {
                const badge = begleitbelegBadge(beleg);

                return (
                  <tr key={beleg.id}>
                    <td data-label="Nummer">
                      <Link to={`/belege/${beleg.id}`}>{beleg.number}</Link>
                    </td>
                    <td data-label="Art">{begleitbelegTitel(beleg)}</td>
                    <td data-label="Firma">{beleg.company?.name ?? '—'}</td>
                    <td data-label="Angebot">
                      <Link to={`/angebote/${beleg.angebot.id}`}>
                        {beleg.angebot.number}
                      </Link>
                    </td>
                    <td data-label="Datum">{formatDate(beleg.issuedOn)}</td>
                    <td data-label="Brutto" className="numeric">
                      {beleg.totals === null
                        ? '—'
                        : formatMoney(beleg.totals.grossCents, beleg.currency)}
                    </td>
                    <td data-label="Status">
                      <span className={badge.className}>{badge.text}</span>
                    </td>
                    <td className="row-menu">
                      <RowMenu
                        label={`Aktionen für ${beleg.number}`}
                        items={aktionen(beleg)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
};
