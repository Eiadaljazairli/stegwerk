import { useQuery } from '@apollo/client';
import { useEffect, useRef, useState } from 'react';

import { CUSTOM_FIELDS } from '../lib/queries';
import {
  CUSTOM_FILTER_OPERATOR_LABELS,
  type CustomField,
  type CustomFieldFilterOperator,
  TAGE_OPERATOREN,
} from '../lib/types';
import {
  FIRMA_PREFIX,
  feldrechtDesFilters,
  STANDARD_FILTER_FELDER,
} from '../lib/standardFelder';
import { type CustomFieldFilter } from '../lib/types';
import { type FeldArt, useFeldrechte } from '../lib/useFeldrechte';
import { type ListControls } from '../lib/useListControls';
import { type FilterFelder, FilterFormular } from './FilterFormular';
import { IconClose } from './Icons';
import { useVerweisName } from './Verweise';

const filterWert = (value: string): string => {
  if (!value.startsWith('[')) {
    return value;
  }

  try {
    const list: unknown = JSON.parse(value);

    return Array.isArray(list) ? list.map(String).join(', ') : value;
  } catch {
    return value;
  }
};

type CustomFieldFiltersProps = {
  entity: CustomField['entity'];
  controls: ListControls;
};

const filterText = (
  operator: CustomFieldFilterOperator,
  value: string | undefined,
): string => {
  const label = CUSTOM_FILTER_OPERATOR_LABELS[operator];

  if (value === undefined) {
    return label;
  }

  if (operator === 'OLDER_THAN_DAYS') {
    return `älter als ${value} ${value === '1' ? 'Tag' : 'Tage'}`;
  }

  if (TAGE_OPERATOREN.includes(operator)) {
    if (value === '1') {
      return operator === 'IN_LAST_DAYS' ? 'seit gestern' : 'bis morgen';
    }

    return `${label} ${value} Tagen`;
  }

  return `${label} ${filterWert(value)}`;
};

const MAX_FILTER = 10;

const MAX_GRUPPEN = 5;

export const filterTeile = (
  filter: CustomFieldFilter[],
): { einzeln: number[]; gruppen: [number, number[]][] } => {
  const einzeln: number[] = [];
  const gruppen = new Map<number, number[]>();

  filter.forEach((eintrag, index) => {
    if (eintrag.gruppe === undefined) {
      einzeln.push(index);
    } else {
      gruppen.set(eintrag.gruppe, [
        ...(gruppen.get(eintrag.gruppe) ?? []),
        index,
      ]);
    }
  });

  return {
    einzeln,
    gruppen: [...gruppen.entries()].sort(([a], [b]) => a - b),
  };
};

