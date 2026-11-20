import { BadRequestException, NotFoundException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { MembershipEntity } from '../workspaces/membership.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { AppointmentAttendeeEntity } from './appointment-attendee.entity';
import { AppointmentEntity } from './appointment.entity';
import { AppointmentsService } from './appointments.service';
import { AttendeeStatus } from './attendees';
import { berlinDate, berlinTime, overlaps } from './berlin-time';

const SUITE = 'appointments';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: AppointmentsService;
let workspaceId: string;
let otherWorkspaceId: string;
let companyId: string;
let contactId: string;

let ICH: string;
let KOLLEGE: string;

const anlegen = (options: {
  title?: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  allDay?: boolean;
  ownerId?: string;
  workspace?: string;
  companyId?: string;
  recurrence?: string;
  attendees?: {
    contactId?: string;
    userId?: string;
    email?: string;
    name?: string;
    status?: AttendeeStatus;
  }[];
}) =>
  service.create(options.workspace ?? workspaceId, ICH, {
    title: options.title ?? 'Ortstermin',
    startDate: options.startDate ?? '2026-03-16',
    startTime: options.startTime ?? '09:00',
    endDate: options.endDate ?? options.startDate ?? '2026-03-16',
    endTime: options.endTime ?? '10:00',
    allDay: options.allDay,
    ownerId: options.ownerId,
    companyId: options.companyId,
    recurrence: options.recurrence,
    attendees: options.attendees,
  });

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  service = new AppointmentsService(
    dataSource.getRepository(AppointmentEntity),
    dataSource.getRepository(AppointmentAttendeeEntity),
  );

  const workspaces = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Wir', slug: 'wir' }))
  ).id;
  otherWorkspaceId = (
    await workspaces.save(workspaces.create({ name: 'Andere', slug: 'andere' }))
  ).id;

  const companies = dataSource.getRepository(CompanyEntity);

  companyId = (
    await companies.save(companies.create({ workspaceId, name: 'Kunde GmbH' }))
  ).id;

  const users = dataSource.getRepository(UserEntity);

  ICH = (
    await users.save(
      users.create({
        email: 'ich@example.de',
        passwordHash: 'x',
        firstName: 'Max',
        lastName: 'Berger',
      }),
    )
  ).id;

  KOLLEGE = (
    await users.save(
      users.create({
        email: 'kollege@example.de',
        passwordHash: 'x',
        firstName: 'Lena',
        lastName: 'Vogt',
      }),
    )
  ).id;

  const memberships = dataSource.getRepository(MembershipEntity);

  await memberships.save([
    memberships.create({ userId: ICH, workspaceId }),
    memberships.create({ userId: KOLLEGE, workspaceId }),
  ]);

  const contacts = dataSource.getRepository(ContactEntity);

  contactId = (
    await contacts.save(
      contacts.create({
        workspaceId,
        firstName: 'Katrin',
        lastName: 'Böhm',
        email: 'k.boehm@example.de',
      }),
    )
  ).id;
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource
    .getRepository(AppointmentEntity)
    .createQueryBuilder()
    .delete()
    .execute();
});

