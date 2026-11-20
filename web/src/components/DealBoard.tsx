import { useMutation, useQuery } from '@apollo/client';
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';

import {
  DEALS,
  MOVE_DEAL_TO_STAGE,
  UPDATE_DEAL,
  WORKSPACE_SUMMARY,
} from '../lib/queries';
import {
  type CustomField,
  type CustomFieldFilter,
  type Deal,
  type DealStage,
  type FilterVerknuepfung,
  formatCurrency,
  formatDate,
} from '../lib/types';
import { LoadingAnnouncement } from './Skeleton';
import { useToast } from './Toast';
import { Avatar } from './Avatar';
import { usePhasen } from '../lib/stages';
import {
  AGGREGAT_ZEICHEN,
  aggregatName,
  aggregatOptionen,
  aggregatText,
  berechneAggregat,
  gueltigesAggregat,
  type ZahlFeld,
} from '../lib/boardAggregat';
import { useFeldrechte } from '../lib/useFeldrechte';
import { usePermissions } from '../lib/usePermissions';
import {
  type BoardSpalte,
  type Getragen,
  ansage,
  tasteImBoard,
} from '../lib/boardZiehen';
import { useKartenZiehen } from '../lib/useKartenZiehen';
import {
  FESTE_KARTENFELDER,
  kartenFeldBearbeitbar,
  kartenFeldEingabe,
  type KartenWahl,
  leseKarte,
  merkeKarte,
  umschalten,
} from '../lib/boardKarte';
import { type EingabeTyp } from '../lib/inlineWert';
import { RowMenu } from './RowMenu';
import { useCustomFieldColumns } from './CustomFieldColumns';
import { customFieldAnzeige } from './CustomFieldWert';
import { KartenFeld } from './InlineWert';
import { personName, useTeam } from './Verantwortlich';

const BOARD_PAGE = 200;

export type BoardFilter = {
  search: string | null;
  customFilters: CustomFieldFilter[] | null;
  filterVerknuepfung: FilterVerknuepfung | null;
  ownerId: string | null;
};

const ausgangsWert = (wert: unknown): string | number | null =>
  typeof wert === 'string' || typeof wert === 'number' ? wert : null;

