import { useQuery } from '@apollo/client';
import { useState } from 'react';

import { IconDeals } from '../components/Icons';
import { ObjectHeader } from '../components/ObjectHeader';
import { LoadingAnnouncement, SkeletonMetrics } from '../components/Skeleton';
import { personName, useTeam } from '../components/Verantwortlich';
import { useAuth } from '../lib/auth';
import { AUSWERTUNG } from '../lib/queries';
import { DEAL_STAGES, type DealStage, formatCurrency } from '../lib/types';
import { usePipelines, useStageLabel } from '../lib/stages';
import { zeitraum, ZEITRAUM_LABELS, type ZeitraumArt } from '../lib/zeitraum';
import { TableWrap } from '../components/TableWrap';

type Monat = {
  monat: string;
  gewonnenAnzahl: number;
  gewonnenSumme: number;
  verlorenAnzahl: number;
  verlorenSumme: number;
};

type AuswertungData = {
  auswertung: {
    gewonnenAnzahl: number;
    gewonnenSumme: number;
    verlorenAnzahl: number;
    verlorenSumme: number;
    abschlussquote: number | null;
    durchschnittWert: number | null;
    durchschnittTage: number | null;
    neueGeschaefte: number;
    monate: Monat[];
    verkaeufer: {
      ownerId: string | null;
      name: string;
      offenAnzahl: number;
      offenSumme: number;
      gewonnenAnzahl: number;
      gewonnenSumme: number;
      verlorenAnzahl: number;
      quote: number | null;
    }[];
    verlustgruende: { grund: string; anzahl: number; summe: number }[];
    verweildauer: { phase: string; anzahl: number; tage: number }[];
    betraegeVerborgen: boolean;
  };
};

const MONATE = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];

const monatsname = (monat: string): string =>
  `${MONATE[Number(monat.slice(5, 7)) - 1]} ${monat.slice(2, 4)}`;

const prozent = (wert: number | null): string =>
  wert === null
    ? '—'
    : new Intl.NumberFormat('de-DE', {
        style: 'percent',
        maximumFractionDigits: 0,
      }).format(wert);

const SPEICHER = 'stegwerk.auswertungen';

type Auswahl = { art: ZeitraumArt; von: string; bis: string; wer: string };

const gemerkt = (): Auswahl => {
  const vorgabe = { art: 'zwoelf' as const, ...zeitraum('zwoelf'), wer: '' };

  try {
    const roh = window.localStorage.getItem(SPEICHER);
    const wert = roh === null ? null : (JSON.parse(roh) as Partial<Auswahl>);

    if (wert?.art === undefined || !(wert.art in ZEITRAUM_LABELS)) {
      return vorgabe;
    }

    return wert.art === 'frei'
      ? {
          art: 'frei',
          von: wert.von ?? vorgabe.von,
          bis: wert.bis ?? vorgabe.bis,
          wer: wert.wer ?? '',
        }
      : { art: wert.art, ...zeitraum(wert.art), wer: wert.wer ?? '' };
  } catch {
    return vorgabe;
  }
};

