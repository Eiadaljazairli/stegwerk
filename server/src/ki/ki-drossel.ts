export class KiDrossel {
  private readonly zeiten = new Map<string, number[]>();

  constructor(private readonly uhr: () => number = () => Date.now()) {}

  versuche(schluessel: string, grenze: number, fensterMs: number): boolean {
    const jetzt = this.uhr();
    const frisch = (this.zeiten.get(schluessel) ?? []).filter(
      (zeit) => jetzt - zeit < fensterMs,
    );

    if (frisch.length >= grenze) {
      this.zeiten.set(schluessel, frisch);

      return false;
    }

    frisch.push(jetzt);
    this.zeiten.set(schluessel, frisch);

    return true;
  }

  zuruecknehmen(schluessel: string): void {
    this.zeiten.get(schluessel)?.pop();
  }
}

export const GRENZE_PERSON = { anzahl: 30, fensterMs: 10 * 60_000 };

export const GRENZE_BEREICH = { anzahl: 300, fensterMs: 60 * 60_000 };
