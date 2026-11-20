import { useStageLabel } from '../lib/stages';
import { type DealStage } from '../lib/types';
import { useMutation, useQuery } from '@apollo/client';
import { type FormEvent, useState } from 'react';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { OptionChip } from '../components/CustomFieldWert';
import { EmptyState } from '../components/EmptyState';
import { FeldAbschnitte } from '../components/FeldAbschnitte';
import { StandardwertEingabe } from '../components/StandardwertEingabe';
import { useToast } from '../components/Toast';
import {
  ARCHIVE_CUSTOM_FIELD,
  CREATE_CUSTOM_FIELD,
  CUSTOM_FIELD_GROUPS,
  CUSTOM_FIELDS,
  FELD_FUELLGRAD,
  RESTORE_CUSTOM_FIELD,
  UPDATE_CUSTOM_FIELD,
} from '../lib/queries';
import {
  standardwertEingabeText,
  standardwertMoeglich,
  standardwertSenden,
} from '../lib/standardwert';
import { usePermissions } from '../lib/usePermissions';
import {
  CUSTOM_FIELD_ENTITY_LABELS,
  CUSTOM_FIELD_TYPE_LABELS,
  type CustomField,
  type CustomFieldGroup,
  EINDEUTIG_MOEGLICH,
  OPTION_FARBEN,
  optionFarbe,
} from '../lib/types';
import { TableWrap } from '../components/TableWrap';

const ENTITIES: CustomField['entity'][] = ['COMPANY', 'CONTACT', 'DEAL'];

const LISTED_ENTITIES: CustomField['entity'][] = [
  'COMPANY',
  'CONTACT',
  'DEAL',
  'TASK',
];

const TYPES: CustomField['type'][] = [
  'TEXT',
  'NUMBER',
  'CURRENCY',
  'DATE',
  'BOOLEAN',
  'SELECT',
  'MULTI_SELECT',
  'RATING',
  'URL',
  'LINKS',
  'EMAIL',
  'PHONE',
  'ADDRESS',
  'RELATION',
];

const VERWEIS_ZIELE: { wert: CustomField['entity']; label: string }[] = [
  { wert: 'COMPANY', label: 'Firmen' },
  { wert: 'CONTACT', label: 'Kontakte' },
  { wert: 'DEAL', label: 'Geschäfte' },
];

const MEHRZAHL: Record<CustomField['entity'], string> = {
  COMPANY: 'Firmen',
  CONTACT: 'Kontakte',
  DEAL: 'Geschäfte',
  TASK: 'Aufgaben',
};

const verknuepfungText = (
  field: CustomField,
  alle: CustomField[],
): string | null => {
  if (field.type !== 'RELATION' || field.zielEntity == null) {
    return null;
  }

  if (field.gegenseite === true) {
    const quelle = alle.find((f) => f.id === field.gegenfeldId);

    return quelle === undefined
      ? `Gegenfeld (${MEHRZAHL[field.zielEntity]})`
      : `Gegenfeld von „${quelle.label}“ (${MEHRZAHL[field.zielEntity]})`;
  }

  return `→ ${MEHRZAHL[field.zielEntity]}${field.mehrere === true ? ', mehrere' : ', eine'}`;
};

const STELLEN = ['', '0', '1', '2', '3', '4'];

