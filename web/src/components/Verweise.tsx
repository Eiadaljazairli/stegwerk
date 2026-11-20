import { type ApolloClient, useApolloClient, useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { nachAenderung } from '../lib/aenderungen';
import { GEGENFELD_WERTE, VERWEIS_TITEL } from '../lib/queries';
import { type CustomField } from '../lib/types';
import {
  istVerweisArt,
  VERWEIS_ART_EINZAHL,
  type VerweisArt,
  verweisDazu,
  verweisIds,
  VerweisLader,
  verweisPfad,
  verweisSenden,
  verweisText,
  type VerweisTitel,
  verweisWeg,
} from '../lib/verweise';
import { type AuswahlArt, DatensatzAuswahl } from './DatensatzAuswahl';
import { useFeldHinweis } from './FeldHinweis';
import { IconClose } from './Icons';

const LADER = new WeakMap<object, VerweisLader>();

const laderFuer = (client: ApolloClient<object>): VerweisLader => {
  const vorhanden = LADER.get(client);

  if (vorhanden !== undefined) {
    return vorhanden;
  }

  const lader = new VerweisLader(async (art, ids) => {
    const { data } = await client.query<{ verweisTitel: VerweisTitel[] }>({
      query: VERWEIS_TITEL,
      variables: { ziel: art, ids },
      fetchPolicy: 'network-only',
    });

    return data.verweisTitel;
  });

  LADER.set(client, lader);

  nachAenderung(() => lader.vergessen());

  return lader;
};

export const useVerweisTitel = (
  art: VerweisArt | null,
  ids: readonly string[],
): ((id: string) => VerweisTitel | null | undefined) => {
  const client = useApolloClient();
  const lader = laderFuer(client);
  const [, setStand] = useState(0);
  const schluessel = ids.join(',');
  const vergessen = lader.stand;

  useEffect(() => lader.abonnieren(() => setStand((n) => n + 1)), [lader]);

  useEffect(() => {
    if (art !== null && schluessel !== '') {
      lader.anfordern(art, schluessel.split(','));
    }
  }, [lader, art, schluessel, vergessen]);

  return (id) => (art === null ? undefined : lader.lesen(art, id));
};

const VerweisChip = ({
  art,
  id,
  titel,
  onEntfernen,
}: {
  art: VerweisArt;
  id: string;
  titel: VerweisTitel | null | undefined;
  onEntfernen?: () => void;
}) => {
  if (titel === null) {
    return null;
  }

  const text = verweisText(titel);
  const sichtbar = titel?.sichtbar === true;

  return (
    <span
      className={
        sichtbar ? 'verweis-chip' : 'verweis-chip verweis-chip--verborgen'
      }
    >
      {text === null ? (
        <span aria-busy="true">…</span>
      ) : sichtbar ? (
        <Link to={verweisPfad(art, id)}>{text}</Link>
      ) : (
        <span
          title={`${VERWEIS_ART_EINZAHL[art]}, die Ihre Rolle nicht sieht.`}
        >
          {text}
        </span>
      )}
      {onEntfernen !== undefined && sichtbar && (
        <button
          type="button"
          className="verweis-chip__weg"
          aria-label={`${text ?? ''} entfernen`}
          title="Entfernen"
          onClick={onEntfernen}
        >
          <IconClose size={10} />
        </button>
      )}
    </span>
  );
};

export const VerweisChips = ({
  art,
  wert,
}: {
  art: CustomField['zielEntity'];
  wert: unknown;
}) => {
  const ziel = istVerweisArt(art) ? art : null;
  const ids = verweisIds(wert);
  const titel = useVerweisTitel(ziel, ids);

  if (ziel === null || ids.length === 0) {
    return <>—</>;
  }

  return (
    <span className="verweis-chips">
      {ids.map((id) => (
        <VerweisChip key={id} art={ziel} id={id} titel={titel(id)} />
      ))}
    </span>
  );
};

const AUSWAHL_ART: Record<VerweisArt, AuswahlArt> = {
  COMPANY: 'firma',
  CONTACT: 'kontakt',
  DEAL: 'geschaeft',
};

export const VerweisFeld = ({
  field,
  value,
  nurLesen,
  onSave,
}: {
  field: CustomField;
  value: unknown;
  nurLesen: boolean;
  onSave: (value: string) => void | Promise<unknown>;
}) => {
  const hinweis = useFeldHinweis(field.label, field.beschreibung);
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const ziel = istVerweisArt(field.zielEntity) ? field.zielEntity : null;
  const ids = verweisIds(value);
  const titel = useVerweisTitel(ziel, ids);

  if (ziel === null) {
    return null;
  }

  const speichern = async (neu: string[]) => {
    setFehler(null);

    try {
      await onSave(verweisSenden(neu));
    } catch (problem) {
      setFehler(problem instanceof Error ? problem.message : 'Das ging nicht.');

      throw problem;
    }
  };

  const einzahl = VERWEIS_ART_EINZAHL[ziel];
  const belegt = ids.some((id) => titel(id) !== null);

  return (
    <div className="detail-field">
      <div className="detail-field__label">
        {field.label}
        {hinweis.knopf}
      </div>
      {hinweis.text}
      <div
        className="detail-field__value detail-field__value--static"
        aria-describedby={hinweis.beschreibtId}
        title={
          nurLesen ? 'Ihre Rolle darf dieses Feld nicht ändern.' : undefined
        }
      >
        {offen ? (
          <DatensatzAuswahl
            art={AUSWAHL_ART[ziel]}
            label={`${einzahl} für ${field.label} wählen`}
            ausser={ids}
            onWaehlen={async (treffer) => {
              await speichern(verweisDazu(field, ids, treffer.id));
              setOffen(false);
            }}
            onAbbrechen={() => setOffen(false)}
          />
        ) : (
          <span className="verknuepfung">
            <span
              className="verweis-chips"
              role="list"
              aria-label={field.label}
            >
              {ids.map((id) => (
                <span role="listitem" key={id}>
                  <VerweisChip
                    art={ziel}
                    id={id}
                    titel={titel(id)}
                    onEntfernen={
                      nurLesen
                        ? undefined
                        : () =>
                            void speichern(verweisWeg(ids, id)).catch(
                              () => null,
                            )
                    }
                  />
                </span>
              ))}
              {!belegt && <span className="detail-field__empty">—</span>}
            </span>
            {!nurLesen && (
              <span className="verknuepfung__aktionen">
                <button
                  type="button"
                  className="feed__link"
                  aria-label={`${einzahl} für ${field.label} ${
                    field.mehrere === true || !belegt ? 'hinzufügen' : 'ändern'
                  }`}
                  onClick={() => setOffen(true)}
                >
                  {field.mehrere === true || !belegt
                    ? `+ ${einzahl}`
                    : 'Ändern'}
                </button>
              </span>
            )}
          </span>
        )}
        {fehler !== null && (
          <div className="error-banner" role="alert">
            {fehler}
          </div>
        )}
      </div>
    </div>
  );
};

export const VerweisWahl = ({
  art,
  wert,
  label,
  onChange,
}: {
  art: CustomField['zielEntity'];
  wert: string;
  label: string;
  onChange: (id: string) => void;
}) => {
  const ziel = istVerweisArt(art) ? art : null;
  const [suchen, setSuchen] = useState(false);

  if (ziel === null) {
    return null;
  }

  if (wert === '' || suchen) {
    return (
      <span className="verweis-wahl">
        <DatensatzAuswahl
          art={AUSWAHL_ART[ziel]}
          label={`${VERWEIS_ART_EINZAHL[ziel]} für ${label} wählen`}
          onWaehlen={(treffer) => {
            onChange(treffer.id);
            setSuchen(false);
          }}
          onAbbrechen={wert === '' ? undefined : () => setSuchen(false)}
        />
      </span>
    );
  }

  return (
    <span className="verweis-wahl">
      <VerweisChips art={ziel} wert={wert} />
      <button
        type="button"
        className="feed__link"
        aria-label={`${VERWEIS_ART_EINZAHL[ziel]} für ${label} ändern`}
        onClick={() => setSuchen(true)}
      >
        Ändern
      </button>
    </span>
  );
};

export const useVerweisName = (
  art: CustomField['zielEntity'],
  id: string | undefined,
): string | undefined => {
  const ziel = istVerweisArt(art) ? art : null;
  const titel = useVerweisTitel(
    ziel,
    id === undefined || ziel === null ? [] : [id],
  );

  if (id === undefined || ziel === null) {
    return id;
  }

  return verweisText(titel(id) ?? undefined) ?? '…';
};

type GegenfeldWert = {
  feldId: string;
  quelle: CustomField['entity'];
  eintraege: { id: string; titel: string }[];
  nichtSichtbar: number;
};

export const GegenfeldBereich = ({
  entity,
  id,
  felder,
}: {
  entity: CustomField['entity'];
  id: string;
  felder: CustomField[];
}) => {
  const { data } = useQuery<{ gegenfeldWerte: GegenfeldWert[] }>(
    GEGENFELD_WERTE,
    {
      variables: { entity, id },
      skip: felder.length === 0,
      fetchPolicy: 'cache-and-network',
    },
  );
  const werte = new Map(
    (data?.gegenfeldWerte ?? []).map((wert) => [wert.feldId, wert]),
  );
  const sichtbare = felder.filter((feld) => werte.has(feld.id));

  if (sichtbare.length === 0) {
    return null;
  }

  return (
    <div className="card detail-grid gegenfelder">
      {sichtbare.map((feld) => {
        const wert = werte.get(feld.id) as GegenfeldWert;
        const quelle = istVerweisArt(wert.quelle) ? wert.quelle : null;

        return (
          <div className="detail-field" key={feld.id}>
            <div className="detail-field__label">{feld.label}</div>
            <div className="detail-field__value detail-field__value--static">
              {wert.eintraege.length === 0 && wert.nichtSichtbar === 0 ? (
                <span className="detail-field__empty">—</span>
              ) : (
                <ul className="verweis-chips" aria-label={feld.label}>
                  {wert.eintraege.map((eintrag) => (
                    <li key={eintrag.id} className="verweis-chip">
                      {quelle === null ? (
                        eintrag.titel
                      ) : (
                        <Link to={verweisPfad(quelle, eintrag.id)}>
                          {eintrag.titel || 'Ohne Namen'}
                        </Link>
                      )}
                    </li>
                  ))}
                  {wert.nichtSichtbar > 0 && (
                    <li
                      className="verweis-chip verweis-chip--verborgen"
                      title="Datensätze, die Ihre Rolle nicht sieht."
                    >
                      {wert.nichtSichtbar === 1
                        ? '1 nicht sichtbar'
                        : `${String(wert.nichtSichtbar)} nicht sichtbar`}
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
