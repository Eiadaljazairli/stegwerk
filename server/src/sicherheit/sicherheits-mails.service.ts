import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Between, type DataSource, LessThan } from 'typeorm';

import { MailService } from '../mail/mail.service';
import {
  anmeldungVerknuepftMail,
  kontoGesperrtMail,
  neueAnmeldungMail,
  zweiFaktorAusMail,
} from '../mail/templates';
import { UserEntity } from '../users/user.entity';
import { hoereSicherheit, type SicherheitsMeldung } from './melden';
import { SicherheitsEreignisEntity } from './sicherheits-ereignis.entity';

@Injectable()
export class SicherheitsMailsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SicherheitsMailsService.name);
  private abmelden: (() => void) | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mailService: MailService,
  ) {}

  onModuleInit(): void {
    this.abmelden = hoereSicherheit((meldung) => void this.pruefe(meldung));
  }

  onModuleDestroy(): void {
    this.abmelden?.();
  }

  async pruefe(meldung: SicherheitsMeldung, jetzt = new Date()): Promise<void> {
    try {
      if (meldung.userId === null || meldung.userId === undefined) {
        return;
      }

      if (
        meldung.art === 'sso_verknuepft' &&
        meldung.details?.neuesKonto !== true
      ) {
        const anbieter =
          meldung.details?.anbieter === 'microsoft' ? 'Microsoft' : 'Google';

        await this.sende(meldung.userId, (email) =>
          anmeldungVerknuepftMail(email, anbieter),
        );

        return;
      }

      if (meldung.art === 'konto_gesperrt') {
        if (await this.schonGesperrtGemeldet(meldung.userId, jetzt)) {
          return;
        }

        await this.sende(meldung.userId, (email) =>
          kontoGesperrtMail(email, meldung.details?.zweiterFaktor === true),
        );

        return;
      }

      if (meldung.art === 'zwei_faktor_aus') {
        await this.sende(meldung.userId, (email) => zweiFaktorAusMail(email));

        return;
      }

      if (
        meldung.art === 'anmeldung' &&
        (await this.istNeuesGeraet(meldung, jetzt))
      ) {
        const zeit = new Intl.DateTimeFormat('de-DE', {
          dateStyle: 'long',
          timeStyle: 'short',
          timeZone: 'Europe/Berlin',
        }).format(jetzt);

        await this.sende(meldung.userId, (email) =>
          neueAnmeldungMail(
            email,
            meldung.geraet ?? 'unbekanntes Gerät',
            meldung.ipGekuerzt ?? 'unbekannt',
            zeit,
          ),
        );
      }
    } catch (fehler) {
      this.logger.warn(`Sicherheitsmail nicht verschickt: ${String(fehler)}`);
    }
  }

  private async istNeuesGeraet(
    meldung: SicherheitsMeldung,
    jetzt: Date,
  ): Promise<boolean> {
    if (meldung.geraet === null || meldung.geraet === undefined) {
      return false;
    }

    const vorher = LessThan(new Date(jetzt.getTime() - 5_000));
    const ereignisse = this.dataSource.getRepository(SicherheitsEreignisEntity);
    const [frueher, vomGeraet] = await Promise.all([
      ereignisse.count({
        where: { art: 'anmeldung', userId: meldung.userId!, createdAt: vorher },
      }),
      ereignisse.count({
        where: {
          art: 'anmeldung',
          userId: meldung.userId!,
          geraet: meldung.geraet.slice(0, 80),
          createdAt: vorher,
        },
      }),
    ]);

    return frueher > 0 && vomGeraet === 0;
  }

  private async schonGesperrtGemeldet(
    userId: string,
    jetzt: Date,
  ): Promise<boolean> {
    const anzahl = await this.dataSource
      .getRepository(SicherheitsEreignisEntity)
      .count({
        where: {
          art: 'konto_gesperrt',
          userId,
          createdAt: Between(
            new Date(jetzt.getTime() - 24 * 60 * 60_000),
            new Date(jetzt.getTime() - 5_000),
          ),
        },
      });

    return anzahl > 0;
  }

  private async sende(
    userId: string,
    mail: (email: string) => Parameters<MailService['send']>[0],
  ): Promise<void> {
    const konto = await this.dataSource
      .getRepository(UserEntity)
      .findOne({ where: { id: userId } });

    if (konto !== null) {
      await this.mailService.send(mail(konto.email));
    }
  }
}
