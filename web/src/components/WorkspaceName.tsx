import { useMutation, useQuery } from '@apollo/client';
import { type FormEvent, useState } from 'react';

import { MY_ROLE, MY_WORKSPACES, RENAME_WORKSPACE } from '../lib/queries';
import { useWorkspaceName } from '../lib/useWorkspaceName';

export const WorkspaceName = () => {
  const name = useWorkspaceName();
  const { data: roleData } = useQuery<{ myRole: string }>(MY_ROLE);
  const canRename =
    roleData?.myRole === 'OWNER' || roleData?.myRole === 'ADMIN';

  const [rename, { loading, error }] = useMutation(RENAME_WORKSPACE, {
    refetchQueries: [MY_WORKSPACES],
  });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (!canRename) {
    return <p className="page__subtitle">{name}</p>;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (draft.trim() === '' || draft.trim() === name) {
      setEditing(false);

      return;
    }

    const result = await rename({ variables: { name: draft.trim() } }).catch(
      () => null,
    );

    if (result?.data != null) {
      setEditing(false);
    }
  };

  return (
    <>
      {editing ? (
        <form className="workspace-name" onSubmit={submit}>
          <input
            autoFocus
            maxLength={120}
            value={draft}
            aria-label="Name des Arbeitsbereichs"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setEditing(false);
              }
            }}
          />
          <button
            className="button button--small"
            type="submit"
            disabled={loading}
          >
            Speichern
          </button>
          <button
            className="button button--ghost button--small"
            type="button"
            onClick={() => setEditing(false)}
          >
            Abbrechen
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="page__subtitle workspace-name__edit"
          title="Arbeitsbereich umbenennen"
          onClick={() => {
            setDraft(name);
            setEditing(true);
          }}
        >
          {name}
          <span className="workspace-name__hint" aria-hidden="true">
            Umbenennen
          </span>
        </button>
      )}

      {error !== undefined && (
        <div className="error-banner">{error.message}</div>
      )}
    </>
  );
};