const AnzeigeWahl = ({
  type,
  nachkommastellen,
  zahlformat,
  datumsformat,
  idPrefix,
  feldName,
  onChange,
}: {
  type: CustomField['type'];
  nachkommastellen: number | null;
  zahlformat: string | null;
  datumsformat: string | null;
  idPrefix: string;
  feldName?: string;
  onChange: (aenderung: {
    nachkommastellen?: number | null;
    zahlformat?: string | null;
    datumsformat?: string | null;
  }) => void;
}) => {
  const fuer = feldName === undefined ? '' : ` für ${feldName}`;

  if (type === 'NUMBER') {
    return (
      <>
        <select
          id={`${idPrefix}-zahlformat`}
          className="cell-hint"
          aria-label={`Anzeige${fuer}`}
          value={zahlformat ?? 'zahl'}
          onChange={(event) => onChange({ zahlformat: event.target.value })}
        >
          <option value="zahl">Zahl</option>
          <option value="prozent">Prozent</option>
        </select>
        <select
          id={`${idPrefix}-stellen`}
          className="cell-hint"
          aria-label={`Nachkommastellen${fuer}`}
          value={nachkommastellen === null ? '' : String(nachkommastellen)}
          onChange={(event) =>
            onChange({
              nachkommastellen:
                event.target.value === '' ? null : Number(event.target.value),
            })
          }
        >
          {STELLEN.map((stellen) => (
            <option key={stellen} value={stellen}>
              {stellen === ''
                ? 'Stellen wie eingegeben'
                : `${stellen} Nachkommastellen`}
            </option>
          ))}
        </select>
      </>
    );
  }

  if (type === 'DATE') {
    return (
      <select
        id={`${idPrefix}-datumsformat`}
        className="cell-hint"
        aria-label={`Datumsanzeige${fuer}`}
        value={datumsformat ?? 'absolut'}
        onChange={(event) => onChange({ datumsformat: event.target.value })}
      >
        <option value="absolut">als Tag (12.03.2026)</option>
        <option value="relativ">relativ (in 3 Tagen)</option>
      </select>
    );
  }

  return null;
};

const MIT_MOEGLICHKEITEN: CustomField['type'][] = ['SELECT', 'MULTI_SELECT'];

const WAEHRUNGEN = ['EUR', 'CHF', 'USD', 'GBP', 'PLN', 'CZK', 'SEK', 'DKK'];

const splitOptions = (text: string): string[] =>
  text
    .split('\n')
    .map((option) => option.trim())
    .filter((option) => option !== '');

const FarbWahl = ({
  option,
  farbe,
  onChange,
}: {
  option: string;
  farbe: string;
  onChange: (farbe: string) => void;
}) => (
  <label className="farb-wahl">
    <span className={`option-chip option-chip--${farbe}`}>{option}</span>
    <select
      aria-label={`Farbe für ${option}`}
      value={farbe}
      onChange={(event) => onChange(event.target.value)}
    >
      {OPTION_FARBEN.map((entry) => (
        <option key={entry.wert} value={entry.wert}>
          {entry.label}
        </option>
      ))}
    </select>
  </label>
);

const KAUM_GENUTZT = 0.1;

const Fuellgrad = ({ field }: { field: CustomField }) => {
  const darf = usePermissions().can('workspace:fields');
  const { data } = useQuery<{
    feldFuellgrad: { key: string; gefuellt: number; gesamt: number }[];
  }>(FELD_FUELLGRAD, { variables: { entity: field.entity }, skip: !darf });
  const eintrag = data?.feldFuellgrad.find((f) => f.key === field.key);

  if (eintrag === undefined || eintrag.gesamt < 10) {
    return null;
  }

  const anteil = eintrag.gefuellt / eintrag.gesamt;

  if (anteil >= KAUM_GENUTZT) {
    return null;
  }

  return (
    <span
      className="feld-kaum-genutzt"
      title="Kaum genutzte Felder machen die Akte lang. Archivieren behält alle Werte."
    >
      Kaum genutzt: in {eintrag.gefuellt} von {eintrag.gesamt} Datensätzen
      gefüllt
    </span>
  );
};

const PFLICHT_PHASEN: DealStage[] = [
  'QUALIFIED',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
];

