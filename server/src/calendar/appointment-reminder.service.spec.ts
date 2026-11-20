import { type DataSource } from 'typeorm';

import { type Mail, type MailService } from '../mail/mail.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { AppointmentReminderService } from './appointment-reminder.service';
import { AppointmentEntity } from './appointment.entity';

const SUITE = 'appointment_reminders';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: AppointmentReminderService;
let workspaceId: string;
let ownerId: string;

let versandt: Mail[] = [];
let zustellung = true;

const postfach = {
  send: (mail: Mail) => {
    versandt.push(mail);

    return Promise.resolve(zustellung);
  },
} as unknown as MailService;

const termin = async (overrides: Partial<AppointmentEntity> = {}) => {
  const repository = dataSource.getRepository(AppointmentEntity);

  return repository.save(
    repository.create({
      workspaceId,
      title: 'Ortstermin',
      startsAt: new Date('2026-03-16T08:00:00Z'),
      endsAt: new Date('2026-03-16T09:00:00Z'),
      allDay: false,
      ownerId,
      createdById: ownerId,
      remindMinutesBefore: 30,
      ...overrides,
    }),
  );
};

const gespeichert = async (id: string): Promise<AppointmentEntity> => {
  const gefunden = await dataSource
    .getRepository(AppointmentEntity)
    .findOneByOrFail({ id });

  return gefunden;
};

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  service = new AppointmentReminderService(
    dataSource.getRepository(AppointmentEntity),
    dataSource.getRepository(UserEntity),
    postfach,
  );

  const workspaces = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Wir', slug: 'wir' }))
  ).id;

  const users = dataSource.getRepository(UserEntity);

  ownerId = (
    await users.save(
      users.create({
        email: 'anna@example.de',
        passwordHash: 'x',
        firstName: 'Anna',
        lastName: 'Meier',
      }),
    )
  ).id;
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  versandt = [];
  zustellung = true;

  await dataSource
    .getRepository(AppointmentEntity)
    .createQueryBuilder()
    .delete()
    .execute();
});

describe('der Durchlauf', () => {
  it('verschickt eine fällige Erinnerung an den Besitzer', async () => {
    const angelegt = await termin();

    const bericht = await service.run(new Date('2026-03-16T07:35:00Z'));

    expect(bericht.sent).toBe(1);
    expect(versandt).toHaveLength(1);
    expect(versandt[0].to).toBe('anna@example.de');
    expect(versandt[0].subject).toContain('um 09:00 Uhr');
    expect(versandt[0].text).toContain('Hallo Anna Meier,');

    expect((await gespeichert(angelegt.id)).remindedAt).not.toBeNull();
  });

  it('verschickt sie kein zweites Mal', async () => {
    await termin();

    await service.run(new Date('2026-03-16T07:35:00Z'));
    const zweiter = await service.run(new Date('2026-03-16T07:40:00Z'));

    expect(zweiter.sent).toBe(0);
    expect(versandt).toHaveLength(1);
  });

  it('schweigt, solange es zu früh ist', async () => {
    const angelegt = await termin();

    const bericht = await service.run(new Date('2026-03-16T07:00:00Z'));

    expect(bericht.sent).toBe(0);
    expect(versandt).toHaveLength(0);
    expect((await gespeichert(angelegt.id)).remindedAt).toBeNull();
  });

  it('hakt eine verfallene Erinnerung ab, ohne sie zu verschicken', async () => {
    const angelegt = await termin();

    const bericht = await service.run(new Date('2026-03-16T10:00:00Z'));

    expect(bericht.sent).toBe(0);
    expect(bericht.expired).toBe(1);
    expect(versandt).toHaveLength(0);
    expect((await gespeichert(angelegt.id)).remindedAt).not.toBeNull();
  });

  it('lässt einen abgesagten Termin in Ruhe', async () => {
    await termin({ cancelledAt: new Date('2026-03-15T10:00:00Z') });

    const bericht = await service.run(new Date('2026-03-16T07:35:00Z'));

    expect(bericht.sent).toBe(0);
    expect(versandt).toHaveLength(0);
  });

  it('lässt einen Termin ohne eingestellte Erinnerung in Ruhe', async () => {
    await termin({ remindMinutesBefore: null });

    const bericht = await service.run(new Date('2026-03-16T07:35:00Z'));

    expect(bericht.considered).toBe(0);
    expect(versandt).toHaveLength(0);
  });

  it('hakt nicht ab, was nicht zugestellt wurde', async () => {
    zustellung = false;

    const angelegt = await termin();
    const bericht = await service.run(new Date('2026-03-16T07:35:00Z'));

    expect(bericht.failed).toBe(1);
    expect(bericht.sent).toBe(0);
    expect((await gespeichert(angelegt.id)).remindedAt).toBeNull();
  });

  it('rührt Termine weit in der Zukunft nicht an', async () => {
    await termin({
      startsAt: new Date('2027-03-16T08:00:00Z'),
      endsAt: new Date('2027-03-16T09:00:00Z'),
    });

    const bericht = await service.run(new Date('2026-03-16T07:35:00Z'));

    expect(bericht.considered).toBe(0);
  });

  it('erinnert einen Tag vorher, wenn das eingestellt ist', async () => {
    await termin({ remindMinutesBefore: 1440 });

    const zuFrüh = await service.run(new Date('2026-03-15T07:00:00Z'));
    expect(zuFrüh.sent).toBe(0);

    const fällig = await service.run(new Date('2026-03-15T08:30:00Z'));
    expect(fällig.sent).toBe(1);
  });

  it('bedient mehrere fällige Termine in einem Durchlauf', async () => {
    await termin({ title: 'erster' });
    await termin({
      title: 'zweiter',
      startsAt: new Date('2026-03-16T08:30:00Z'),
      endsAt: new Date('2026-03-16T09:30:00Z'),
      remindMinutesBefore: 60,
    });

    const bericht = await service.run(new Date('2026-03-16T07:45:00Z'));

    expect(bericht.sent).toBe(2);
    expect(versandt.map((mail) => mail.subject).join(' ')).toContain('erster');
  });
});

