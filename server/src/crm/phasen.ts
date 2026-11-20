import { DealStage, OPEN_DEAL_STAGES } from './entities/deal.entity';

export type Phase = {
  stage: DealStage;
  label: string;
  probability: number;
  farbe: string | null;
  ausgeblendet: boolean;
};

export const NIE_AUSGEBLENDET: readonly DealStage[] = [
  DealStage.WON,
  DealStage.LOST,
];

type Einstellung = {
  stage: DealStage;
  label: string | null;
  probability: number | null;
  farbe?: string | null;
  ausgeblendet?: boolean | null;
};

export const STANDARD_PHASEN: Record<
  DealStage,
  { label: string; probability: number }
> = {
  [DealStage.LEAD]: { label: 'Kontakt', probability: 10 },
  [DealStage.QUALIFIED]: { label: 'Qualifiziert', probability: 25 },
  [DealStage.PROPOSAL]: { label: 'Angebot', probability: 50 },
  [DealStage.NEGOTIATION]: { label: 'Verhandlung', probability: 75 },
  [DealStage.WON]: { label: 'Gewonnen', probability: 100 },
  [DealStage.LOST]: { label: 'Verloren', probability: 0 },
};

export const FESTE_WAHRSCHEINLICHKEIT: Partial<Record<DealStage, number>> = {
  [DealStage.WON]: 100,
  [DealStage.LOST]: 0,
};

export const phasenAus = (
  bereich: Einstellung[],
  pipeline: Einstellung[] = [],
): Phase[] => {
  const imBereich = new Map(bereich.map((zeile) => [zeile.stage, zeile]));
  const inPipeline = new Map(pipeline.map((zeile) => [zeile.stage, zeile]));
  const text = (wert: string | null | undefined): string | null =>
    (wert ?? '').trim() === '' ? null : (wert ?? '').trim();

  return Object.values(DealStage).map((stage) => {
    const eigen = inPipeline.get(stage);
    const zeile = imBereich.get(stage);
    const standard = STANDARD_PHASEN[stage];

    return {
      stage,
      label: text(eigen?.label) ?? text(zeile?.label) ?? standard.label,
      probability:
        FESTE_WAHRSCHEINLICHKEIT[stage] ??
        eigen?.probability ??
        zeile?.probability ??
        standard.probability,
      farbe: text(eigen?.farbe) ?? text(zeile?.farbe),
      ausgeblendet:
        !NIE_AUSGEBLENDET.includes(stage) &&
        (eigen?.ausgeblendet ?? zeile?.ausgeblendet ?? false),
    };
  });
};

export type PrognoseGeschaeft = {
  stage: DealStage;
  amount: number | null;
  probability: number | null;
  closeDate: string | null;
};

export type PrognoseMonat = {
  month: string;
  dealCount: number;
  totalAmount: number;
  weightedAmount: number;
};

export type Prognose = {
  openAmount: number;
  weightedAmount: number;
  months: PrognoseMonat[];
};

const runden = (wert: number): number => Math.round(wert * 100) / 100;

export const prognose = (
  geschaefte: PrognoseGeschaeft[],
  phasen: Phase[],
  heute: string,
  monate: number,
): Prognose => {
  const wahrscheinlichkeit = new Map(
    phasen.map((phase) => [phase.stage, phase.probability]),
  );
  const aktueller = heute.slice(0, 7);
  const schluessel: string[] = [];
  const [jahr, monat] = aktueller.split('-').map(Number);

  for (let i = 0; i < monate; i += 1) {
    const gesamt = jahr * 12 + (monat - 1) + i;

    schluessel.push(
      `${String(Math.floor(gesamt / 12))}-${String((gesamt % 12) + 1).padStart(2, '0')}`,
    );
  }

  const eimer = new Map<string, PrognoseMonat>(
    [...schluessel, 'offen'].map((key) => [
      key,
      { month: key, dealCount: 0, totalAmount: 0, weightedAmount: 0 },
    ]),
  );

  let openAmount = 0;
  let weightedAmount = 0;

  for (const geschaeft of geschaefte) {
    if (!OPEN_DEAL_STAGES.includes(geschaeft.stage)) {
      continue;
    }

    const betrag = geschaeft.amount ?? 0;
    const prozent =
      geschaeft.probability ?? wahrscheinlichkeit.get(geschaeft.stage) ?? 0;
    const gewichtet = (betrag * prozent) / 100;

    openAmount += betrag;
    weightedAmount += gewichtet;

    const monatKey =
      geschaeft.closeDate === null ||
      geschaeft.closeDate.slice(0, 7) < aktueller
        ? 'offen'
        : geschaeft.closeDate.slice(0, 7);
    const ziel = eimer.get(monatKey);

    if (ziel === undefined) {
      continue;
    }

    ziel.dealCount += 1;
    ziel.totalAmount += betrag;
    ziel.weightedAmount += gewichtet;
  }

  return {
    openAmount: runden(openAmount),
    weightedAmount: runden(weightedAmount),
    months: [...eimer.values()].map((eintrag) => ({
      ...eintrag,
      totalAmount: runden(eintrag.totalAmount),
      weightedAmount: runden(eintrag.weightedAmount),
    })),
  };
};
