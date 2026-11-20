import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';

import { ObjectHeader } from '../components/ObjectHeader';
import { IconDeals } from '../components/Icons';
import { LoadingAnnouncement } from '../components/Skeleton';
import { StatusTabs } from '../components/StatusTabs';
import {
  CREATE_PIPELINE,
  DELETE_PIPELINE,
  PIPELINES,
  RENAME_PIPELINE,
  UPDATE_DEAL_STAGES,
} from '../lib/queries';
import { type Pipeline, type StageSetting } from '../lib/stages';
import { type DealStage, OPTION_FARBEN } from '../lib/types';
import { TableWrap } from '../components/TableWrap';

const FEST: Partial<Record<DealStage, number>> = { WON: 100, LOST: 0 };
const IMMER_SICHTBAR: DealStage[] = ['WON', 'LOST'];

type Zeile = {
  label: string;
  probability: string;
  farbe: string;
  ausgeblendet: boolean;
};

type Entwurf = Record<string, Zeile>;

const zeileAus = (phase: StageSetting): Zeile => ({
  label: phase.label,
  probability: String(phase.probability),
  farbe: phase.farbe ?? '',
  ausgeblendet: phase.ausgeblendet,
});

export const StagesPage = () => {
  const { data, loading, error } = useQuery<{
    pipelines: Pipeline[];
  }>(PIPELINES);
  const refetchQueries = [PIPELINES];
  const [speichern, { loading: speichert, error: fehler }] = useMutation(
    UPDATE_DEAL_STAGES,
    { refetchQueries },
  );
  const [anlegen, anlegenZustand] = useMutation<{
    createPipeline: { id: string };
  }>(CREATE_PIPELINE, { refetchQueries });
  const [umbenennen, umbenennenZustand] = useMutation(RENAME_PIPELINE, {
    refetchQueries,
  });
  const [loeschen, loeschenZustand] = useMutation(DELETE_PIPELINE, {
    refetchQueries,
  });

  const [aktivId, setAktivId] = useState<string | null>(null);
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const [gespeichert, setGespeichert] = useState(false);
  const [neuerName, setNeuerName] = useState('');
  const [name, setName] = useState<string | null>(null);
  const [ziel, setZiel] = useState('');

  if (loading && data === undefined) {
    return <LoadingAnnouncement />;
  }

  if (error !== undefined) {
    return <div className="error-banner">{error.message}</div>;
  }

  const pipelines = data?.pipelines ?? [];
  const standard = pipelines[0];
  const aktiv =
    pipelines.find((pipeline) => pipeline.id === aktivId) ?? standard;

  if (aktiv === undefined) {
    return null;
  }

  const istStandard = aktiv.id === standard.id;
  const phasen = aktiv.phasen;
  const geerbt = (stage: DealStage): StageSetting | undefined =>
    standard.phasen.find((phase) => phase.stage === stage);

  const wert = (phase: StageSetting): Zeile =>
    entwurf?.[phase.stage] ?? zeileAus(phase);

  const setze = <K extends keyof Zeile>(
    phase: StageSetting,
    feld: K,
    neu: Zeile[K],
  ) => {
    setGespeichert(false);
    setEntwurf({
      ...entwurf,
      [phase.stage]: { ...wert(phase), [feld]: neu },
    });
  };

  const wechseln = (id: string) => {
    setAktivId(id);
    setEntwurf(null);
    setGespeichert(false);
    setName(null);
    setZiel('');
  };

  const sichern = async () => {
    if (entwurf === null) {
      return;
    }

    await speichern({
      variables: {
        pipelineId: aktiv.id,
        input: phasen.map((phase) => {
          const zeile = wert(phase);
          const basis = istStandard ? undefined : geerbt(phase.stage);
          const label = zeile.label.trim();
          const prozent = zeile.probability.trim();

          return {
            stage: phase.stage,
            label:
              label === (basis?.label ?? phase.defaultLabel) ? null : label,
            probability:
              FEST[phase.stage] !== undefined ||
              prozent === '' ||
              (basis !== undefined && Number(prozent) === basis.probability)
                ? null
                : Number(prozent),
            farbe: zeile.farbe === (basis?.farbe ?? '') ? null : zeile.farbe,
            ausgeblendet:
              IMMER_SICHTBAR.includes(phase.stage) ||
              zeile.ausgeblendet === (basis?.ausgeblendet ?? false)
                ? null
                : zeile.ausgeblendet,
          };
        }),
      },
    }).catch(() => undefined);
    setEntwurf(null);
    setGespeichert(true);
  };

  const anlegenUndZeigen = async () => {
    const ergebnis = await anlegen({
      variables: { name: neuerName.trim() },
    }).catch(() => null);
    const id = ergebnis?.data?.createPipeline.id;

    if (id !== undefined) {
      setNeuerName('');
      wechseln(id);
    }
  };

  const andere = pipelines.filter((pipeline) => pipeline.id !== aktiv.id);
  const verwaltungsFehler =
    anlegenZustand.error ?? umbenennenZustand.error ?? loeschenZustand.error;

  return (
    <>
      <ObjectHeader
        hilfe="geschaefte"
        kind="deal"
        icon={IconDeals}
        label="Einstellungen"
        title="Pipelines und Phasen"
        note="Mehrere Verkaufsstrecken, etwa Neukunden und Wartungsverträge, mit eigenen Namen, Farben und Wahrscheinlichkeiten je Phase. Daraus rechnet die Übersicht die Prognose."
        actions={
          <button
            type="button"
            className="button"
            disabled={entwurf === null || speichert}
            onClick={() => void sichern()}
          >
            Speichern
          </button>
        }
      />

      {(fehler ?? verwaltungsFehler) !== undefined && (
        <div className="error-banner">
          {(fehler ?? verwaltungsFehler)?.message}
        </div>
      )}
      {gespeichert && entwurf === null && fehler === undefined && (
        <div className="notice" role="status">
          Gespeichert.
        </div>
      )}

      <StatusTabs
        tabs={pipelines.map((pipeline) => ({
          key: pipeline.id,
          label: pipeline.name,
          count: pipeline.anzahlGeschaefte,
        }))}
        active={aktiv.id}
        onChange={wechseln}
      />

      <div className="pipeline-verwaltung">
        <form
          className="pipeline-verwaltung__zeile"
          onSubmit={(event) => {
            event.preventDefault();

            if (name !== null && name.trim() !== '') {
              void umbenennen({
                variables: { id: aktiv.id, name: name.trim() },
              })
                .then(() => setName(null))
                .catch(() => null);
            }
          }}
        >
          <label htmlFor="pipeline-name">Name</label>
          <input
            id="pipeline-name"
            maxLength={80}
            value={name ?? aktiv.name}
            onChange={(event) => setName(event.target.value)}
          />
          <button
            type="submit"
            className="button button--ghost button--small"
            disabled={name === null || name.trim() === aktiv.name}
          >
            Umbenennen
          </button>
          {istStandard && (
            <span className="field__hint">
              Standard-Pipeline: neue Geschäfte landen hier, und ihre Phasen
              gelten für alle anderen, solange die nichts Eigenes sagen.
            </span>
          )}
        </form>

        {!istStandard && (
          <form
            className="pipeline-verwaltung__zeile"
            onSubmit={(event) => {
              event.preventDefault();

              if (window.confirm(`Pipeline „${aktiv.name}“ löschen?`)) {
                void loeschen({
                  variables: {
                    id: aktiv.id,
                    verschiebenNach: ziel === '' ? null : ziel,
                  },
                })
                  .then(() => wechseln(standard.id))
                  .catch(() => null);
              }
            }}
          >
            {aktiv.anzahlGeschaefte > 0 && (
              <>
                <label htmlFor="pipeline-ziel">
                  {aktiv.anzahlGeschaefte} Geschäfte verschieben nach
                </label>
                <select
                  id="pipeline-ziel"
                  value={ziel}
                  onChange={(event) => setZiel(event.target.value)}
                >
                  <option value="">— wählen —</option>
                  {andere.map((pipeline) => (
                    <option key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <button
              type="submit"
              className="button button--danger button--small"
              disabled={aktiv.anzahlGeschaefte > 0 && ziel === ''}
            >
              Pipeline löschen
            </button>
          </form>
        )}

        <form
          className="pipeline-verwaltung__zeile"
          onSubmit={(event) => {
            event.preventDefault();
            void anlegenUndZeigen();
          }}
        >
          <label htmlFor="pipeline-neu">Neue Pipeline</label>
          <input
            id="pipeline-neu"
            maxLength={80}
            placeholder="z. B. Wartungsverträge"
            value={neuerName}
            onChange={(event) => setNeuerName(event.target.value)}
          />
          <button
            type="submit"
            className="button button--ghost button--small"
            disabled={neuerName.trim() === '' || anlegenZustand.loading}
          >
            Anlegen
          </button>
        </form>
      </div>

      <TableWrap>
        <table className="stages-table">
          <thead>
            <tr>
              <th>Phase</th>
              <th>Name in dieser Pipeline</th>
              <th className="numeric">Wahrscheinlichkeit</th>
              <th>Farbe</th>
              <th>Benutzt</th>
            </tr>
          </thead>
          <tbody>
            {phasen.map((phase) => {
              const zeile = wert(phase);
              const fest = FEST[phase.stage];
              const immer = IMMER_SICHTBAR.includes(phase.stage);

              return (
                <tr
                  key={phase.stage}
                  className={zeile.ausgeblendet ? 'is-muted' : undefined}
                >
                  <td className="stages-table__default">
                    <span
                      className={
                        zeile.farbe === ''
                          ? 'badge'
                          : `badge phase--${zeile.farbe}`
                      }
                    >
                      {phase.defaultLabel}
                    </span>
                  </td>
                  <td>
                    <input
                      aria-label={`Name für ${phase.defaultLabel}`}
                      value={zeile.label}
                      maxLength={40}
                      onChange={(event) =>
                        setze(phase, 'label', event.target.value)
                      }
                    />
                  </td>
                  <td className="numeric">
                    {fest === undefined ? (
                      <span className="stages-table__percent">
                        <input
                          aria-label={`Wahrscheinlichkeit für ${phase.defaultLabel}`}
                          type="number"
                          min={0}
                          max={100}
                          value={zeile.probability}
                          onChange={(event) =>
                            setze(phase, 'probability', event.target.value)
                          }
                        />
                        %
                      </span>
                    ) : (
                      `${String(fest)} %`
                    )}
                  </td>
                  <td>
                    <select
                      aria-label={`Farbe für ${phase.defaultLabel}`}
                      value={zeile.farbe}
                      onChange={(event) =>
                        setze(phase, 'farbe', event.target.value)
                      }
                    >
                      <option value="">Standard</option>
                      {OPTION_FARBEN.map((farbe) => (
                        <option key={farbe.wert} value={farbe.wert}>
                          {farbe.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${phase.defaultLabel} benutzt`}
                      checked={!zeile.ausgeblendet}
                      disabled={immer}
                      title={
                        immer
                          ? 'Gewonnen und Verloren gibt es in jeder Pipeline.'
                          : undefined
                      }
                      onChange={(event) =>
                        setze(phase, 'ausgeblendet', !event.target.checked)
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      <p className="field__hint">
        Eine Phase, die eine Pipeline nicht benutzt, fällt aus Auswahl und
        Board. Geschäfte, die schon in ihr liegen, bleiben dort, bis jemand sie
        weiterschiebt.
      </p>
    </>
  );
};
