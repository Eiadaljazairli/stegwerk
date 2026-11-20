import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { ContactEntity } from '../crm/entities/contact.entity';
import { TerminNurBelegt1792400060100 } from '../database/migrations/1792400060100-TerminNurBelegt';
import { DealKontaktEntity } from '../crm/entities/deal-kontakt.entity';
import { DealEntity, DealStage } from '../crm/entities/deal.entity';
import { KalenderSyncResolver } from '../kalender-sync/kalender-sync.resolver';
import { type KalenderSyncService } from '../kalender-sync/kalender-sync.service';
import { KalenderVerbindungEntity } from '../kalender-sync/kalender-verbindung.entity';
import { runWithRequestContext } from '../observability/request-context';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { RoleEntity } from '../workspaces/role.entity';
import { setzeSichtfeld } from '../workspaces/sichtbarkeit';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { AppointmentAttendeeEntity } from './appointment-attendee.entity';
import { AppointmentEntity } from './appointment.entity';
import { AppointmentsResolver } from './appointments.resolver';
import { AppointmentsService } from './appointments.service';
import { IcsExportService } from './ics-export.service';
import { liesIcs } from './ics-lesen';
import { BELEGT, istGeschwaerzt, terminDatenFuer } from './termin-sichtbarkeit';
import { graphZuIcs } from '../kalender-sync/graph-kalender';

const SUITE = 'termin_sichtbarkeit';

jest.setTimeout(60_000);

let dataSource: DataSource;
let permissions: PermissionsService;
let service: AppointmentsService;
let resolver: AppointmentsResolver;
let ics: IcsExportService;
let workspaceId: string;
let fremderBereich: string;
let anna: RequestUser;
let ben: RequestUser;
let clara: RequestUser;
let kundeId: string;
let fremderKundeId: string;

const als = <T>(wer: RequestUser, tun: () => Promise<T>): Promise<T> =>
  runWithRequestContext({ requestId: 'test', userId: wer.userId }, () => {
    setzeSichtfeld(() => permissions.sichtfeldFuer(wer));

    return tun();
  });

const termin = (extra: Partial<AppointmentEntity>) =>
  dataSource.getRepository(AppointmentEntity).save(
    dataSource.getRepository(AppointmentEntity).create({
      workspaceId,
      ownerId: anna.userId,
      createdById: anna.userId,
      title: 'Zahnarzt',
      description: 'Wurzelbehandlung',
      location: 'Praxis Dr. Weiß',
      startsAt: new Date('2026-11-05T09:00:00Z'),
      endsAt: new Date('2026-11-05T10:00:00Z'),
      allDay: false,
      skippedDates: [],
      ...extra,
    }),
  );

