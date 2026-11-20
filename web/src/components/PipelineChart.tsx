import { type DealStage, formatCurrency } from '../lib/types';
import { usePhasen } from '../lib/stages';

export type PipelineStage = {
  stage: DealStage;
  dealCount: number;
  totalAmount: number;
};

const OPEN_STAGES: DealStage[] = [
  'LEAD',
  'QUALIFIED',
  'PROPOSAL',
  'NEGOTIATION',
];

export const PipelineChart = ({
  stages,
  betraegeVerborgen = false,
  pipelineId = null,
}: {
  stages: PipelineStage[];
  betraegeVerborgen?: boolean;
  pipelineId?: string | null;
}) => {
  const phasen = usePhasen(pipelineId);
  const phase = (stage: DealStage) =>
    phasen.find((eintrag) => eintrag.stage === stage);
  const stageLabel = (stage: DealStage) => phase(stage)?.label ?? stage;
  const byStage = new Map(stages.map((entry) => [entry.stage, entry]));
  const open = OPEN_STAGES.map(
    (stage) => byStage.get(stage) ?? { stage, dealCount: 0, totalAmount: 0 },
  ).filter(
    (entry) => phase(entry.stage)?.ausgeblendet !== true || entry.dealCount > 0,
  );

  const mass = (entry: PipelineStage) =>
    betraegeVerborgen ? entry.dealCount : entry.totalAmount;
  const largest = Math.max(...open.map(mass), 1);

  const won = byStage.get('WON');
  const lost = byStage.get('LOST');

  return (
    <div className="card funnel">
      {open.map((entry) => (
        <div className="funnel__row" key={entry.stage}>
          <div className="funnel__label">
            <span className="funnel__name">
              {phase(entry.stage)?.farbe != null && (
                <span
                  className={`phase-punkt phase--${String(phase(entry.stage)?.farbe)}`}
                  aria-hidden="true"
                />
              )}
              {stageLabel(entry.stage)}
            </span>
            <span className="funnel__count">
              {entry.dealCount === 1
                ? '1 Geschäft'
                : `${entry.dealCount} Geschäfte`}
            </span>
          </div>

          <div className="funnel__track">
            <div
              className="funnel__bar"
              title={`${stageLabel(entry.stage)}: ${String(entry.dealCount)} · ${betraegeVerborgen ? '—' : formatCurrency(entry.totalAmount)}`}
              style={{
                width: `${Math.max((mass(entry) / largest) * 100, mass(entry) > 0 ? 2 : 0)}%`,
              }}
            />
          </div>

          <div className="funnel__amount">
            {betraegeVerborgen ? '—' : formatCurrency(entry.totalAmount)}
          </div>
        </div>
      ))}

      <div className="funnel__closed">
        {(
          [
            ['won', stageLabel('WON'), won],
            ['lost', stageLabel('LOST'), lost],
          ] as const
        ).map(([kind, label, entry]) => (
          <div className={`funnel__outcome is-${kind}`} key={kind}>
            <div className="funnel__label">
              {label}
              <span className="funnel__count">
                {(entry?.dealCount ?? 0) === 1
                  ? '1 Geschäft'
                  : `${String(entry?.dealCount ?? 0)} Geschäfte`}
              </span>
            </div>

            <div className="funnel__amount">
              {betraegeVerborgen
                ? '—'
                : formatCurrency(entry?.totalAmount ?? 0)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
