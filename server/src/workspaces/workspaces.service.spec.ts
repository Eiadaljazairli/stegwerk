import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { MembershipEntity, MembershipRole } from './membership.entity';
import { WorkspaceEntity } from './workspace.entity';
import { ROLE_TEMPLATES } from './permissions';
import { PermissionsService } from './permissions.service';
import { RoleEntity } from './role.entity';
import { WorkspaceRolesService } from './workspace-roles.service';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { WorkspacesService } from './workspaces.service';

const als = (userId: string, workspaceId: string): RequestUser => ({
  userId,
  workspaceId,
  email: `${userId}@example.de`,
});

const SUITE = 'workspaces';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: WorkspacesService;
let workspaceId: string;
let ownerId: string;
let adminId: string;
let memberId: string;
let strangerId: string;

const addUser = async (email: string) => {
  const users = dataSource.getRepository(UserEntity);

  return users.save(
    users.create({
      email,
      passwordHash: 'x',
      firstName: 'Test',
      lastName: 'Person',
    }),
  );
};

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  service = new WorkspacesService(
    dataSource.getRepository(WorkspaceEntity),
    new WorkspaceRolesService(
      new PermissionsService(
        dataSource.getRepository(MembershipEntity),
        dataSource.getRepository(RoleEntity),
      ),
    ),
  );
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query('TRUNCATE TABLE workspaces, users CASCADE');

  const workspace = await dataSource
    .getRepository(WorkspaceEntity)
    .save(
      dataSource
        .getRepository(WorkspaceEntity)
        .create({ name: 'Mein Vertrieb', slug: 'mein-vertrieb' }),
    );

  workspaceId = workspace.id;
  ownerId = (await addUser('inhaberin@example.de')).id;
  adminId = (await addUser('admin@example.de')).id;
  memberId = (await addUser('mitglied@example.de')).id;
  strangerId = (await addUser('fremde@example.de')).id;

  const memberships = dataSource.getRepository(MembershipEntity);
  const roles = dataSource.getRepository(RoleEntity);

  const seeded = await roles.save(
    ROLE_TEMPLATES.map((template) =>
      roles.create({
        workspaceId,
        name: template.name,
        description: template.description,
        templateKey: template.key,
        everything: template.everything,
        permissions: [...template.permissions],
        isSystem: true,
      }),
    ),
  );

  const roleFor = (key: string) =>
    seeded.find((role) => role.templateKey === key)?.id ?? null;

  for (const [userId, role, key] of [
    [ownerId, MembershipRole.OWNER, 'owner'],
    [adminId, MembershipRole.ADMIN, 'admin'],
    [memberId, MembershipRole.MEMBER, 'member'],
  ] as const) {
    await memberships.save(
      memberships.create({ userId, workspaceId, role, roleId: roleFor(key) }),
    );
  }
});

const nameOf = async () =>
  (
    await dataSource
      .getRepository(WorkspaceEntity)
      .findOne({ where: { id: workspaceId } })
  )?.name;

