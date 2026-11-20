import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { GeplanterLaufEntity } from './geplanter-lauf.entity';

export type LaufZustand =
  | 'ok'
  | 'fehler'
  | 'ausgeblieben'
  | 'laeuft'
  | 'wartet'
  | 'aus';

const KULANZ_MS = 5 * 60 * 1000;

export const zustandVon = (
  lauf: Pick<
    GeplanterLaufEntity,
    | 'aktiv'
    | 'intervallSek'
    | 'angemeldetAm'
    | 'letzterStart'
    | 'letztesEnde'
    | 'fehlerInFolge'
  >,
  jetzt = new Date(),
): LaufZustand => {
  if (!lauf.aktiv) {
    return 'aus';
  }

  const intervall = lauf.intervallSek * 1000;
  const bezug =
    lauf.letzterStart !== null && lauf.letzterStart > lauf.angemeldetAm
      ? lauf.letzterStart
      : lauf.angemeldetAm;

  if (jetzt.getTime() - bezug.getTime() > 2 * intervall + KULANZ_MS) {
    return 'ausgeblieben';
  }

  if (
    lauf.letzterStart !== null &&
    (lauf.letztesEnde === null || lauf.letztesEnde < lauf.letzterStart)
  ) {
    return 'laeuft';
  }

  if (lauf.fehlerInFolge > 0) {
    return 'fehler';
  }

  return lauf.letzterStart === null ? 'wartet' : 'ok';
};

let instanz: LaeufeService | null = null;

export const ueberwacht = <T>(
  name: string,
  intervallMs: number,
  arbeit: () => Promise<T>,
): Promise<T> =>
  instanz === null ? arbeit() : instanz.lauf(name, intervallMs, arbeit);

export const einplanen = (
  name: string,
  intervallMs: number,
  aktiv = true,
): void => {
  void instanz?.anmelden(name, intervallMs, aktiv);
};

@Injectable()
export class LaeufeService implements OnModuleDestroy {
  private readonly logger = new Logger(LaeufeService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    instanz = this;
  }

  onModuleDestroy(): void {
    if (instanz === this) {
      instanz = null;
    }
  }

  private get repo() {
    return this.dataSource.getRepository(GeplanterLaufEntity);
  }

  private async schreiben(
    name: string,
    werte: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await werte();
    } catch (fehler) {
      this.logger.warn(
        `Lauf „${name}“ nicht vermerkt: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
      );
    }
  }

  anmelden(name: string, intervallMs: number, aktiv = true): Promise<void> {
    return this.schreiben(name, () =>
      this.repo
        .createQueryBuilder()
        .insert()
        .values({
          name,
          intervallSek: Math.round(intervallMs / 1000),
          aktiv,
          angemeldetAm: new Date(),
        })
        .orUpdate(['intervallSek', 'aktiv', 'angemeldetAm'], ['name'])
        .execute(),
    );
  }

  async lauf<T>(
    name: string,
    intervallMs: number,
    arbeit: () => Promise<T>,
  ): Promise<T> {
    const start = new Date();

    await this.schreiben(name, () =>
      this.repo
        .createQueryBuilder()
        .insert()
        .values({
          name,
          intervallSek: Math.round(intervallMs / 1000),
          aktiv: true,
          angemeldetAm: start,
          letzterStart: start,
        })
        .orUpdate(['intervallSek', 'aktiv', 'letzterStart'], ['name'])
        .execute(),
    );

    try {
      const ergebnis = await arbeit();
      const ende = new Date();

      await this.schreiben(name, () =>
        this.repo
          .createQueryBuilder()
          .update()
          .set({
            letztesEnde: ende,
            letzterErfolg: ende,
            letzteDauerMs: ende.getTime() - start.getTime(),
            laeufe: () => '"laeufe" + 1',
            fehlerInFolge: 0,
          })
          .where('name = :name', { name })
          .execute(),
      );

      return ergebnis;
    } catch (fehler) {
      const ende = new Date();
      const text = (
        fehler instanceof Error ? fehler.message : String(fehler)
      ).slice(0, 500);

      await this.schreiben(name, () =>
        this.repo
          .createQueryBuilder()
          .update()
          .set({
            letztesEnde: ende,
            letzterFehlerAm: ende,
            letzterFehler: text,
            letzteDauerMs: ende.getTime() - start.getTime(),
            laeufe: () => '"laeufe" + 1',
            fehlerInFolge: () => '"fehlerInFolge" + 1',
          })
          .where('name = :name', { name })
          .execute(),
      );

      throw fehler;
    }
  }

  alle(): Promise<GeplanterLaufEntity[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }
}