describe('anlegen', () => {
  it('speichert einen Zeitpunkt und gibt die Wandzeit zurück', async () => {
    const termin = await anlegen({
      startDate: '2026-03-16',
      startTime: '09:00',
    });

    expect(termin.startsAt.toISOString()).toBe('2026-03-16T08:00:00.000Z');
    expect(berlinTime(termin.startsAt)).toBe('09:00');
  });

  it('rechnet im Sommer mit zwei Stunden', async () => {
    const termin = await anlegen({
      startDate: '2026-07-16',
      startTime: '09:00',
    });

    expect(termin.startsAt.toISOString()).toBe('2026-07-16T07:00:00.000Z');
  });

  it('trägt den Anleger als Besitzer ein, wenn keiner genannt ist', async () => {
    const termin = await anlegen({});

    expect(termin.ownerId).toBe(ICH);
    expect(termin.createdById).toBe(ICH);
  });

  it('legt einen Termin auch in einen fremden Kalender', async () => {
    const termin = await anlegen({ ownerId: KOLLEGE });

    expect(termin.ownerId).toBe(KOLLEGE);
    expect(termin.createdById).toBe(ICH);
  });

  it('weist einen Termin ohne Länge ab', async () => {
    await expect(
      anlegen({ startTime: '09:00', endTime: '09:00' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('weist einen Termin ab, der vor seinem Anfang endet', async () => {
    await expect(
      anlegen({ startTime: '10:00', endTime: '09:00' }),
    ).rejects.toThrow('Ein Termin muss nach seinem Anfang enden.');
  });

  it('nimmt höchstens einen verknüpften Datensatz', async () => {
    await expect(
      service.create(workspaceId, ICH, {
        title: 'Zweierlei',
        startDate: '2026-03-16',
        startTime: '09:00',
        endDate: '2026-03-16',
        endTime: '10:00',
        companyId,
        contactId: '33333333-3333-4333-8333-333333333333',
      }),
    ).rejects.toThrow('Ein Termin gehört zu höchstens einem Datensatz.');
  });

  it('macht aus ganztägig Mitternacht bis Mitternacht', async () => {
    const termin = await anlegen({
      startDate: '2026-03-16',
      endDate: '2026-03-16',
      allDay: true,
      startTime: '13:00',
      endTime: '14:00',
    });

    expect(termin.startsAt.toISOString()).toBe('2026-03-15T23:00:00.000Z');
    expect(termin.endsAt.toISOString()).toBe('2026-03-16T23:00:00.000Z');
    expect(termin.allDay).toBe(true);
  });
});

describe('der Ausschnitt', () => {
  it('nimmt, was in den Zeitraum hineinragt', async () => {
    await anlegen({ startDate: '2026-03-16', title: 'drin' });
    await anlegen({ startDate: '2026-04-20', title: 'draußen' });

    const gefunden = await service.range(
      workspaceId,
      '2026-03-01',
      '2026-03-31',
    );

    expect(gefunden.map((termin) => termin.title)).toEqual(['drin']);
  });

  it('reicht bis zum Ende des letzten genannten Tages', async () => {
    await anlegen({
      startDate: '2026-03-31',
      startTime: '18:00',
      endTime: '19:00',
    });

    const gefunden = await service.range(
      workspaceId,
      '2026-03-01',
      '2026-03-31',
    );

    expect(gefunden).toHaveLength(1);
  });

  it('lässt einen Termin weg, der genau am Anfang endet', async () => {
    await anlegen({
      startDate: '2026-02-28',
      startTime: '23:00',
      endDate: '2026-03-01',
      endTime: '00:00',
    });

    const gefunden = await service.range(
      workspaceId,
      '2026-03-01',
      '2026-03-31',
    );

    expect(gefunden).toHaveLength(0);
  });

  it('nimmt einen Termin, der über den Anfang hinweggeht', async () => {
    await anlegen({
      startDate: '2026-02-28',
      startTime: '23:00',
      endDate: '2026-03-01',
      endTime: '01:00',
    });

    const gefunden = await service.range(
      workspaceId,
      '2026-03-01',
      '2026-03-31',
    );

    expect(gefunden).toHaveLength(1);
  });

  it('zeigt einem Arbeitsbereich nicht die Termine eines anderen', async () => {
    await anlegen({ title: 'unserer' });
    await anlegen({ title: 'fremder', workspace: otherWorkspaceId });

    const gefunden = await service.range(
      workspaceId,
      '2026-03-01',
      '2026-03-31',
    );

    expect(gefunden.map((termin) => termin.title)).toEqual(['unserer']);
  });

  it('filtert auf einen Kalender', async () => {
    await anlegen({ title: 'meiner', ownerId: ICH });
    await anlegen({ title: 'seiner', ownerId: KOLLEGE });

    const gefunden = await service.range(
      workspaceId,
      '2026-03-01',
      '2026-03-31',
      {
        ownerId: KOLLEGE,
      },
    );

    expect(gefunden.map((termin) => termin.title)).toEqual(['seiner']);
  });

  it('lässt abgesagte draußen, bis man danach fragt', async () => {
    const termin = await anlegen({ title: 'abgesagt' });

    await service.cancel(workspaceId, termin.id);

    expect(
      await service.range(workspaceId, '2026-03-01', '2026-03-31'),
    ).toHaveLength(0);
    expect(
      await service.range(workspaceId, '2026-03-01', '2026-03-31', {
        includeCancelled: true,
      }),
    ).toHaveLength(1);
  });

  it('gibt sie nach Anfang sortiert zurück', async () => {
    await anlegen({ title: 'spät', startTime: '15:00', endTime: '16:00' });
    await anlegen({ title: 'früh', startTime: '08:00', endTime: '09:00' });

    const gefunden = await service.range(
      workspaceId,
      '2026-03-01',
      '2026-03-31',
    );

    expect(gefunden.map((termin) => termin.title)).toEqual(['früh', 'spät']);
  });

  it('behandelt ein ausdrückliches null wie "alle"', async () => {
    await anlegen({ title: 'meiner' });

    const gefunden = await service.range(
      workspaceId,
      '2026-03-01',
      '2026-03-31',
      {
        ownerId: null,
        includeCancelled: null,
      },
    );

    expect(gefunden.map((termin) => termin.title)).toEqual(['meiner']);
  });

  it('wehrt sich gegen einen verdrehten Zeitraum', async () => {
    await expect(
      service.range(workspaceId, '2026-03-31', '2026-03-01'),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('Doppelbelegung', () => {
  it('meldet einen Termin, der sich überschneidet', async () => {
    await anlegen({ startTime: '09:00', endTime: '10:00', title: 'erster' });

    const gefunden = await service.conflictsForWallTime(workspaceId, ICH, {
      startDate: '2026-03-16',
      startTime: '09:30',
      endDate: '2026-03-16',
      endTime: '10:30',
    });

    expect(gefunden).toHaveLength(1);
    expect(gefunden[0].appointment.title).toBe('erster');
    expect(gefunden[0].minutes).toBe(30);
  });

  it('meldet nichts bei zwei Terminen, die aneinander anschließen', async () => {
    await anlegen({ startTime: '09:00', endTime: '10:00' });

    const gefunden = await service.conflictsForWallTime(workspaceId, ICH, {
      startDate: '2026-03-16',
      startTime: '10:00',
      endDate: '2026-03-16',
      endTime: '11:00',
    });

    expect(gefunden).toHaveLength(0);
  });

  it('sagt dasselbe wie die Regel in JavaScript', async () => {
    const bestand = await anlegen({ startTime: '09:00', endTime: '11:00' });

    for (const [von, bis] of [
      ['08:00', '09:00'],
      ['08:00', '09:30'],
      ['09:30', '10:30'],
      ['10:30', '12:00'],
      ['11:00', '12:00'],
      ['08:00', '12:00'],
    ]) {
      const inSql = await service.conflictsForWallTime(workspaceId, ICH, {
        startDate: '2026-03-16',
        startTime: von,
        endDate: '2026-03-16',
        endTime: bis,
      });

      const inJs = overlaps(bestand, {
        startsAt: new Date(`2026-03-16T${von}:00+01:00`),
        endsAt: new Date(`2026-03-16T${bis}:00+01:00`),
      });

      expect(`${von}-${bis}: ${String(inSql.length > 0)}`).toBe(
        `${von}-${bis}: ${String(inJs)}`,
      );
    }
  });

  it('sieht nur den Kalender derselben Person', async () => {
    await anlegen({ ownerId: KOLLEGE, startTime: '09:00', endTime: '10:00' });

    const gefunden = await service.conflictsForWallTime(workspaceId, ICH, {
      startDate: '2026-03-16',
      startTime: '09:00',
      endDate: '2026-03-16',
      endTime: '10:00',
    });

    expect(gefunden).toHaveLength(0);
  });

  it('zählt einen abgesagten Termin nicht mit', async () => {
    const termin = await anlegen({ startTime: '09:00', endTime: '10:00' });

    await service.cancel(workspaceId, termin.id);

    const gefunden = await service.conflictsForWallTime(workspaceId, ICH, {
      startDate: '2026-03-16',
      startTime: '09:00',
      endDate: '2026-03-16',
      endTime: '10:00',
    });

    expect(gefunden).toHaveLength(0);
  });

  it('zählt den Termin nicht gegen sich selbst', async () => {
    const termin = await anlegen({ startTime: '09:00', endTime: '10:00' });

    const ohne = await service.conflictsForWallTime(
      workspaceId,
      ICH,
      {
        startDate: '2026-03-16',
        startTime: '09:00',
        endDate: '2026-03-16',
        endTime: '10:00',
      },
      termin.id,
    );

    expect(ohne).toHaveLength(0);
  });

  it('behandelt ein ausdrückliches null als "nichts ausnehmen"', async () => {
    await anlegen({ startTime: '09:00', endTime: '10:00' });

    const gefunden = await service.conflictsForWallTime(
      workspaceId,
      ICH,
      {
        startDate: '2026-03-16',
        startTime: '09:00',
        endDate: '2026-03-16',
        endTime: '10:00',
      },
      null,
    );

    expect(gefunden).toHaveLength(1);
  });

  it('sieht keine Termine eines anderen Arbeitsbereichs', async () => {
    await anlegen({
      workspace: otherWorkspaceId,
      startTime: '09:00',
      endTime: '10:00',
    });

    const gefunden = await service.conflictsForWallTime(workspaceId, ICH, {
      startDate: '2026-03-16',
      startTime: '09:00',
      endDate: '2026-03-16',
      endTime: '10:00',
    });

    expect(gefunden).toHaveLength(0);
  });
});

describe('ändern', () => {
  it('lässt die Zeiten in Ruhe, wenn nur der Titel kommt', async () => {
    const termin = await anlegen({ startTime: '09:00', endTime: '10:00' });

    const geändert = await service.update(workspaceId, {
      id: termin.id,
      title: 'Neuer Titel',
    });

    expect(geändert.title).toBe('Neuer Titel');
    expect(geändert.startsAt.getTime()).toBe(termin.startsAt.getTime());
    expect(geändert.endsAt.getTime()).toBe(termin.endsAt.getTime());
  });

  it('behält die Uhrzeit, wenn nur das Datum kommt', async () => {
    const termin = await anlegen({
      startDate: '2026-03-16',
      startTime: '09:00',
    });

    const geändert = await service.update(workspaceId, {
      id: termin.id,
      startDate: '2026-03-18',
      endDate: '2026-03-18',
    });

    expect(berlinTime(geändert.startsAt)).toBe('09:00');
    expect(geändert.startsAt.toISOString()).toBe('2026-03-18T08:00:00.000Z');
  });

  it('behält die Uhrzeit auch über die Zeitumstellung hinweg', async () => {
    const termin = await anlegen({
      startDate: '2026-03-16',
      startTime: '09:00',
    });

    const geändert = await service.update(workspaceId, {
      id: termin.id,
      startDate: '2026-07-16',
      endDate: '2026-07-16',
    });

    expect(berlinTime(geändert.startsAt)).toBe('09:00');
    expect(geändert.startsAt.toISOString()).toBe('2026-07-16T07:00:00.000Z');
  });

  it('macht aus einem ganztägigen Termin nicht bei jedem Speichern einen längeren', async () => {
    const termin = await anlegen({
      startDate: '2026-03-16',
      endDate: '2026-03-16',
      allDay: true,
    });

    let letzter = termin;

    for (let runde = 0; runde < 3; runde += 1) {
      letzter = await service.update(workspaceId, {
        id: termin.id,
        title: `Runde ${String(runde)}`,
        allDay: true,
      });
    }

    expect(letzter.startsAt.toISOString()).toBe('2026-03-15T23:00:00.000Z');
    expect(letzter.endsAt.toISOString()).toBe('2026-03-16T23:00:00.000Z');
  });

  it('stellt die Erinnerung wieder aus, wenn der Termin verschoben wird', async () => {
    const termin = await anlegen({});

    await dataSource
      .getRepository(AppointmentEntity)
      .update(termin.id, { remindedAt: new Date() });

    const geändert = await service.update(workspaceId, {
      id: termin.id,
      startDate: '2026-03-18',
      endDate: '2026-03-18',
    });

    expect(geändert.remindedAt).toBeNull();
  });

  it('findet einen Termin aus einem anderen Arbeitsbereich nicht', async () => {
    const fremder = await anlegen({ workspace: otherWorkspaceId });

    await expect(
      service.update(workspaceId, { id: fremder.id, title: 'geklaut' }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('absagen und löschen', () => {
  it('sagt ab, ohne zu löschen', async () => {
    const termin = await anlegen({});

    const abgesagt = await service.cancel(workspaceId, termin.id);

    expect(abgesagt.cancelledAt).not.toBeNull();
    expect(await service.byId(workspaceId, termin.id)).not.toBeNull();
  });

  it('behält den ersten Absagezeitpunkt', async () => {
    const termin = await anlegen({});

    const erste = await service.cancel(
      workspaceId,
      termin.id,
      new Date('2026-03-10T10:00:00Z'),
    );
    const zweite = await service.cancel(
      workspaceId,
      termin.id,
      new Date('2026-03-11T10:00:00Z'),
    );

    expect(zweite.cancelledAt?.toISOString()).toBe(
      erste.cancelledAt?.toISOString(),
    );
  });

  it('nimmt einen abgesagten Termin wieder auf', async () => {
    const termin = await anlegen({});

    await service.cancel(workspaceId, termin.id);
    const wieder = await service.reinstate(workspaceId, termin.id);

    expect(wieder.cancelledAt).toBeNull();
  });

  it('löscht endgültig', async () => {
    const termin = await anlegen({});

    await service.remove(workspaceId, termin.id);

    await expect(service.byId(workspaceId, termin.id)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('löscht nichts aus einem anderen Arbeitsbereich', async () => {
    const fremder = await anlegen({ workspace: otherWorkspaceId });

    await expect(service.remove(workspaceId, fremder.id)).rejects.toThrow(
      NotFoundException,
    );

    expect(await service.byId(otherWorkspaceId, fremder.id)).toBeTruthy();
  });
});

describe('was die Datenbank selbst verhindert', () => {
  it('nimmt keinen Termin an, der vor seinem Anfang endet', async () => {
    const repository = dataSource.getRepository(AppointmentEntity);

    await expect(
      repository.insert({
        workspaceId,
        title: 'verdreht',
        startsAt: new Date('2026-03-16T10:00:00Z'),
        endsAt: new Date('2026-03-16T09:00:00Z'),
        allDay: false,
        ownerId: ICH,
        createdById: ICH,
      }),
    ).rejects.toThrow(/CHK_appointments_order/);
  });
});

describe('Serientermine', () => {
  it('macht aus einer Regel viele Termine', async () => {
    await anlegen({ recurrence: 'FREQ=WEEKLY', title: 'Wochenbesprechung' });

    const gefunden = await service.range(
      workspaceId,
      '2026-03-01',
      '2026-04-15',
    );

    expect(gefunden).toHaveLength(5);
    expect(
      gefunden.every((termin) => termin.title === 'Wochenbesprechung'),
    ).toBe(true);
  });

  it('gibt jedem Termin der Serie eine eigene Kennung', async () => {
    await anlegen({ recurrence: 'FREQ=WEEKLY' });

    const gefunden = await service.range(
      workspaceId,
      '2026-03-01',
      '2026-04-15',
    );
    const kennungen = gefunden.map((termin) => termin.id);

    expect(new Set(kennungen).size).toBe(kennungen.length);
    expect(kennungen[1]).toContain(':2026-03-23');
  });

  it('behält über die Zeitumstellung dieselbe Uhrzeit', async () => {
    await anlegen({
      recurrence: 'FREQ=WEEKLY',
      startDate: '2026-03-16',
      startTime: '09:00',
      endTime: '10:00',
    });

    const gefunden = await service.range(
      workspaceId,
      '2026-03-01',
      '2026-04-15',
    );

    for (const termin of gefunden) {
      expect(berlinTime(termin.startsAt)).toBe('09:00');
      expect(berlinTime(termin.endsAt)).toBe('10:00');
    }

    expect(gefunden[0].startsAt.toISOString()).toBe('2026-03-16T08:00:00.000Z');
    expect(gefunden[3].startsAt.toISOString()).toBe('2026-04-06T07:00:00.000Z');
  });

  it('behält die Länge in Wandzeit', async () => {
    await anlegen({
      recurrence: 'FREQ=WEEKLY',
      startDate: '2026-03-27',
      startTime: '22:00',
      endDate: '2026-03-28',
      endTime: '02:00',
    });

    const gefunden = await service.range(
      workspaceId,
      '2026-03-01',
      '2026-04-15',
    );

    expect(gefunden.length).toBeGreaterThan(1);

    for (const termin of gefunden) {
      expect(berlinTime(termin.startsAt)).toBe('22:00');
      expect(berlinTime(termin.endsAt)).toBe('02:00');
    }
  });

  it('weist eine Regel ab, die niemand lesen kann', async () => {
    await expect(anlegen({ recurrence: 'FREQ=HOURLY' })).rejects.toThrow();
    await expect(anlegen({ recurrence: 'jeden Montag' })).rejects.toThrow();
  });

  it('speichert die Regel in einer einzigen Schreibweise', async () => {
    const termin = await anlegen({ recurrence: 'freq=weekly;interval=1' });

    expect(termin.recurrence).toBe('FREQ=WEEKLY');
  });

  it('lässt einen einzelnen Tag ausfallen, ohne die Serie abzusagen', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY' });

    await service.cancel(workspaceId, `${serie.id}:2026-03-23`);

    const gefunden = await service.range(
      workspaceId,
      '2026-03-01',
      '2026-04-15',
    );

    expect(gefunden.map((termin) => berlinDate(termin.startsAt))).not.toContain(
      '2026-03-23',
    );
    expect(gefunden).toHaveLength(4);

    const kopf = await service.byId(workspaceId, serie.id);

    expect(kopf.cancelledAt).toBeNull();
    expect(kopf.skippedDates).toEqual(['2026-03-23']);
  });

  it('nimmt einen ausgefallenen Tag wieder auf', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY' });

    await service.cancel(workspaceId, `${serie.id}:2026-03-23`);
    await service.reinstate(workspaceId, `${serie.id}:2026-03-23`);

    expect((await service.byId(workspaceId, serie.id)).skippedDates).toEqual(
      [],
    );
  });

  it('sagt mit dem Serienkopf die ganze Serie ab', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY' });

    await service.cancel(workspaceId, serie.id);

    expect(
      await service.range(workspaceId, '2026-03-01', '2026-04-15'),
    ).toHaveLength(0);
  });

  it('ändert mit dem Umfang SERIES alle Termine', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY' });

    await service.update(
      workspaceId,
      { id: `${serie.id}:2026-03-23`, startTime: '11:00', endTime: '12:00' },
      'SERIES',
    );

    const gefunden = await service.range(
      workspaceId,
      '2026-03-01',
      '2026-04-15',
    );

    expect(gefunden).toHaveLength(5);

    for (const termin of gefunden) {
      expect(berlinTime(termin.startsAt)).toBe('11:00');
    }
  });

  it('löst mit dem Umfang ONE genau einen Tag heraus', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY' });

    const einzeln = await service.update(
      workspaceId,
      { id: `${serie.id}:2026-03-23`, startTime: '14:00', endTime: '15:00' },
      'ONE',
    );

    expect(einzeln.recurrence).toBeNull();
    expect(berlinTime(einzeln.startsAt)).toBe('14:00');

    const gefunden = await service.range(
      workspaceId,
      '2026-03-01',
      '2026-04-15',
    );

    expect(gefunden).toHaveLength(5);

    const amDreiundzwanzigsten = gefunden.filter(
      (termin) => berlinDate(termin.startsAt) === '2026-03-23',
    );

    expect(amDreiundzwanzigsten).toHaveLength(1);
    expect(berlinTime(amDreiundzwanzigsten[0].startsAt)).toBe('14:00');

    for (const termin of gefunden.filter(
      (eintrag) => berlinDate(eintrag.startsAt) !== '2026-03-23',
    )) {
      expect(berlinTime(termin.startsAt)).toBe('09:00');
    }
  });

  it('vergisst die Ausnahmen, wenn die Regel sich ändert', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY' });

    await service.cancel(workspaceId, `${serie.id}:2026-03-23`);
    await service.update(workspaceId, {
      id: serie.id,
      recurrence: 'FREQ=DAILY',
    });

    expect((await service.byId(workspaceId, serie.id)).skippedDates).toEqual(
      [],
    );
  });

  it('meldet eine Doppelbelegung auch gegen einen Serientermin', async () => {
    await anlegen({ recurrence: 'FREQ=WEEKLY', title: 'Wochenbesprechung' });

    const gefunden = await service.conflictsForWallTime(workspaceId, ICH, {
      startDate: '2026-04-06',
      startTime: '09:30',
      endDate: '2026-04-06',
      endTime: '10:30',
    });

    expect(gefunden).toHaveLength(1);
    expect(gefunden[0].appointment.title).toBe('Wochenbesprechung');
    expect(gefunden[0].minutes).toBe(30);
  });

  it('meldet einen ausgefallenen Serientag nicht als Konflikt', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY' });

    await service.cancel(workspaceId, `${serie.id}:2026-04-06`);

    expect(
      await service.conflictsForWallTime(workspaceId, ICH, {
        startDate: '2026-04-06',
        startTime: '09:30',
        endDate: '2026-04-06',
        endTime: '10:30',
      }),
    ).toHaveLength(0);
  });

  it('zählt die Serie beim Verschieben nicht gegen sich selbst', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY' });

    expect(
      await service.conflictsForWallTime(
        workspaceId,
        ICH,
        {
          startDate: '2026-04-06',
          startTime: '09:00',
          endDate: '2026-04-06',
          endTime: '10:00',
        },
        `${serie.id}:2026-04-06`,
      ),
    ).toHaveLength(0);
  });
});

describe('Teilnehmer', () => {
  it('legt die Runde mit dem Termin an', async () => {
    const termin = await anlegen({
      attendees: [{ contactId }, { userId: ICH }, { email: 'gast@example.de' }],
    });

    const runde = await service.attendeesOf(workspaceId, termin.id);

    expect(runde).toHaveLength(3);
    expect(
      runde.every((eintrag) => eintrag.status === AttendeeStatus.NEEDS_ACTION),
    ).toBe(true);
  });

  it('weist einen Teilnehmer ohne alles ab', async () => {
    await expect(
      anlegen({ attendees: [{ name: 'Nur ein Name' }] }),
    ).rejects.toThrow('braucht');
  });

  it('weist zwei Verweise nebeneinander ab', async () => {
    await expect(
      anlegen({ attendees: [{ contactId, userId: ICH }] }),
    ).rejects.toThrow('nicht beides');
  });

  it('nimmt dieselbe Person nur einmal', async () => {
    const termin = await anlegen({
      attendees: [
        { contactId },
        { contactId },
        { email: 'gast@example.de' },
        { email: 'GAST@example.de' },
      ],
    });

    expect(await service.attendeesOf(workspaceId, termin.id)).toHaveLength(2);
  });

  it('behält die Rückmeldung, wenn die Runde erneut gespeichert wird', async () => {
    const termin = await anlegen({ attendees: [{ contactId }] });

    const [dabei] = await service.attendeesOf(workspaceId, termin.id);

    await service.setAttendeeStatus(
      workspaceId,
      dabei.id,
      AttendeeStatus.ACCEPTED,
    );

    await service.update(workspaceId, {
      id: termin.id,
      location: 'Woanders',
      attendees: [{ contactId }],
    });

    const [danach] = await service.attendeesOf(workspaceId, termin.id);

    expect(danach.status).toBe(AttendeeStatus.ACCEPTED);
  });

  it('leert die Runde, wenn eine leere Liste kommt', async () => {
    const termin = await anlegen({ attendees: [{ contactId }] });

    await service.update(workspaceId, { id: termin.id, attendees: [] });

    expect(await service.attendeesOf(workspaceId, termin.id)).toHaveLength(0);
  });

  it('lässt die Runde in Ruhe, wenn keine mitkommt', async () => {
    const termin = await anlegen({ attendees: [{ contactId }] });

    await service.update(workspaceId, { id: termin.id, title: 'Anders' });

    expect(await service.attendeesOf(workspaceId, termin.id)).toHaveLength(1);
  });

  it('speichert bei einem Kontakt keine zweite Adresse', async () => {
    const termin = await anlegen({
      attendees: [{ contactId, email: 'alt@example.de' }],
    });

    const [dabei] = await service.attendeesOf(workspaceId, termin.id);

    expect(dabei.email).toBeNull();
    expect(dabei.contactId).toBe(contactId);
  });

  it('gibt die Runde an einen herausgelösten Serientermin weiter', async () => {
    const serie = await anlegen({
      recurrence: 'FREQ=WEEKLY',
      attendees: [{ contactId }, { email: 'gast@example.de' }],
    });

    const einzeln = await service.update(
      workspaceId,
      { id: `${serie.id}:2026-03-23`, startTime: '14:00', endTime: '15:00' },
      'ONE',
    );

    expect(await service.attendeesOf(workspaceId, einzeln.id)).toHaveLength(2);
    expect(await service.attendeesOf(workspaceId, serie.id)).toHaveLength(2);
  });

  it('findet Teilnehmer eines anderen Arbeitsbereichs nicht', async () => {
    const fremder = await anlegen({
      workspace: otherWorkspaceId,
      attendees: [{ email: 'gast@example.de' }],
    });

    expect(await service.attendeesOf(workspaceId, fremder.id)).toHaveLength(0);
  });

  it('behält einen Teilnehmer, dessen Kontakt gelöscht wurde', async () => {
    const contacts = dataSource.getRepository(ContactEntity);
    const fluechtig = await contacts.save(
      contacts.create({ workspaceId, firstName: 'Kurz', lastName: 'Da' }),
    );

    const termin = await anlegen({
      attendees: [{ contactId: fluechtig.id, name: 'Kurz Da' }],
    });

    await contacts.delete(fluechtig.id);

    const [dabei] = await service.attendeesOf(workspaceId, termin.id);

    expect(dabei).toBeTruthy();
    expect(dabei.contactId).toBeNull();
    expect(dabei.name).toBe('Kurz Da');
  });
});

describe('eine Serie in einem späteren Ausschnitt', () => {
  it('findet sie auch, wenn der erste Termin weit davor liegt', async () => {
    await anlegen({ recurrence: 'FREQ=WEEKLY', title: 'Wochenbesprechung' });

    const zweiteWoche = await service.range(
      workspaceId,
      '2026-03-23',
      '2026-03-29',
    );

    expect(zweiteWoche).toHaveLength(1);
    expect(berlinDate(zweiteWoche[0].startsAt)).toBe('2026-03-23');

    const spaeter = await service.range(
      workspaceId,
      '2026-06-01',
      '2026-06-07',
    );

    expect(spaeter).toHaveLength(1);
    expect(berlinDate(spaeter[0].startsAt)).toBe('2026-06-01');
  });

  it('findet einen einzelnen Termin nur in seinem eigenen Ausschnitt', async () => {
    await anlegen({ startDate: '2026-03-16', title: 'einmalig' });

    expect(
      await service.range(workspaceId, '2026-03-23', '2026-03-29'),
    ).toHaveLength(0);
    expect(
      await service.range(workspaceId, '2026-03-16', '2026-03-16'),
    ).toHaveLength(1);
  });

  it('zeigt einen einzelnen Tag einer Serie', async () => {
    await anlegen({ recurrence: 'FREQ=WEEKLY' });

    const einTag = await service.range(workspaceId, '2026-04-06', '2026-04-06');

    expect(einTag).toHaveLength(1);
    expect(berlinDate(einTag[0].startsAt)).toBe('2026-04-06');
  });
});

describe('Verweise in einen fremden Arbeitsbereich', () => {
  const fremdeFirma = async () => {
    const companies = dataSource.getRepository(CompanyEntity);

    return (
      await companies.save(
        companies.create({ workspaceId: otherWorkspaceId, name: 'Fremd AG' }),
      )
    ).id;
  };

  const fremdePerson = async (email: string) => {
    const users = dataSource.getRepository(UserEntity);
    const memberships = dataSource.getRepository(MembershipEntity);
    const person = await users.save(
      users.create({
        email,
        passwordHash: 'x',
        firstName: 'Frank',
        lastName: 'Fremd',
      }),
    );

    await memberships.save(
      memberships.create({ userId: person.id, workspaceId: otherWorkspaceId }),
    );

    return person.id;
  };

  const zaehle = (title: string) =>
    dataSource
      .getRepository(AppointmentEntity)
      .count({ where: { workspaceId, title } });

  it('nimmt keine Firma aus einem fremden Arbeitsbereich an', async () => {
    await expect(
      anlegen({ title: 'Fremde Firma', companyId: await fremdeFirma() }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await zaehle('Fremde Firma')).toBe(0);
  });

  it('macht niemanden zum Besitzer, der hier nicht Mitglied ist', async () => {
    const fremd = await fremdePerson('besitzer@fremd.example');

    await expect(
      anlegen({ title: 'Fremder Besitzer', ownerId: fremd }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await zaehle('Fremder Besitzer')).toBe(0);
  });

  it('lädt keine fremde Person ein und legt dann auch nichts an', async () => {
    const fremd = await fremdePerson('gast@fremd.example');

    await expect(
      anlegen({ title: 'Fremder Gast', attendees: [{ userId: fremd }] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await zaehle('Fremder Gast')).toBe(0);
  });

  it('lädt keinen Kontakt aus einem fremden Arbeitsbereich ein', async () => {
    const contacts = dataSource.getRepository(ContactEntity);
    const fremd = await contacts.save(
      contacts.create({
        workspaceId: otherWorkspaceId,
        firstName: 'Gisela',
        lastName: 'Geheim',
      }),
    );

    await expect(
      anlegen({
        title: 'Fremder Kontakt',
        attendees: [{ contactId: fremd.id }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await zaehle('Fremder Kontakt')).toBe(0);
  });

  it('hängt einen Termin nicht nachträglich an eine fremde Firma', async () => {
    const termin = await anlegen({ title: 'Eigener Termin' });

    await expect(
      service.update(workspaceId, {
        id: termin.id,
        companyId: await fremdeFirma(),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const danach = await dataSource
      .getRepository(AppointmentEntity)
      .findOneByOrFail({ id: termin.id });

    expect(danach.companyId).toBeNull();
  });

  it('nimmt Mitglieder und eigene Kontakte weiter an', async () => {
    const termin = await anlegen({
      title: 'Mit Kollegin',
      ownerId: KOLLEGE,
      attendees: [{ userId: ICH }, { contactId }],
    });

    expect(termin.ownerId).toBe(KOLLEGE);
  });
});
describe('einzelne Tage einer Serie', () => {
  const tage = async (from = '2026-03-01', to = '2026-05-31') =>
    (
      await service.range(workspaceId, from, to, { includeCancelled: true })
    ).map((termin) => ({
      tag: berlinDate(termin.startsAt),
      zeit: berlinTime(termin.startsAt),
      titel: termin.title,
      abgesagt: termin.cancelledAt !== null,
    }));

  it('merkt sich beim Herauslösen Serie und ursprünglichen Tag', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY;COUNT=5' });

    const einzeln = await service.update(
      workspaceId,
      { id: `${serie.id}:2026-03-23`, startDate: '2026-03-24' },
      'ONE',
    );

    expect(einzeln.serieId).toBe(serie.id);
    expect(einzeln.serieDatum).toBe('2026-03-23');
    expect(berlinDate(einzeln.startsAt)).toBe('2026-03-24');
    expect((await service.byId(workspaceId, serie.id)).skippedDates).toEqual([
      '2026-03-23',
    ]);
    expect(await service.ausnahmenVon(workspaceId, serie.id)).toHaveLength(1);
  });

  it('sagt einen Tag als sichtbaren abgesagten Termin ab und nimmt ihn zurück', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY;COUNT=5' });

    const abgesagt = await service.cancel(
      workspaceId,
      `${serie.id}:2026-03-30`,
    );

    expect(abgesagt.serieDatum).toBe('2026-03-30');
    expect(abgesagt.cancelledAt).not.toBeNull();
    expect(
      (await tage()).filter((eintrag) => eintrag.tag === '2026-03-30'),
    ).toEqual([
      { tag: '2026-03-30', zeit: '09:00', titel: 'Ortstermin', abgesagt: true },
    ]);

    await service.reinstate(workspaceId, abgesagt.id);

    expect(
      (await tage()).filter((eintrag) => eintrag.tag === '2026-03-30'),
    ).toEqual([
      {
        tag: '2026-03-30',
        zeit: '09:00',
        titel: 'Ortstermin',
        abgesagt: false,
      },
    ]);
  });

  it('löscht mit ONE nur einen Tag, ohne Ersatz', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY;COUNT=5' });

    await service.remove(workspaceId, `${serie.id}:2026-03-30`, 'ONE');

    expect((await tage()).map((eintrag) => eintrag.tag)).toEqual([
      '2026-03-16',
      '2026-03-23',
      '2026-04-06',
      '2026-04-13',
    ]);
    expect(await service.ausnahmenVon(workspaceId, serie.id)).toHaveLength(0);
  });

  it('löscht einen einzeln geänderten Tag, ohne dass die Serie ihn wieder zeigt', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY;COUNT=3' });
    const einzeln = await service.update(
      workspaceId,
      { id: `${serie.id}:2026-03-23`, startTime: '15:00', endTime: '16:00' },
      'ONE',
    );

    await service.remove(workspaceId, einzeln.id);

    expect((await tage()).map((eintrag) => eintrag.tag)).toEqual([
      '2026-03-16',
      '2026-03-30',
    ]);
  });

  it('löscht ohne Umfang an einem Serientag wie bisher die ganze Serie', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY;COUNT=3' });

    await service.update(
      workspaceId,
      { id: `${serie.id}:2026-03-23`, title: 'Anders' },
      'ONE',
    );
    await service.remove(workspaceId, `${serie.id}:2026-03-30`);

    expect(await tage()).toEqual([]);
  });

  it('teilt die Serie bei „diesem und allen folgenden“', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY' });

    const neu = await service.update(
      workspaceId,
      {
        id: `${serie.id}:2026-04-06`,
        startDate: '2026-04-06',
        startTime: '11:00',
        endDate: '2026-04-06',
        endTime: '12:00',
      },
      'FOLLOWING',
    );

    expect(neu.id).not.toBe(serie.id);
    expect(neu.recurrence).toBe('FREQ=WEEKLY');
    expect((await service.byId(workspaceId, serie.id)).recurrence).toBe(
      'FREQ=WEEKLY;UNTIL=20260405',
    );

    expect(
      (await tage('2026-03-01', '2026-04-20')).map(
        (eintrag) => `${eintrag.tag} ${eintrag.zeit}`,
      ),
    ).toEqual([
      '2026-03-16 09:00',
      '2026-03-23 09:00',
      '2026-03-30 09:00',
      '2026-04-06 11:00',
      '2026-04-13 11:00',
      '2026-04-20 11:00',
    ]);
    expect(neu.startsAt.toISOString()).toBe('2026-04-06T09:00:00.000Z');
  });

  it('teilt eine feste Anzahl, statt sie zu verdoppeln', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY;COUNT=10' });

    const neu = await service.update(
      workspaceId,
      { id: `${serie.id}:2026-04-06`, title: 'Ab April' },
      'FOLLOWING',
    );

    expect((await service.byId(workspaceId, serie.id)).recurrence).toBe(
      'FREQ=WEEKLY;COUNT=3',
    );
    expect(neu.recurrence).toBe('FREQ=WEEKLY;COUNT=7');
    expect(await tage('2026-03-01', '2026-12-31')).toHaveLength(10);
  });

  it('nimmt ausgefallene und geänderte Tage ab dem Teilungstag mit', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY;COUNT=6' });

    await service.update(
      workspaceId,
      { id: `${serie.id}:2026-03-23`, title: 'Früh geändert' },
      'ONE',
    );
    await service.remove(workspaceId, `${serie.id}:2026-04-13`, 'ONE');
    const spaet = await service.update(
      workspaceId,
      { id: `${serie.id}:2026-04-20`, title: 'Spät geändert' },
      'ONE',
    );

    const neu = await service.update(
      workspaceId,
      { id: `${serie.id}:2026-04-06`, location: 'Neuer Raum' },
      'FOLLOWING',
    );

    expect((await service.byId(workspaceId, serie.id)).skippedDates).toEqual([
      '2026-03-23',
    ]);
    expect(neu.skippedDates).toEqual(['2026-04-13', '2026-04-20']);
    expect((await service.byId(workspaceId, spaet.id)).serieId).toBe(neu.id);
    expect(
      (await tage()).map((eintrag) => `${eintrag.tag} ${eintrag.titel}`),
    ).toEqual([
      '2026-03-16 Ortstermin',
      '2026-03-23 Früh geändert',
      '2026-03-30 Ortstermin',
      '2026-04-06 Ortstermin',
      '2026-04-20 Spät geändert',
    ]);
  });

  it('behandelt „alle folgenden“ am ersten Tag wie „alle“', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY;COUNT=3' });

    const ergebnis = await service.update(
      workspaceId,
      { id: `${serie.id}:2026-03-16`, title: 'Ganz neu' },
      'FOLLOWING',
    );

    expect(ergebnis.id).toBe(serie.id);
    expect(
      (await tage()).every((eintrag) => eintrag.titel === 'Ganz neu'),
    ).toBe(true);
  });

  it('verschiebt bei „alle“ von einem späteren Tag aus nicht den Serienbeginn', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY;COUNT=4' });

    await service.update(
      workspaceId,
      {
        id: `${serie.id}:2026-03-30`,
        startDate: '2026-03-30',
        startTime: '10:00',
        endDate: '2026-03-30',
        endTime: '11:00',
      },
      'SERIES',
    );

    expect(
      (await tage()).map((eintrag) => `${eintrag.tag} ${eintrag.zeit}`),
    ).toEqual([
      '2026-03-16 10:00',
      '2026-03-23 10:00',
      '2026-03-30 10:00',
      '2026-04-06 10:00',
    ]);
  });

  it('zieht Änderungen an der Serie in die Ausnahmen nach, außer dort eigene', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY;COUNT=3' });
    const verschoben = await service.update(
      workspaceId,
      { id: `${serie.id}:2026-03-23`, startTime: '14:00', endTime: '15:00' },
      'ONE',
    );
    const umbenannt = await service.update(
      workspaceId,
      { id: `${serie.id}:2026-03-30`, title: 'Eigener Titel' },
      'ONE',
    );

    await service.update(workspaceId, {
      id: serie.id,
      title: 'Neuer Titel',
      location: 'Raum 2',
    });

    const a = await service.byId(workspaceId, verschoben.id);
    const b = await service.byId(workspaceId, umbenannt.id);

    expect(a.title).toBe('Neuer Titel');
    expect(a.location).toBe('Raum 2');
    expect(berlinTime(a.startsAt)).toBe('14:00');
    expect(b.title).toBe('Eigener Titel');
    expect(b.location).toBe('Raum 2');
  });

  it('verwirft die Ausnahmen, wenn sich die Tage der Serie ändern', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY;COUNT=3' });

    await service.update(
      workspaceId,
      { id: `${serie.id}:2026-03-23`, title: 'Anders' },
      'ONE',
    );
    await service.update(workspaceId, {
      id: serie.id,
      startDate: '2026-03-17',
      endDate: '2026-03-17',
    });

    expect(await service.ausnahmenVon(workspaceId, serie.id)).toHaveLength(0);
    expect((await tage()).map((eintrag) => eintrag.tag)).toEqual([
      '2026-03-17',
      '2026-03-24',
      '2026-03-31',
    ]);
  });

  it('beendet die Serie beim Absagen „ab diesem Tag“', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY' });
    const spaeter = await service.update(
      workspaceId,
      { id: `${serie.id}:2026-04-20`, title: 'Später' },
      'ONE',
    );

    await service.cancel(
      workspaceId,
      `${serie.id}:2026-04-06`,
      new Date(),
      'FOLLOWING',
    );

    expect(
      (await tage('2026-03-01', '2026-04-30')).map(
        (eintrag) => `${eintrag.tag}${eintrag.abgesagt ? ' abgesagt' : ''}`,
      ),
    ).toEqual([
      '2026-03-16',
      '2026-03-23',
      '2026-03-30',
      '2026-04-20 abgesagt',
    ]);
    expect(
      (await service.byId(workspaceId, spaeter.id)).cancelledAt,
    ).not.toBeNull();
  });

  it('löscht „ab diesem Tag“ samt späterer Ausnahmen', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY;COUNT=6' });

    await service.update(
      workspaceId,
      { id: `${serie.id}:2026-04-13`, title: 'Später' },
      'ONE',
    );
    await service.remove(workspaceId, `${serie.id}:2026-04-06`, 'FOLLOWING');

    expect((await tage()).map((eintrag) => eintrag.tag)).toEqual([
      '2026-03-16',
      '2026-03-23',
      '2026-03-30',
    ]);
    expect(await service.ausnahmenVon(workspaceId, serie.id)).toHaveLength(0);
  });

  it('löscht von einem einzeln geänderten Tag aus auf Wunsch die ganze Serie', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY;COUNT=3' });
    const einzeln = await service.update(
      workspaceId,
      { id: `${serie.id}:2026-03-23`, title: 'Anders' },
      'ONE',
    );

    await service.remove(workspaceId, einzeln.id, 'SERIES');

    expect(await tage()).toEqual([]);
  });

  it('sagt mit der Serie auch ihre einzeln geänderten Tage ab', async () => {
    const serie = await anlegen({ recurrence: 'FREQ=WEEKLY;COUNT=3' });
    const einzeln = await service.update(
      workspaceId,
      { id: `${serie.id}:2026-03-23`, title: 'Anders' },
      'ONE',
    );

    await service.cancel(workspaceId, serie.id);

    expect(
      (await service.byId(workspaceId, einzeln.id)).cancelledAt,
    ).not.toBeNull();
    expect(
      await service.range(workspaceId, '2026-03-01', '2026-04-30'),
    ).toEqual([]);
  });

  it('löst einen ganztägigen Serientag heraus, ohne einen Tag dazuzugewinnen', async () => {
    const serie = await anlegen({
      recurrence: 'FREQ=WEEKLY;COUNT=3',
      allDay: true,
    });

    const einzeln = await service.update(
      workspaceId,
      { id: `${serie.id}:2026-03-23`, title: 'Messe' },
      'ONE',
    );

    expect(einzeln.allDay).toBe(true);
    expect(berlinDate(einzeln.startsAt)).toBe('2026-03-23');
    expect(berlinDate(new Date(einzeln.endsAt.getTime() - 1))).toBe(
      '2026-03-23',
    );
  });
});
