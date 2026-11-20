import { type CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import { type CustomFieldValues } from '../custom-fields/custom-field.types';
import { DealStage } from './entities/deal.entity';

export const PHASEN_REIHENFOLGE: DealStage[] = [
  DealStage.LEAD,
  DealStage.QUALIFIED,
  DealStage.PROPOSAL,
  DealStage.NEGOTIATION,
  DealStage.WON,
];

export const fehlendePflichtfelder = (
  definitionen: CustomFieldDefinition[],
  phase: DealStage,
  werte: CustomFieldValues | null | undefined,
): string[] => {
  if (phase === DealStage.LOST) {
    return [];
  }

  const stufe = PHASEN_REIHENFOLGE.indexOf(phase);

  return definitionen
    .filter(
      (feld) =>
        feld.pflichtAbPhase !== null &&
        stufe >= PHASEN_REIHENFOLGE.indexOf(feld.pflichtAbPhase as DealStage),
    )
    .filter((feld) => {
      const wert = werte?.[feld.key];

      return (
        wert === undefined ||
        wert === null ||
        wert === '' ||
        (Array.isArray(wert) && wert.length === 0)
      );
    })
    .map((feld) => `„${feld.label}“`);
};
