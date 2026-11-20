import { ForbiddenException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { InvitationsResolver } from './invitations.resolver';
import { MembershipEntity, MembershipRole } from './membership.entity';
import { Permission } from './permissions';
import { PermissionsService } from './permissions.service';
import { RoleEntity } from './role.entity';
import { RolesResolver } from './roles.resolver';
import { RolesService } from './roles.service';
import { WorkspaceEntity } from './workspace.entity';

const SUITE = 'rollen_vergabe';

jest.setTimeout(60_000);

let dataSource: DataSource;
let rolesService: RolesService;
let permissions: PermissionsService;
let roles: RolesResolver;
let invitations: InvitationsResolver;
let workspaceId: string;
let ownerId: string;
let adminId: string;
let memberId: string;
let rolle: Record<'owner' | 'admin' | 'member' | 'readonly', RoleEntity>;

const als = (userId: string): RequestUser => ({
  userId,
  workspaceId,
  email: `${userId}@example.de`,
});

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  rolesService = new RolesService(
    dataSource.getRepository(RoleEntity),
    dataSource.getRepository(MembershipEntity),
  );
  permissions = new PermissionsService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(RoleEntity),
  );
  roles = new RolesResolver(rolesService, permissions);
  invitations = new InvitationsResolver(
    {
      invite: () =>
        Promise.resolve({ invitation: {}, token: 't', delivered: false }),
      removeMember: () =>
        Promise.resolve({ removed: true, reassignedTasks: 0 }),
    } as never,
    { getOrThrow: () => 'https://stegwerk.test' } as never,
    permissions,
    rolesService,
    { fuer: () => Promise.resolve([]) } as never,
  );

  const m = dataSource.manager;

  workspaceId = (
    await m.save(m.create(WorkspaceEntity, { name: 'Bereich', slug: 'b' }))
  ).id;

  const person = async (name: string) =>
    (
      await m.save(
        m.create(UserEntity, {
          email: `${name}@example.de`,
          firstName: name,
          lastName: 'Test',
          passwordHash: 'x',
        }),
      )
    ).id;

  ownerId = await person('inhaber');
  adminId = await person('admin');
  memberId = await person('mitglied');

  const liste = await rolesService.list(workspaceId);
  const finde = (key: string) =>
    liste.find((eintrag) => eintrag.templateKey === key)!;

  rolle = {
    owner: finde('owner'),
    admin: finde('admin'),
    member: finde('member'),
    readonly: finde('readonly'),
  };

  await m.save([
    m.create(MembershipEntity, {
      userId: ownerId,
      workspaceId,
      role: MembershipRole.OWNER,
      roleId: rolle.owner.id,
    }),
    m.create(MembershipEntity, {
      userId: adminId,
      workspaceId,
      role: MembershipRole.ADMIN,
      roleId: rolle.admin.id,
    }),
    m.create(MembershipEntity, {
      userId: memberId,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: rolle.member.id,
    }),
  ]);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

describe('Rollen zuweisen', () => {
  it('ein Administrator macht sich nicht selbst zum Inhaber', async () => {
    await expect(
      roles.assignRole(als(adminId), adminId, rolle.owner.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await permissions.holdsEverything(adminId, workspaceId)).toBe(false);
  });

  it('ein Administrator stuft den Inhaber nicht herab', async () => {
    await expect(
      roles.assignRole(als(adminId), ownerId, rolle.readonly.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ein Administrator vergibt, was er selbst hat, und die alte Rolle zieht mit', async () => {
    const neu = await roles.assignRole(
      als(adminId),
      memberId,
      rolle.readonly.id,
    );

    expect(neu.roleId).toBe(rolle.readonly.id);
    expect(neu.role).toBe(MembershipRole.MEMBER);

    await roles.assignRole(als(adminId), memberId, rolle.member.id);
  });

  it('ein herabgestufter Administrator verliert auch die alte Rolle', async () => {
    const neu = await roles.assignRole(als(ownerId), adminId, rolle.member.id);

    expect(neu.role).toBe(MembershipRole.MEMBER);

    await roles.assignRole(als(ownerId), adminId, rolle.admin.id);
  });

  it('der Inhaber darf alles vergeben', async () => {
    const neu = await roles.assignRole(als(ownerId), memberId, rolle.owner.id);

    expect(neu.role).toBe(MembershipRole.OWNER);

    await roles.assignRole(als(ownerId), memberId, rolle.member.id);
  });
});

describe('Einladen und Entfernen', () => {
  it('ein Administrator lädt niemanden als Inhaber ein', async () => {
    await expect(
      invitations.inviteMember(als(adminId), {
        email: 'zweitkonto@example.de',
        role: MembershipRole.OWNER,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('als Mitglied schon', async () => {
    await expect(
      invitations.inviteMember(als(adminId), {
        email: 'neu@example.de',
        role: MembershipRole.MEMBER,
      }),
    ).resolves.toMatchObject({ delivered: false });
  });

  it('ein Mitglied lädt gar nicht ein', async () => {
    await expect(
      invitations.inviteMember(als(memberId), {
        email: 'neu@example.de',
        role: MembershipRole.MEMBER,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ein Administrator entfernt keinen Inhaber', async () => {
    await expect(
      invitations.removeMember(als(adminId), { userId: ownerId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('Rollen anlegen', () => {
  it('nur mit Rechten, die man selbst hat', async () => {
    const mitRollenrecht = {
      everything: false,
      permissions: [Permission.ROLE_MANAGE],
    };

    await expect(
      permissions.assertGrantable(
        { ...als(adminId), apiKey: { id: 'k', name: 'k', ...mitRollenrecht } },
        { everything: false, permissions: [Permission.BILLING_MANAGE] },
        'eine Rolle anlegen',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
