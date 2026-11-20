import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import {
  API_KEYS,
  CREATE_API_KEY,
  REVOKE_API_KEY,
  SET_API_KEY_SCHREIBMODUS,
} from '../lib/queries';
import {
  type ApiKey,
  formatDate,
  type MyPermissions,
  PERMISSION_GROUPS,
} from '../lib/types';
import { ConfirmDialog } from './ConfirmDialog';

const NICHT_FUER_SCHLUESSEL = new Set(['workspace:ki']);

const MODUS: Record<ApiKey['schreibmodus'], string> = {
  direkt: 'Ändert direkt',
  vorschlag: 'Schlägt nur vor',
};

const LABELS = new Map(
  PERMISSION_GROUPS.flatMap((group) =>
    group.permissions.map(
      (permission) =>
        [permission.key, `${group.label}: ${permission.label}`] as const,
    ),
  ),
);

type Zustand =
  | { art: 'liste' }
  | { art: 'anlegen' }
  | { art: 'gezeigt'; token: string; name: string };

export const ApiKeysSection = () => {
  const { data, loading, error } = useQuery<{
    apiKeys: ApiKey[];
    myPermissions: MyPermissions;
  }>(API_KEYS);

  const [createApiKey, { loading: creating, error: createError }] = useMutation(
    CREATE_API_KEY,
    { refetchQueries: [API_KEYS], fetchPolicy: 'no-cache' },
  );
  const [revokeApiKey, { error: revokeError }] = useMutation(REVOKE_API_KEY, {
    refetchQueries: [API_KEYS],
  });
  const [modusSetzen, { error: modusError }] = useMutation(
    SET_API_KEY_SCHREIBMODUS,
    { refetchQueries: [API_KEYS] },
  );

  const [zustand, setZustand] = useState<Zustand>({ art: 'liste' });
  const [name, setName] = useState('');
  const [rechte, setRechte] = useState<string[]>([]);
  const [frist, setFrist] = useState('');
  const [schreibmodus, setSchreibmodus] =
    useState<ApiKey['schreibmodus']>('vorschlag');
  const [zuWiderrufen, setZuWiderrufen] = useState<ApiKey | null>(null);
  const [kopiert, setKopiert] = useState(false);

  const meine = data?.myPermissions;
  const darfVerwalten =
    meine !== undefined &&
    (meine.everything || meine.permissions.includes('workspace:api'));

  const darfIch = (recht: string): boolean =>
    meine !== undefined &&
    (meine.everything || meine.permissions.includes(recht));

  const umschalten = (recht: string) => {
    setRechte((bisher) =>
      bisher.includes(recht)
        ? bisher.filter((eintrag) => eintrag !== recht)
        : [...bisher, recht],
    );
  };

  const zuruecksetzen = () => {
    setName('');
    setRechte([]);
    setFrist('');
    setSchreibmodus('vorschlag');
    setKopiert(false);
  };

  const anlegen = async () => {
    const ergebnis = await createApiKey({
      variables: {
        input: {
          name,
          permissions: rechte,
          schreibmodus,
          expiresAt: frist === '' ? undefined : new Date(frist).toISOString(),
        },
      },
    }).catch(() => null);

    const erzeugt = ergebnis?.data?.createApiKey;

    if (erzeugt !== undefined && erzeugt !== null) {
      setZustand({ art: 'gezeigt', token: erzeugt.token, name });
      zuruecksetzen();
    }
  };

  if (loading && data === undefined) {
    return null;
  }

  if (error !== undefined) {
    return <div className="error-banner">{error.message}</div>;
  }

  if (!darfVerwalten) {
    return null;
  }

  const schluessel = data?.apiKeys ?? [];
  const fehler = createError ?? revokeError ?? modusError;

  return (
    <section className="detail-section">
      {zuWiderrufen !== null && (
        <ConfirmDialog
          title={`Schlüssel "${zuWiderrufen.name}" widerrufen?`}
          consequence="Programme, die ihn benutzen, bekommen ab sofort keinen Zugang mehr. Das lässt sich nicht rückgängig machen — für einen weiteren Zugang legen Sie einen neuen Schlüssel an."
          confirmLabel="Widerrufen"
          onCancel={() => setZuWiderrufen(null)}
          onConfirm={() => {
            void revokeApiKey({ variables: { id: zuWiderrufen.id } });
            setZuWiderrufen(null);
          }}
        />
      )}

      <div className="section-heading">
        <h2>
          Schlüssel ({schluessel.filter((s) => s.revokedAt === null).length})
        </h2>
        {zustand.art === 'liste' && (
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setZustand({ art: 'anlegen' })}
          >
            Neuer Schlüssel
          </button>
        )}
      </div>
      <p className="field__hint">
        Wie ein Programm den Schlüssel benutzt, mit Beispielen und der Referenz
        aller Abfragen: <Link to="/entwickler">Für Entwickler</Link>.
      </p>

      <p className="page__subtitle" style={{ marginTop: -4 }}>
        Für Programme, die sich nicht anmelden können — eine nächtliche
        Übernahme von Aufträgen etwa. Ein Schlüssel gehört dem Arbeitsbereich
        und bleibt gültig, wenn die Person geht, die ihn angelegt hat.
      </p>

      {fehler !== undefined && (
        <div className="error-banner">{fehler.message}</div>
      )}

      {zustand.art === 'gezeigt' && (
        <div className="card" style={{ padding: 18, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 6px' }}>
            Schlüssel „{zustand.name}" angelegt
          </h3>
          <p className="page__subtitle" style={{ marginTop: 0 }}>
            <strong>
              Dies ist das einzige Mal, dass Sie ihn vollständig sehen.
            </strong>{' '}
            Hinterlegen Sie ihn jetzt dort, wo das Programm ihn liest — danach
            lässt er sich nicht wiederherstellen, nur ersetzen.
          </p>
          <code className="api-key__klartext">{zustand.token}</code>
          <div className="auth__actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="button"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(zustand.token)
                  .then(() => setKopiert(true))
                  .catch(() => setKopiert(false));
              }}
            >
              {kopiert ? 'Kopiert' : 'Kopieren'}
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setZustand({ art: 'liste' })}
            >
              Fertig
            </button>
          </div>
        </div>
      )}

      {zustand.art === 'anlegen' && (
        <div className="card" style={{ padding: 18, marginBottom: 16 }}>
          <div className="field">
            <label htmlFor="api-key-name">Wofür ist er da?</label>
            <input
              id="api-key-name"
              value={name}
              maxLength={120}
              placeholder="Nächtlicher Auftragsimport"
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="api-key-frist">Gültig bis (freigestellt)</label>
            <input
              id="api-key-frist"
              type="date"
              value={frist}
              onChange={(event) => setFrist(event.target.value)}
            />
            <span className="pagination__summary">
              Leer heißt: gilt, bis jemand ihn widerruft.
            </span>
          </div>

          <div className="role-editor__groups">
            {PERMISSION_GROUPS.map((gruppe) => {
              const moeglich = gruppe.permissions.filter(
                (recht) =>
                  darfIch(recht.key) && !NICHT_FUER_SCHLUESSEL.has(recht.key),
              );

              if (moeglich.length === 0) {
                return null;
              }

              return (
                <fieldset key={gruppe.label} className="role-editor__group">
                  <legend>{gruppe.label}</legend>
                  {moeglich.map((recht) => (
                    <label key={recht.key} className="role-editor__check">
                      <input
                        type="checkbox"
                        checked={rechte.includes(recht.key)}
                        onChange={() => umschalten(recht.key)}
                      />
                      {recht.label}
                    </label>
                  ))}
                </fieldset>
              );
            })}
          </div>

          <p className="pagination__summary">
            Geben Sie nur, was das Programm wirklich braucht. Angeboten wird
            nur, was Sie selbst dürfen.
          </p>

          <fieldset className="field api-key__modus">
            <legend>Änderungen</legend>
            <label className="checkbox-field">
              <input
                type="radio"
                name="api-key-modus"
                checked={schreibmodus === 'vorschlag'}
                onChange={() => setSchreibmodus('vorschlag')}
              />
              Nur vorschlagen — ein Mensch gibt jede Änderung frei
            </label>
            <label className="checkbox-field">
              <input
                type="radio"
                name="api-key-modus"
                checked={schreibmodus === 'direkt'}
                onChange={() => setSchreibmodus('direkt')}
              />
              Direkt ausführen, mit den Rechten oben
            </label>
            <span className="pagination__summary">
              Für KI-Assistenten (MCP) empfohlen: „Nur vorschlagen“. Der
              Schlüssel liest dann mit seinen Rechten, Änderungen landen unter
              „KI-Vorschläge“ und werden erst beim Annehmen ausgeführt — mit den
              Rechten der Person, die annimmt. Ein Importprogramm braucht
              „Direkt“.
            </span>
          </fieldset>

          <div className="role-editor__actions">
            <button
              type="button"
              className="button"
              disabled={creating || name.trim() === '' || rechte.length === 0}
              onClick={() => void anlegen()}
            >
              {creating ? 'Wird angelegt…' : 'Schlüssel anlegen'}
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                zuruecksetzen();
                setZustand({ art: 'liste' });
              }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {schluessel.length === 0 ? (
        <div className="state">
          Noch keine Schlüssel. Ohne einen kommt kein Programm an diesen
          Arbeitsbereich.
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Kennung</th>
              <th>Rechte</th>
              <th>Änderungen</th>
              <th>Zuletzt benutzt</th>
              <th>
                <span className="visually-hidden">Aktionen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {schluessel.map((eintrag) => (
              <tr
                key={eintrag.id}
                className={eintrag.revokedAt === null ? undefined : 'is-muted'}
              >
                <td>
                  {eintrag.name}
                  <div className="pagination__summary">
                    {eintrag.createdByName === null
                      ? 'Angelegt'
                      : `Angelegt von ${eintrag.createdByName}`}{' '}
                    am {formatDate(eintrag.createdAt)}
                    {eintrag.expiresAt === null
                      ? ''
                      : ` · gültig bis ${formatDate(eintrag.expiresAt)}`}
                  </div>
                </td>
                <td>
                  <code>{eintrag.anzeige}</code>
                </td>
                <td>
                  <div className="pagination__summary">
                    {eintrag.permissions
                      .map((recht) => LABELS.get(recht) ?? recht)
                      .join(' · ')}
                  </div>
                </td>
                <td>
                  {MODUS[eintrag.schreibmodus]}
                  {eintrag.revokedAt === null && (
                    <div>
                      <button
                        type="button"
                        className="button button--quiet button--small"
                        onClick={() =>
                          void modusSetzen({
                            variables: {
                              id: eintrag.id,
                              schreibmodus:
                                eintrag.schreibmodus === 'direkt'
                                  ? 'vorschlag'
                                  : 'direkt',
                            },
                          }).catch(() => null)
                        }
                      >
                        {eintrag.schreibmodus === 'direkt'
                          ? 'Auf „nur vorschlagen“ stellen'
                          : 'Auf „direkt“ stellen'}
                      </button>
                    </div>
                  )}
                </td>
                <td>
                  {eintrag.lastUsedAt === null
                    ? 'Noch nie'
                    : formatDate(eintrag.lastUsedAt)}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {eintrag.revokedAt === null ? (
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => setZuWiderrufen(eintrag)}
                    >
                      Widerrufen
                    </button>
                  ) : (
                    <span className="pagination__summary">
                      Widerrufen am {formatDate(eintrag.revokedAt)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
};
