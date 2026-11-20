import { HttpException, HttpStatus } from '@nestjs/common';

export class Fehlversuche {
  private readonly eintraege = new Map<
    string,
    { anzahl: number; seit: number }
  >();

  constructor(
    private readonly grenze = 10,
    private readonly fensterMs = 15 * 60_000,
  ) {}

  private aktuell(schluessel: string, jetzt: number) {
    const eintrag = this.eintraege.get(schluessel);

    if (eintrag !== undefined && jetzt - eintrag.seit > this.fensterMs) {
      this.eintraege.delete(schluessel);

      return undefined;
    }

    return eintrag;
  }

  pruefe(schluessel: string, jetzt = Date.now()): void {
    const eintrag = this.aktuell(schluessel, jetzt);

    if (eintrag !== undefined && eintrag.anzahl >= this.grenze) {
      throw new HttpException(
        'Zu viele Fehlversuche für dieses Konto. Bitte warten Sie 15 Minuten.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  zaehle(schluessel: string, jetzt = Date.now()): boolean {
    const eintrag = this.aktuell(schluessel, jetzt);
    const anzahl = (eintrag?.anzahl ?? 0) + 1;

    this.eintraege.set(
      schluessel,
      eintrag === undefined || anzahl === this.grenze
        ? { anzahl, seit: jetzt }
        : { ...eintrag, anzahl },
    );

    if (this.eintraege.size > 50_000) {
      for (const [key, wert] of this.eintraege) {
        if (jetzt - wert.seit > this.fensterMs) {
          this.eintraege.delete(key);
        }
      }
    }

    return anzahl === this.grenze;
  }

  vergiss(schluessel: string): void {
    this.eintraege.delete(schluessel);
  }
}
