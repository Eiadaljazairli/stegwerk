import { useLazyQuery, useMutation } from '@apollo/client';
import { useState } from 'react';

import { useAuth } from '../lib/auth';
import { useWorkspaceName } from '../lib/useWorkspaceName';
import { DELETE_WORKSPACE, EXPORT_WORKSPACE_DATA } from '../lib/queries';

export const DataPage = () => {
  const { endSession } = useAuth();
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');

  const [runExport, { loading: exporting, error: exportError }] = useLazyQuery<{
    exportWorkspaceData: string;
  }>(EXPORT_WORKSPACE_DATA, { fetchPolicy: 'network-only' });

  const [deleteWorkspace, { loading: deleting, error: deleteError }] =
    useMutation(DELETE_WORKSPACE);

  const handleExport = async () => {
    const result = await runExport().catch(() => null);
    const json = result?.data?.exportWorkspaceData;

    if (typeof json !== 'string') {
      return;
    }

    const url = URL.createObjectURL(
      new Blob([json], { type: 'application/json' }),
    );
    const link = document.createElement('a');

    link.href = url;
    link.download = `stegwerk-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    const result = await deleteWorkspace({
      variables: { confirmationName: confirmation, password },
    }).catch(() => null);

    if (result?.data?.deleteWorkspace === true) {
      endSession();
      window.location.assign('/anmelden');
    }
  };

  const workspaceName = useWorkspaceName();
  const canDelete =
    confirmation.trim() === workspaceName && password.trim() !== '';

  return (
    <>
      <div className="page__header">
        <div>
          <h1>Daten</h1>
          <p className="page__subtitle">
            Export und Löschung nach DSGVO Art. 15, 20 und 17.
          </p>
        </div>
      </div>

      {(exportError ?? deleteError) !== undefined && (
        <div className="error-banner">
          {(exportError ?? deleteError)?.message}
        </div>
      )}

      <div className="card import-step">
        <div className="import-step__title">Daten exportieren</div>
        <p className="page__subtitle" style={{ margin: '0 0 12px' }}>
          Lädt alles herunter, was zu diesem Arbeitsbereich gespeichert ist —
          Firmen, Kontakte, Geschäfte, Notizen, Aufgaben, Mitglieder und das
          Änderungsprotokoll — als eine JSON-Datei. Passwörter und Sitzungs­
          schlüssel sind nicht enthalten.
        </p>
        <div className="import-step__actions">
          <button
            className="button"
            type="button"
            disabled={exporting}
            onClick={() => void handleExport()}
          >
            {exporting ? 'Wird erstellt…' : 'Export herunterladen'}
          </button>
        </div>
      </div>

      <div className="card import-step danger-zone">
        <div className="import-step__title">Arbeitsbereich löschen</div>
        <p className="page__subtitle" style={{ margin: '0 0 12px' }}>
          Löscht diesen Arbeitsbereich und alle darin enthaltenen Daten
          unwiderruflich. Mitglieder, die danach zu keinem Arbeitsbereich mehr
          gehören, werden ebenfalls gelöscht. Exportieren Sie vorher.
        </p>

        <div className="field" style={{ maxWidth: 380 }}>
          <label htmlFor="delete-confirmation">
            Tippen Sie <strong>{workspaceName}</strong> zur Bestätigung
          </label>
          <input
            id="delete-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={workspaceName}
          />
        </div>

        <div className="field" style={{ maxWidth: 380 }}>
          <label htmlFor="delete-password">Ihr Passwort</label>
          <input
            id="delete-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <div className="import-step__actions">
          <button
            className="button button--destructive"
            type="button"
            disabled={!canDelete || deleting}
            onClick={() => void handleDelete()}
          >
            {deleting ? 'Wird gelöscht…' : 'Unwiderruflich löschen'}
          </button>
        </div>
      </div>
    </>
  );
};
