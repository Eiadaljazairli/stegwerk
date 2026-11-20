import { HttpException, HttpStatus } from '@nestjs/common';

import { type Budget, VorgangErschoepft, ZEITLIMIT_MS } from './abruf';

export class BereichsDrossel {
  private readonly zeiten = new Map<string, number[]>();

  constructor(
    private readonly hoechstens: number,
    private readonly zeitraumMs: number,
    private readonly jetzt: () => number = Date.now,
  ) {}

  zaehle(workspaceId: string): void {
    const jetzt = this.jetzt();
    const frisch = (this.zeiten.get(workspaceId) ?? []).filter(
      (zeit) => jetzt - zeit < this.zeitraumMs,
    );

    if (frisch.length >= this.hoechstens) {
      this.zeiten.set(workspaceId, frisch);

      throw new HttpException(
        `Dieser Arbeitsbereich hat in der letzten Stunde ${String(this.hoechstens)} Seiten und Bilder von fremden Websites abgerufen. Bitte später noch einmal.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    frisch.push(jetzt);
    this.zeiten.set(workspaceId, frisch);

    if (this.zeiten.size > 10_000) {
      for (const [bereich, liste] of this.zeiten) {
        if (liste.every((zeit) => jetzt - zeit >= this.zeitraumMs)) {
          this.zeiten.delete(bereich);
        }
      }
    }
  }
}

export class Vorgang implements Budget {
  private anfragen = 0;
  private readonly frist: number;

  constructor(
    private readonly drossel: BereichsDrossel,
    private readonly workspaceId: string,
    private readonly hoechstens: number,
    gesamtMs: number,
    private readonly jetzt: () => number = Date.now,
  ) {
    this.frist = jetzt() + gesamtMs;
  }

  vorAnfrage(): number {
    const rest = this.frist - this.jetzt();

    if (this.anfragen >= this.hoechstens || rest < 1_000) {
      throw new VorgangErschoepft(
        'Die Website antwortet zu langsam oder verweist zu oft weiter; der Abruf wurde abgebrochen.',
      );
    }

    this.drossel.zaehle(this.workspaceId);
    this.anfragen += 1;

    return Math.min(ZEITLIMIT_MS, rest);
  }
}
