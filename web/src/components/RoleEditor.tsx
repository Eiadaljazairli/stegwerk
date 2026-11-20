import { useQuery } from '@apollo/client';
import { useState } from 'react';

import { CUSTOM_FIELDS } from '../lib/queries';
import {
  eigenesSchluessel,
  type FeldArt,
  STANDARD_FELDRECHTE,
} from '../lib/useFeldrechte';
import {
  type CustomField,
  type FeldrechtEintrag,
  PERMISSION_GROUPS,
  type Role,
  SICHTBARKEITS_ARTEN,
  type Sichtbarkeit,
  type Sichtweite,
} from '../lib/types';

const FELD_ARTEN: { key: FeldArt; label: string }[] = [
  { key: 'company', label: 'Firmen' },
  { key: 'contact', label: 'Kontakte' },
  { key: 'deal', label: 'Geschäfte' },
  { key: 'task', label: 'Aufgaben' },
];

export const RoleEditor = ({
  role,
  saving,
  onSave,
  onCancel,
}: {
  role: Role | null;
  saving: boolean;
  onSave: (input: {
    name: string;
    description: string;
    permissions: string[];
    sichtbarkeit?: Sichtbarkeit;
    feldrechte?: FeldrechtEintrag[];
  }) => void;
  onCancel: () => void;
}) => {
  const { data: felderDaten } = useQuery<{ customFields: CustomField[] }>(
    CUSTOM_FIELDS,
  );
  const [feldrechte, setFeldrechte] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (role?.feldrechte ?? []).map((eintrag) => [eintrag.feld, eintrag.recht]),
    ),
  );
  const felder = FELD_ARTEN.map((art) => ({
    ...art,
    felder: [
      ...STANDARD_FELDRECHTE.filter((f) => f.art === art.key).map((f) => ({
        schluessel: f.schluessel,
        label: f.label,
      })),
      ...(felderDaten?.customFields ?? [])
        .filter(
          (feld) =>
            feld.entity.toLowerCase() === art.key && feld.archivedAt === null,
        )
        .map((feld) => ({
          schluessel: eigenesSchluessel(art.key, feld.key),
          label: feld.label,
        })),
    ],
  })).filter((art) => art.felder.length > 0);
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [permissions, setPermissions] = useState<string[]>(
    role?.permissions ?? [],
  );

  const [sichtbarkeit, setSichtbarkeit] = useState<Sichtbarkeit>(
    role?.sichtbarkeit ?? { company: 'alle', contact: 'alle', deal: 'alle' },
  );

  const has = (key: string) => permissions.includes(key);

  const toggle = (key: string) => {
    if (has(key)) {
      setPermissions(permissions.filter((entry) => entry !== key));

      return;
    }

    const [subject, action] = key.split(':');
    const implied =
      action !== 'view' && subject !== 'workspace' ? [`${subject}:view`] : [];

    setPermissions([...new Set([...permissions, key, ...implied])]);
  };

  return (
    <form
      className="card role-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          name,
          description,
          permissions,
          ...(role?.everything === true
            ? {}
            : {
                sichtbarkeit: {
                  company: sichtbarkeit.company,
                  contact: sichtbarkeit.contact,
                  deal: sichtbarkeit.deal,
                },
                feldrechte: Object.entries(feldrechte)
                  .filter(([, recht]) => recht !== 'alle')
                  .map(([feld, recht]) => ({
                    feld,
                    recht: recht as FeldrechtEintrag['recht'],
                  })),
              }),
        });
      }}
    >
      <div className="role-editor__head">
        <div className="field">
          <label htmlFor="role-name">Name der Rolle</label>
          <input
            id="role-name"
            required
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="field field--wide">
          <label htmlFor="role-description">Beschreibung</label>
          <input
            id="role-description"
            maxLength={300}
            placeholder="Wofür ist diese Rolle gedacht?"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>

      {role?.everything === true ? (
        <p className="notice">
          Die Inhaber-Rolle darf immer alles. Das lässt sich nicht einschränken
          — sie ist der Weg zurück in einen Arbeitsbereich, in dem sich jemand
          versehentlich ausgesperrt hat. Der Name ist änderbar.
        </p>
      ) : (
        <div className="role-editor__groups">
          {PERMISSION_GROUPS.map((group) => (
            <fieldset key={group.label} className="role-editor__group">
              <legend>{group.label}</legend>

              {group.permissions.map((permission) => (
                <label key={permission.key} className="role-editor__check">
                  <input
                    type="checkbox"
                    checked={has(permission.key)}
                    onChange={() => toggle(permission.key)}
                  />
                  {permission.label}
                </label>
              ))}
            </fieldset>
          ))}

          <fieldset className="role-editor__group">
            <legend>Welche Datensätze</legend>

            {SICHTBARKEITS_ARTEN.map((art) => (
              <label key={art.key} className="role-editor__sicht">
                <span>{art.label}</span>
                <select
                  aria-label={`Sichtbare ${art.label}`}
                  value={sichtbarkeit[art.key]}
                  onChange={(event) =>
                    setSichtbarkeit({
                      ...sichtbarkeit,
                      [art.key]: event.target.value as Sichtweite,
                    })
                  }
                >
                  <option value="alle">Alle Datensätze</option>
                  <option value="eigene">Nur eigene und unzugeordnete</option>
                </select>
              </label>
            ))}
          </fieldset>

          {felder.map((art) => (
            <fieldset key={art.key} className="role-editor__group">
              <legend>Felder: {art.label}</legend>

              {art.felder.map((feld) => (
                <label key={feld.schluessel} className="role-editor__sicht">
                  <span>{feld.label}</span>
                  <select
                    aria-label={`${art.label}: ${feld.label}`}
                    value={feldrechte[feld.schluessel] ?? 'alle'}
                    onChange={(event) =>
                      setFeldrechte({
                        ...feldrechte,
                        [feld.schluessel]: event.target.value,
                      })
                    }
                  >
                    <option value="alle">Sehen und ändern</option>
                    <option value="lesen">Nur lesen</option>
                    <option value="verborgen">Verborgen</option>
                  </select>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      )}

      <div className="role-editor__actions">
        <button className="button" type="submit" disabled={saving}>
          {saving ? 'Wird gespeichert…' : 'Speichern'}
        </button>
        <button
          type="button"
          className="button button--ghost"
          onClick={onCancel}
        >
          Abbrechen
        </button>
      </div>
    </form>
  );
};