const zeitraum = { from: '2026-11-01', to: '2026-11-30' };

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  permissions = new PermissionsService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(RoleEntity),
  );
  service = new AppointmentsService(
    dataSource.getRepository(AppointmentEntity),
    dataSource.getRepository(AppointmentAttendeeEntity),
  );
  resolver = new AppointmentsResolver(
    service,
    permissions,
    dataSource.getRepository(UserEntity),
  );
  ics = new IcsExportService(service, dataSource.manager);

  const m = dataSource.manager;

  workspaceId = (
    await m.save(m.create(WorkspaceEntity, { name: 'TS', slug: 'ts' }))
  ).id;
  fremderBereich = (
    await m.save(m.create(WorkspaceEntity, { name: 'Andere', slug: 'andere' }))
  ).id;

  const person = (email: string, vorname: string) =>
    m.save(
      m.create(UserEntity, {
        email,
        passwordHash: 'x',
        firstName: vorname,
        lastName: 'Test',
      }),
    );
  const a = await person('anna@ts.test', 'Anna');
  const b = await person('ben@ts.test', 'Ben');
  const c = await person('clara@andere.test', 'Clara');
  const eigene = await m.save(
    m.create(RoleEntity, {
      workspaceId,
      name: 'Außendienst',
      everything: false,
      permissions: [
        Permission.CONTACT_VIEW,
        Permission.DEAL_VIEW,
        Permission.APPOINTMENT_VIEW,
        Permission.APPOINTMENT_WRITE,
      ],
      sichtbarkeit: { company: 'alle', contact: 'eigene', deal: 'alle' },
      isSystem: false,
    }),
  );

  await m.save([
    m.create(MembershipEntity, {
      userId: a.id,
      workspaceId,
      role: MembershipRole.OWNER,
    }),
    m.create(MembershipEntity, {
      userId: b.id,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: eigene.id,
    }),
    m.create(MembershipEntity, {
      userId: c.id,
      workspaceId: fremderBereich,
      role: MembershipRole.OWNER,
    }),
  ]);

  anna = { userId: a.id, workspaceId, email: a.email };
  ben = { userId: b.id, workspaceId, email: b.email };
  clara = { userId: c.id, workspaceId: fremderBereich, email: c.email };

  kundeId = (
    await m.save(
      m.create(ContactEntity, {
        workspaceId,
        firstName: 'Kai',
        lastName: 'Kunde',
        email: 'kai@kunde.de',
        ownerId: null,
      }),
    )
  ).id;
  fremderKundeId = (
    await m.save(
      m.create(ContactEntity, {
        workspaceId,
        firstName: 'Fritz',
        lastName: 'Fremd',
        ownerId: a.id,
      }),
    )
  ).id;
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE appointment_attendees, appointments, kalender_verbindungen, deal_kontakte, deals CASCADE',
  );
});

