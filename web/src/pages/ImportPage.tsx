import { ordneSpaltenZu } from '../lib/spaltenZuordnung';
import { useMutation, useQuery } from '@apollo/client';
import { type ChangeEvent, useState } from 'react';

import { IMPORTABLE_FIELDS, IMPORT_RECORDS, INSPECT_CSV } from '../lib/queries';
import {
  IMPORT_ENTITIES,
  IMPORT_ENTITY_LABELS,
  type ImportableField,
  type ImportEntity,
  type ImportReport,
} from '../lib/types';
import { XlsxFehler, xlsxZuCsv } from '../lib/xlsx';
import { beispielCsv, csvText } from '../lib/zeichensatz';
import { TableWrap } from '../components/TableWrap';
import { AbhilfeLink } from '../components/AbhilfeLink';
import { IconArrowRight } from '../components/Icons';

type Inspection = {
  columns: string[];
  rowCount: number;
  sampleRow: string[];
  kopfzeile: number;
  vorschau: string[][];
  spaltenWerte: { spalte: string; werte: string[]; mehr: boolean }[];
};

const vermuteWert = (
  wert: string,
  optionen: { wert: string; label: string }[],
): string => {
  const klein = wert.trim().toLowerCase();

  return (
    optionen.find(
      (option) =>
        option.wert.toLowerCase() === klein ||
        option.label.toLowerCase() === klein,
    )?.wert ?? ''
  );
};