const MonatsChart = ({
  monate,
  verborgen,
}: {
  monate: Monat[];
  verborgen: boolean;
}) => {
  const gewonnen = (m: Monat) =>
    verborgen ? m.gewonnenAnzahl : m.gewonnenSumme;
  const verloren = (m: Monat) =>
    verborgen ? m.verlorenAnzahl : m.verlorenSumme;
  const geld = (n: number) => (verborgen ? '' : ` · ${formatCurrency(n)}`);
  const hoechster = Math.max(
    1,
    ...monate.map((m) => Math.max(gewonnen(m), verloren(m))),
  );

  return (
    <div className="card auswertung-chart">
      <div className="auswertung-chart__legende" aria-hidden="true">
        <span className="auswertung-chart__punkt auswertung-chart__punkt--gewonnen" />
        Gewonnen
        <span className="auswertung-chart__punkt auswertung-chart__punkt--verloren" />
        Verloren
      </div>
      <div
        className="auswertung-chart__balken"
        role="list"
        style={{
          gridTemplateColumns: `repeat(${String(monate.length)}, minmax(0, 1fr))`,
        }}
      >
        {monate.map((m) => (
          <div
            key={m.monat}
            className="auswertung-chart__monat"
            role="listitem"
            aria-label={`${monatsname(m.monat)}: ${String(m.gewonnenAnzahl)} gewonnen${geld(m.gewonnenSumme)}; ${String(m.verlorenAnzahl)} verloren${geld(m.verlorenSumme)}`}
            title={`${String(m.gewonnenAnzahl)} gewonnen${geld(m.gewonnenSumme)}\n${String(m.verlorenAnzahl)} verloren${geld(m.verlorenSumme)}`}
          >
            <div className="auswertung-chart__spur">
              <div
                className="auswertung-chart__saeule auswertung-chart__saeule--gewonnen"
                style={{
                  height: `${String((gewonnen(m) / hoechster) * 100)}%`,
                }}
              />
              <div
                className="auswertung-chart__saeule auswertung-chart__saeule--verloren"
                style={{
                  height: `${String((verloren(m) / hoechster) * 100)}%`,
                }}
              />
            </div>
            <div className="forecast__label">{monatsname(m.monat)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const PIPELINE_SPEICHER = 'stegwerk.auswertungen.pipeline';

export const AuswertungenPage = () => {
  const pipelines = usePipelines();
  const [pipelineRoh, setPipelineRoh] = useState<string>(() => {
    try {
      return window.localStorage.getItem(PIPELINE_SPEICHER) ?? '';
    } catch {
      return '';
    }
  });
  const pipelineId =
    pipelines.find((pipeline) => pipeline.id === pipelineRoh)?.id ?? null;
  const setPipeline = (neu: string) => {
    setPipelineRoh(neu);

    try {
      window.localStorage.setItem(PIPELINE_SPEICHER, neu);
    } catch {}
  };
  const stageLabel = useStageLabel(pipelineId);
  const { session } = useAuth();
  const team = useTeam();
  const [auswahl, setAuswahlRoh] = useState<Auswahl>(gemerkt);

  const setAuswahl = (neu: Auswahl) => {
    setAuswahlRoh(neu);

    try {
      window.localStorage.setItem(SPEICHER, JSON.stringify(neu));
    } catch {}
  };

  const ownerId =
    auswahl.wer === ''
      ? null
      : auswahl.wer === 'me'
        ? (session?.user.id ?? null)
        : auswahl.wer;

  const gueltig =
    auswahl.von !== '' && auswahl.bis !== '' && auswahl.von <= auswahl.bis;

  const { data, loading, error } = useQuery<AuswertungData>(AUSWERTUNG, {
    variables: { von: auswahl.von, bis: auswahl.bis, ownerId, pipelineId },
    skip: !gueltig,
  });

  const a = data?.auswertung;
  const geld = (n: number | null) =>
    a?.betraegeVerborgen === true ? '—' : formatCurrency(n);

  return (
    <>
      <ObjectHeader
        hilfe="auswertungen"
        kind="deal"
        icon={IconDeals}
        label="Auswertungen"
        title="Was aus den Geschäften wurde"
      />

      <div className="toolbar">
        <select
          className="toolbar__filter"
          aria-label="Zeitraum"
          value={auswahl.art}
          onChange={(event) => {
            const art = event.target.value as ZeitraumArt;

            setAuswahl(
              art === 'frei'
                ? { ...auswahl, art }
                : { ...auswahl, art, ...zeitraum(art) },
            );
          }}
        >
          {(Object.keys(ZEITRAUM_LABELS) as ZeitraumArt[]).map((art) => (
            <option key={art} value={art}>
              {ZEITRAUM_LABELS[art]}
            </option>
          ))}
        </select>

        {auswahl.art === 'frei' && (
          <>
            <input
              type="date"
              className="toolbar__filter"
              aria-label="Von"
              value={auswahl.von}
              onChange={(event) =>
                setAuswahl({ ...auswahl, von: event.target.value })
              }
            />
            <input
              type="date"
              className="toolbar__filter"
              aria-label="Bis"
              value={auswahl.bis}
              onChange={(event) =>
                setAuswahl({ ...auswahl, bis: event.target.value })
              }
            />
          </>
        )}

        <select
          className="toolbar__filter"
          aria-label="Verkäufer"
          value={auswahl.wer}
          onChange={(event) =>
            setAuswahl({ ...auswahl, wer: event.target.value })
          }
        >
          <option value="">Ganzes Team</option>
          <option value="me">Nur meine</option>
          {team.map((person) => (
            <option key={person.id} value={person.id}>
              {personName(person)}
            </option>
          ))}
        </select>

        {pipelines.length > 1 && (
          <select
            className="toolbar__filter"
            aria-label="Pipeline"
            value={pipelineId ?? ''}
            onChange={(event) => setPipeline(event.target.value)}
          >
            <option value="">Alle Pipelines</option>
            {pipelines.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {!gueltig && (
        <div className="error-banner">
          Bitte ein Von- und ein Bis-Datum wählen; Von liegt nicht nach Bis.
        </div>
      )}

      {error !== undefined && (
        <div className="error-banner">{error.message}</div>
      )}

      {loading && a === undefined ? (
        <>
          <LoadingAnnouncement />
          <SkeletonMetrics count={6} />
        </>
      ) : a === undefined ? null : (
        <>
          {a.betraegeVerborgen && (
            <p className="muted">
              Beträge sind für Ihre Rolle verborgen; Anzahlen und Quoten bleiben
              sichtbar.
            </p>
          )}
          <div className="metrics">
            <div className="card metric">
              <div className="metric__label">Gewonnen</div>
              <div className="metric__value">{geld(a.gewonnenSumme)}</div>
              <div className="metric__sub">
                {a.gewonnenAnzahl}{' '}
                {a.gewonnenAnzahl === 1 ? 'Geschäft' : 'Geschäfte'}
              </div>
            </div>
            <div className="card metric">
              <div className="metric__label">Verloren</div>
              <div className="metric__value">{geld(a.verlorenSumme)}</div>
              <div className="metric__sub">
                {a.verlorenAnzahl}{' '}
                {a.verlorenAnzahl === 1 ? 'Geschäft' : 'Geschäfte'}
              </div>
            </div>
            <div className="card metric">
              <div className="metric__label">Abschlussquote</div>
              <div className="metric__value">{prozent(a.abschlussquote)}</div>
              <div className="metric__sub">
                gewonnen von allen entschiedenen
              </div>
            </div>
            <div className="card metric">
              <div className="metric__label">Ø Auftragswert</div>
              <div className="metric__value">
                {a.durchschnittWert === null ? '—' : geld(a.durchschnittWert)}
              </div>
            </div>
            <div className="card metric">
              <div className="metric__label">Ø Dauer bis Abschluss</div>
              <div className="metric__value">
                {a.durchschnittTage === null
                  ? '—'
                  : `${String(Math.round(a.durchschnittTage))} Tage`}
              </div>
            </div>
            <div className="card metric">
              <div className="metric__label">Neue Geschäfte</div>
              <div className="metric__value">{a.neueGeschaefte}</div>
            </div>
          </div>

          <section className="detail-section">
            <div className="section-heading">
              <h2>Gewonnen und verloren je Monat</h2>
            </div>
            <MonatsChart monate={a.monate} verborgen={a.betraegeVerborgen} />
          </section>

          <section className="detail-section">
            <div className="section-heading">
              <h2>Je Verkäufer</h2>
            </div>
            {a.verkaeufer.length === 0 ? (
              <p className="notes__empty">
                Keine Geschäfte in diesem Zeitraum.
              </p>
            ) : (
              <TableWrap>
                <table>
                  <thead>
                    <tr>
                      <th>Verantwortlich</th>
                      <th className="numeric">Offene Pipeline</th>
                      <th className="numeric">Gewonnen</th>
                      <th className="numeric">Verloren</th>
                      <th className="numeric">Quote</th>
                      <th className="numeric">Umsatz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.verkaeufer.map((v) => (
                      <tr key={v.ownerId ?? 'ohne'}>
                        <td>{v.name}</td>
                        <td className="numeric">
                          {geld(v.offenSumme)}{' '}
                          <span className="auswertung__klein">
                            ({v.offenAnzahl})
                          </span>
                        </td>
                        <td className="numeric">{v.gewonnenAnzahl}</td>
                        <td className="numeric">{v.verlorenAnzahl}</td>
                        <td className="numeric">{prozent(v.quote)}</td>
                        <td className="numeric">{geld(v.gewonnenSumme)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </section>

          <section className="detail-section">
            <div className="section-heading">
              <h2>Verlustgründe</h2>
            </div>
            {a.verlustgruende.length === 0 ? (
              <p className="notes__empty">
                Nichts verloren in diesem Zeitraum.
              </p>
            ) : (
              <TableWrap>
                <table>
                  <thead>
                    <tr>
                      <th>Grund</th>
                      <th className="numeric">Anzahl</th>
                      <th className="numeric">Summe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.verlustgruende.map((g) => (
                      <tr key={g.grund}>
                        <td>{g.grund}</td>
                        <td className="numeric">{g.anzahl}</td>
                        <td className="numeric">{geld(g.summe)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </section>

          <section className="detail-section">
            <div className="section-heading">
              <h2>Verweildauer je Phase</h2>
            </div>
            {a.verweildauer.length === 0 ? (
              <p className="notes__empty">
                In diesem Zeitraum hat kein Geschäft die Phase gewechselt.
              </p>
            ) : (
              <TableWrap>
                <table>
                  <thead>
                    <tr>
                      <th>Phase</th>
                      <th className="numeric">Wechsel</th>
                      <th className="numeric">Ø Tage in der Phase</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...a.verweildauer]
                      .sort(
                        (x, y) =>
                          DEAL_STAGES.indexOf(
                            x.phase.toUpperCase() as DealStage,
                          ) -
                          DEAL_STAGES.indexOf(
                            y.phase.toUpperCase() as DealStage,
                          ),
                      )
                      .map((v) => (
                        <tr key={v.phase}>
                          <td>
                            {stageLabel(v.phase.toUpperCase() as DealStage)}
                          </td>
                          <td className="numeric">{v.anzahl}</td>
                          <td className="numeric">
                            {v.tage.toLocaleString('de-DE', {
                              maximumFractionDigits: 1,
                            })}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </section>
        </>
      )}
    </>
  );
};
