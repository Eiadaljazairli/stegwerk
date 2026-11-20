import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  type EntitySubscriberInterface,
  type InsertEvent,
  type RemoveEvent,
  type UpdateEvent,
} from 'typeorm';

import { AppointmentAttendeeEntity } from './appointment-attendee.entity';
import { AppointmentEntity } from './appointment.entity';
import { meldeTermin } from './termin-ereignisse';

type Termin = Partial<AppointmentEntity>;

@Injectable()
export class TerminBeobachter implements EntitySubscriberInterface {
  constructor(@InjectDataSource() dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  afterInsert(event: InsertEvent<unknown>): void {
    this.gesehen(event.metadata.target, event.entity as Termin, null);
  }

  afterUpdate(event: UpdateEvent<unknown>): void {
    this.gesehen(
      event.metadata.target,
      event.entity as Termin | undefined,
      (event.databaseEntity as Termin | undefined) ?? null,
    );
  }

  afterRemove(event: RemoveEvent<unknown>): void {
    const vorher = (event.databaseEntity ?? event.entity) as Termin | undefined;

    if (event.metadata.target === AppointmentEntity && vorher !== undefined) {
      const id = (event.entityId as string | undefined) ?? vorher.id;

      if (id !== undefined && vorher.workspaceId !== undefined) {
        meldeTermin({
          art: 'geloescht',
          workspaceId: vorher.workspaceId,
          terminId: id,
          ownerId: vorher.ownerId,
          serieId: vorher.serieId ?? null,
        });
      }

      return;
    }

    if (event.metadata.target === AppointmentAttendeeEntity) {
      this.runde(vorher as Partial<AppointmentAttendeeEntity> | undefined);
    }
  }

  private gesehen(
    ziel: unknown,
    neu: Termin | undefined,
    vorher: Termin | null,
  ): void {
    if (ziel === AppointmentAttendeeEntity) {
      this.runde(neu as Partial<AppointmentAttendeeEntity> | undefined);

      return;
    }

    if (
      ziel !== AppointmentEntity ||
      neu?.id === undefined ||
      neu.workspaceId === undefined
    ) {
      return;
    }

    meldeTermin({
      art: 'geaendert',
      workspaceId: neu.workspaceId,
      terminId: neu.id,
      abgesagt:
        neu.cancelledAt !== null &&
        neu.cancelledAt !== undefined &&
        (vorher === null
          ? neu.serieId !== null &&
            neu.serieId !== undefined &&
            neu.eingeladenAm !== null &&
            neu.eingeladenAm !== undefined
          : vorher.cancelledAt === null),
    });
  }

  private runde(
    teilnehmer: Partial<AppointmentAttendeeEntity> | undefined,
  ): void {
    if (
      teilnehmer?.appointmentId !== undefined &&
      teilnehmer.workspaceId !== undefined
    ) {
      meldeTermin({
        art: 'geaendert',
        workspaceId: teilnehmer.workspaceId,
        terminId: teilnehmer.appointmentId,
      });
    }
  }
}
