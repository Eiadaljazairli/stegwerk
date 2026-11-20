import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';

import {
  CREATE_ROLE,
  DELETE_ROLE,
  ROLES,
  UPDATE_ROLE,
  WORKSPACE_MEMBERS,
} from '../lib/queries';
import {
  type FeldrechtEintrag,
  type MyPermissions,
  PERMISSION_GROUPS,
  type Role,
  SICHTBARKEITS_ARTEN,
  type Sichtbarkeit,
} from '../lib/types';
import { STANDARD_FELDRECHTE } from '../lib/useFeldrechte';
import { ConfirmDialog } from './ConfirmDialog';
import { RoleEditor } from './RoleEditor';

const countLabel = (count: number): string =>
  count === 1 ? '1 Mitglied' : `${String(count)} Mitglieder`;

const LABELS = new Map(
  PERMISSION_GROUPS.flatMap((group) =>
    group.permissions.map(
      (permission) =>
        [permission.key, `${group.label}: ${permission.label}`] as const,
    ),
  ),
);

const feldName = (schluessel: string): string =>
  STANDARD_FELDRECHTE.find((eintrag) => eintrag.schluessel === schluessel)
    ?.label ?? schluessel.split(':').slice(2).join(':');

export const RolesSection = () => {
  const { data, loading, error } = useQuery<{
    roles: Role[];
    myPermissions: MyPermissions;
  }>(ROLES);

  const refetchQueries = [ROLES, WORKSPACE_MEMBERS];
  const [createRole, { loading: creating, error: createError }] = useMutation(
    CREATE_ROLE,
    { refetchQueries },
  );
  const [updateRole, { loading: updating, error: updateError }] = useMutation(
    UPDATE_ROLE,
    { refetchQueries },
  );
  const [deleteRole, { error: deleteError }] = useMutation(DELETE_ROLE, {
    refetchQueries,
  });

  const [editing, setEditing] = useState<Role | null | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<Role | null>(null);

  const mine = data?.myPermissions;
  const mayManage =
    mine !== undefined &&
    (mine.everything || mine.permissions.includes('workspace:roles'));

  const failure = createError ?? updateError ?? deleteError;

  const save = async (input: {
    name: string;
    description: string;
    permissions: string[];
    sichtbarkeit?: Sichtbarkeit;
    feldrechte?: FeldrechtEintrag[];
  }) => {
    const result =
      editing === null
        ? await createRole({ variables: { input } }).catch(() => null)
        : await updateRole({
            variables: { input: { id: editing?.id, ...input } },
          }).catch(() => null);

    if (result?.data !== undefined && result.data !== null) {
      setEditing(undefined);
    }
  };

  if (loading && data === undefined) {
    return null;
  }

  if (error !== undefined) {
    return <div className="error-banner">{error.message}</div>;
  }

  return (
    <section className="detail-section">
      {pendingDelete !== null && (
        <ConfirmDialog
          title={`Rolle "${pendingDelete.name}" löschen?`}
          consequence="Die Rolle wird entfernt. Mitglieder behalten ihren Zugang nur, wenn sie bereits eine andere Rolle haben."
          confirmLabel="Rolle löschen"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            void deleteRole({ variables: { id: pendingDelete.id } });
            setPendingDelete(null);
          }}
        />
      )}

      <div className="section-heading">
        <h2>Rollen ({data?.roles.length ?? 0})</h2>
        {mayManage && editing === undefined && (
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setEditing(null)}
          >
            Neue Rolle
          </button>
        )}
      </div>

      {failure !== undefined && (
        <div className="error-banner">{failure.message}</div>
      )}

      {editing !== undefined && (
        <RoleEditor
          role={editing}
          saving={creating || updating}
          onSave={(input) => void save(input)}
          onCancel={() => setEditing(undefined)}
        />
      )}

      <div className="roles">
        {data?.roles.map((role) => (
          <article className="card role" key={role.id}>
            <header className="role__head">
              <div>
                <h3 className="role__name">{role.name}</h3>
                <span className="role__count">
                  {countLabel(role.memberCount)}
                </span>
              </div>

              {mayManage && (
                <div className="role__actions">
                  <button
                    type="button"
                    className="button button--ghost row-action"
                    onClick={() => setEditing(role)}
                  >
                    Bearbeiten
                  </button>
                  {!role.isSystem && (
                    <button
                      type="button"
                      className="button button--danger row-action"
                      onClick={() => setPendingDelete(role)}
                    >
                      Löschen
                    </button>
                  )}
                </div>
              )}
            </header>

            {role.description !== null && (
              <p className="role__description">{role.description}</p>
            )}

            {!role.everything &&
              SICHTBARKEITS_ARTEN.some(
                (art) => role.sichtbarkeit[art.key] === 'eigene',
              ) && (
                <p className="role__sicht">
                  Sieht nur eigene und unzugeordnete:{' '}
                  {SICHTBARKEITS_ARTEN.filter(
                    (art) => role.sichtbarkeit[art.key] === 'eigene',
                  )
                    .map((art) => art.label)
                    .join(', ')}
                </p>
              )}

            {!role.everything && (role.feldrechte ?? []).length > 0 && (
              <p className="role__sicht">
                Eingeschränkte Felder:{' '}
                {(role.feldrechte ?? [])
                  .map(
                    (eintrag) =>
                      `${feldName(eintrag.feld)} (${
                        eintrag.recht === 'verborgen'
                          ? 'verborgen'
                          : 'nur lesen'
                      })`,
                  )
                  .join(', ')}
              </p>
            )}

            {role.everything ? (
              <p className="role__all">Darf alles.</p>
            ) : role.permissions.length === 0 ? (
              <p className="role__all role__all--none">
                Darf nichts. Diese Rolle sieht keine Daten.
              </p>
            ) : (
              <ul className="role__permissions">
                {role.permissions.map((permission) => (
                  <li key={permission}>
                    {LABELS.get(permission) ?? permission}
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </section>
  );
};