const WerteZuordnung = ({
  spalte,
  optionen,
  zeilen,
  onChange,
}: {
  spalte: string;
  optionen: { wert: string; label: string }[];
  zeilen: { von: string; nach: string }[];
  onChange: (von: string, nach: string) => void;
}) =>
  optionen.length === 0 || zeilen.length === 0 ? null : (
    <details className="werte-zuordnung" open>
      <summary>
        Werte zuordnen ({zeilen.filter((zeile) => zeile.nach !== '').length} von{' '}
        {zeilen.length})
      </summary>
      <ul>
        {zeilen.map(({ von, nach }) => (
          <li key={von}>
            <span className="werte-zuordnung__von">{von}</span>
            <IconArrowRight size={14} />
            <select
              aria-label={`${spalte}: Wert „${von}“ zuordnen`}
              value={nach}
              onChange={(event) => onChange(von, event.target.value)}
            >
              <option value="">— leer lassen —</option>
              {optionen.map((option) => (
                <option key={option.wert} value={option.wert}>
                  {option.label}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </details>
  );

export const ImportPage = () => {
  const [entity, setEntity] = useState<ImportEntity>('COMPANY');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [report, setReport] = useState<ImportReport | null>(null);
  const [dateiFehler, setDateiFehler] = useState<string | null>(null);
  const [werte, setWerte] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [korrekturen, setKorrekturen] = useState<Record<number, string[]>>({});

  const { data: fieldData } = useQuery<{ importableFields: ImportableField[] }>(
    IMPORTABLE_FIELDS,
    {
      variables: { entity },
      fetchPolicy: 'cache-and-network',
    },
  );
  const fields = fieldData?.importableFields ?? [];

  const [inspectCsv, { loading: inspecting, error: inspectError }] =
    useMutation<{ inspectCsv: Inspection }>(INSPECT_CSV);
  const [importRecords, { loading: importing, error: importError }] =
    useMutation<{ importRecords: ImportReport }>(IMPORT_RECORDS);

  const resetDownstream = () => {
    setInspection(null);
    setMapping({});
    setReport(null);
    setWerte({});
    setKorrekturen({});
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file === undefined) {
      return;
    }

    setDateiFehler(null);

    if (/\.xlsx$/iu.test(file.name)) {
      void file
        .arrayBuffer()
        .then(xlsxZuCsv)
        .then((text) => {
          setCsv(text);
          setFileName(file.name);
          resetDownstream();
        })
        .catch((fehler: unknown) => {
          setDateiFehler(
            fehler instanceof XlsxFehler
              ? fehler.message
              : 'Die Excel-Datei ließ sich nicht lesen. Speichern Sie sie bitte als CSV und versuchen Sie es damit.',
          );
          event.target.value = '';
        });

      return;
    }

    if (/\.xls$/iu.test(file.name)) {
      setDateiFehler(
        'Das alte Excel-Format (.xls) wird nicht gelesen. Speichern Sie die Datei bitte als .xlsx oder CSV.',
      );
      event.target.value = '';

      return;
    }

    void file.arrayBuffer().then((inhalt) => {
      setCsv(csvText(inhalt));
      setFileName(file.name);
      resetDownstream();
    });
  };

  const handleInspect = async (kopfzeile = 0) => {
    const result = await inspectCsv({
      variables: { input: { csv, kopfzeile } },
    }).catch(() => null);

    const found = result?.data?.inspectCsv;

    if (found === undefined) {
      return;
    }

    setInspection(found);
    setReport(null);
    setWerte({});
    setKorrekturen({});
    setMapping(ordneSpaltenZu(found.columns, fields));
  };

  const wertZuordnung = (column: string) => {
    const optionen =
      fields.find((field) => field.name === mapping[column])?.optionen ?? [];
    const ausDatei =
      inspection?.spaltenWerte.find((eintrag) => eintrag.spalte === column)
        ?.werte ?? [];

    return {
      optionen,
      zeilen: ausDatei.map((wert) => ({
        von: wert,
        nach: werte[column]?.[wert] ?? vermuteWert(wert, optionen),
      })),
    };
  };

  const run = async (dryRun: boolean) => {
    const pairs = Object.entries(mapping)
      .filter(([, field]) => field !== '')
      .map(([column, field]) => {
        const { optionen, zeilen } = wertZuordnung(column);

        return optionen.length === 0
          ? { column, field }
          : { column, field, werte: zeilen };
      });

    const result = await importRecords({
      variables: {
        input: {
          entity,
          csv,
          mapping: pairs,
          dryRun,
          kopfzeile: inspection?.kopfzeile ?? 0,
          korrekturen: Object.entries(korrekturen).map(([zeile, zellen]) => ({
            zeile: Number(zeile),
            zellen,
          })),
        },
      },
    }).catch(() => null);

    if (result?.data?.importRecords !== undefined) {
      setReport(result.data.importRecords);

      if (!dryRun) {
        setKorrekturen({});
      }
    }
  };

  const mappedCount = Object.values(mapping).filter((f) => f !== '').length;
  const error = inspectError ?? importError;

  return (
    <>
      <div className="page__header">
        <div>
          <h1>Import</h1>
          <p className="page__subtitle">
            CSV- oder Excel-Datei einlesen, Spalten zuordnen, Vorschau prüfen,
            übernehmen.
          </p>
        </div>
      </div>

      {error !== undefined && (
        <div className="error-banner">{error.message}</div>
      )}

      {dateiFehler !== null && (
        <div className="error-banner" role="alert">
          {dateiFehler}
          <AbhilfeLink id="import" />
        </div>
      )}

      <div className="card import-step">
        <div className="import-step__title">1 · Daten wählen</div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="import-entity">Ziel</label>
            <select
              id="import-entity"
              value={entity}
              onChange={(event) => {
                setEntity(event.target.value as ImportEntity);
                resetDownstream();
              }}
            >
              {IMPORT_ENTITIES.map((value) => (
                <option key={value} value={value}>
                  {IMPORT_ENTITY_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="import-file">CSV- oder Excel-Datei</label>
            <input
              id="import-file"
              type="file"
              accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFile}
            />
            {fields.length > 0 && (
              <p className="field__hint">
                Nicht sicher, wie die Datei aussehen soll?{' '}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob([beispielCsv(fields)], {
                        type: 'text/csv;charset=utf-8',
                      }),
                    );
                    const link = document.createElement('a');

                    link.href = url;
                    link.download = `Beispiel-Import-${entity.toLowerCase()}.csv`;
                    link.click();
                    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  Beispieldatei herunterladen
                </button>
              </p>
            )}
          </div>
        </div>

        <textarea
          className="import-textarea"
          aria-label="Inhalt der Datei einfügen"
          rows={6}
          placeholder="…oder Inhalt hier einfügen"
          value={csv}
          onChange={(event) => {
            setCsv(event.target.value);
            setFileName(null);
            resetDownstream();
          }}
        />

        <div className="import-step__actions">
          {fileName !== null && (
            <span className="import-file-name">{fileName}</span>
          )}
          <button
            className="button"
            type="button"
            disabled={csv.trim() === '' || inspecting}
            onClick={() => void handleInspect(0)}
          >
            Spalten einlesen
          </button>
        </div>
      </div>

      {inspection !== null && (
        <div className="card import-step">
          <div className="import-step__title">
            2 · Spalten zuordnen — {inspection.rowCount}{' '}
            {inspection.rowCount === 1 ? 'Zeile' : 'Zeilen'} erkannt
          </div>

          {inspection.vorschau.length > 1 && (
            <div className="field import-kopfzeile">
              <label htmlFor="import-kopfzeile">
                Welche Zeile enthält die Spaltennamen?
              </label>
              <select
                id="import-kopfzeile"
                value={inspection.kopfzeile}
                onChange={(event) =>
                  void handleInspect(Number(event.target.value))
                }
              >
                {inspection.vorschau.map((zeile, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <option key={index} value={index}>
                    Zeile {index + 1}:{' '}
                    {zeile
                      .filter((zelle) => zelle !== '')
                      .join(' · ')
                      .slice(0, 80) || '(leer)'}
                  </option>
                ))}
              </select>
            </div>
          )}

          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Spalte</th>
                  <th>Beispielwert</th>
                  <th>Feld</th>
                </tr>
              </thead>
              <tbody>
                {inspection.columns.map((column, index) => (
                  <tr key={column}>
                    <td>{column}</td>
                    <td className="import-sample">
                      {inspection.sampleRow[index] || '—'}
                    </td>
                    <td>
                      <select
                        aria-label={`Feld für ${column}`}
                        value={mapping[column] ?? ''}
                        onChange={(event) =>
                          setMapping({
                            ...mapping,
                            [column]: event.target.value,
                          })
                        }
                      >
                        <option value="">— nicht importieren —</option>
                        {fields.map((field) => (
                          <option key={field.name} value={field.name}>
                            {field.label}
                            {field.required ? ' *' : ''}
                          </option>
                        ))}
                      </select>
                      <WerteZuordnung
                        spalte={column}
                        {...wertZuordnung(column)}
                        onChange={(von, nach) =>
                          setWerte({
                            ...werte,
                            [column]: { ...werte[column], [von]: nach },
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>

          <div className="import-step__actions">
            <span className="pagination__summary">
              {mappedCount} von {inspection.columns.length} Spalten zugeordnet
            </span>
            <button
              className="button button--ghost"
              type="button"
              disabled={mappedCount === 0 || importing}
              onClick={() => void run(true)}
            >
              Vorschau
            </button>
          </div>
        </div>
      )}

      {report !== null && (
        <div className="card import-step">
          <div className="import-step__title">
            3 · {report.dryRun ? 'Vorschau' : 'Ergebnis'}
          </div>

          <div className="metrics">
            <div className="card metric">
              <div className="metric__label">Neu</div>
              <div className="metric__value">{report.created}</div>
            </div>
            <div className="card metric">
              <div className="metric__label">Aktualisiert</div>
              <div className="metric__value">{report.updated}</div>
            </div>
            <div
              className={
                report.rejected > 0 ? 'card metric is-alarming' : 'card metric'
              }
            >
              <div className="metric__label">Abgelehnt</div>
              <div className="metric__value">{report.rejected}</div>
            </div>
          </div>

          {report.rejections.length > 0 && inspection !== null && (
            <>
              <p className="field__hint">
                Abgelehnte Zeilen lassen sich hier korrigieren und erneut
                prüfen; die Datei selbst bleibt, wie sie ist.
              </p>
              <TableWrap label="Abgelehnte Zeilen">
                <table className="import-korrektur">
                  <thead>
                    <tr>
                      <th>Zeile</th>
                      <th>Grund</th>
                      {inspection.columns.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rejections.map((rejection) => {
                      const zellen =
                        korrekturen[rejection.row] ?? rejection.zellen;

                      return (
                        <tr key={rejection.row}>
                          <td className="numeric">{rejection.row}</td>
                          <td>{rejection.reason}</td>
                          {inspection.columns.map((column, index) => (
                            <td key={column}>
                              <input
                                aria-label={`Zeile ${rejection.row}, ${column}`}
                                value={zellen[index] ?? ''}
                                onChange={(event) =>
                                  setKorrekturen({
                                    ...korrekturen,
                                    [rejection.row]: inspection.columns.map(
                                      (_, i) =>
                                        i === index
                                          ? event.target.value
                                          : (zellen[i] ?? ''),
                                    ),
                                  })
                                }
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
              {report.dryRun && Object.keys(korrekturen).length > 0 && (
                <div className="import-step__actions">
                  <button
                    className="button button--ghost"
                    type="button"
                    disabled={importing}
                    onClick={() => void run(true)}
                  >
                    Korrigierte Zeilen erneut prüfen
                  </button>
                </div>
              )}
            </>
          )}

          {report.dryRun ? (
            <div className="import-step__actions">
              <span className="pagination__summary">
                Nichts wurde gespeichert. Abgelehnte Zeilen werden übersprungen.
              </span>
              <button
                className="button"
                type="button"
                disabled={importing || report.created + report.updated === 0}
                onClick={() => void run(false)}
              >
                Übernehmen
              </button>
            </div>
          ) : (
            <div className="import-step__actions">
              <span className="pagination__summary">Import abgeschlossen.</span>
            </div>
          )}
        </div>
      )}
    </>
  );
};