describe('Erinnerungen an eine Serie', () => {
  const serie = async (overrides: Partial<AppointmentEntity> = {}) => {
    const repository = dataSource.getRepository(AppointmentEntity);

    return repository.save(
      repository.create({
        workspaceId,
        title: 'Wochenbesprechung',
        startsAt: new Date('2026-03-16T08:00:00Z'),
        endsAt: new Date('2026-03-16T09:00:00Z'),
        allDay: false,
        ownerId,
        createdById: ownerId,
        remindMinutesBefore: 30,
        recurrence: 'FREQ=WEEKLY',
        skippedDates: [],
        ...overrides,
      }),
    );
  };

  it('erinnert an den anstehenden Tag und nicht an den ersten von damals', async () => {
    await serie();

    const bericht = await service.run(new Date('2026-04-06T06:35:00Z'));

    expect(bericht.sent).toBe(1);
    expect(versandt[0].subject).toContain('2026-04-06');
    expect(versandt[0].subject).toContain('um 09:00 Uhr');
  });

  it('erinnert Woche für Woche und nicht nur einmal', async () => {
    const angelegt = await serie();

    const ersteWoche = await service.run(new Date('2026-03-16T07:35:00Z'));
    expect(ersteWoche.sent).toBe(1);

    const gleichNochmal = await service.run(new Date('2026-03-16T07:45:00Z'));
    expect(gleichNochmal.sent).toBe(0);

    const zweiteWoche = await service.run(new Date('2026-03-23T07:35:00Z'));
    expect(zweiteWoche.sent).toBe(1);

    expect(versandt).toHaveLength(2);
    expect(versandt[0].subject).toContain('2026-03-16');
    expect(versandt[1].subject).toContain('2026-03-23');

    const danach = await dataSource
      .getRepository(AppointmentEntity)
      .findOneByOrFail({ id: angelegt.id });

    expect(danach.remindedAt?.toISOString()).toBe('2026-03-23T08:00:00.000Z');
  });

  it('erinnert nach der Zeitumstellung zur richtigen Zeit', async () => {
    await serie();

    const zuFrueh = await service.run(new Date('2026-04-06T06:25:00Z'));
    expect(zuFrueh.sent).toBe(0);

    const passend = await service.run(new Date('2026-04-06T06:35:00Z'));
    expect(passend.sent).toBe(1);
  });

  it('erinnert nicht an einen ausgefallenen Serientag', async () => {
    await serie({ skippedDates: ['2026-04-06'] });

    const bericht = await service.run(new Date('2026-04-06T06:35:00Z'));

    expect(bericht.sent).toBe(0);
    expect(versandt).toHaveLength(0);
  });

  it('erinnert nicht mehr, wenn die Serie zu Ende ist', async () => {
    await serie({ recurrence: 'FREQ=WEEKLY;COUNT=2' });

    const bericht = await service.run(new Date('2026-03-30T07:35:00Z'));

    expect(bericht.sent).toBe(0);
  });

  it('lässt eine abgesagte Serie ganz in Ruhe', async () => {
    await serie({ cancelledAt: new Date('2026-03-01T10:00:00Z') });

    expect((await service.run(new Date('2026-04-06T06:35:00Z'))).sent).toBe(0);
  });

  it('rührt eine Serie ohne eingestellte Erinnerung nicht an', async () => {
    await serie({ remindMinutesBefore: null });

    expect(
      (await service.run(new Date('2026-04-06T06:35:00Z'))).considered,
    ).toBe(0);
  });
});
