import { type DocumentNode, useQuery } from '@apollo/client';
import { type ReactNode, useEffect, useState } from 'react';

import { CUSTOM_FIELDS } from '../lib/queries';
import { type CustomField, type ListenGruppe } from '../lib/types';
import { type FeldArt, useFeldrechte } from '../lib/useFeldrechte';
import { type ListControls } from '../lib/useListControls';

type Art = Extract<CustomField['entity'], 'COMPANY' | 'CONTACT' | 'DEAL'>;

export type GruppenFeld = {
  key: string;
  label: string;
  ohneWert: string;
  reihenfolge?: string[];
};

const STANDARD: Record<Art, GruppenFeld[]> = {
  COMPANY: [
    { key: 'std:industry', label: 'Branche', ohneWert: 'Ohne Branche' },
    { key: 'std:city', label: 'Stadt', ohneWert: 'Ohne Stadt' },
    { key: 'std:country', label: 'Land', ohneWert: 'Ohne Land' },
    {
      key: 'std:ownerId',
      label: 'Verantwortlich',
      ohneWert: 'Niemand zuständig',
    },
  ],
  CONTACT: [
    { key: 'std:companyId', label: 'Firma', ohneWert: 'Ohne Firma' },
    {
      key: 'std:ownerId',
      label: 'Verantwortlich',
      ohneWert: 'Niemand zuständig',
    },
    { key: 'std:jobTitle', label: 'Position', ohneWert: 'Ohne Position' },
  ],
  DEAL: [
    { key: 'std:stage', label: 'Phase', ohneWert: 'Ohne Phase' },
    {
      key: 'std:ownerId',
      label: 'Verantwortlich',
      ohneWert: 'Niemand zuständig',
    },
    { key: 'std:companyId', label: 'Firma', ohneWert: 'Ohne Firma' },
    { key: 'std:currency', label: 'Währung', ohneWert: 'Ohne Währung' },
    {
      key: 'std:lostReason',
      label: 'Verlustgrund',
      ohneWert: 'Ohne Verlustgrund',
    },
  ],
};

export const useGruppenFelder = (
  entity: Art,
): { felder: GruppenFeld[]; geladen: boolean } => {
  const { data } = useQuery<{ customFields: CustomField[] }>(CUSTOM_FIELDS, {
    variables: { entity },
  });
  const feldrechte = useFeldrechte();
  const art = entity.toLowerCase() as FeldArt;

  const felder = [
    ...STANDARD[entity].filter(
      (feld) =>
        feldrechte.standard(art, feld.key.slice('std:'.length)) !== 'verborgen',
    ),
    ...(data?.customFields ?? [])
      .filter(
        (feld) =>
          feld.type === 'SELECT' &&
          feld.archivedAt == null &&
          feldrechte.eigenes(art, feld.key) !== 'verborgen',
      )
      .map((feld) => ({
        key: `custom:${feld.key}`,
        label: feld.label,
        ohneWert: `Ohne ${feld.label}`,
        reihenfolge: feld.options,
      })),
  ];

  return { felder, geladen: data !== undefined && feldrechte.geladen };
};

export const useGruppierung = (
  entity: Art,
  controls: ListControls,
): { felder: GruppenFeld[]; feld: GruppenFeld | undefined } => {
  const { felder, geladen } = useGruppenFelder(entity);
  const feld = felder.find((eintrag) => eintrag.key === controls.gruppierung);
  const { gruppierung, setGruppierung } = controls;

  useEffect(() => {
    if (geladen && gruppierung !== null && feld === undefined) {
      setGruppierung(null);
    }
  }, [geladen, gruppierung, feld, setGruppierung]);

  return { felder, feld };
};

export const GruppierenWahl = ({
  felder,
  controls,
}: {
  felder: GruppenFeld[];
  controls: ListControls;
}) => (
  <select
    className="toolbar__filter"
    aria-label="Gruppieren nach"
    value={controls.gruppierung ?? ''}
    onChange={(event) =>
      controls.setGruppierung(
        event.target.value === '' ? null : event.target.value,
      )
    }
  >
    <option value="">Nicht gruppiert</option>
    {felder.map((feld) => (
      <option key={feld.key} value={feld.key}>
        Gruppiert nach {feld.label}
      </option>
    ))}
  </select>
);

const zuKey = (liste: string, feld: string) =>
  `stegwerk.gruppenZu.${liste}.${feld}`;

const leseZu = (liste: string, feld: string): Set<string> | null => {
  try {
    const roh = window.localStorage.getItem(zuKey(liste, feld));
    const liste_: unknown = roh === null ? null : JSON.parse(roh);

    return Array.isArray(liste_)
      ? new Set(liste_.filter((x): x is string => typeof x === 'string'))
      : null;
  } catch {
    return null;
  }
};

const gruppenKey = (gruppe: ListenGruppe) => gruppe.wert ?? '\u0000';