export const DealBoard = ({
  pipelineId,
  onNeu,
  filter,
}: {
  pipelineId: string | null;
  onNeu?: (stage: DealStage) => void;
  filter?: BoardFilter;
}) => {
  const toast = useToast();
  const phasen = usePhasen(pipelineId);
  const darfAendern = usePermissions().can('deal:write');
  const feldrechte = useFeldrechte();
  const eigeneFelder = useCustomFieldColumns('DEAL').filter(
    (feld) =>
      feld.archivedAt == null &&
      feldrechte.eigenes('deal', feld.key) !== 'verborgen',
  );
  const [karte, setKarte] = useState<KartenWahl>(leseKarte);
  const waehleKarte = (neu: KartenWahl) => {
    setKarte(neu);
    merkeKarte(neu);
  };
  const [getragen, setGetragen] = useState<Getragen | null>(null);
  const [meldung, setMeldung] = useState('');
  const fokusNach = useRef<string | null>(null);
  const team = useTeam();
  const [bearbeitet, setBearbeitet] = useState<string | null>(null);
  const betragVerborgen = feldrechte.standard('deal', 'amount') === 'verborgen';
  const kartenFelder = [
    ...FESTE_KARTENFELDER.filter(
      (feld) => !(feld.key === 'amount' && betragVerborgen),
    ),
    ...eigeneFelder.map((feld) => ({
      key: `custom:${feld.key}`,
      label: feld.label,
    })),
  ];
  const reihenfolge = kartenFelder.map((feld) => feld.key);
  const gezeigt = karte.kompakt
    ? []
    : karte.felder.filter((feld) => reihenfolge.includes(feld));

  const { data, loading, error } = useQuery<{
    deals: { items: Deal[]; totalCount: number };
  }>(DEALS, {
    variables: {
      search: filter?.search ?? null,
      limit: BOARD_PAGE,
      offset: 0,
      sortField: 'closeDate',
      sortDirection: 'ASC',
      customFilters: filter?.customFilters ?? null,
      filterVerknuepfung: filter?.filterVerknuepfung ?? null,
      ownerId: filter?.ownerId ?? null,
      stage: null,
      companyId: null,
      openOnly: null,
      pipelineId,
    },
  });

  const [moveDealToStage] = useMutation(MOVE_DEAL_TO_STAGE, {
    refetchQueries: [DEALS, WORKSPACE_SUMMARY],
  });

  const [updateDeal] = useMutation(UPDATE_DEAL, {
    refetchQueries: [DEALS, WORKSPACE_SUMMARY],
  });

  const deals = data?.deals.items ?? [];

  const zahlFelder: ZahlFeld[] = [
    ...(betragVerborgen ? [] : [{ feld: 'amount', label: 'Betrag' }]),
    ...eigeneFelder
      .filter((feld) => feld.type === 'NUMBER' || feld.type === 'CURRENCY')
      .map((feld) => ({
        feld: `custom:${feld.key}`,
        label: feld.label,
        waehrung: feld.type === 'CURRENCY' ? (feld.waehrung ?? 'EUR') : null,
      })),
  ];
  const optionen = aggregatOptionen(
    zahlFelder,
    feldrechte.standard('deal', 'probability') !== 'verborgen',
  );
  const aggregat = gueltigesAggregat(karte.aggregat, optionen);
  const wahrscheinlichkeitVon = (deal: Deal) =>
    deal.probability ??
    phasen.find((phase) => phase.stage === deal.stage)?.probability ??
    0;
  const zahlFormat = (wert: number, waehrung: string | null) =>
    waehrung === null
      ? new Intl.NumberFormat('de-DE').format(wert)
      : formatCurrency(wert, waehrung);

  const speichereFeld = (
    deal: Deal,
    feld: string,
    wert: string | number | null,
  ): Promise<unknown> => {
    const eigenes = feld.startsWith('custom:')
      ? feld.slice('custom:'.length)
      : null;
    const person =
      feld === 'owner' && wert !== null
        ? team.find((eintrag) => eintrag.id === wert)
        : undefined;
    const input =
      eigenes !== null
        ? { id: deal.id, customFields: { [eigenes]: wert } }
        : feld === 'owner'
          ? { id: deal.id, ownerId: wert }
          : { id: deal.id, [feld]: wert };

    return updateDeal({
      variables: { input },
      optimisticResponse: {
        updateDeal: {
          ...deal,
          __typename: 'Deal',
          probability: deal.probability ?? null,
          lostReason: deal.lostReason ?? null,
          owner:
            feld === 'owner'
              ? person === undefined
                ? null
                : { __typename: 'User', ...person }
              : (deal.owner ?? null),
          customFields:
            eigenes === null
              ? (deal.customFields ?? {})
              : { ...(deal.customFields ?? {}), [eigenes]: wert },
          ...(eigenes === null && feld !== 'owner' ? { [feld]: wert } : {}),
        },
      },
    }).catch((fehler: Error) => {
      toast.zeige({ text: fehler.message });
      setMeldung(`Nicht gespeichert: ${fehler.message}`);
      throw fehler;
    });
  };

  const eingabeFuer = (
    feld: string,
    eigenes: CustomField | undefined,
  ): {
    typ: EingabeTyp;
    optionen?: { wert: string; label: string }[];
  } | null => {
    const typ = kartenFeldEingabe(feld, eigenes?.type);

    if (typ === null) {
      return null;
    }

    if (feld === 'owner') {
      return {
        typ,
        optionen: [
          { wert: '', label: '— niemand —' },
          ...team.map((person) => ({
            wert: person.id,
            label: personName(person),
          })),
        ],
      };
    }

    if (eigenes?.type === 'RATING') {
      return {
        typ,
        optionen: [
          { wert: '', label: '—' },
          ...[1, 2, 3, 4, 5].map((stern) => ({
            wert: String(stern),
            label: `${String(stern)} von 5 Sternen`,
          })),
        ],
      };
    }

    if (eigenes?.type === 'SELECT') {
      return {
        typ,
        optionen: [
          { wert: '', label: '—' },
          ...eigenes.options.map((option) => ({ wert: option, label: option })),
        ],
      };
    }

    return { typ };
  };

  const darfFeld = (feld: string, eigenes: CustomField | undefined) =>
    kartenFeldBearbeitbar(
      darfAendern,
      eigenes !== undefined
        ? feldrechte.eigenes('deal', eigenes.key)
        : feldrechte.standard('deal', feld),
      kartenFeldEingabe(feld, eigenes?.type),
    );

  const feldAufKarte = (
    deal: Deal,
    feld: string,
    anzeige: ReactNode,
    className?: string,
  ) => {
    const eigenes = eigeneFelder.find(
      (eintrag) => `custom:${eintrag.key}` === feld,
    );
    const eingabe = eingabeFuer(feld, eigenes);
    const label =
      kartenFelder.find((eintrag) => eintrag.key === feld)?.label ?? feld;
    const roh =
      feld === 'owner'
        ? (deal.owner?.id ?? null)
        : eigenes !== undefined
          ? ausgangsWert(deal.customFields?.[eigenes.key])
          : ausgangsWert(deal[feld as keyof Deal]);
    const ausgang =
      eingabe?.typ === 'select' && typeof roh === 'number' ? String(roh) : roh;

    return (
      <KartenFeld
        label={`${label} von „${deal.name}“`}
        typ={eingabe?.typ ?? 'text'}
        optionen={eingabe?.optionen}
        ausgang={ausgang}
        darfAendern={eingabe !== null && darfFeld(feld, eigenes)}
        anzeige={anzeige}
        className={className}
        onSpeichern={(wert) =>
          speichereFeld(
            deal,
            feld,
            eigenes?.type === 'RATING' && typeof wert === 'string'
              ? Number(wert)
              : wert,
          )
        }
        onBearbeiten={(an) =>
          setBearbeitet((alt) => (an ? deal.id : alt === deal.id ? null : alt))
        }
      />
    );
  };

  const verschieben = (id: string, stage: DealStage) => {
    const deal = deals.find((entry) => entry.id === id);

    if (deal === undefined || deal.stage === stage) {
      return;
    }

    void moveDealToStage({
      variables: { id, stage },
      optimisticResponse: {
        moveDealToStage: { ...deal, stage, __typename: 'Deal' },
      },
    }).catch((fehler: Error) => {
      toast.zeige({ text: fehler.message });
      setMeldung(`Nicht verschoben: ${fehler.message}`);
    });
  };

  const ziehen = useKartenZiehen((id, ziel) => {
    const deal = deals.find((entry) => entry.id === id);
    const phase = phasen.find((entry) => entry.stage === ziel);

    if (deal !== undefined && phase !== undefined && deal.stage !== ziel) {
      setMeldung(`„${deal.name}“ nach ${phase.label} verschoben.`);
    }

    verschieben(id, ziel as DealStage);
  });

  useEffect(() => {
    const id = fokusNach.current;

    if (id === null) {
      return;
    }

    const karte = document.querySelector<HTMLElement>(`[data-deal-id="${id}"]`);

    if (karte !== null) {
      karte.focus();
      fokusNach.current = null;
    }
  });

  const spalten: BoardSpalte[] = phasen
    .map(({ stage, label, ausgeblendet }) => ({
      stage,
      label,
      nimmtAn: !ausgeblendet,
      karten: deals
        .filter((deal) => deal.stage === stage)
        .map((deal) => deal.id),
    }))
    .filter((spalte) => spalte.nimmtAn || spalte.karten.length > 0);

  const beiTaste = (event: KeyboardEvent<HTMLElement>, deal: Deal) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    const ergebnis = tasteImBoard(
      event.key,
      spalten,
      deal.id,
      getragen?.dealId === deal.id ? getragen : null,
    );

    if (ergebnis.art === 'nichts') {
      return;
    }

    if (event.key !== 'Tab') {
      event.preventDefault();
    }

    const text = ansage(ergebnis, spalten, deal.name);

    if (text !== null) {
      setMeldung(text);
    }

    switch (ergebnis.art) {
      case 'fokus':
        document
          .querySelector<HTMLElement>(`[data-deal-id="${ergebnis.dealId}"]`)
          ?.focus();
        break;
      case 'aufnehmen':
      case 'ziel':
        setGetragen(ergebnis.getragen);
        break;
      case 'ablegen':
        setGetragen(null);
        fokusNach.current = deal.id;
        verschieben(deal.id, ergebnis.getragen.ziel as DealStage);
        break;
      case 'abbrechen':
        setGetragen(null);
        break;
    }
  };

  if (loading && data === undefined) {
    return <LoadingAnnouncement />;
  }

  if (error !== undefined) {
    return <div className="error-banner">{error.message}</div>;
  }

  const beyond = (data?.deals.totalCount ?? 0) - deals.length;

  const kartenWert = (deal: Deal, feld: string) => {
    if (feld === 'owner') {
      return personName(deal.owner ?? null);
    }

    if (feld === 'lostReason') {
      return deal.lostReason ?? '—';
    }

    const eigenes = eigeneFelder.find(
      (eintrag) => `custom:${eintrag.key}` === feld,
    );

    return eigenes === undefined
      ? '—'
      : (customFieldAnzeige(eigenes, deal.customFields?.[eigenes.key]) ?? '—');
  };

  return (
    <>
      {beyond > 0 && (
        <div className="notice">
          Das Board zeigt die ersten {BOARD_PAGE} Geschäfte; {beyond} weitere
          finden Sie in der Liste.
        </div>
      )}

      <p id="board-anleitung" className="visually-hidden">
        {darfAendern
          ? 'Leertaste nimmt das Geschäft auf. Pfeil links und rechts wählen die Phase, Leertaste legt ab, Escape bricht ab. Pfeil hoch und runter gehen zur nächsten Karte.'
          : 'Pfeiltasten gehen von Karte zu Karte.'}
      </p>
      <div className="visually-hidden" role="status" aria-live="assertive">
        {meldung}
      </div>

      <details className="board-karte">
        <summary>Karten</summary>
        <fieldset className="board-karte__wahl">
          <legend>Was jede Karte zeigt</legend>
          <label>
            <input
              type="checkbox"
              checked={karte.kompakt}
              onChange={(event) =>
                waehleKarte({ ...karte, kompakt: event.target.checked })
              }
            />
            Kompakt: nur der Name
          </label>
          {kartenFelder.map((feld) => (
            <label key={feld.key}>
              <input
                type="checkbox"
                disabled={karte.kompakt}
                checked={karte.felder.includes(feld.key)}
                onChange={() =>
                  waehleKarte(umschalten(karte, feld.key, reihenfolge))
                }
              />
              {feld.label}
            </label>
          ))}
        </fieldset>
      </details>

      <div className={karte.kompakt ? 'board board--kompakt' : 'board'}>
        {phasen.map(({ stage, label, farbe, ausgeblendet }) => {
          const column = deals.filter((deal) => deal.stage === stage);

          if (ausgeblendet && column.length === 0) {
            return null;
          }

          const ergebnis =
            aggregat === null
              ? null
              : berechneAggregat(column, aggregat, {
                  feld: zahlFelder.find((feld) => feld.feld === aggregat.feld),
                  wahrscheinlichkeit: wahrscheinlichkeitVon,
                });
          const kennzahl =
            ergebnis === null ? '' : aggregatText(ergebnis, zahlFormat);
          const istZiel =
            (getragen !== null &&
              getragen.ziel === stage &&
              getragen.ziel !== getragen.von) ||
            (ziehen.zustand !== null &&
              ziehen.zustand.ziel === stage &&
              column.every((deal) => deal.id !== ziehen.zustand?.dealId));
          const getrageneKarte =
            getragen !== null && istZiel
              ? deals.find((deal) => deal.id === getragen.dealId)
              : undefined;

          return (
            <section
              key={stage}
              className={
                istZiel
                  ? `board__column board__column--${stage.toLowerCase()} is-drag-over`
                  : `board__column board__column--${stage.toLowerCase()}`
              }
              aria-label={label}
              data-board-ziel={ausgeblendet ? undefined : stage}
            >
              <header className="board__head">
                <span
                  className={
                    farbe === null
                      ? 'board__stage'
                      : `board__stage badge phase--${farbe}`
                  }
                >
                  {label}
                </span>
                <span className="board__count">{column.length}</span>
                {onNeu !== undefined && darfAendern && !ausgeblendet && (
                  <button
                    type="button"
                    className="board__neu"
                    aria-label={`Neues Geschäft in „${label}“`}
                    title={`Neues Geschäft in „${label}“`}
                    onClick={() => onNeu(stage)}
                  >
                    +
                  </button>
                )}
                {aggregat !== null && (
                  <span className="board__total">
                    <RowMenu
                      label={`Kennzahl in „${label}“: ${aggregatName(aggregat, zahlFelder)}, ${kennzahl}. Ändern`}
                      ausloeser={{
                        className: 'board__kennzahl',
                        inhalt: (
                          <>
                            {AGGREGAT_ZEICHEN[aggregat.art] !== '' && (
                              <span className="board__kennzahl-art">
                                {AGGREGAT_ZEICHEN[aggregat.art]}
                              </span>
                            )}
                            {kennzahl}
                          </>
                        ),
                      }}
                      items={optionen.map((option) => ({
                        label: aggregatName(option, zahlFelder),
                        gewaehlt:
                          option.art === aggregat.art &&
                          option.feld === aggregat.feld,
                        onSelect: () =>
                          waehleKarte({ ...karte, aggregat: option }),
                      }))}
                    />
                  </span>
                )}
              </header>

              <div className="board__cards">
                {column.map((deal) => {
                  const klasse =
                    getragen?.dealId === deal.id
                      ? 'board__card is-lifted'
                      : ziehen.zustand?.dealId === deal.id
                        ? 'board__card is-dragging'
                        : 'board__card';
                  const ziele = spalten.filter(
                    (spalte) => spalte.nimmtAn && spalte.stage !== deal.stage,
                  );

                  return (
                    <article
                      key={deal.id}
                      data-deal-id={deal.id}
                      className={klasse}
                      tabIndex={0}
                      aria-roledescription={
                        darfAendern ? 'verschiebbare Karte' : 'Karte'
                      }
                      aria-label={deal.name}
                      aria-describedby="board-anleitung"
                      onKeyDown={(event) => {
                        if (darfAendern) {
                          beiTaste(event, deal);
                        } else if (
                          event.target === event.currentTarget &&
                          event.key.startsWith('Arrow')
                        ) {
                          const ergebnis = tasteImBoard(
                            event.key,
                            spalten,
                            deal.id,
                            null,
                          );

                          if (ergebnis.art === 'fokus') {
                            event.preventDefault();
                            document
                              .querySelector<HTMLElement>(
                                `[data-deal-id="${ergebnis.dealId}"]`,
                              )
                              ?.focus();
                          }
                        }
                      }}
                      onBlur={(event) => {
                        if (
                          getragen?.dealId === deal.id &&
                          !event.currentTarget.contains(
                            event.relatedTarget as Node | null,
                          )
                        ) {
                          setGetragen(null);
                        }
                      }}
                      onPointerDown={
                        darfAendern && bearbeitet !== deal.id
                          ? (event) => ziehen.onPointerDown(event, deal.id)
                          : undefined
                      }
                    >
                      <div className="board__card-top">
                        <Link
                          to={`/geschaefte/${deal.id}`}
                          className="board__card-title"
                          draggable={false}
                        >
                          {deal.name}
                        </Link>
                        {darfAendern && ziele.length > 0 && (
                          <RowMenu
                            label={`Aktionen für ${deal.name}`}
                            items={ziele.map((spalte) => ({
                              label: `In Phase „${spalte.label}“ verschieben`,
                              onSelect: () => {
                                setMeldung(
                                  `„${deal.name}“ nach ${spalte.label} verschoben.`,
                                );
                                fokusNach.current = deal.id;
                                verschieben(deal.id, spalte.stage as DealStage);
                              },
                            }))}
                          />
                        )}
                      </div>
                      {gezeigt.includes('company') && deal.company !== null && (
                        <div className="board__card-company">
                          <Avatar name={deal.company.name} size="sm" />
                          <span>{deal.company.name}</span>
                        </div>
                      )}
                      {(gezeigt.includes('amount') ||
                        gezeigt.includes('closeDate')) && (
                        <div className="board__card-foot">
                          {gezeigt.includes('amount') &&
                            feldAufKarte(
                              deal,
                              'amount',
                              formatCurrency(deal.amount, deal.currency),
                              'board__card-amount',
                            )}
                          {gezeigt.includes('closeDate') &&
                            feldAufKarte(
                              deal,
                              'closeDate',
                              formatDate(deal.closeDate),
                              'board__card-date',
                            )}
                        </div>
                      )}
                      {gezeigt
                        .filter(
                          (feld) =>
                            !['company', 'amount', 'closeDate'].includes(feld),
                        )
                        .map((feld) => (
                          <div key={feld} className="board__card-feld">
                            <span className="board__card-feld-name">
                              {
                                kartenFelder.find(
                                  (eintrag) => eintrag.key === feld,
                                )?.label
                              }
                            </span>
                            {feldAufKarte(deal, feld, kartenWert(deal, feld))}
                          </div>
                        ))}
                    </article>
                  );
                })}

                {getrageneKarte !== undefined && (
                  <div className="board__ablage" aria-hidden="true">
                    „{getrageneKarte.name}“ hier ablegen
                  </div>
                )}

                {column.length === 0 && getrageneKarte === undefined && (
                  <div className="board__empty">Leer</div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
};
