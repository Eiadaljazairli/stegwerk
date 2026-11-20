import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, MoreThan } from 'typeorm';

import { AnkuendigungEntity } from './ankuendigung.entity';

const MERKEN_MS = 15_000;
const LAENGSTENS_MS = 28 * 24 * 60 * 60 * 1000;

export const WARTUNG_OHNE_ANKUENDIGUNG =
  'Stegwerk wird gerade gewartet. Änderungen sind für kurze Zeit nicht möglich; Lesen geht weiter.';

export type Hinweis = {
  id: string | null;
  text: string;
  von: Date;
  bis: Date | null;
  wartung: boolean;
};

@Injectable()
export class WartungService {
  private gemerkt: { bis: number; hinweis: Hinweis | null } | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  private get repo() {
    return this.dataSource.getRepository(AnkuendigungEntity);
  }

  async aktuell(jetzt = new Date()): Promise<Hinweis | null> {
    if (this.gemerkt !== null && this.gemerkt.bis > Date.now()) {
      return this.gemerkt.hinweis;
    }

    const laufend = await this.repo.findOne({
      where: { von: LessThanOrEqual(jetzt), bis: MoreThan(jetzt) },
      order: { wartung: 'DESC', von: 'DESC' },
    });
    const vonHand = this.config.get<{ wartungsmodus?: boolean }>(
      'protokolle',
    )?.wartungsmodus;

    const hinweis: Hinweis | null =
      vonHand === true && laufend?.wartung !== true
        ? {
            id: laufend?.id ?? null,
            text: laufend?.text ?? WARTUNG_OHNE_ANKUENDIGUNG,
            von: laufend?.von ?? jetzt,
            bis: laufend?.bis ?? null,
            wartung: true,
          }
        : laufend === null
          ? null
          : {
              id: laufend.id,
              text: laufend.text,
              von: laufend.von,
              bis: laufend.bis,
              wartung: laufend.wartung,
            };

    this.gemerkt = { bis: Date.now() + MERKEN_MS, hinweis };

    return hinweis;
  }

  async wartungLaeuft(): Promise<Hinweis | null> {
    const hinweis = await this.aktuell();

    return hinweis?.wartung === true ? hinweis : null;
  }

  liste(): Promise<AnkuendigungEntity[]> {
    return this.repo.find({ order: { von: 'DESC' }, take: 20 });
  }

  async setzen(
    betreiberId: string,
    eingabe: { text: string; von: Date; bis: Date; wartung: boolean },
  ): Promise<AnkuendigungEntity> {
    const text = eingabe.text.trim();

    if (text === '' || text.length > 500) {
      throw new BadRequestException('Der Text braucht 1 bis 500 Zeichen.');
    }

    if (eingabe.bis.getTime() <= eingabe.von.getTime()) {
      throw new BadRequestException('„Bis“ muss nach „Von“ liegen.');
    }

    if (eingabe.bis.getTime() - eingabe.von.getTime() > LAENGSTENS_MS) {
      throw new BadRequestException(
        'Eine Ankündigung gilt höchstens vier Wochen.',
      );
    }

    if (eingabe.bis.getTime() <= Date.now()) {
      throw new BadRequestException('Dieser Zeitraum ist schon vorbei.');
    }

    const neu = await this.repo.save(
      this.repo.create({
        text,
        von: eingabe.von,
        bis: eingabe.bis,
        wartung: eingabe.wartung,
        erstelltVon: betreiberId,
      }),
    );

    this.gemerkt = null;

    return neu;
  }

  async beenden(id: string, jetzt = new Date()): Promise<boolean> {
    const eintrag = await this.repo.findOne({ where: { id } });

    if (eintrag === null || eintrag.bis <= jetzt) {
      return false;
    }

    if (eintrag.von >= jetzt) {
      await this.repo.delete({ id });
    } else {
      await this.repo.update({ id }, { bis: jetzt });
    }

    this.gemerkt = null;

    return true;
  }

  vergessen(): void {
    this.gemerkt = null;
  }
}
