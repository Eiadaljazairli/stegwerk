import { useQuery } from '@apollo/client';
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';

import { PIPELINES } from './queries';
import {
  DEAL_STAGE_LABELS,
  DEAL_STAGES,
  type DealStage,
  stageBadgeClass,
} from './types';

export type StageSetting = {
  stage: DealStage;
  label: string;
  defaultLabel: string;
  probability: number;
  farbe: string | null;
  ausgeblendet: boolean;
};

export type Pipeline = {
  id: string;
  name: string;
  position: number;
  anzahlGeschaefte: number;
  phasen: StageSetting[];
};

const STANDARD_WAHRSCHEINLICHKEIT: Record<DealStage, number> = {
  LEAD: 10,
  QUALIFIED: 25,
  PROPOSAL: 50,
  NEGOTIATION: 75,
  WON: 100,
  LOST: 0,
};

const STANDARD_PHASEN: StageSetting[] = DEAL_STAGES.map((stage) => ({
  stage,
  label: DEAL_STAGE_LABELS[stage],
  defaultLabel: DEAL_STAGE_LABELS[stage],
  probability: STANDARD_WAHRSCHEINLICHKEIT[stage],
  farbe: null,
  ausgeblendet: false,
}));

type Kontext = {
  pipelines: Pipeline[];
  phasen: Map<string, StageSetting[]>;
  standard: StageSetting[];
};

const LEER: Kontext = {
  pipelines: [],
  phasen: new Map(),
  standard: STANDARD_PHASEN,
};

let aktuell: Kontext = LEER;

const phasenVon = (
  kontext: Kontext,
  pipelineId?: string | null,
): StageSetting[] =>
  (pipelineId === undefined || pipelineId === null
    ? undefined
    : kontext.phasen.get(pipelineId)) ?? kontext.standard;

export const stageLabelNow = (stage: DealStage): string =>
  aktuell.standard.find((phase) => phase.stage === stage)?.label ??
  DEAL_STAGE_LABELS[stage];

const PhasenKontext = createContext<Kontext>(LEER);

export const StageSettingsProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const { data } = useQuery<{ pipelines: Pipeline[] }>(PIPELINES);

  const wert = useMemo<Kontext>(() => {
    const pipelines = data?.pipelines ?? [];

    if (pipelines.length === 0) {
      return LEER;
    }

    return {
      pipelines,
      phasen: new Map(pipelines.map((p) => [p.id, p.phasen])),
      standard: pipelines[0].phasen,
    };
  }, [data]);

  aktuell = wert;

  return (
    <PhasenKontext.Provider value={wert}>{children}</PhasenKontext.Provider>
  );
};

export const usePipelines = (): Pipeline[] =>
  useContext(PhasenKontext).pipelines;

export const usePipelineWahl = (
  schluessel: string,
): [string | null, (id: string) => void] => {
  const pipelines = usePipelines();
  const [gemerkt, setGemerkt] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(schluessel);
    } catch {
      return null;
    }
  });

  const gilt =
    pipelines.find((pipeline) => pipeline.id === gemerkt)?.id ??
    pipelines[0]?.id ??
    null;

  const waehle = (id: string) => {
    setGemerkt(id);

    try {
      window.localStorage.setItem(schluessel, id);
    } catch {}
  };

  return [gilt, waehle];
};

export const PipelineWahl = ({
  wert,
  onChange,
}: {
  wert: string | null;
  onChange: (id: string) => void;
}) => {
  const pipelines = usePipelines();

  if (pipelines.length < 2) {
    return null;
  }

  return (
    <select
      className="toolbar__filter pipeline-wahl"
      aria-label="Pipeline"
      value={wert ?? ''}
      onChange={(event) => onChange(event.target.value)}
    >
      {pipelines.map((pipeline) => (
        <option key={pipeline.id} value={pipeline.id}>
          {pipeline.name}
        </option>
      ))}
    </select>
  );
};

export const usePhasen = (pipelineId?: string | null): StageSetting[] =>
  phasenVon(useContext(PhasenKontext), pipelineId);

export const usePhasenJePipeline = (): ((
  pipelineId?: string | null,
) => StageSetting[]) => {
  const kontext = useContext(PhasenKontext);

  return (pipelineId) => phasenVon(kontext, pipelineId);
};

export const waehlbarePhasen = (
  phasen: StageSetting[],
  aktuell?: DealStage,
): StageSetting[] =>
  phasen.filter((phase) => !phase.ausgeblendet || phase.stage === aktuell);

export const useStageLabel = (
  pipelineId?: string | null,
): ((stage: DealStage) => string) => {
  const phasen = usePhasen(pipelineId);

  return (stage) =>
    phasen.find((phase) => phase.stage === stage)?.label ??
    DEAL_STAGE_LABELS[stage];
};

export const useStageProbability = (
  pipelineId?: string | null,
): ((stage: DealStage) => number) => {
  const phasen = usePhasen(pipelineId);

  return (stage) =>
    phasen.find((phase) => phase.stage === stage)?.probability ??
    STANDARD_WAHRSCHEINLICHKEIT[stage];
};

export const useStageName = (): ((
  stage: DealStage,
  pipelineId?: string | null,
) => string) => {
  const kontext = useContext(PhasenKontext);

  return (stage, pipelineId) =>
    phasenVon(kontext, pipelineId).find((phase) => phase.stage === stage)
      ?.label ?? DEAL_STAGE_LABELS[stage];
};

export const useStageBadge = (): ((
  stage: DealStage,
  pipelineId?: string | null,
) => string) => {
  const kontext = useContext(PhasenKontext);

  return (stage, pipelineId) => {
    const farbe = phasenVon(kontext, pipelineId).find(
      (phase) => phase.stage === stage,
    )?.farbe;

    return farbe === null || farbe === undefined
      ? stageBadgeClass(stage)
      : `badge phase--${farbe}`;
  };
};
