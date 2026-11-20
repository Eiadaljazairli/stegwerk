import { type StoreObject, useApolloClient } from '@apollo/client';
import { type DocumentNode } from 'graphql';
import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import { merkeReihenfolge } from '../lib/blaettern';
import {
  aktuelleAngeheftete,
  anheften,
  mitAngehefteten,
} from '../lib/neueZeilen';
import {
  ausSchluessel,
  FOKUSSIERBAR,
  innerhalb,
  naechsteZelle,
  type Zelle,
  zellenSchluessel,
} from '../lib/tabellen-navigation';
import { type EingabeTyp } from '../lib/inlineWert';
import { type CustomField, type CustomFieldValues } from '../lib/types';
import { type ListControls } from '../lib/useListControls';
import { type ColumnChoice } from './ColumnPicker';
import { customFieldAnzeige } from './CustomFieldWert';
import { InlineEingabe, useInlineEntwurf } from './InlineWert';
import { type Auswahl } from './Sammelleiste';
import { SortableHeader } from './ListControls';
import { TableWrap } from './TableWrap';

export type ListColumn<Row> = {
  key: string;
  label: string;
  sortField?: string;
  numeric?: boolean;
  render: (row: Row) => ReactNode;
  edit?: {
    feld: string;
    typ?: EingabeTyp;
    wert: (row: Row) => string | number | null;
  };
  summe?: ReactNode;
};

export { type EingabeTyp, wertAusEingabe } from '../lib/inlineWert';

const BearbeitbareZelle = ({
  label,
  typ,
  ausgang,
  numeric,
  onSpeichern,
  zelle,
  tabIndex,
  children,
}: {
  label: string;
  typ: EingabeTyp;
  ausgang: string | number | null;
  numeric?: boolean;
  onSpeichern: (wert: string | number | null) => Promise<unknown>;
  zelle: string;
  tabIndex: number;
  children: ReactNode;
}) => {
  const entwurf = useInlineEntwurf({ typ, ausgang, onSpeichern });
  const zellRef = useRef<HTMLTableCellElement>(null);
  const zurueck = useRef(false);
  const bearbeitet = entwurf.bearbeitet;

  useEffect(() => {
    if (!bearbeitet && zurueck.current) {
      zurueck.current = false;
      zellRef.current?.focus();
    }
  }, [bearbeitet]);

  const klasse = [
    'list-table__bearbeitbar',
    numeric === true ? 'numeric' : '',
    entwurf.speichert ? 'is-saving' : '',
  ]
    .filter((teil) => teil !== '')
    .join(' ');

  if (bearbeitet) {
    return (
      <td className={klasse} data-label={label}>
        <InlineEingabe
          label={label}
          typ={typ}
          entwurf={entwurf}
          onZurueck={() => {
            zurueck.current = true;
          }}
        />
      </td>
    );
  }

  return (
    <td
      ref={zellRef}
      className={klasse}
      data-label={label}
      data-zelle={zelle}
      tabIndex={tabIndex}
      title="Doppelklick, Enter oder einfach lostippen zum Bearbeiten"
      onDoubleClick={() => entwurf.beginnen()}
      onKeyDown={(event: KeyboardEvent<HTMLTableCellElement>) => {
        if (event.target !== event.currentTarget) {
          return;
        }

        if (
          (event.key === 'Enter' || event.key === 'F2') &&
          !event.ctrlKey &&
          !event.metaKey
        ) {
          event.preventDefault();
          entwurf.beginnen();
        } else if (
          event.key.length === 1 &&
          event.key !== ' ' &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          event.preventDefault();
          entwurf.beginnen(event.key);
        }
      }}
    >
      {children}
    </td>
  );
};

export const customFieldColumns = <
  Row extends { customFields?: CustomFieldValues },
>(
  fields: CustomField[],
): ListColumn<Row>[] =>
  fields.map((field) => ({
    key: `custom:${field.key}`,
    label: field.label,
    sortField: field.type === 'RELATION' ? undefined : `custom:${field.key}`,
    numeric: field.type === 'NUMBER' || field.type === 'CURRENCY',
    render: (row) => customFieldAnzeige(field, row.customFields?.[field.key]),
  }));

