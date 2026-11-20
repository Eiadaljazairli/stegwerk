import { useState } from 'react';

import { downloadExport } from '../lib/download';
import { type ListControls } from '../lib/useListControls';
import { IconImport } from './Icons';

const KEIN_FILTER = new Set([
  'search',
  'limit',
  'offset',
  'sortField',
  'sortDirection',
  'gruppierung',
  'gruppe',
]);

export const exportFilter = (
  variablen: Record<string, unknown>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(variablen).filter(
      ([schluessel, wert]) =>
        !KEIN_FILTER.has(schluessel) && wert !== null && wert !== undefined,
    ),
  );

export const ExportButton = ({
  entity,
  controls,
  variablen,
}: {
  entity: 'company' | 'contact' | 'deal';
  controls: ListControls;
  variablen?: Record<string, unknown>;
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);

    try {
      await downloadExport(entity, {
        search: controls.variables.search,
        sortField: controls.sortField,
        sortDirection: controls.sortDirection,
        filter: exportFilter(variablen ?? controls.variables),
      });
    } catch (thrown) {
      setError((thrown as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="button button--ghost export__button"
        disabled={busy}
        onClick={() => void run()}
      >
        <IconImport size={15} />
        {busy ? 'Wird erstellt…' : 'Export'}
      </button>

      {error !== null && <div className="error-banner">{error}</div>}
    </>
  );
};
