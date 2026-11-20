import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { type EntityManager } from 'typeorm';

import { type AppointmentAttendeeEntity } from './appointment-attendee.entity';
import { AppointmentEntity } from './appointment.entity';
import { AppointmentsService, splitOccurrenceId } from './appointments.service';
import { attendeeIdentity, ICS_PARTSTAT } from './attendees';
import { berlinTime } from './berlin-time';
import { buildIcs, type IcsEvent } from './ics';
import {
  istGeschwaerzt,
  schwaerzen,
  sichtregelLaden,
} from './termin-sichtbarkeit';

export const asEvent = (
  appointment: AppointmentEntity,
  host: string,
  attendees: AppointmentAttendeeEntity[] = [],
  serie: Pick<AppointmentEntity, 'id' | 'startsAt' | 'allDay'> | null = null,
): IcsEvent => ({
  uid: `${serie === null ? appointment.id : serie.id}@${host}`,
  ausnahmeVon:
    serie === null || appointment.serieDatum === null
      ? null
      : {
          tag: appointment.serieDatum,
          ganztaegig: serie.allDay,
          uhrzeit: berlinTime(serie.startsAt),
        },
  startsAt: appointment.startsAt,
  endsAt: appointment.endsAt,
  summary: appointment.title,
  description: appointment.description,
  location: appointment.location,
  videoLink: appointment.videoLink,
  allDay: appointment.allDay,
  recurrence: appointment.recurrence,
  skippedDates: appointment.skippedDates,
  attendees: attendees.map((attendee) => {
    const wer = attendeeIdentity(attendee, {
      contact: attendee.contact,
      user: attendee.user,
    });

    return {
      email: wer.email,
      name: wer.name,
      partstat: ICS_PARTSTAT[attendee.status],
    };
  }),
  changedAt: appointment.updatedAt,
  cancelled: appointment.cancelledAt !== null,
  privat: appointment.privat === true || appointment.geschwaerzt === true,
});

export const serieAlsEvents = (
  serie: AppointmentEntity,
  host: string,
  runde: AppointmentAttendeeEntity[],
  ausnahmen: {
    termin: AppointmentEntity;
    runde: AppointmentAttendeeEntity[];
  }[],
): IcsEvent[] => {
  const vertreten = new Set(ausnahmen.map(({ termin }) => termin.serieDatum));

  return [
    {
      ...asEvent(serie, host, runde),
      skippedDates: serie.skippedDates.filter((tag) => !vertreten.has(tag)),
    },
    ...ausnahmen.map(({ termin, runde: dabei }) =>
      asEvent(termin, host, dabei, serie),
    ),
  ];
};

@Injectable()
export class IcsExportService {
  constructor(
    private readonly appointments: AppointmentsService,
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  async zeitraum(
    workspaceId: string,
    from: string,
    to: string,
    ownerId: string | null,
    host: string,
    name?: string,
    zusatz: IcsEvent[] = [],
    betrachterId: string | null = null,
  ): Promise<string> {
    const regel = await sichtregelLaden(
      this.manager,
      workspaceId,
      betrachterId,
    );
    const sicht = <T extends AppointmentEntity>(termin: T): T =>
      istGeschwaerzt(termin, regel) ? schwaerzen(termin) : termin;
    const found = await this.appointments.range(workspaceId, from, to, {
      ownerId,
      includeCancelled: true,
    });

    const koepfe = new Map<string, AppointmentEntity>();

    for (const termin of found) {
      const kopfId =
        termin.serieId ?? splitOccurrenceId(termin.id).appointmentId;

      if (!koepfe.has(kopfId)) {
        koepfe.set(kopfId, sicht(termin));
      }
    }

    const events: IcsEvent[] = [];

    for (const [kopfId, beispiel] of koepfe) {
      const gelesen =
        beispiel.id === kopfId && beispiel.recurrence === null
          ? beispiel
          : await this.appointments.byId(workspaceId, kopfId).catch(() => null);
      const kopf = gelesen === null ? null : sicht(gelesen);

      if (kopf === null) {
        events.push(
          asEvent(
            beispiel,
            host,
            beispiel.geschwaerzt === true
              ? []
              : await this.appointments.attendeesOf(workspaceId, beispiel.id),
          ),
        );
        continue;
      }

      const runde =
        kopf.geschwaerzt === true
          ? []
          : await this.appointments.attendeesOf(workspaceId, kopfId);

      if (kopf.recurrence === null) {
        events.push(asEvent(kopf, host, runde));
        continue;
      }

      const ausnahmen = await this.appointments.ausnahmenVon(
        workspaceId,
        kopfId,
      );

      events.push(
        ...serieAlsEvents(
          kopf,
          host,
          runde,
          await Promise.all(
            ausnahmen
              .filter(
                (termin) => ownerId === null || termin.ownerId === ownerId,
              )
              .map(sicht)
              .map(async (termin) => ({
                termin,
                runde:
                  termin.geschwaerzt === true
                    ? []
                    : await this.appointments.attendeesOf(
                        workspaceId,
                        termin.id,
                      ),
              })),
          ),
        ),
      );
    }

    return buildIcs([...events, ...zusatz], { name });
  }
}
