import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { BillingService } from '../billing/billing.service';

import { berlinDate } from '../calendar/berlin-time';
import { huelle } from '../mail/layout';
import { MailService } from '../mail/mail.service';
import { UserEntity } from '../users/user.entity';
import { InvoiceSeriesEntity } from './invoice-series.entity';
import { InvoicesService } from './invoices.service';
import { INTERVALLE, type Intervall, naechsterTermin } from './serien-termine';

const NACHHOLEN_HOECHSTENS = 12;

export type SerienLauf = { erstellt: number; fehlgeschlagen: number };

@Injectable()
export class InvoiceSeriesService {
  private readonly logger = new Logger(InvoiceSeriesService.name);

  constructor(
    @InjectRepository(InvoiceSeriesEntity)
    private readonly series: Repository<InvoiceSeriesEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly invoices: InvoicesService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly billing: BillingService,
  ) {}

  list(workspaceId: string): Promise<InvoiceSeriesEntity[]> {
    return this.series.find({
      where: { workspaceId, active: true },
      relations: { sourceInvoice: { company: true, lines: true } },
      order: { nextRunOn: 'ASC' },
    });
  }

  forInvoice(
    workspaceId: string,
    invoiceId: string,
  ): Promise<InvoiceSeriesEntity | null> {
    return this.series.findOne({
      where: { workspaceId, sourceInvoiceId: invoiceId, active: true },
    });
  }

  async create(
    workspaceId: string,
    userId: string,
    input: {
      invoiceId: string;
      interval: string;
      startOn: string;
      endOn?: string | null;
    },
  ): Promise<InvoiceSeriesEntity> {
    const vorlage = await this.invoices.findOne(workspaceId, input.invoiceId);

    if (vorlage.correctsInvoiceId !== null) {
      throw new BadRequestException(
        'Eine Rechnungskorrektur ist keine Vorlage für eine Serie.',
      );
    }

    if (vorlage.lines.length === 0) {
      throw new BadRequestException('Die Vorlage hat noch keine Positionen.');
    }

    if (!INTERVALLE.includes(input.interval as Intervall)) {
      throw new BadRequestException(
        'Monatlich, vierteljährlich oder jährlich.',
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.startOn)) {
      throw new BadRequestException('Bitte ein Startdatum wählen.');
    }

    if (input.startOn < berlinDate(new Date())) {
      throw new BadRequestException(
        'Der erste Termin liegt in der Vergangenheit.',
      );
    }

    const ende = input.endOn ?? null;

    if (ende !== null && ende < input.startOn) {
      throw new BadRequestException('Das Ende liegt vor dem ersten Termin.');
    }

    if ((await this.forInvoice(workspaceId, vorlage.id)) !== null) {
      throw new BadRequestException(
        'Zu dieser Rechnung läuft schon eine Serie.',
      );
    }

    return this.series.save(
      this.series.create({
        workspaceId,
        sourceInvoiceId: vorlage.id,
        interval: input.interval,
        anchorDay: Number(input.startOn.slice(8, 10)),
        nextRunOn: input.startOn,
        endOn: ende,
        active: true,
        createdById: userId,
      }),
    );
  }

  async end(workspaceId: string, id: string): Promise<boolean> {
    const serie = await this.series.findOne({ where: { id, workspaceId } });

    if (serie === null) {
      throw new NotFoundException('Serie nicht gefunden.');
    }

    await this.series.update(serie.id, { active: false });

    return true;
  }

  async runDue(heute: string): Promise<SerienLauf> {
    const faellig = await this.series.find({
      where: { active: true, nextRunOn: LessThanOrEqual(heute) },
    });
    const lauf: SerienLauf = { erstellt: 0, fehlgeschlagen: 0 };

    for (const serie of faellig) {
      try {
        await this.billing.assertCanWrite(serie.workspaceId);
      } catch {
        continue;
      }

      for (let runde = 0; runde < NACHHOLEN_HOECHSTENS; runde += 1) {
        const termin = serie.nextRunOn;

        if (termin > heute || !serie.active) {
          break;
        }

        const naechster = naechsterTermin(
          termin,
          serie.interval as Intervall,
          serie.anchorDay,
        );
        const endet = serie.endOn !== null && naechster > serie.endOn;

        const vergeben = await this.series
          .createQueryBuilder()
          .update()
          .set({ nextRunOn: naechster, active: !endet })
          .where('id = :id AND "nextRunOn" = :termin', {
            id: serie.id,
            termin,
          })
          .execute();

        if (vergeben.affected !== 1) {
          break;
        }

        serie.nextRunOn = naechster;
        serie.active = !endet;

        try {
          const entwurf = await this.invoices.copyAsDraft(
            serie.workspaceId,
            serie.sourceInvoiceId,
            termin,
            serie.id,
          );

          await this.series.update(serie.id, { lastInvoiceId: entwurf.id });
          await this.benachrichtigen(serie, entwurf.id, termin);
          lauf.erstellt += 1;
        } catch (error) {
          lauf.fehlgeschlagen += 1;
          this.logger.error(
            `Serie ${serie.id}: Entwurf für ${termin} nicht angelegt`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    }

    return lauf;
  }

  private async benachrichtigen(
    serie: InvoiceSeriesEntity,
    invoiceId: string,
    termin: string,
  ): Promise<void> {
    if (serie.createdById === null) {
      return;
    }

    const user = await this.users.findOne({ where: { id: serie.createdById } });

    if (user === null) {
      return;
    }

    const url = `${this.config.get<string>('webOrigin') ?? 'http://localhost:5273'}/rechnungen/${invoiceId}`;
    const satz = `Aus einer wiederkehrenden Rechnung liegt der Entwurf für ${termin.slice(8, 10)}.${termin.slice(5, 7)}.${termin.slice(0, 4)} bereit. Prüfen und stellen Sie ihn, dann geht er hinaus.`;

    await this.mail.send({
      to: user.email,
      subject: 'Rechnungsentwurf aus einer Serie',
      text: [satz, '', url].join('\n'),
      html: huelle({
        vorschau: satz,
        ueberschrift: 'Rechnungsentwurf bereit',
        absaetze: [satz],
        knopf: { text: 'Entwurf öffnen', url },
      }),
    });
  }
}
