import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { type DataSource } from 'typeorm';

import { TaskEntity } from '../crm/entities/task.entity';
import { type MailService } from '../mail/mail.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { ROLE_TEMPLATES } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { RoleEntity } from '../workspaces/role.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { type RequestUser } from './decorators/current-user.decorator';
import { KontoService } from './konto.service';
import { type AppointmentEntity } from '../calendar/appointment.entity';
import {
  BELEGT,
  fuerBetrachter,
  sichtregelLaden,
} from '../calendar/termin-sichtbarkeit';
import { type RefreshTokensService } from './refresh-tokens.service';

const SUITE = 'd5_konto';
const PASSWORT = 'EinLangesPasswort1';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: KontoService;
let gesendet: { to: string; subject: string; text: string }[];
let widerrufen: string[];
let workspaceId: string;
let inhaberId: string;
let adminId: string;
let mitgliedId: string;

const als = (userId: string): RequestUser => ({
  userId,
  workspaceId,
  email: `${userId}@example.de`,
});

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query('TRUNCATE TABLE workspaces, users CASCADE');
  gesendet = [];
  widerrufen = [];
  service = new KontoService(
    dataSource,
    {
      send: (mail: { to: string; subject: string; text: string }) => {
        gesendet.push(mail);

        return Promise.resolve(true);
      },
    } as unknown as MailService,
    {
      revokeAllForUser: (id: string) => {
        widerrufen.push(id);

        return Promise.resolve();
      },
    } as unknown as RefreshTokensService,
    new ConfigService({ webOrigin: 'https://app.example' }),
    new PermissionsService(
      dataSource.getRepository(MembershipEntity),
      dataSource.getRepository(RoleEntity),
    ),
  );

  workspaceId = (
    await dataSource
      .getRepository(WorkspaceEntity)
      .save({ name: 'Nordwind', slug: 'nordwind' })
  ).id;

  const hash = await bcrypt.hash(PASSWORT, 4);
  const users = dataSource.getRepository(UserEntity);
  const anlegen = async (email: string, firstName: string) =>
    (
      await users.save(
        users.create({
          email,
          passwordHash: hash,
          firstName,
          lastName: 'Test',
        }),
      )
    ).id;

  inhaberId = await anlegen('inhaber@example.de', 'Ina');
  adminId = await anlegen('admin@example.de', 'Ada');
  mitgliedId = await anlegen('mitglied@example.de', 'Max');

  const roles = dataSource.getRepository(RoleEntity);
  const seeded = await roles.save(
    ROLE_TEMPLATES.map((v) =>
      roles.create({
        workspaceId,
        name: v.name,
        description: v.description,
        templateKey: v.key,
        everything: v.everything,
        permissions: [...v.permissions],
        isSystem: true,
      }),
    ),
  );
  const rolle = (key: string) =>
    seeded.find((r) => r.templateKey === key)?.id ?? null;

  await dataSource.getRepository(MembershipEntity).save([
    {
      userId: inhaberId,
      workspaceId,
      role: MembershipRole.OWNER,
      roleId: rolle('owner'),
    },
    {
      userId: adminId,
      workspaceId,
      role: MembershipRole.ADMIN,
      roleId: rolle('admin'),
    },
    {
      userId: mitgliedId,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: rolle('member'),
    },
  ]);
});

const tokenAus = (text: string): string =>
  /email-aendern\/([A-Za-z0-9_-]+)/u.exec(text)?.[1] ?? '';

