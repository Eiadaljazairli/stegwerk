export type AngebotsZeile = {
  id: string;
  position: number;
  name: string;
  articleNumber: string | null;
  description: string | null;
  quantity: number;
  unit: string;
};

export type GelieferteMenge = { angebotsPositionId: string; quantity: number };

export type LieferstandZeile = AngebotsZeile & {
  bestellt: number;
  geliefert: number;
  offen: number;
};

export const tausendstel = (menge: number): number => Math.round(menge * 1000);

const ausTausendsteln = (wert: number): number => wert / 1000;

export const lieferstand = (
  zeilen: AngebotsZeile[],
  geliefert: GelieferteMenge[],
): LieferstandZeile[] => {
  const summe = new Map<string, number>();

  for (const eintrag of geliefert) {
    summe.set(
      eintrag.angebotsPositionId,
      (summe.get(eintrag.angebotsPositionId) ?? 0) +
        tausendstel(eintrag.quantity),
    );
  }

  return [...zeilen]
    .sort((links, rechts) => links.position - rechts.position)
    .map((zeile) => {
      const bestellt = tausendstel(zeile.quantity);
      const schon = summe.get(zeile.id) ?? 0;

      return {
        ...zeile,
        bestellt: ausTausendsteln(bestellt),
        geliefert: ausTausendsteln(schon),
        offen: ausTausendsteln(Math.max(bestellt - schon, 0)),
      };
    });
};

export const lieferFehler = (
  stand: LieferstandZeile[],
  wunsch: { angebotsPositionId: string; menge: number }[],
): string | null => {
  if (wunsch.length === 0) {
    return 'Ein Lieferschein braucht mindestens eine Position.';
  }

  const gesehen = new Set<string>();

  for (const eintrag of wunsch) {
    const zeile = stand.find((z) => z.id === eintrag.angebotsPositionId);

    if (zeile === undefined) {
      return 'Eine Position gehört nicht zu diesem Angebot.';
    }

    if (gesehen.has(zeile.id)) {
      return `Position ${String(zeile.position + 1)} steht zweimal auf dem Lieferschein.`;
    }

    gesehen.add(zeile.id);

    if (!Number.isFinite(eintrag.menge) || tausendstel(eintrag.menge) <= 0) {
      return `Die Menge für „${zeile.name}“ muss größer als null sein.`;
    }

    if (tausendstel(eintrag.menge) > tausendstel(zeile.offen)) {
      return `Von „${zeile.name}“ sind nur noch ${String(zeile.offen).replace('.', ',')} ${zeile.unit} offen.`;
    }
  }

  return null;
};