export const CustomFieldsPage = () => {
  const stageLabel = useStageLabel();
  const { data, loading, error } = useQuery<{ customFields: CustomField[] }>(
    CUSTOM_FIELDS,
  );
  const { data: gruppenDaten } = useQuery<{
    customFieldGroups: CustomFieldGroup[];
  }>(CUSTOM_FIELD_GROUPS);
  const gruppen = gruppenDaten?.customFieldGroups ?? [];
  const gruppenFuer = (art: CustomField['entity']) =>
    gruppen
      .filter((gruppe) => gruppe.entity === art)
      .sort((a, b) => a.position - b.position);

  const refetchQueries = [CUSTOM_FIELDS];

  const [createField, { loading: creating, error: createError }] = useMutation(
    CREATE_CUSTOM_FIELD,
    { refetchQueries },
  );
  const [updateField, { error: updateError }] = useMutation(
    UPDATE_CUSTOM_FIELD,
    { refetchQueries },
  );
  const [archiveField] = useMutation(ARCHIVE_CUSTOM_FIELD, { refetchQueries });
  const [restoreField] = useMutation(RESTORE_CUSTOM_FIELD, { refetchQueries });
  const toast = useToast();
  const fehlerZeigen = (fehler: Error) => toast.zeige({ text: fehler.message });

  const [entity, setEntity] = useState<CustomField['entity']>('COMPANY');
  const [label, setLabel] = useState('');
  const [type, setType] = useState<CustomField['type']>('TEXT');
  const [options, setOptions] = useState('');
  const [required, setRequired] = useState(false);
  const [farben, setFarben] = useState<Record<string, string>>({});
  const [waehrung, setWaehrung] = useState('EUR');
  const [eindeutig, setEindeutig] = useState(false);
  const [anzeige, setAnzeige] = useState<{
    nachkommastellen?: number | null;
    zahlformat?: string | null;
    datumsformat?: string | null;
  }>({});
  const [beschreibung, setBeschreibung] = useState('');
  const [standardwert, setStandardwert] = useState('');
  const [gruppeId, setGruppeId] = useState('');
  const [zielEntity, setZielEntity] =
    useState<CustomField['entity']>('COMPANY');
  const [mehrere, setMehrere] = useState(false);
  const [gegenfeldLabel, setGegenfeldLabel] = useState('');
  const [toArchive, setToArchive] = useState<CustomField | null>(null);
  const verknuepfung = type === 'RELATION';

  const fields = data?.customFields ?? [];

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();

    const standard = standardwertMoeglich({ type, eindeutig })
      ? standardwertSenden(type, standardwert)
      : '';

    if (standard === undefined) {
      toast.zeige({ text: 'Der Standardwert ist keine Zahl.' });

      return;
    }

    const result = await createField({
      variables: {
        input: {
          entity,
          label: label.trim(),
          type,
          required: verknuepfung ? false : required,
          ...(verknuepfung
            ? {
                zielEntity,
                mehrere,
                ...(gegenfeldLabel.trim() === ''
                  ? {}
                  : { gegenfeldLabel: gegenfeldLabel.trim() }),
              }
            : {}),
          ...(MIT_MOEGLICHKEITEN.includes(type)
            ? {
                options: splitOptions(options),
                farben: splitOptions(options).map((option) => ({
                  option,
                  farbe: farben[option] ?? 'grau',
                })),
              }
            : {}),
          ...(type === 'CURRENCY' ? { waehrung } : {}),
          ...(EINDEUTIG_MOEGLICH.includes(type) ? { eindeutig } : {}),
          ...(type === 'NUMBER'
            ? {
                nachkommastellen: anzeige.nachkommastellen ?? null,
                zahlformat: anzeige.zahlformat ?? null,
              }
            : {}),
          ...(type === 'DATE'
            ? { datumsformat: anzeige.datumsformat ?? null }
            : {}),
          ...(beschreibung.trim() === ''
            ? {}
            : { beschreibung: beschreibung.trim() }),
          ...(standard === '' ? {} : { standardwert: standard }),
          ...(gruppeId === '' ? {} : { gruppeId }),
        },
      },
    }).catch(() => null);

    if (result?.data !== undefined && result.data !== null) {
      setLabel('');
      setOptions('');
      setRequired(false);
      setFarben({});
      setEindeutig(false);
      setAnzeige({});
      setBeschreibung('');
      setStandardwert('');
      setMehrere(false);
      setGegenfeldLabel('');
    }
  };

  const aendern = (input: Record<string, unknown>) =>
    void updateField({ variables: { input } }).catch(() => null);

  const saveStandardwert = (field: CustomField, roh: string) => {
    const text = standardwertSenden(field.type, roh);

    if (text === undefined) {
      toast.zeige({ text: 'Der Standardwert ist keine Zahl.' });

      return;
    }

    if (text !== (field.standardwert ?? '')) {
      aendern({ id: field.id, standardwert: text });
    }
  };

  const saveFarbe = (field: CustomField, option: string, farbe: string) =>
    void updateField({
      variables: {
        input: {
          id: field.id,
          farben: field.options.map((entry) => ({
            option: entry,
            farbe: entry === option ? farbe : optionFarbe(field, entry),
          })),
        },
      },
    });

  return (
    <>
      <div className="page__header">
        <div>
          <h1>Eigene Felder</h1>
          <p className="page__subtitle">
            Felder, die es nur in Ihrem Arbeitsbereich gibt — eine Kundennummer,
            eine Region, ein Vertragsende.
          </p>
        </div>
      </div>

      {(createError ?? updateError) !== undefined && (
        <div className="error-banner">
          {(createError ?? updateError)?.message}
        </div>
      )}

      <section className="detail-section">
        <h2>Neues Feld</h2>

        <form className="card field-form" onSubmit={handleCreate}>
          <div className="field">
            <label htmlFor="entity">Gehört zu</label>
            <select
              id="entity"
              value={entity}
              onChange={(event) => {
                setEntity(event.target.value as CustomField['entity']);
                setGruppeId('');
              }}
            >
              {ENTITIES.map((value) => (
                <option key={value} value={value}>
                  {CUSTOM_FIELD_ENTITY_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="label">Name</label>
            <input
              id="label"
              required
              maxLength={100}
              value={label}
              placeholder="Kundennummer"
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="type">Art</label>
            <select
              id="type"
              value={type}
              onChange={(event) => {
                setType(event.target.value as CustomField['type']);
                setStandardwert('');
              }}
            >
              {TYPES.map((value) => (
                <option key={value} value={value}>
                  {CUSTOM_FIELD_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          {MIT_MOEGLICHKEITEN.includes(type) && (
            <div className="field field--wide">
              <label htmlFor="options">Optionen, eine pro Zeile</label>
              <textarea
                id="options"
                rows={4}
                value={options}
                placeholder={'Nord\nSüd\nWest\nOst'}
                onChange={(event) => setOptions(event.target.value)}
              />
              {splitOptions(options).length > 0 && (
                <div className="farb-wahlen" aria-label="Farben">
                  {splitOptions(options).map((option) => (
                    <FarbWahl
                      key={option}
                      option={option}
                      farbe={farben[option] ?? 'grau'}
                      onChange={(farbe) =>
                        setFarben({ ...farben, [option]: farbe })
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {verknuepfung && (
            <>
              <div className="field">
                <label htmlFor="ziel">Verweist auf</label>
                <select
                  id="ziel"
                  value={zielEntity}
                  onChange={(event) =>
                    setZielEntity(event.target.value as CustomField['entity'])
                  }
                >
                  {VERWEIS_ZIELE.map((ziel) => (
                    <option key={ziel.wert} value={ziel.wert}>
                      {ziel.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field field--wide">
                <label htmlFor="gegenfeld">Name des Gegenfelds</label>
                <input
                  id="gegenfeld"
                  maxLength={100}
                  value={gegenfeldLabel}
                  placeholder={`${MEHRZAHL[entity]} (${label.trim() || 'Feldname'})`}
                  aria-describedby="gegenfeld-hilfe"
                  onChange={(event) => setGegenfeldLabel(event.target.value)}
                />
                <span id="gegenfeld-hilfe" className="field__hint">
                  Entsteht in der Akte der {MEHRZAHL[zielEntity]} und zeigt alle{' '}
                  {MEHRZAHL[entity]}, die über dieses Feld dorthin verweisen.
                  Leer: der Vorschlag im Feld.
                </span>
              </div>
              <div className="field field--inline">
                <label htmlFor="mehrere">
                  <input
                    id="mehrere"
                    type="checkbox"
                    checked={mehrere}
                    onChange={(event) => setMehrere(event.target.checked)}
                  />
                  Mehrere Datensätze erlauben
                </label>
              </div>
            </>
          )}

          {type === 'CURRENCY' && (
            <div className="field">
              <label htmlFor="waehrung">Währung</label>
              <select
                id="waehrung"
                value={waehrung}
                onChange={(event) => setWaehrung(event.target.value)}
              >
                {WAEHRUNGEN.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(type === 'NUMBER' || type === 'DATE') && (
            <div className="field">
              <label
                htmlFor={
                  type === 'NUMBER' ? 'neu-zahlformat' : 'neu-datumsformat'
                }
              >
                Anzeige
              </label>
              <span className="anzeige-wahl">
                <AnzeigeWahl
                  type={type}
                  idPrefix="neu"
                  nachkommastellen={anzeige.nachkommastellen ?? null}
                  zahlformat={anzeige.zahlformat ?? null}
                  datumsformat={anzeige.datumsformat ?? null}
                  onChange={(aenderung) =>
                    setAnzeige({ ...anzeige, ...aenderung })
                  }
                />
              </span>
            </div>
          )}

          <div className="field field--wide">
            <label htmlFor="beschreibung">Hinweis für Ihr Team</label>
            <input
              id="beschreibung"
              maxLength={300}
              value={beschreibung}
              placeholder="Kundennummer aus DATEV übernehmen"
              aria-describedby="beschreibung-hilfe"
              onChange={(event) => setBeschreibung(event.target.value)}
            />
            <span id="beschreibung-hilfe" className="field__hint">
              Steht in der Akte als kleines i neben dem Feld.
            </span>
          </div>

          {standardwertMoeglich({ type, eindeutig }) &&
            (!MIT_MOEGLICHKEITEN.includes(type) ||
              splitOptions(options).length > 0) && (
              <div className="field">
                <label htmlFor="standardwert">Standardwert</label>
                <StandardwertEingabe
                  id="standardwert"
                  type={type}
                  options={splitOptions(options)}
                  wert={standardwert}
                  sofort
                  onChange={setStandardwert}
                />
              </div>
            )}

          {gruppenFuer(entity).length > 0 && (
            <div className="field">
              <label htmlFor="gruppe">Abschnitt</label>
              <select
                id="gruppe"
                value={gruppeId}
                onChange={(event) => setGruppeId(event.target.value)}
              >
                <option value="">Weitere Angaben</option>
                {gruppenFuer(entity).map((gruppe) => (
                  <option key={gruppe.id} value={gruppe.id}>
                    {gruppe.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!verknuepfung && (
            <div className="field field--inline">
              <label htmlFor="required">
                <input
                  id="required"
                  type="checkbox"
                  checked={required}
                  onChange={(event) => setRequired(event.target.checked)}
                />
                Pflichtfeld
              </label>
            </div>
          )}

          {EINDEUTIG_MOEGLICH.includes(type) && (
            <div className="field field--inline">
              <label htmlFor="eindeutig">
                <input
                  id="eindeutig"
                  type="checkbox"
                  checked={eindeutig}
                  onChange={(event) => {
                    setEindeutig(event.target.checked);

                    if (event.target.checked) {
                      setStandardwert('');
                    }
                  }}
                />
                Eindeutig (kein Wert doppelt)
              </label>
            </div>
          )}

          <button className="button" type="submit" disabled={creating}>
            {creating ? 'Wird angelegt …' : 'Feld anlegen'}
          </button>
        </form>
      </section>

      {error !== undefined && (
        <div className="error-banner">{error.message}</div>
      )}

      {!loading && fields.length === 0 && (
        <EmptyState
          title="Noch keine eigenen Felder"
          description="Legen Sie oben eines an. Es erscheint dann auf jedem Datensatz der gewählten Art."
        />
      )}

      {LISTED_ENTITIES.filter((value) =>
        fields.some((field) => field.entity === value),
      ).map((value) => (
        <section className="detail-section" key={value}>
          <h2>{CUSTOM_FIELD_ENTITY_LABELS[value]}</h2>

          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Art</th>
                  <th>Pflicht</th>
                  <th>Eindeutig</th>
                  <th>Standardwert</th>
                  <th>Abschnitt</th>
                  <th>Schlüssel</th>
                  <th>
                    <span className="visually-hidden">Aktionen</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {fields
                  .filter((field) => field.entity === value)
                  .map((field) => (
                    <tr
                      key={field.id}
                      className={
                        field.archivedAt === null ? undefined : 'row--muted'
                      }
                    >
                      <td>
                        <input
                          className="cell-input"
                          aria-label={`Bezeichnung von ${field.label}`}
                          defaultValue={field.label}
                          maxLength={100}
                          onBlur={(event) => {
                            const next = event.target.value.trim();

                            if (next === '' || next === field.label) {
                              event.target.value = field.label;

                              return;
                            }

                            void updateField({
                              variables: {
                                input: { id: field.id, label: next },
                              },
                            });
                          }}
                        />
                        <input
                          className="cell-input cell-hint"
                          aria-label={`Hinweis zu ${field.label}`}
                          placeholder="Hinweis für Ihr Team"
                          defaultValue={field.beschreibung ?? ''}
                          maxLength={300}
                          disabled={field.archivedAt !== null}
                          onBlur={(event) => {
                            const next = event.target.value.trim();

                            if (next !== (field.beschreibung ?? '')) {
                              aendern({ id: field.id, beschreibung: next });
                            }
                          }}
                        />
                        {field.archivedAt === null &&
                          field.gegenseite !== true && (
                            <Fuellgrad field={field} />
                          )}
                      </td>
                      <td>
                        {CUSTOM_FIELD_TYPE_LABELS[field.type]}
                        {field.type === 'RELATION' && (
                          <span className="cell-hint">
                            {' '}
                            {verknuepfungText(field, fields)}
                          </span>
                        )}
                        {field.type === 'CURRENCY' && (
                          <select
                            className="cell-hint"
                            aria-label={`Währung für ${field.label}`}
                            value={field.waehrung ?? 'EUR'}
                            onChange={(event) =>
                              void updateField({
                                variables: {
                                  input: {
                                    id: field.id,
                                    waehrung: event.target.value,
                                  },
                                },
                              })
                            }
                          >
                            {[
                              ...new Set([
                                field.waehrung ?? 'EUR',
                                ...WAEHRUNGEN,
                              ]),
                            ].map((code) => (
                              <option key={code} value={code}>
                                {code}
                              </option>
                            ))}
                          </select>
                        )}
                        {(field.type === 'NUMBER' || field.type === 'DATE') &&
                          field.archivedAt === null && (
                            <AnzeigeWahl
                              type={field.type}
                              idPrefix={field.id}
                              feldName={field.label}
                              nachkommastellen={field.nachkommastellen ?? null}
                              zahlformat={field.zahlformat ?? null}
                              datumsformat={field.datumsformat ?? null}
                              onChange={(aenderung) =>
                                void updateField({
                                  variables: {
                                    input: { id: field.id, ...aenderung },
                                  },
                                })
                              }
                            />
                          )}
                        {MIT_MOEGLICHKEITEN.includes(field.type) &&
                          (field.archivedAt === null ? (
                            <span className="farb-wahlen">
                              {field.options.map((option) => (
                                <FarbWahl
                                  key={option}
                                  option={option}
                                  farbe={optionFarbe(field, option)}
                                  onChange={(farbe) =>
                                    saveFarbe(field, option, farbe)
                                  }
                                />
                              ))}
                            </span>
                          ) : (
                            <span className="option-chips cell-hint">
                              {field.options.map((option) => (
                                <OptionChip
                                  key={option}
                                  field={field}
                                  option={option}
                                />
                              ))}
                            </span>
                          ))}
                      </td>
                      <td>
                        {field.type === 'RELATION' ? (
                          field.gegenseite !== true &&
                          field.entity === 'DEAL' ? null : (
                            '—'
                          )
                        ) : (
                          <input
                            type="checkbox"
                            aria-label={`${field.label} ist Pflicht`}
                            checked={field.required}
                            onChange={(event) =>
                              void updateField({
                                variables: {
                                  input: {
                                    id: field.id,
                                    required: event.target.checked,
                                  },
                                },
                              })
                            }
                          />
                        )}
                        {field.entity === 'DEAL' &&
                          !field.required &&
                          field.gegenseite !== true && (
                            <select
                              className="cell-hint"
                              aria-label={`${field.label} Pflicht ab Phase`}
                              value={field.pflichtAbPhase ?? ''}
                              onChange={(event) =>
                                void updateField({
                                  variables: {
                                    input: {
                                      id: field.id,
                                      pflichtAbPhase: event.target.value,
                                    },
                                  },
                                }).catch(() => null)
                              }
                            >
                              <option value="">nie</option>
                              {PFLICHT_PHASEN.map((phase) => (
                                <option key={phase} value={phase.toLowerCase()}>
                                  ab {stageLabel(phase)}
                                </option>
                              ))}
                            </select>
                          )}
                      </td>
                      <td>
                        {EINDEUTIG_MOEGLICH.includes(field.type) ? (
                          <input
                            type="checkbox"
                            aria-label={`${field.label} eindeutig`}
                            checked={field.eindeutig}
                            onChange={(event) =>
                              void updateField({
                                variables: {
                                  input: {
                                    id: field.id,
                                    eindeutig: event.target.checked,
                                  },
                                },
                              }).catch(() => null)
                            }
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {field.archivedAt === null &&
                        standardwertMoeglich(field) ? (
                          <StandardwertEingabe
                            id={`standardwert-${field.id}`}
                            type={field.type}
                            options={field.options}
                            wert={standardwertEingabeText(field)}
                            ariaLabel={`Standardwert für ${field.label}`}
                            onChange={(roh) => saveStandardwert(field, roh)}
                          />
                        ) : (
                          <span
                            title={
                              field.eindeutig
                                ? 'Ein eindeutiges Feld hat keinen Standardwert.'
                                : undefined
                            }
                          >
                            —
                          </span>
                        )}
                      </td>
                      <td>
                        {gruppenFuer(field.entity).length > 0 &&
                        field.archivedAt === null ? (
                          <select
                            className="cell-hint"
                            aria-label={`Abschnitt für ${field.label}`}
                            value={field.gruppeId ?? ''}
                            onChange={(event) =>
                              aendern({
                                id: field.id,
                                gruppeId:
                                  event.target.value === ''
                                    ? null
                                    : event.target.value,
                              })
                            }
                          >
                            <option value="">Weitere Angaben</option>
                            {gruppenFuer(field.entity).map((gruppe) => (
                              <option key={gruppe.id} value={gruppe.id}>
                                {gruppe.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          (gruppen.find((g) => g.id === field.gruppeId)?.name ??
                          '—')
                        )}
                      </td>
                      <td>
                        <code className="cell-code">{field.key}</code>
                      </td>
                      <td className="numeric">
                        {field.archivedAt === null ? (
                          <button
                            type="button"
                            className="button button--ghost button--small"
                            onClick={() => setToArchive(field)}
                          >
                            Archivieren
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="button button--ghost button--small"
                            onClick={() =>
                              void restoreField({
                                variables: { id: field.id },
                              }).catch(fehlerZeigen)
                            }
                          >
                            Wiederherstellen
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </TableWrap>
        </section>
      ))}

      <section className="detail-section">
        <h2>Abschnitte in der Akte</h2>
        <p className="page__subtitle">
          Fassen Sie eigene Felder unter Überschriften wie „Vertrag“ oder
          „Technik“ zusammen. In der Akte lässt sich jeder Abschnitt zuklappen;
          Felder ohne Abschnitt stehen unter „Weitere Angaben“.
        </p>
        {ENTITIES.map((art) => (
          <div key={art} className="card feld-abschnitte-art">
            <h3>{CUSTOM_FIELD_ENTITY_LABELS[art]}</h3>
            <FeldAbschnitte entity={art} gruppen={gruppen} felder={fields} />
          </div>
        ))}
      </section>

      {toArchive !== null && (
        <ConfirmDialog
          title={`"${toArchive.label}" archivieren?`}
          consequence={
            toArchive.type === 'RELATION'
              ? 'Die Verknüpfung und ihr Gegenfeld verschwinden aus allen Akten. Die Verweise bleiben gespeichert — Sie können beides jederzeit wiederherstellen.'
              : 'Das Feld verschwindet aus allen Formularen. Bereits erfasste Werte bleiben erhalten und stehen weiterhin im Datenexport — Sie können das Feld jederzeit wiederherstellen.'
          }
          confirmLabel="Archivieren"
          onCancel={() => setToArchive(null)}
          onConfirm={() => {
            void archiveField({ variables: { id: toArchive.id } }).catch(
              fehlerZeigen,
            );
            setToArchive(null);
          }}
        />
      )}
    </>
  );
};