export const ordneGruppen = (
  gruppen: ListenGruppe[],
  name: (gruppe: ListenGruppe) => string,
  reihenfolge?: string[],
): ListenGruppe[] =>
  [...gruppen].sort((a, b) => {
    if (a.wert === null || b.wert === null) {
      return a.wert === null ? (b.wert === null ? 0 : 1) : -1;
    }

    if (reihenfolge !== undefined) {
      const ia = reihenfolge.indexOf(a.wert);
      const ib = reihenfolge.indexOf(b.wert);

      if (ia !== ib) {
        return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
      }
    }

    return name(a).localeCompare(name(b), 'de');
  });

export const GruppierteListe = ({
  liste,
  feld,
  gruppen,
  name,
  reihenfolge,
  summe,
  zeilen,
}: {
  liste: string;
  feld: GruppenFeld;
  gruppen: ListenGruppe[];
  name?: (gruppe: ListenGruppe) => string | null;
  reihenfolge?: string[];
  summe?: (gruppe: ListenGruppe) => ReactNode;
  zeilen: (gruppe: ListenGruppe, titel: string) => ReactNode;
}) => {
  const [zu, setZu] = useState<Set<string>>(
    () =>
      leseZu(liste, feld.key) ??
      (gruppen.length > 6
        ? new Set(gruppen.map(gruppenKey))
        : new Set<string>()),
  );

  const umschalten = (gruppe: ListenGruppe) => {
    const neu = new Set(zu);
    const key = gruppenKey(gruppe);

    if (neu.has(key)) {
      neu.delete(key);
    } else {
      neu.add(key);
    }

    setZu(neu);

    try {
      window.localStorage.setItem(
        zuKey(liste, feld.key),
        JSON.stringify([...neu]),
      );
    } catch {}
  };

  const ueberschrift = (gruppe: ListenGruppe): string =>
    gruppe.wert === null
      ? feld.ohneWert
      : gruppe.nichtSichtbar
        ? 'Nicht sichtbar'
        : (name?.(gruppe) ?? gruppe.label ?? gruppe.wert);

  const geordnet = ordneGruppen(
    gruppen,
    ueberschrift,
    reihenfolge ?? feld.reihenfolge,
  );

  return (
    <div className="gruppen">
      {gruppen.length >= 100 && (
        <p className="field__hint">
          Gezeigt werden die 100 größten Gruppen. Grenzen Sie die Liste mit
          Filtern ein, um die übrigen zu sehen.
        </p>
      )}
      {geordnet.map((gruppe) => {
        const offen = !zu.has(gruppenKey(gruppe));
        const titel = ueberschrift(gruppe);

        return (
          <section key={gruppenKey(gruppe)} className="gruppe">
            <h2 className="gruppe__kopf">
              <button
                type="button"
                className="gruppe__schalter"
                aria-expanded={offen}
                onClick={() => umschalten(gruppe)}
              >
                <span className="gruppe__pfeil" aria-hidden="true">
                  {offen ? '▾' : '▸'}
                </span>
                <span className="gruppe__titel">{titel}</span>
                <span className="gruppe__anzahl">{gruppe.anzahl}</span>
                {summe !== undefined && (
                  <span className="gruppe__summe">{summe(gruppe)}</span>
                )}
              </button>
            </h2>
            {offen && zeilen(gruppe, titel)}
          </section>
        );
      })}
    </div>
  );
};

const SCHRITT = 25;
const HOECHSTENS = 200;

export const GruppenZeilen = <TData, Row>({
  query,
  variables,
  feld,
  gruppe,
  seite,
  children,
}: {
  query: DocumentNode;
  variables: Record<string, unknown>;
  feld: string;
  gruppe: ListenGruppe;
  seite: (data: TData) => { items: Row[]; hasMore: boolean } | undefined;
  children: (rows: Row[]) => ReactNode;
}) => {
  const [limit, setLimit] = useState(SCHRITT);
  const { data, loading, error } = useQuery<TData>(query, {
    variables: {
      ...variables,
      gruppierung: null,
      gruppe: { feld, wert: gruppe.wert },
      limit,
      offset: 0,
    },
  });
  const inhalt = data === undefined ? undefined : seite(data);

  if (error !== undefined) {
    return <div className="error-banner">{error.message}</div>;
  }

  if (inhalt === undefined) {
    return loading ? <p className="field__hint gruppe__laedt">Lädt…</p> : null;
  }

  return (
    <>
      {children(inhalt.items)}
      {inhalt.hasMore &&
        (limit < HOECHSTENS ? (
          <button
            type="button"
            className="button button--ghost button--small gruppe__mehr"
            disabled={loading}
            onClick={() => setLimit(Math.min(limit + SCHRITT, HOECHSTENS))}
          >
            Weitere laden ({inhalt.items.length} von {gruppe.anzahl})
          </button>
        ) : (
          <p className="field__hint">
            {inhalt.items.length} von {gruppe.anzahl} gezeigt. Für die übrigen
            die Gruppe mit einem Filter eingrenzen.
          </p>
        ))}
    </>
  );
};