describe('Anmelde-Adresse ändern', () => {
  it('gilt erst nach dem Link, und die alte Adresse erfährt es', async () => {
    await service.emailAendernAnfragen(mitgliedId, 'Neu@Example.de', PASSWORT);

    const vorher = await dataSource
      .getRepository(UserEntity)
      .findOneByOrFail({ id: mitgliedId });
    expect(vorher.email).toBe('mitglied@example.de');
    expect(gesendet[0].to).toBe('neu@example.de');

    await service.emailAendernBestaetigen(
      mitgliedId,
      tokenAus(gesendet[0].text),
    );

    const nachher = await dataSource
      .getRepository(UserEntity)
      .findOneByOrFail({ id: mitgliedId });
    expect(nachher.email).toBe('neu@example.de');
    expect(gesendet[1].to).toBe('mitglied@example.de');
  });

  it('verlangt das Passwort und lehnt eine vergebene Adresse ab', async () => {
    await expect(
      service.emailAendernAnfragen(mitgliedId, 'x@example.de', 'falsch'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.emailAendernAnfragen(mitgliedId, 'admin@example.de', PASSWORT),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lässt den Link nur im beantragenden Konto wirken', async () => {
    await service.emailAendernAnfragen(mitgliedId, 'neu@example.de', PASSWORT);

    await expect(
      service.emailAendernBestaetigen(adminId, tokenAus(gesendet[0].text)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Konto löschen', () => {
  it('lässt den einzigen Inhaber nicht gehen', async () => {
    await expect(service.kontoLoeschen(inhaberId, PASSWORT)).rejects.toThrow(
      'einziger Inhaber',
    );
  });

  it('lässt von zwei Inhabern, die gleichzeitig löschen, einen übrig', async () => {
    const inhaberRolle = await dataSource
      .getRepository(RoleEntity)
      .findOneByOrFail({ workspaceId, templateKey: 'owner' });

    await dataSource
      .getRepository(MembershipEntity)
      .update(
        { userId: adminId, workspaceId },
        { roleId: inhaberRolle.id, role: MembershipRole.OWNER },
      );

    const ergebnisse = await Promise.allSettled([
      service.kontoLoeschen(inhaberId, PASSWORT),
      service.kontoLoeschen(adminId, PASSWORT),
    ]);

    expect(ergebnisse.filter((e) => e.status === 'fulfilled')).toHaveLength(1);
    expect(
      await dataSource
        .getRepository(MembershipEntity)
        .countBy({ workspaceId, roleId: inhaberRolle.id }),
    ).toBe(1);
  });

  it('entfernt Name und Adresse, gibt Offenes an den Inhaber und meldet ab', async () => {
    await dataSource.getRepository(TaskEntity).save({
      workspaceId,
      title: 'Rückruf',
      assigneeId: mitgliedId,
      createdById: mitgliedId,
    });

    await service.kontoLoeschen(mitgliedId, PASSWORT);

    const konto = await dataSource
      .getRepository(UserEntity)
      .findOneByOrFail({ id: mitgliedId });
    expect(konto.email).toBe(`geloescht-${mitgliedId}@stegwerk.invalid`);
    expect(konto.firstName).toBe('Gelöschtes');
    expect(await bcrypt.compare(PASSWORT, konto.passwordHash)).toBe(false);
    expect(
      await dataSource
        .getRepository(MembershipEntity)
        .countBy({ userId: mitgliedId }),
    ).toBe(0);
    expect(
      (
        await dataSource
          .getRepository(TaskEntity)
          .findOneByOrFail({ title: 'Rückruf' })
      ).assigneeId,
    ).toBe(inhaberId);
    expect(widerrufen).toContain(mitgliedId);
    expect(gesendet.at(-1)?.to).toBe('mitglied@example.de');
  });
});

describe('Konto löschen und der Kalender', () => {
  it('lässt übernommene Termine einer Verbindung auf „belegt“ geschwärzt', async () => {
    await dataSource.query(
      `INSERT INTO "kalender_verbindungen" ("workspaceId", "userId", "serverUrl", benutzer, "passwortVersiegelt", sichtbarkeit)
       VALUES ($1, $2, 'https://dav.example.de/', 'm', 'x', 'belegt')`,
      [workspaceId, mitgliedId],
    );
    await dataSource.query(
      `INSERT INTO "appointments" ("workspaceId", title, "startsAt", "endsAt", "ownerId", "createdById", quelle)
       VALUES ($1, 'Elternabend', now() + interval '1 day', now() + interval '25 hours', $2, $2, 'kalender')`,
      [workspaceId, mitgliedId],
    );

    await service.kontoLoeschen(mitgliedId, PASSWORT);

    const termine = (await dataSource.query(
      `SELECT * FROM "appointments" WHERE "workspaceId" = $1`,
      [workspaceId],
    )) as AppointmentEntity[];

    expect(
      fuerBetrachter(
        termine,
        await sichtregelLaden(dataSource.manager, workspaceId, inhaberId),
      ).map((t) => t.title),
    ).toEqual([BELEGT]);
  });
});

describe('Zwei-Faktor eines Kollegen zurücksetzen', () => {
  const einschalten = (id: string) =>
    dataSource
      .getRepository(UserEntity)
      .update(id, { totpSecret: 'x', totpEnabledAt: new Date() });

  it('darf ein Admin beim Mitglied, mit Mail und Abmeldung', async () => {
    await einschalten(mitgliedId);

    await service.zweiFaktorZuruecksetzen(als(adminId), mitgliedId);

    const konto = await dataSource
      .getRepository(UserEntity)
      .findOneByOrFail({ id: mitgliedId });
    expect(konto.totpEnabledAt).toBeNull();
    expect(widerrufen).toEqual([mitgliedId]);
    expect(gesendet[0].text).toContain('Ada Test');
  });

  it('nicht beim Inhaber, nicht bei sich, nicht als Mitglied', async () => {
    await einschalten(inhaberId);
    await einschalten(adminId);

    await expect(
      service.zweiFaktorZuruecksetzen(als(adminId), inhaberId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.zweiFaktorZuruecksetzen(als(adminId), adminId),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.zweiFaktorZuruecksetzen(als(mitgliedId), adminId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