describe('who may rename', () => {
  it('lets an owner', async () => {
    await service.rename(als(ownerId, workspaceId), 'Vertrieb Nord');

    expect(await nameOf()).toBe('Vertrieb Nord');
  });

  it('lets an admin', async () => {
    await service.rename(als(adminId, workspaceId), 'Vertrieb Nord');

    expect(await nameOf()).toBe('Vertrieb Nord');
  });

  it('refuses a plain member', async () => {
    await expect(
      service.rename(als(memberId, workspaceId), 'Vertrieb Nord'),
    ).rejects.toThrow(ForbiddenException);

    expect(await nameOf()).toBe('Mein Vertrieb');
  });

  it('refuses somebody who is not in the workspace at all', async () => {
    await expect(
      service.rename(als(strangerId, workspaceId), 'Übernommen'),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('the new name', () => {
  it('has its surrounding space trimmed', async () => {
    await service.rename(als(ownerId, workspaceId), '  Vertrieb Nord  ');

    expect(await nameOf()).toBe('Vertrieb Nord');
  });

  it('cannot be empty', async () => {
    await expect(
      service.rename(als(ownerId, workspaceId), '   '),
    ).rejects.toThrow(BadRequestException);

    expect(await nameOf()).toBe('Mein Vertrieb');
  });

  it('leaves the slug where it was', async () => {
    await service.rename(als(ownerId, workspaceId), 'Ganz Anders');

    const workspace = await dataSource
      .getRepository(WorkspaceEntity)
      .findOne({ where: { id: workspaceId } });

    expect(workspace?.slug).toBe('mein-vertrieb');
  });

  it('may repeat a name another workspace already uses', async () => {
    const other = await dataSource
      .getRepository(WorkspaceEntity)
      .save(
        dataSource
          .getRepository(WorkspaceEntity)
          .create({ name: 'Vertrieb', slug: 'vertrieb' }),
      );

    await expect(
      service.rename(als(ownerId, workspaceId), other.name),
    ).resolves.toBeDefined();
  });
});

describe('Zwei-Faktor-Pflicht', () => {
  const rechte = () =>
    new PermissionsService(
      dataSource.getRepository(MembershipEntity),
      dataSource.getRepository(RoleEntity),
    );
  const zweiterFaktor = (userId: string) =>
    dataSource
      .getRepository(UserEntity)
      .update({ id: userId }, { totpEnabledAt: new Date() });

  it('lässt nur einschalten, wer selbst einen zweiten Faktor hat', async () => {
    await expect(
      service.setZweiFaktorPflicht(als(ownerId, workspaceId), true),
    ).rejects.toBeInstanceOf(BadRequestException);

    await zweiterFaktor(ownerId);
    const bereich = await service.setZweiFaktorPflicht(
      als(ownerId, workspaceId),
      true,
    );

    expect(bereich.zweiFaktorPflicht).toBe(true);
  });

  it('verweigert einem einfachen Mitglied das Umschalten', async () => {
    await zweiterFaktor(memberId);

    await expect(
      service.setZweiFaktorPflicht(als(memberId, workspaceId), true),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('gibt ohne zweiten Faktor keine Rechte heraus, mit ihm wieder', async () => {
    await zweiterFaktor(ownerId);
    await service.setZweiFaktorPflicht(als(ownerId, workspaceId), true);

    const ohne = await rechte().permissionsOf(als(adminId, workspaceId));
    expect(ohne).toEqual({ everything: false, permissions: [] });

    const inhaber = await rechte().permissionsOf(als(ownerId, workspaceId));
    expect(inhaber.everything).toBe(true);

    await zweiterFaktor(adminId);
    const mit = await rechte().permissionsOf(als(adminId, workspaceId));
    expect(mit.permissions.length).toBeGreaterThan(0);
  });
});

describe('Frist des Papierkorbs', () => {
  it('lässt den Inhaber sie ändern, in den Grenzen', async () => {
    await dataSource
      .getRepository(UserEntity)
      .update({ id: ownerId }, { totpEnabledAt: new Date() });

    const bereich = await service.setPapierkorbTage(
      als(ownerId, workspaceId),
      7,
    );

    expect(bereich.papierkorbTage).toBe(7);

    for (const falsch of [0, 366, 2.5]) {
      await expect(
        service.setPapierkorbTage(als(ownerId, workspaceId), falsch),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('verweigert einem einfachen Mitglied das Ändern', async () => {
    await dataSource
      .getRepository(UserEntity)
      .update({ id: memberId }, { totpEnabledAt: new Date() });

    await expect(
      service.setPapierkorbTage(als(memberId, workspaceId), 90),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('Erlaubte Domains für Einladungen', () => {
  const domains = async (id = workspaceId) =>
    (
      await dataSource
        .getRepository(WorkspaceEntity)
        .findOneOrFail({ where: { id } })
    ).einladungsDomains;

  it('lässt die Inhaberin sie setzen, bereinigt und ohne Doppelte', async () => {
    await service.setEinladungsDomains(als(ownerId, workspaceId), [
      ' @Beispiel.de ',
      'beispiel.de',
      'nordwind-gmbh.de',
      '',
    ]);

    expect(await domains()).toEqual(['beispiel.de', 'nordwind-gmbh.de']);
  });

  it('lässt eine Administratorin, die Mitglieder verwaltet', async () => {
    await service.setEinladungsDomains(als(adminId, workspaceId), [
      'beispiel.de',
    ]);

    expect(await domains()).toEqual(['beispiel.de']);
  });

  it('weist ein einfaches Mitglied ab', async () => {
    await expect(
      service.setEinladungsDomains(als(memberId, workspaceId), ['privat.de']),
    ).rejects.toThrow(ForbiddenException);

    expect(await domains()).toEqual([]);
  });

  it('weist jemanden aus einem fremden Bereich ab', async () => {
    const fremd = await dataSource
      .getRepository(WorkspaceEntity)
      .save(
        dataSource
          .getRepository(WorkspaceEntity)
          .create({ name: 'Fremd', slug: 'fremd' }),
      );

    await expect(
      service.setEinladungsDomains(als(ownerId, fremd.id), ['beispiel.de']),
    ).rejects.toThrow(ForbiddenException);
    expect(await domains(fremd.id)).toEqual([]);
  });

  it('lehnt etwas ab, das keine Domain ist', async () => {
    await expect(
      service.setEinladungsDomains(als(ownerId, workspaceId), [
        'anna@beispiel.de',
      ]),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.setEinladungsDomains(als(ownerId, workspaceId), ['beispiel']),
    ).rejects.toThrow(BadRequestException);
  });

  it('hebt die Einschränkung mit einer leeren Liste auf', async () => {
    await service.setEinladungsDomains(als(ownerId, workspaceId), [
      'beispiel.de',
    ]);
    await service.setEinladungsDomains(als(ownerId, workspaceId), []);

    expect(await domains()).toEqual([]);
  });
});
