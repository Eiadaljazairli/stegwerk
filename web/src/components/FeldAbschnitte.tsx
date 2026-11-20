import { useMutation } from '@apollo/client';
import { type FormEvent, useState } from 'react';

import {
  CREATE_CUSTOM_FIELD_GROUP,
  CUSTOM_FIELD_GROUPS,
  CUSTOM_FIELDS,
  DELETE_CUSTOM_FIELD_GROUP,
  UPDATE_CUSTOM_FIELD_GROUP,
} from '../lib/queries';
import {
  CUSTOM_FIELD_ENTITY_LABELS,
  type CustomField,
  type CustomFieldGroup,
} from '../lib/types';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './Toast';
import { IconArrowDown, IconArrowUp } from './Icons';

export const FeldAbschnitte = ({
  entity,
  gruppen,
  felder,
}: {
  entity: CustomField['entity'];
  gruppen: CustomFieldGroup[];
  felder: CustomField[];
}) => {
  const refetchQueries = [CUSTOM_FIELD_GROUPS, CUSTOM_FIELDS];
  const [anlegen, { loading: legtAn }] = useMutation(
    CREATE_CUSTOM_FIELD_GROUP,
    { refetchQueries },
  );
  const [aendern] = useMutation(UPDATE_CUSTOM_FIELD_GROUP, { refetchQueries });
  const [entfernen] = useMutation(DELETE_CUSTOM_FIELD_GROUP, {
    refetchQueries,
  });
  const toast = useToast();
  const fehler = (error: Error) => toast.zeige({ text: error.message });
  const [name, setName] = useState('');
  const [zuEntfernen, setZuEntfernen] = useState<CustomFieldGroup | null>(null);

  const eigene = gruppen
    .filter((gruppe) => gruppe.entity === entity)
    .sort((a, b) => a.position - b.position);
  const art = CUSTOM_FIELD_ENTITY_LABELS[entity];

  const neu = async (event: FormEvent) => {
    event.preventDefault();

    const result = await anlegen({
      variables: { input: { entity, name: name.trim() } },
    }).catch((error: Error) => {
      fehler(error);

      return null;
    });

    if (result?.data !== undefined && result.data !== null) {
      setName('');
    }
  };

  const verschieben = (index: number, richtung: -1 | 1) => {
    const ziel = index + richtung;

    if (ziel < 0 || ziel >= eigene.length) {
      return;
    }

    const neuOrdnung = [...eigene];

    [neuOrdnung[index], neuOrdnung[ziel]] = [
      neuOrdnung[ziel],
      neuOrdnung[index],
    ];

    void Promise.all(
      neuOrdnung
        .map((gruppe, position) => ({ gruppe, position }))
        .filter(({ gruppe, position }) => gruppe.position !== position)
        .map(({ gruppe, position }) =>
          aendern({ variables: { input: { id: gruppe.id, position } } }),
        ),
    ).catch(fehler);
  };

  return (
    <div className="feld-gruppen">
      {eigene.length === 0 && (
        <p className="field__hint">
          Noch keine Abschnitte: alle eigenen Felder stehen in der Akte unter
          „Eigene Felder“.
        </p>
      )}
      {eigene.map((gruppe, index) => {
        const anzahl = felder.filter(
          (feld) => feld.gruppeId === gruppe.id && feld.archivedAt === null,
        ).length;

        return (
          <div key={gruppe.id} className="feld-gruppen__zeile">
            <input
              className="cell-input"
              aria-label={`Name des Abschnitts ${gruppe.name}`}
              defaultValue={gruppe.name}
              maxLength={80}
              onBlur={(event) => {
                const next = event.target.value.trim();

                if (next === '' || next === gruppe.name) {
                  event.target.value = gruppe.name;

                  return;
                }

                void aendern({
                  variables: { input: { id: gruppe.id, name: next } },
                }).catch((error: Error) => {
                  event.target.value = gruppe.name;
                  fehler(error);
                });
              }}
            />
            <span className="cell-hint">
              {anzahl === 1 ? '1 Feld' : `${String(anzahl)} Felder`}
            </span>
            <label className="field--inline cell-hint">
              <input
                type="checkbox"
                checked={gruppe.eingeklappt}
                onChange={(event) =>
                  void aendern({
                    variables: {
                      input: {
                        id: gruppe.id,
                        eingeklappt: event.target.checked,
                      },
                    },
                  }).catch(fehler)
                }
              />
              zu Beginn zugeklappt
            </label>
            <button
              type="button"
              className="button button--ghost button--small"
              aria-label={`${gruppe.name} nach oben`}
              disabled={index === 0}
              onClick={() => verschieben(index, -1)}
            >
              <IconArrowUp size={14} />
            </button>
            <button
              type="button"
              className="button button--ghost button--small"
              aria-label={`${gruppe.name} nach unten`}
              disabled={index === eigene.length - 1}
              onClick={() => verschieben(index, 1)}
            >
              <IconArrowDown size={14} />
            </button>
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => setZuEntfernen(gruppe)}
            >
              Entfernen
            </button>
          </div>
        );
      })}

      <form className="feld-gruppen__neu" onSubmit={neu}>
        <div className="field">
          <label htmlFor={`abschnitt-neu-${entity}`}>
            Neuer Abschnitt ({art})
          </label>
          <input
            id={`abschnitt-neu-${entity}`}
            required
            maxLength={80}
            value={name}
            placeholder="Vertrag"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <button
          type="submit"
          className="button button--small"
          disabled={legtAn || name.trim() === ''}
        >
          Abschnitt anlegen
        </button>
      </form>

      {zuEntfernen !== null && (
        <ConfirmDialog
          title={`Abschnitt „${zuEntfernen.name}“ entfernen?`}
          consequence="Die Felder darin bleiben mit allen Werten erhalten und stehen in der Akte danach unter „Weitere Angaben“."
          confirmLabel="Entfernen"
          onCancel={() => setZuEntfernen(null)}
          onConfirm={() => {
            void entfernen({ variables: { id: zuEntfernen.id } }).catch(fehler);
            setZuEntfernen(null);
          }}
        />
      )}
    </div>
  );
};