describe('ein privater Termin', () => {
  it('steht für die Inhaberin ganz da, für andere nur als „belegt“', async () => {
    const privat = await termin({ privat: true });

    await dataSource.getRepository(AppointmentAttendeeEntity).save(
      dataSource.getRepository(AppointmentAttendeeEntity).create({
        workspaceId,
        appointmentId: privat.id,
        email: 'praxis@weiss.de',
      }),
    );

    const fuerAnna = await als(anna, () =>
      resolver.appointments(anna, zeitraum),
    );
    const fuerBen = await als(ben, () => resolver.appointments(ben, zeitraum));

    expect(fuerAnna.map((t) => [t.title, t.location])).toEqual([
      ['Zahnarzt', 'Praxis Dr. Weiß'],
    ]);
    expect(fuerBen.map((t) => [t.title, t.location, t.description])).toEqual([
      [BELEGT, null, null],
    ]);
    expect(resolver.geschwaerzt(fuerBen[0])).toBe(true);
    expect(await resolver.attendees(ben, fuerBen[0])).toEqual([]);
    expect(await resolver.attendeeSummary(ben, fuerBen[0])).toBe('');
    expect(fuerBen[0].startsAt.toISOString()).toBe('2026-11-05T09:00:00.000Z');
  });

  it('zählt bei der Doppelbelegung mit, zeigt aber keinen Titel', async () => {
    await termin({ privat: true });

    const konflikte = await als(ben, () =>
      resolver.appointmentConflicts(
        ben,
        '2026-11-05',
        '10:30',
        '2026-11-05',
        '11:30',
        anna.userId,
      ),
    );

    expect(konflikte).toHaveLength(1);
    expect(konflikte[0].appointment.title).toBe(BELEGT);
    expect(konflikte[0].minutes).toBe(30);
  });

  it('lässt sich von anderen nicht ändern, absagen oder löschen', async () => {
    const privat = await termin({ privat: true });

    await expect(
      als(ben, () =>
        resolver.updateAppointment(ben, { id: privat.id, title: 'Belegt' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      als(ben, () => resolver.cancelAppointment(ben, privat.id)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      als(ben, () => resolver.deleteAppointment(ben, privat.id)),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const danach = await dataSource
      .getRepository(AppointmentEntity)
      .findOneByOrFail({ id: privat.id });

    expect(danach.title).toBe('Zahnarzt');
    expect(danach.cancelledAt).toBeNull();
  });

  it('geht als Datei an andere mit „Belegt“ und CLASS:PRIVATE', async () => {
    await termin({ privat: true });

    const fuerBen = await ics.zeitraum(
      workspaceId,
      zeitraum.from,
      zeitraum.to,
      null,
      'app.test',
      undefined,
      [],
      ben.userId,
    );
    const fuerAnna = await ics.zeitraum(
      workspaceId,
      zeitraum.from,
      zeitraum.to,
      anna.userId,
      'app.test',
      undefined,
      [],
      anna.userId,
    );

    expect(fuerBen).toContain('SUMMARY:Belegt');
    expect(fuerBen).not.toContain('Zahnarzt');
    expect(fuerBen).not.toContain('Praxis');
    expect(fuerBen).toContain('CLASS:PRIVATE');
    expect(liesIcs(fuerAnna).termine[0]).toMatchObject({
      titel: 'Zahnarzt',
      privat: true,
    });
  });

  it('bleibt im fremden Bereich unsichtbar', async () => {
    await termin({ privat: true });

    expect(
      await als(clara, () => resolver.appointments(clara, zeitraum)),
    ).toEqual([]);
  });
});

describe('ein übernommener Termin und die Stufe der Verbindung', () => {
  const verbindung = (sichtbarkeit: 'alles' | 'belegt') =>
    dataSource.getRepository(KalenderVerbindungEntity).save(
      dataSource.getRepository(KalenderVerbindungEntity).create({
        workspaceId,
        userId: anna.userId,
        serverUrl: 'https://dav.example.de/',
        benutzer: 'anna',
        passwortVersiegelt: 'x',
        sichtbarkeit,
      }),
    );

  it('wird bei „belegt“ ohne Akte geschwärzt, mit Akte nicht', async () => {
    await verbindung('belegt');
    await termin({ quelle: 'kalender', title: 'Elternabend' });
    await termin({
      quelle: 'kalender',
      title: 'Kundentermin',
      contactId: kundeId,
      startsAt: new Date('2026-11-06T09:00:00Z'),
      endsAt: new Date('2026-11-06T10:00:00Z'),
    });

    const fuerBen = await als(ben, () => resolver.appointments(ben, zeitraum));

    expect(fuerBen.map((t) => t.title)).toEqual([BELEGT, 'Kundentermin']);
  });

  it('bleibt bei „alles“ sichtbar, und die Inhaberin sieht ihn immer', async () => {
    await verbindung('alles');
    await termin({ quelle: 'kalender', title: 'Elternabend' });

    expect(
      (await als(ben, () => resolver.appointments(ben, zeitraum))).map(
        (t) => t.title,
      ),
    ).toEqual(['Elternabend']);
    expect(
      istGeschwaerzt(
        {
          ownerId: anna.userId,
          privat: true,
          quelle: 'kalender',
          companyId: null,
          contactId: null,
          dealId: null,
        },
        { betrachterId: anna.userId, belegtFuer: new Set([anna.userId]) },
      ),
    ).toBe(false);
  });
});

describe('Termine an Akten über die Runde', () => {
  it('zeigt am Kontakt auch Termine, bei denen er nur Teilnehmer ist', async () => {
    const t = await termin({ title: 'Runde mit Kai' });

    await dataSource.getRepository(AppointmentAttendeeEntity).save(
      dataSource.getRepository(AppointmentAttendeeEntity).create({
        workspaceId,
        appointmentId: t.id,
        contactId: kundeId,
      }),
    );

    expect(
      (await als(anna, () => service.fuerKontakt(workspaceId, kundeId))).map(
        (x) => x.title,
      ),
    ).toEqual(['Runde mit Kai']);
  });

  it('lässt in der Akte weg, was andere nur als „belegt“ sähen', async () => {
    await dataSource.getRepository(KalenderVerbindungEntity).save(
      dataSource.getRepository(KalenderVerbindungEntity).create({
        workspaceId,
        userId: anna.userId,
        serverUrl: 'https://dav.example.de/',
        benutzer: 'anna',
        passwortVersiegelt: 'x',
        sichtbarkeit: 'belegt',
      }),
    );
    await termin({ title: 'Privat bei Kai', privat: true, contactId: kundeId });
    const runde = await termin({
      title: 'Runde aus dem Kalender',
      quelle: 'kalender',
      startsAt: new Date('2026-11-06T09:00:00Z'),
      endsAt: new Date('2026-11-06T10:00:00Z'),
    });
    await termin({
      title: 'Offen mit Kai',
      contactId: kundeId,
      startsAt: new Date('2026-11-07T09:00:00Z'),
      endsAt: new Date('2026-11-07T10:00:00Z'),
    });

    await dataSource.getRepository(AppointmentAttendeeEntity).save(
      dataSource.getRepository(AppointmentAttendeeEntity).create({
        workspaceId,
        appointmentId: runde.id,
        contactId: kundeId,
      }),
    );

    const akte = (wer: RequestUser) =>
      als(wer, async () =>
        (
          await service.fuerAkte(
            workspaceId,
            wer.userId,
            await service.fuerKontakt(workspaceId, kundeId),
          )
        )
          .map((x) => x.title)
          .sort(),
      );

    expect(await akte(anna)).toEqual([
      'Offen mit Kai',
      'Privat bei Kai',
      'Runde aus dem Kalender',
    ]);
    expect(await akte(ben)).toEqual(['Offen mit Kai']);
  });

  it('zeigt am Geschäft die Termine seiner Beteiligten, unter Zeilenrechten', async () => {
    const deal = await dataSource.getRepository(DealEntity).save(
      dataSource.getRepository(DealEntity).create({
        workspaceId,
        name: 'Halle',
        stage: DealStage.PROPOSAL,
        primaryContactId: kundeId,
      }),
    );

    await dataSource.getRepository(DealKontaktEntity).save(
      dataSource.getRepository(DealKontaktEntity).create({
        workspaceId,
        dealId: deal.id,
        contactId: fremderKundeId,
      }),
    );
    await termin({ title: 'Mit Kai', contactId: kundeId });
    await termin({ title: 'Mit Fritz', contactId: fremderKundeId });
    await termin({ title: 'Am Geschäft', contactId: null, dealId: deal.id });

    const fuerAnna = await als(anna, () =>
      service.fuerBeteiligteDesGeschaefts(workspaceId, deal.id),
    );
    const fuerBen = await als(ben, () =>
      service.fuerBeteiligteDesGeschaefts(workspaceId, deal.id),
    );

    expect(fuerAnna.map((t) => t.title).sort()).toEqual([
      'Mit Fritz',
      'Mit Kai',
    ]);
    expect(fuerBen.map((t) => t.title)).toEqual(['Mit Kai']);
  });
});

describe('Einladung verschicken (terminEinladungSenden)', () => {
  const versendet: string[] = [];
  const sync = {
    einladungSenden: (_wer: RequestUser, id: string) => {
      versendet.push(id);

      return dataSource
        .getRepository(AppointmentEntity)
        .findOneByOrFail({ id });
    },
  };
  const einladen = (wer: RequestUser, id: string) =>
    als(wer, () =>
      new KalenderSyncResolver(
        sync as unknown as KalenderSyncService,
        permissions,
        service,
        dataSource.getRepository(AppointmentEntity),
      ).terminEinladungSenden(wer, id),
    );

  beforeEach(() => {
    versendet.length = 0;
  });

  it('verweigert einen fremden privaten Termin und verschickt nichts', async () => {
    const privat = await termin({ privat: true });

    await expect(einladen(ben, privat.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(versendet).toEqual([]);
  });

  it('verweigert einen übernommenen Termin ohne Akte aus einer Verbindung auf „belegt“', async () => {
    await dataSource.getRepository(KalenderVerbindungEntity).save(
      dataSource.getRepository(KalenderVerbindungEntity).create({
        workspaceId,
        userId: anna.userId,
        serverUrl: 'https://dav.example.de/',
        benutzer: 'anna',
        passwortVersiegelt: 'x',
        sichtbarkeit: 'belegt',
      }),
    );
    const elternabend = await termin({
      quelle: 'kalender',
      title: 'Elternabend',
    });

    await expect(einladen(ben, elternabend.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(versendet).toEqual([]);
  });

  it('kennt einen Termin an einer Akte nicht, die man nicht sehen darf', async () => {
    const fremd = await termin({
      title: 'Mit Fritz',
      contactId: fremderKundeId,
    });

    await expect(einladen(ben, fremd.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(versendet).toEqual([]);
  });

  it('lässt die Inhaberin ihren Termin weiter verschicken', async () => {
    const eigen = await termin({ privat: true });

    expect((await einladen(anna, eigen.id)).title).toBe('Zahnarzt');
    expect(versendet).toEqual([eigen.id]);
  });
});

describe('die Runde und gelöschte Kontakte', () => {
  it('schreibt beim Kontakt seinen Namen mit, damit er sich löschen lässt', async () => {
    const t = await termin({ title: 'Runde' });
    const kontakt = await dataSource.getRepository(ContactEntity).save(
      dataSource.getRepository(ContactEntity).create({
        workspaceId,
        firstName: 'Lena',
        lastName: 'Löschbar',
        email: 'lena@kunde.de',
      }),
    );

    await service.setAttendees(workspaceId, t.id, [{ contactId: kontakt.id }]);
    await dataSource.getRepository(ContactEntity).delete({ id: kontakt.id });

    expect(
      (
        await dataSource
          .getRepository(AppointmentAttendeeEntity)
          .findBy({ appointmentId: t.id })
      ).map((zeile) => [zeile.contactId, zeile.name]),
    ).toEqual([[null, 'Lena Löschbar']]);
  });
});

describe('Migration TerminNurBelegt', () => {
  it('trägt bei zugeordneten Teilnehmern ohne Namen den des Kontakts nach', async () => {
    const t = await termin({ title: 'Alt' });
    const kontakt = await dataSource.getRepository(ContactEntity).save(
      dataSource.getRepository(ContactEntity).create({
        workspaceId,
        firstName: 'Otto',
        lastName: 'Alt',
        email: 'otto@kunde.de',
      }),
    );

    await dataSource.query(
      `INSERT INTO "appointment_attendees" ("workspaceId", "appointmentId", "contactId")
       VALUES ($1, $2, $3)`,
      [workspaceId, t.id, kontakt.id],
    );

    const runner = dataSource.createQueryRunner();

    try {
      await new TerminNurBelegt1792400060100().up(runner);
    } finally {
      await runner.release();
    }

    await dataSource.getRepository(ContactEntity).delete({ id: kontakt.id });

    expect(
      (
        await dataSource
          .getRepository(AppointmentAttendeeEntity)
          .findBy({ appointmentId: t.id })
      ).map((zeile) => [zeile.contactId, zeile.name]),
    ).toEqual([[null, 'Otto Alt']]);
  });
});

describe('Lesen und Weitergeben', () => {
  it('liest Outlook „Privat“ als privat', () => {
    const datei = graphZuIcs({
      id: 'x',
      iCalUId: 'uid-1',
      subject: 'Arzt',
      sensitivity: 'private',
      start: { dateTime: '2026-11-05T09:00:00', timeZone: 'UTC' },
      end: { dateTime: '2026-11-05T10:00:00', timeZone: 'UTC' },
    });

    expect(liesIcs(datei ?? '').termine[0].privat).toBe(true);
  });

  const regel = (
    betrachterId: string | null,
    belegt: string[] = [],
  ): Parameters<typeof terminDatenFuer>[2] => ({
    betrachterId,
    belegtFuer: new Set(belegt),
  });

  it('nimmt einem Webhook bei fremden privaten Terminen Titel, Ort und Akte', () => {
    const data = {
      id: 't1',
      ownerId: 'anna',
      privat: true,
      quelle: 'stegwerk',
      title: 'Zahnarzt',
      location: 'Praxis',
      contactId: 'kai',
      companyId: 'firma',
      dealId: 'halle',
      startsAt: '2026-11-05T09:00:00Z',
    };

    expect(terminDatenFuer(data, undefined, regel('ben')).data).toEqual({
      ...data,
      title: BELEGT,
      location: null,
      contactId: null,
      companyId: null,
      dealId: null,
    });
    expect(terminDatenFuer(data, undefined, regel('anna')).data).toEqual(data);
    expect(
      terminDatenFuer(
        data,
        {
          title: { vorher: 'a', nachher: 'b' },
          contactId: { vorher: null, nachher: 'kai' },
          startsAt: { vorher: 1 },
        },
        regel('ben'),
      ).changes,
    ).toEqual({ startsAt: { vorher: 1 } });
  });

  it('schwärzt im Webhook auch übernommene Termine einer Verbindung auf „belegt“', () => {
    const data = {
      id: 't2',
      ownerId: 'anna',
      privat: false,
      quelle: 'kalender',
      title: 'Elternabend',
      contactId: null,
      companyId: null,
      dealId: null,
    };

    expect(
      terminDatenFuer(data, undefined, regel('ben', ['anna'])).data.title,
    ).toBe(BELEGT);
    expect(
      terminDatenFuer(data, undefined, regel(null, ['anna'])).data.title,
    ).toBe(BELEGT);
    expect(terminDatenFuer(data, undefined, regel('ben')).data.title).toBe(
      'Elternabend',
    );
    expect(
      terminDatenFuer(
        { ...data, contactId: 'kai' },
        undefined,
        regel('ben', ['anna']),
      ).data.title,
    ).toBe('Elternabend');
  });
});

describe('eine übernommene Serie, deren Verbindung weggefallen ist', () => {
  it('bleibt geschwärzt, wenn ein Tag herausgelöst oder die Serie geteilt wird', async () => {
    const serie = await termin({
      quelle: 'kalender',
      title: 'Therapie',
      recurrence: 'FREQ=WEEKLY',
      nurBelegt: true,
    });

    const einzeln = await als(anna, () =>
      service.update(
        workspaceId,
        { id: `${serie.id}:2026-11-12`, startTime: '14:00', endTime: '15:00' },
        'ONE',
      ),
    );
    const geteilt = await als(anna, () =>
      service.update(
        workspaceId,
        { id: `${serie.id}:2026-11-19`, startTime: '16:00', endTime: '17:00' },
        'FOLLOWING',
      ),
    );

    expect(einzeln.nurBelegt).toBe(true);
    expect(geteilt.nurBelegt).toBe(true);

    const fuerBen = await als(ben, () => resolver.appointments(ben, zeitraum));

    expect(fuerBen.length).toBeGreaterThanOrEqual(3);
    expect(new Set(fuerBen.map((t) => t.title))).toEqual(new Set([BELEGT]));
  });
});

describe('der Webhook zu einem Termin', () => {
  it('verrät nurBelegt nicht, weder in den Daten noch in den Änderungen', () => {
    const data = {
      id: 't3',
      ownerId: 'anna',
      privat: false,
      quelle: 'kalender',
      title: 'Therapie',
      contactId: null,
      companyId: null,
      dealId: null,
      nurBelegt: true,
    };
    const changes = { nurBelegt: { vorher: false, nachher: true } };

    for (const betrachter of ['anna', 'ben']) {
      const aus = terminDatenFuer(data, changes, {
        betrachterId: betrachter,
        belegtFuer: new Set(),
      });

      expect(aus.data).not.toHaveProperty('nurBelegt');
      expect(aus.changes).not.toHaveProperty('nurBelegt');
    }

    expect(
      terminDatenFuer(data, undefined, {
        betrachterId: 'ben',
        belegtFuer: new Set(),
      }).data.title,
    ).toBe(BELEGT);
  });
});