export const CustomFieldFilters = ({
  entity,
  controls,
}: CustomFieldFiltersProps) => {
  const { data } = useQuery<{ customFields: CustomField[] }>(CUSTOM_FIELDS, {
    variables: { entity },
  });

  const feldrechte = useFeldrechte();
  const art = entity.toLowerCase() as FeldArt;
  const sichtbar = (field: CustomField) => {
    const recht = feldrechtDesFilters(art, field.key);

    return feldrechte.standard(recht.art, recht.feld) !== 'verborgen';
  };
  const standard = STANDARD_FILTER_FELDER[entity].filter(
    (field) => !field.key.startsWith(FIRMA_PREFIX) && sichtbar(field),
  );
  const firma = STANDARD_FILTER_FELDER[entity].filter(
    (field) => field.key.startsWith(FIRMA_PREFIX) && sichtbar(field),
  );
  const eigene = (data?.customFields ?? []).filter(
    (field) =>
      field.gegenseite !== true &&
      feldrechte.eigenes(art, field.key) !== 'verborgen',
  );
  const fields = [...standard, ...firma, ...eigene];
  const byKey = new Map(fields.map((field) => [field.key, field]));

  const felder: FilterFelder = { standard, firma, eigene };
  const [gruppe, setGruppe] = useState('');

  const aktiv = controls.customFilters;
  const teile = filterTeile(aktiv);
  const vergebeneGruppen = teile.gruppen.map(([nummer]) => nummer);
  const naechsteGruppe = [1, 2, 3, 4, 5].find(
    (nummer) => !vergebeneGruppen.includes(nummer),
  );
  const oder = controls.verknuepfung === 'ODER';
  const innen = oder ? 'und' : 'oder';
  const voll = aktiv.length >= MAX_FILTER;
  const stand = JSON.stringify(aktiv);

  return (
    <div className="custom-filters">
      <FilterFormular
        felder={felder}
        gesperrt={voll}
        submitLabel="Filtern"
        onSubmit={(filter) =>
          controls.addCustomFilter({
            ...(gruppe === '' ? {} : { gruppe: Number(gruppe) }),
            ...filter,
          })
        }
        zusatz={
          aktiv.length > 0 && (
            <select
              aria-label="In Gruppe"
              title={`Bedingungen einer Gruppe hängen mit „${innen}“ zusammen.`}
              value={gruppe}
              onChange={(event) => setGruppe(event.target.value)}
            >
              <option value="">als eigene Bedingung</option>
              {vergebeneGruppen.map((nummer) => (
                <option key={nummer} value={String(nummer)}>
                  in Gruppe {nummer}
                </option>
              ))}
              {naechsteGruppe !== undefined &&
                vergebeneGruppen.length < MAX_GRUPPEN && (
                  <option value={String(naechsteGruppe)}>
                    in neue Gruppe {naechsteGruppe}
                  </option>
                )}
            </select>
          )
        }
      />

      {aktiv.length > 0 && (
        <div className="custom-filters__active">
          {teile.einzeln.length + teile.gruppen.length > 1 && (
            <label className="custom-filters__verknuepfung">
              Treffer mit
              <select
                aria-label="Verknüpfung der Bedingungen"
                value={controls.verknuepfung}
                onChange={(event) =>
                  controls.setVerknuepfung(
                    event.target.value === 'ODER' ? 'ODER' : 'UND',
                  )
                }
              >
                <option value="UND">allen</option>
                <option value="ODER">mindestens einer</option>
              </select>
              Bedingung{oder ? '' : 'en'}:
            </label>
          )}
          {teile.einzeln.map((index) => (
            <FilterChip
              key={`e-${index}`}
              filter={aktiv[index]}
              felder={felder}
              label={byKey.get(aktiv[index].key)?.label ?? aktiv[index].key}
              optionLabels={byKey.get(aktiv[index].key)?.optionLabels}
              stand={stand}
              onRemove={() => controls.removeCustomFilter(index)}
              onUpdate={(neu) => controls.updateCustomFilter(index, neu)}
            />
          ))}
          {teile.gruppen.map(([nummer, stellen]) => (
            <span
              key={`g-${nummer}`}
              className="filter-gruppe"
              role="group"
              aria-label={`Gruppe ${nummer}: eine Bedingung ${innen === 'oder' ? 'genügt' : 'nach der anderen'}`}
            >
              <span className="filter-gruppe__klammer" aria-hidden="true">
                (
              </span>
              {stellen.map((index, position) => (
                <span
                  key={`g-${nummer}-${index}`}
                  className="filter-gruppe__teil"
                >
                  {position > 0 && (
                    <span className="filter-gruppe__wort">{innen}</span>
                  )}
                  <FilterChip
                    filter={aktiv[index]}
                    felder={felder}
                    label={
                      byKey.get(aktiv[index].key)?.label ?? aktiv[index].key
                    }
                    optionLabels={byKey.get(aktiv[index].key)?.optionLabels}
                    stand={stand}
                    onRemove={() => controls.removeCustomFilter(index)}
                    onUpdate={(neu) => controls.updateCustomFilter(index, neu)}
                  />
                </span>
              ))}
              <span className="filter-gruppe__klammer" aria-hidden="true">
                )
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const FilterChip = ({
  filter,
  felder,
  label,
  optionLabels,
  stand,
  onRemove,
  onUpdate,
}: {
  filter: CustomFieldFilter;
  felder: FilterFelder;
  label: string;
  optionLabels?: Record<string, string>;
  stand: string;
  onRemove: () => void;
  onUpdate: (filter: CustomFieldFilter) => void;
}) => {
  const [offen, setOffen] = useState(false);
  const rahmen = useRef<HTMLSpanElement>(null);
  const knopf = useRef<HTMLButtonElement>(null);
  const verweis = felder.eigene.find(
    (feld) => feld.key === filter.key && feld.type === 'RELATION',
  );
  const verweisName = useVerweisName(
    verweis?.zielEntity ?? null,
    verweis === undefined ? undefined : filter.value,
  );
  const text = `${label} ${filterText(
    filter.operator,
    filter.value === undefined
      ? undefined
      : verweis !== undefined
        ? verweisName
        : (optionLabels?.[filter.value] ?? filter.value),
  )}`;
  const aenderbar = [
    ...felder.standard,
    ...felder.firma,
    ...felder.eigene,
  ].some((feld) => feld.key === filter.key);

  const schliessen = () => {
    setOffen(false);
    knopf.current?.focus();
  };

  useEffect(() => {
    setOffen(false);
  }, [stand]);

  useEffect(() => {
    if (!offen) {
      return;
    }

    const beiKlick = (event: MouseEvent) => {
      if (!rahmen.current?.contains(event.target as Node)) {
        setOffen(false);
      }
    };

    window.addEventListener('mousedown', beiKlick);

    return () => window.removeEventListener('mousedown', beiKlick);
  }, [offen]);

  return (
    <span className="filter-chip filter-chip--geteilt" ref={rahmen}>
      <button
        ref={knopf}
        type="button"
        className="filter-chip__text"
        aria-haspopup="dialog"
        aria-expanded={offen}
        disabled={!aenderbar}
        title={aenderbar ? 'Filter ändern' : undefined}
        onClick={() => setOffen((jetzt) => !jetzt)}
      >
        {text}
      </button>
      <button
        type="button"
        className="filter-chip__weg"
        aria-label={`Filter entfernen: ${text}`}
        title="Filter entfernen"
        onClick={onRemove}
      >
        <IconClose size={12} />
      </button>
      {offen && (
        <div
          className="menu-panel filter-chip__panel"
          role="dialog"
          aria-label={`Filter ändern: ${label}`}
        >
          <FilterFormular
            felder={felder}
            start={filter}
            submitLabel="Übernehmen"
            className="filter-formular"
            autoFocus
            onSubmit={(neu) => {
              onUpdate(neu);
              schliessen();
            }}
            onAbbrechen={schliessen}
          />
        </div>
      )}
    </span>
  );
};
