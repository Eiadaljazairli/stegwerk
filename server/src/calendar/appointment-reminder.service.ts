import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MailService } from '../mail/mail.service';
import { UserEntity } from '../users/user.entity';
import { AppointmentEntity } from './appointment.entity';
import { berlinDate, berlinTime, instantFromBerlin } from './berlin-time';
import { occurrencesBetween, parseRule } from './recurrence';
import {
  LONGEST_LEAD_MINUTES,
  reminderSubject,
  reminderText,
  reminderVerdict,
} from './appointment-reminders';

export type ReminderRun = {
  considered: number;
  sent: number;
  expired: number;
  failed: number;
};

@Injectable()
export class AppointmentReminderService {
  private readonly logger = new Logger(AppointmentReminderService.name);

  constructor(
    @InjectRepository(AppointmentEntity)
    private readonly appointments: Repository<AppointmentEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly mail: MailService,
  ) {}

  private nextOccurrence(
    appointment: AppointmentEntity,
    von: Date,
    bis: Date,
  ): AppointmentEntity | null {
    if (appointment.recurrence === null || appointment.recurrence === '') {
      return appointment;
    }

    const [naechster] = this.expandSeries(appointment, von, bis);

    return naechster ?? null;
  }

  private expandSeries(
    appointment: AppointmentEntity,
    von: Date,
    bis: Date,
  ): AppointmentEntity[] {
    const startTime = berlinTime(appointment.startsAt);
    const endTime = berlinTime(appointment.endsAt);
    const startDay = berlinDate(appointment.startsAt);

    let days: string[];

    try {
      days = occurrencesBetween(
        parseRule(appointment.recurrence ?? ''),
        startDay,
        { from: berlinDate(von), to: berlinDate(bis) },
        { skip: appointment.skippedDates ?? [] },
      );
    } catch {
      return [];
    }

    return days.map((day) => {
      const kopie = Object.assign(
        Object.create(Object.getPrototypeOf(appointment) as object),
        appointment,
      ) as AppointmentEntity;

      kopie.startsAt = instantFromBerlin(day, startTime);
      kopie.endsAt = instantFromBerlin(day, endTime);

      kopie.remindedAt =
        appointment.remindedAt !== null &&
        appointment.remindedAt.getTime() >= kopie.startsAt.getTime()
          ? appointment.remindedAt
          : null;

      return kopie;
    });
  }

  private async markReminded(
    kopf: AppointmentEntity,
    occurrence: AppointmentEntity,
  ): Promise<void> {
    await this.appointments.update(kopf.id, {
      remindedAt: occurrence.startsAt,
    });
  }

  async run(now: Date = new Date()): Promise<ReminderRun> {
    const report: ReminderRun = {
      considered: 0,
      sent: 0,
      expired: 0,
      failed: 0,
    };

    const von = new Date(now.getTime() - 24 * 60 * 60_000);
    const bis = new Date(now.getTime() + LONGEST_LEAD_MINUTES * 60_000);

    const fällige = await this.appointments
      .createQueryBuilder('appointment')
      .where('appointment.remindMinutesBefore IS NOT NULL')
      .andWhere('appointment.cancelledAt IS NULL')
      .andWhere(
        `(
          (appointment.recurrence IS NULL AND appointment.remindedAt IS NULL
            AND appointment.startsAt BETWEEN :von AND :bis)
          OR appointment.recurrence IS NOT NULL
        )`,
        { von, bis },
      )
      .orderBy('appointment.startsAt', 'ASC')
      .take(500)
      .getMany();

    report.considered = fällige.length;

    for (const kopf of fällige) {
      const termin = this.nextOccurrence(kopf, von, bis);

      if (termin === null) {
        continue;
      }

      const urteil = reminderVerdict(termin, now);

      if (urteil === 'zu früh' || urteil === 'nichts') {
        continue;
      }

      if (urteil === 'verfallen') {
        await this.markReminded(kopf, termin);
        report.expired += 1;
        continue;
      }

      const empfänger = await this.users.findOne({
        where: { id: termin.ownerId },
      });

      if (empfänger === null) {
        await this.markReminded(kopf, termin);
        report.expired += 1;
        continue;
      }

      const zugestellt = await this.mail.send({
        to: empfänger.email,
        subject: reminderSubject(termin),
        text: reminderText(
          termin,
          `${empfänger.firstName} ${empfänger.lastName}`.trim(),
        ),
      });

      if (zugestellt) {
        await this.markReminded(kopf, termin);
        report.sent += 1;
      } else {
        report.failed += 1;
        this.logger.warn(
          `Terminerinnerung an ${empfänger.email} konnte nicht zugestellt werden.`,
        );
      }
    }

    return report;
  }
}