export type NeueZeile<Row> = {
  label: string;
  platzhalter: string;
  anlegen: (text: string) => Promise<Row>;
  hinweis?: (text: string) => ReactNode;
  fragment: DocumentNode;
};

export const asChoices = <Row,>(columns: ListColumn<Row>[]): ColumnChoice[] =>
  columns.map((column) => ({ key: column.key, label: column.label }));

export const ListTable = <Row,>({
  columns,
  rows: eingang,
  rowKey,
  controls,
  rowActions,
  auswahl,
  rowLabel,
  onEdit,
  summenLabel = 'Summe aller Treffer',
  reihenfolge,
  label,
  neueZeile,
  zuruecksetzenBei,
}: {
  columns: ListColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  controls: ListControls;
  rowActions?: (row: Row) => ReactNode;
  auswahl?: Auswahl;
  rowLabel?: (row: Row) => string;
  onEdit?: (
    row: Row,
    feld: string,
    wert: string | number | null,
  ) => Promise<unknown>;
  summenLabel?: string;
  reihenfolge?: string;
  label?: string;
  neueZeile?: NeueZeile<Row>;
  zuruecksetzenBei?: unknown;
}) => {
  const [angeheftet, setAngeheftet] = useState<Row[]>([]);
  const [frisch, setFrisch] = useState<ReadonlyMap<Row, Row | null>>(new Map());
  const eingrenzung = JSON.stringify(zuruecksetzenBei ?? null);

  useEffect(() => {
    setAngeheftet([]);
    setFrisch(new Map());
  }, [controls.variables, eingrenzung]);

  const client = useApolloClient();
  const fragment = neueZeile?.fragment;

  useEffect(() => {
    if (fragment === undefined || angeheftet.length === 0) {
      return undefined;
    }

    const abos = angeheftet.map((zeile) => {
      const from = client.cache.identify(zeile as StoreObject);

      if (from === undefined) {
        return null;
      }

      return client.watchFragment({ fragment, from }).subscribe({
        next: ({ data, complete }) => {
          setFrisch((alt) =>
            new Map(alt).set(zeile, complete ? (data as Row) : null),
          );
        },
      });
    });

    return () => {
      for (const abo of abos) {
        abo?.unsubscribe();
      }
    };
  }, [angeheftet, client, fragment]);

  const mitNeuen = mitAngehefteten(
    aktuelleAngeheftete(angeheftet, frisch),
    eingang,
    rowKey,
  );
  const rows = mitNeuen.zeilen;
  const ids = rows.map(rowKey);
  const idsText = ids.join(',');
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const hilfeId = useId();
  const [aktiv, setAktiv] = useState<Zelle>({ zeile: 0, spalte: 0 });
  const [innen, setInnen] = useState<string | null>(null);
  const [ansage, setAnsage] = useState('');
  const groesse = {
    zeilen: rows.length,
    spalten:
      columns.length +
      (auswahl === undefined ? 0 : 1) +
      (rowActions === undefined ? 0 : 1),
  };
  const fokus = innerhalb(aktiv, groesse);
  const fokusSchluessel = zellenSchluessel(fokus);

  useEffect(() => {
    const tbody = tbodyRef.current;

    if (tbody === null) {
      return;
    }

    for (const element of Array.from(
      tbody.querySelectorAll<HTMLElement>(FOKUSSIERBAR),
    )) {
      const zelle = element.closest<HTMLElement>('td[data-zelle]');

      if (zelle?.dataset.zelle === innen) {
        element.removeAttribute('tabindex');
      } else {
        element.setAttribute('tabindex', '-1');
      }
    }
  });

  const zelleFokussieren = (ziel: Zelle) => {
    setAktiv(ziel);
    setInnen(null);
    tbodyRef.current
      ?.querySelector<HTMLElement>(`td[data-zelle="${zellenSchluessel(ziel)}"]`)
      ?.focus();
  };

  const zeileUmschalten = (zeile: number) => {
    const row = rows[zeile];

    if (auswahl === undefined || row === undefined) {
      return;
    }

    const id = rowKey(row);
    const war = auswahl.gewaehlt.has(id);

    umschalten(id);
    setAnsage(`${war ? 'Abgewählt' : 'Ausgewählt'}: ${rowLabel?.(row) ?? id}`);
  };

  const tasteInTabelle = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    if (event.defaultPrevented) {
      return;
    }

    const ziel = event.target as HTMLElement;
    const zelle = ziel.closest<HTMLElement>('td[data-zelle]');
    const position = ausSchluessel(zelle?.dataset.zelle);

    if (zelle === null || position === null) {
      return;
    }

    const aufZelle = ziel === zelle;

    if (!aufZelle) {
      if (event.key === 'Escape') {
        event.preventDefault();
        zelleFokussieren(position);
      }

      return;
    }

    const strg = event.ctrlKey || event.metaKey;
    const weiter = naechsteZelle(position, event.key, groesse, strg);

    if (weiter !== null) {
      event.preventDefault();
      zelleFokussieren(weiter);

      return;
    }

    if (event.key === ' ' && auswahl !== undefined) {
      event.preventDefault();
      zeileUmschalten(position.zeile);

      return;
    }

    if (event.key === 'Enter' && strg) {
      const link = zelle
        .closest('tr')
        ?.querySelector<HTMLAnchorElement>('a[href]');

      if (link !== null && link !== undefined) {
        event.preventDefault();
        link.click();
      }

      return;
    }

    if (event.key === 'Enter') {
      const bedienbar = Array.from(
        zelle.querySelectorAll<HTMLElement>(FOKUSSIERBAR),
      );
      const kaestchen = zelle.querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      );

      if (kaestchen !== null && bedienbar.length === 1) {
        event.preventDefault();
        kaestchen.click();
      } else if (bedienbar.length === 1 && bedienbar[0].matches('a[href]')) {
        event.preventDefault();
        bedienbar[0].click();
      } else if (bedienbar.length > 0) {
        event.preventDefault();
        setInnen(zellenSchluessel(position));
        bedienbar[0].removeAttribute('tabindex');
        bedienbar[0].focus();
      }
    }
  };

  const fokusInTabelle = (event: FocusEvent<HTMLTableSectionElement>) => {
    const zelle = (event.target as HTMLElement).closest<HTMLElement>(
      'td[data-zelle]',
    );
    const position = ausSchluessel(zelle?.dataset.zelle);

    if (position !== null) {
      setAktiv(position);

      if (zellenSchluessel(position) !== innen && event.target !== zelle) {
        setInnen(null);
      }
    }
  };

  useEffect(() => {
    if (reihenfolge !== undefined) {
      merkeReihenfolge(reihenfolge, idsText === '' ? [] : idsText.split(','));
    }
  }, [reihenfolge, idsText]);

  const mitSumme = columns.some((column) => column.summe !== undefined);

  const alle = ids.length > 0 && ids.every((id) => auswahl?.gewaehlt.has(id));
  const manche = !alle && ids.some((id) => auswahl?.gewaehlt.has(id));

  const umschalten = (id: string) => {
    if (auswahl === undefined) {
      return;
    }

    const neu = new Set(auswahl.gewaehlt);

    if (neu.has(id)) {
      neu.delete(id);
    } else {
      neu.add(id);
    }

    auswahl.setzen(neu);
  };

  return (
    <TableWrap label={label}>
      <span className="visually-hidden" aria-live="polite">
        {ansage}
      </span>
      <p id={hilfeId} className="visually-hidden">
        Pfeiltasten wandern durch die Zellen, Enter öffnet oder bearbeitet,
        Strg+Enter öffnet die Zeile, Leertaste wählt sie aus.
      </p>
      <table className="list-table" role="grid" aria-describedby={hilfeId}>
        <thead>
          <tr>
            {auswahl !== undefined && (
              <th className="list-table__wahl">
                <input
                  type="checkbox"
                  aria-label="Alle auf dieser Seite auswählen"
                  checked={alle}
                  ref={(element) => {
                    if (element !== null) {
                      element.indeterminate = manche;
                    }
                  }}
                  onChange={() =>
                    auswahl.setzen(alle ? new Set() : new Set(ids))
                  }
                />
              </th>
            )}
            {columns.map((column) =>
              column.sortField === undefined ? (
                <th
                  key={column.key}
                  className={column.numeric === true ? 'numeric' : undefined}
                >
                  {column.label}
                </th>
              ) : (
                <SortableHeader
                  key={column.key}
                  field={column.sortField}
                  label={column.label}
                  controls={controls}
                  numeric={column.numeric}
                />
              ),
            )}
            {rowActions !== undefined && (
              <th>
                <span className="visually-hidden">Aktionen</span>
              </th>
            )}
          </tr>
        </thead>

        <tbody
          ref={tbodyRef}
          onKeyDown={tasteInTabelle}
          onFocus={fokusInTabelle}
        >
          {rows.map((row, zeile) => {
            const versatz = auswahl === undefined ? 0 : 1;
            const zellProps = (spalte: number) => {
              const schluessel = zellenSchluessel({ zeile, spalte });

              return {
                'data-zelle': schluessel,
                tabIndex: schluessel === fokusSchluessel ? 0 : -1,
              };
            };

            return (
              <tr
                key={rowKey(row)}
                aria-selected={
                  auswahl === undefined
                    ? undefined
                    : auswahl.gewaehlt.has(rowKey(row))
                }
                className={
                  [
                    auswahl?.gewaehlt.has(rowKey(row)) === true
                      ? 'is-selected'
                      : '',
                    mitNeuen.oben.has(rowKey(row)) ? 'is-neu' : '',
                  ]
                    .filter((teil) => teil !== '')
                    .join(' ') || undefined
                }
              >
                {auswahl !== undefined && (
                  <td className="list-table__wahl" {...zellProps(0)}>
                    <input
                      type="checkbox"
                      aria-label={`Auswählen: ${rowLabel?.(row) ?? rowKey(row)}`}
                      checked={auswahl.gewaehlt.has(rowKey(row))}
                      onChange={() => umschalten(rowKey(row))}
                    />
                  </td>
                )}
                {columns.map((column, index) =>
                  column.edit !== undefined && onEdit !== undefined ? (
                    <BearbeitbareZelle
                      key={column.key}
                      zelle={zellProps(index + versatz)['data-zelle']}
                      tabIndex={zellProps(index + versatz).tabIndex}
                      label={column.label}
                      typ={column.edit.typ ?? 'text'}
                      ausgang={column.edit.wert(row)}
                      numeric={column.numeric}
                      onSpeichern={async (wert) => {
                        const edit = column.edit;

                        if (edit !== undefined) {
                          await onEdit(row, edit.feld, wert);
                        }
                      }}
                    >
                      {column.render(row)}
                    </BearbeitbareZelle>
                  ) : (
                    <td
                      key={column.key}
                      className={
                        column.numeric === true ? 'numeric' : undefined
                      }
                      data-label={column.label}
                      {...zellProps(index + versatz)}
                    >
                      {column.render(row)}
                    </td>
                  ),
                )}
                {rowActions !== undefined && (
                  <td {...zellProps(columns.length + versatz)}>
                    {rowActions(row)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>

        {neueZeile !== undefined && (
          <NeueZeileZeile
            neueZeile={neueZeile}
            spalten={groesse.spalten}
            ausserhalb={mitNeuen.ausserhalb}
            onAngelegt={(row) =>
              setAngeheftet((alt) => anheften(alt, row, rowKey))
            }
          />
        )}

        {mitSumme && rows.length > 0 && (
          <tfoot>
            <tr className="list-table__summen">
              {auswahl !== undefined && <td />}
              {columns.map((column, index) => (
                <td
                  key={column.key}
                  className={
                    column.summe === undefined
                      ? index === 0
                        ? 'list-table__summen-titel'
                        : undefined
                      : column.numeric === true
                        ? 'numeric list-table__summen-wert'
                        : 'list-table__summen-wert'
                  }
                  data-label={
                    column.summe === undefined ? undefined : column.label
                  }
                >
                  {column.summe ?? (index === 0 ? summenLabel : null)}
                </td>
              ))}
              {rowActions !== undefined && <td />}
            </tr>
          </tfoot>
        )}
      </table>
    </TableWrap>
  );
};

const NeueZeileZeile = <Row,>({
  neueZeile,
  spalten,
  ausserhalb,
  onAngelegt,
}: {
  neueZeile: NeueZeile<Row>;
  spalten: number;
  ausserhalb: number;
  onAngelegt: (row: Row) => void;
}) => {
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [legtAn, setLegtAn] = useState(false);
  const [ansage, setAnsage] = useState('');
  const knopf = useRef<HTMLButtonElement>(null);
  const zurueck = useRef(false);
  const fehlerId = useId();

  useEffect(() => {
    if (!offen && zurueck.current) {
      zurueck.current = false;
      knopf.current?.focus();
    }
  }, [offen]);

  const schliessen = () => {
    zurueck.current = true;
    setOffen(false);
    setText('');
    setFehler(null);
  };

  const anlegen = async () => {
    const name = text.trim();

    if (name === '' || legtAn) {
      return;
    }

    setLegtAn(true);
    setFehler(null);

    try {
      onAngelegt(await neueZeile.anlegen(name));
      setText('');
      setAnsage(`„${name}“ angelegt.`);
    } catch (grund) {
      setFehler(grund instanceof Error ? grund.message : 'Nicht angelegt.');
    } finally {
      setLegtAn(false);
    }
  };

  return (
    <tbody className="list-table__neu">
      <tr>
        <td colSpan={spalten}>
          <span className="visually-hidden" aria-live="polite">
            {ansage}
          </span>
          {offen ? (
            <form
              className="list-table__neu-form"
              onSubmit={(event) => {
                event.preventDefault();
                void anlegen();
              }}
            >
              <input
                className="list-table__eingabe"
                aria-label={neueZeile.platzhalter}
                placeholder={neueZeile.platzhalter}
                value={text}
                autoFocus
                maxLength={200}
                aria-invalid={fehler === null ? undefined : true}
                aria-describedby={fehler === null ? undefined : fehlerId}
                onChange={(event) => {
                  setText(event.target.value);
                  setFehler(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    schliessen();
                  }
                }}
              />
              <button
                type="submit"
                className="button button--small"
                disabled={legtAn || text.trim() === ''}
              >
                Anlegen
              </button>
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={schliessen}
              >
                Fertig
              </button>
              <span className="list-table__neu-hinweis">
                Enter legt an, Escape schließt.
              </span>
              {neueZeile.hinweis?.(text)}
              {fehler !== null && (
                <span
                  id={fehlerId}
                  className="list-table__neu-fehler"
                  role="alert"
                >
                  {fehler}
                </span>
              )}
            </form>
          ) : (
            <button
              ref={knopf}
              type="button"
              className="list-table__neu-knopf"
              onClick={() => setOffen(true)}
            >
              <span aria-hidden="true">+</span> {neueZeile.label}
            </button>
          )}
          {ausserhalb > 0 && (
            <p className="list-table__neu-hinweis">
              {ausserhalb === 1
                ? 'Der neu angelegte Eintrag steht oben, weil er nach Filter, Sortierung oder Seite sonst nicht hier stünde.'
                : `Die ${String(ausserhalb)} neu angelegten Einträge stehen oben, weil sie nach Filter, Sortierung oder Seite sonst nicht hier stünden.`}
            </p>
          )}
        </td>
      </tr>
    </tbody>
  );
};
