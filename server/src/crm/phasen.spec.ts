import { DealStage } from './entities/deal.entity';
import { phasenAus, prognose } from './phasen';

describe('phasenAus', () => {
  it('nimmt die Standards, wo nichts eingestellt ist', () => {
    expect(phasenAus([]).map((p) => [p.stage, p.label, p.probability])).toEqual(
      [
        [DealStage.LEAD, 'Kontakt', 10],
        [DealStage.QUALIFIED, 'Qualifiziert', 25],
        [DealStage.PROPOSAL, 'Angebot', 50],
        [DealStage.NEGOTIATION, 'Verhandlung', 75],
        [DealStage.WON, 'Gewonnen', 100],
        [DealStage.LOST, 'Verloren', 0],
      ],
    );
  });

  it('übernimmt eigene Namen und Werte, aber nicht für Gewonnen und Verloren', () => {
    const phasen = phasenAus([
      { stage: DealStage.LEAD, label: 'Erstgespräch', probability: 5 },
      { stage: DealStage.WON, label: 'Auftrag', probability: 40 },
      { stage: DealStage.QUALIFIED, label: '  ', probability: null },
    ]);

    expect(phasen[0]).toMatchObject({ label: 'Erstgespräch', probability: 5 });
    expect(phasen[1]).toMatchObject({ label: 'Qualifiziert', probability: 25 });
    expect(phasen[4]).toMatchObject({ label: 'Auftrag', probability: 100 });
  });
});

describe('prognose', () => {
  const phasen = phasenAus([]);

  it('gewichtet nach Phase, außer das Geschäft hat einen eigenen Wert', () => {
    const ergebnis = prognose(
      [
        {
          stage: DealStage.PROPOSAL,
          amount: 10_000,
          probability: null,
          closeDate: '2026-11-15',
        },
        {
          stage: DealStage.NEGOTIATION,
          amount: 20_000,
          probability: 90,
          closeDate: '2026-11-30',
        },
        {
          stage: DealStage.WON,
          amount: 99_999,
          probability: null,
          closeDate: '2026-11-01',
        },
      ],
      phasen,
      '2026-10-18',
      3,
    );

    expect(ergebnis.openAmount).toBe(30_000);
    expect(ergebnis.weightedAmount).toBe(5_000 + 18_000);
    expect(ergebnis.months.map((m) => m.month)).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
      'offen',
    ]);
    expect(ergebnis.months[1]).toMatchObject({
      dealCount: 2,
      weightedAmount: 23_000,
    });
  });

  it('legt Geschäfte ohne oder mit verstrichenem Datum unter "offen"', () => {
    const ergebnis = prognose(
      [
        {
          stage: DealStage.LEAD,
          amount: 1_000,
          probability: null,
          closeDate: null,
        },
        {
          stage: DealStage.LEAD,
          amount: 1_000,
          probability: null,
          closeDate: '2026-09-30',
        },
      ],
      phasen,
      '2026-10-18',
      2,
    );

    expect(ergebnis.months.find((m) => m.month === 'offen')).toMatchObject({
      dealCount: 2,
      weightedAmount: 200,
    });
  });

  it('zählt Geschäfte jenseits des Fensters zur Summe, aber in keinen Monat', () => {
    const ergebnis = prognose(
      [
        {
          stage: DealStage.LEAD,
          amount: 1_000,
          probability: null,
          closeDate: '2028-01-01',
        },
      ],
      phasen,
      '2026-12-01',
      2,
    );

    expect(ergebnis.openAmount).toBe(1_000);
    expect(ergebnis.months.every((m) => m.dealCount === 0)).toBe(true);
  });
});
