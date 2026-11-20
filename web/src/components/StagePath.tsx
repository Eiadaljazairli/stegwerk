import { useMutation } from '@apollo/client';

import { useToast } from './Toast';

import { DEALS, MOVE_DEAL_TO_STAGE, WORKSPACE_SUMMARY } from '../lib/queries';
import { type DealStage } from '../lib/types';
import { IconCheck } from './Icons';
import { usePhasen, waehlbarePhasen } from '../lib/stages';

export const StagePath = ({
  dealId,
  stage,
  pipelineId,
}: {
  dealId: string;
  stage: DealStage;
  pipelineId?: string | null;
}) => {
  const phasen = usePhasen(pipelineId);
  const offen = waehlbarePhasen(phasen, stage).filter(
    (phase) => phase.stage !== 'WON' && phase.stage !== 'LOST',
  );
  const OPEN_STAGES = offen.map((phase) => phase.stage);
  const phaseVon = (entry: DealStage) =>
    phasen.find((phase) => phase.stage === entry);
  const stageLabel = (entry: DealStage) => phaseVon(entry)?.label ?? entry;
  const farbe = (entry: DealStage) => {
    const wert = phaseVon(entry)?.farbe;

    return wert === null || wert === undefined ? '' : ` phase--${wert}`;
  };
  const toast = useToast();
  const [moveDealToStage, { loading }] = useMutation(MOVE_DEAL_TO_STAGE, {
    refetchQueries: [DEALS, WORKSPACE_SUMMARY],
  });

  const move = (next: DealStage) => {
    if (next !== stage) {
      void moveDealToStage({ variables: { id: dealId, stage: next } }).catch(
        (fehler: Error) => toast.zeige({ text: fehler.message }),
      );
    }
  };

  const closed = stage === 'WON' || stage === 'LOST';
  const currentIndex = OPEN_STAGES.indexOf(stage);

  const classFor = (index: number): string => {
    if (closed) {
      return stage === 'WON' ? 'path__step is-done' : 'path__step is-lost';
    }

    if (index < currentIndex) {
      return 'path__step is-done';
    }

    return index === currentIndex
      ? `path__step is-current${farbe(stage)}`
      : 'path__step';
  };

  return (
    <div className="path">
      <ol className="path__steps">
        {OPEN_STAGES.map((entry, index) => (
          <li key={entry} className={classFor(index)}>
            <button
              type="button"
              className="path__button"
              aria-current={entry === stage ? 'step' : undefined}
              disabled={loading}
              onClick={() => move(entry)}
            >
              {(closed ? stage === 'WON' : index < currentIndex) && (
                <IconCheck size={13} />
              )}
              {stageLabel(entry)}
            </button>
          </li>
        ))}
      </ol>

      <div className="path__end">
        {closed ? (
          <span
            className={`${
              stage === 'WON' ? 'path__outcome is-won' : 'path__outcome is-lost'
            }${farbe(stage)}`}
          >
            {stageLabel(stage)}
          </span>
        ) : (
          <>
            <button
              type="button"
              className="button button--ghost path__won"
              disabled={loading}
              onClick={() => move('WON')}
            >
              Als gewonnen markieren
            </button>
            <button
              type="button"
              className="button button--ghost"
              disabled={loading}
              onClick={() => move('LOST')}
            >
              Verloren
            </button>
          </>
        )}
      </div>
    </div>
  );
};
