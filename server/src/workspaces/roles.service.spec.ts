import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { MembershipEntity, MembershipRole } from './membership.entity';
import { Permission } from './permissions';
import { PermissionsService } from './permissions.service';
import { RoleEntity } from './role.entity';
import { RolesService } from './roles.service';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceEntity } from './workspace.entity';

const als = (userId: string, workspaceId: string): RequestUser => ({
  userId,
  workspaceId,
  email: `${userId}@example.de`,
});

const SUITE = 'roles';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: RolesService;
let permissions: PermissionsService;
let workspaceId: string;
let otherWorkspaceId: string;
let ownerId: string;
let memberId: string;

const roleNamed = async (name: string, workspace = workspaceId) =>
  (await service.list(workspace)).find((role) => role.name === name)!;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  service = new RolesService(
    dataSource.getRepository(RoleEntity),
    dataSource.getRepository(MembershipEntity),
  );
  permissions = new PermissionsService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(RoleEntity),
  );
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE memberships, roles, workspaces, users CASCADE',
  );

  const workspaces = dataSource.getRepository(WorkspaceEntity);
  const users = dataSource.getRepository(UserEntity);
  const memberships = dataSource.getRepository(MembershipEntity);

  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Unsere', slug: 'unsere' }))
  ).id;
  otherWorkspaceId = (
    await workspaces.save(workspaces.create({ name: 'Fremde', slug: 'fremde' }))
  ).id;

  ownerId = (
    await users.save(
      users.create({
        email: 'inhaber@example.de',
        firstName: 'Anna',
        lastName: 'Schmidt',
        passwordHash: 'x',
      }),
    )
  ).id;
  memberId = (
    await users.save(
      users.create({
        email: 'mitglied@example.de',
        firstName: 'Jonas',
        lastName: 'Weber',
        passwordHash: 'x',
      }),
    )
  ).id;

  const roles = await service.list(workspaceId);
  const owner = roles.find((role) => role.templateKey === 'owner')!;
  const member = roles.find((role) => role.templateKey === 'member')!;

  await memberships.save([
    memberships.create({
      userId: ownerId,
      workspaceId,
      role: MembershipRole.OWNER,
      roleId: owner.id,
    }),
    memberships.create({
      userId: memberId,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: member.id,
    }),
  ]);
});

describe('the roles a workspace gets', () => {
  it('seeds four the first time somebody looks', async () => {
    const roles = await service.list(otherWorkspaceId);

    expect(roles.map((role) => role.templateKey)).toEqual(
      expect.arrayContaining(['owner', 'admin', 'member', 'readonly']),
    );
  });

  it('seeds them once, not on every look', async () => {
    await service.list(otherWorkspaceId);
    await service.list(otherWorkspaceId);

    expect(await service.list(otherWorkspaceId)).toHaveLength(4);
  });

  it('gives each workspace its own copies', async () => {
    const ours = await roleNamed('Mitglied');
    const theirs = await roleNamed('Mitglied', otherWorkspaceId);

    expect(theirs.id).not.toBe(ours.id);
  });

  it('counts who holds each', async () => {
    const roles = await service.list(workspaceId);

    expect(
      roles.find((role) => role.templateKey === 'owner')?.memberCount,
    ).toBe(1);
    expect(
      roles.find((role) => role.templateKey === 'readonly')?.memberCount,
    ).toBe(0);
  });
});

describe('making a role', () => {
  it('keeps what it was given', async () => {
    const role = await service.create(workspaceId, {
      name: 'Vertrieb Nord',
      permissions: [Permission.DEAL_VIEW],
    });

    expect(role.name).toBe('Vertrieb Nord');
    expect(role.isSystem).toBe(false);
    expect(role.memberCount).toBe(0);
  });

  it('adds the view a write needs', async () => {
    const role = await service.create(workspaceId, {
      name: 'Nur Geschäfte',
      permissions: [Permission.DEAL_WRITE],
    });

    expect(role.permissions).toContain(Permission.DEAL_VIEW);
  });

  it('drops a permission this product does not have', async () => {
    const role = await service.create(workspaceId, {
      name: 'Erfunden',
      permissions: ['deal:teleport' as Permission],
    });

    expect(role.permissions).toEqual([]);
  });

  it('refuses a name already used in this workspace', async () => {
    await expect(
      service.create(workspaceId, { name: 'Mitglied', permissions: [] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows a name another workspace uses', async () => {
    await service.create(workspaceId, { name: 'Vertrieb', permissions: [] });

    await expect(
      service.create(otherWorkspaceId, { name: 'Vertrieb', permissions: [] }),
    ).resolves.toBeDefined();
  });

  it('refuses a name that is only spaces', async () => {
    await expect(
      service.create(workspaceId, { name: '   ', permissions: [] }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('changing a role', () => {
  it('renames one', async () => {
    const role = await roleNamed('Mitglied');

    expect(
      (await service.update(workspaceId, role.id, { name: 'Team' })).name,
    ).toBe('Team');
  });

  it('lets a built-in role be renamed and re-permissioned', async () => {
    const role = await roleNamed('Mitglied');

    const changed = await service.update(workspaceId, role.id, {
      permissions: [Permission.COMPANY_VIEW],
    });

    expect(changed.permissions).toEqual([Permission.COMPANY_VIEW]);
  });

  it('refuses to weaken the owner role', async () => {
    const owner = await roleNamed('Inhaber');

    await expect(
      service.update(workspaceId, owner.id, { permissions: [] }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('still lets the owner role be renamed', async () => {
    const owner = await roleNamed('Inhaber');

    await expect(
      service.update(workspaceId, owner.id, { name: 'Geschäftsführung' }),
    ).resolves.toMatchObject({ everything: true });
  });

  it('refuses another workspace role', async () => {
    const theirs = await roleNamed('Mitglied', otherWorkspaceId);

    await expect(
      service.update(workspaceId, theirs.id, { name: 'Geklaut' }),
    ).rejects.toThrow();
  });
});

describe('deleting a role', () => {
  it('removes one nobody holds', async () => {
    const role = await service.create(workspaceId, {
      name: 'Ungenutzt',
      permissions: [],
    });

    expect(await service.remove(workspaceId, role.id)).toBe(true);
  });

  it('refuses one that people still hold', async () => {
    const member = await roleNamed('Mitglied');

    await expect(service.remove(workspaceId, member.id)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses a built-in one even when nobody holds it', async () => {
    const reader = await roleNamed('Nur Lesen');

    expect(reader.memberCount).toBe(0);
    await expect(service.remove(workspaceId, reader.id)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('assigning a role', () => {
  it('moves somebody to another role', async () => {
    const reader = await roleNamed('Nur Lesen');

    await service.assign(workspaceId, memberId, reader.id);

    expect(
      await permissions.can(als(memberId, workspaceId), Permission.DEAL_WRITE),
    ).toBe(false);
    expect(
      await permissions.can(als(memberId, workspaceId), Permission.DEAL_VIEW),
    ).toBe(true);
  });

  it('refuses to take the role from the last owner', async () => {
    const member = await roleNamed('Mitglied');

    await expect(
      service.assign(workspaceId, ownerId, member.id),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows it once somebody else is an owner', async () => {
    const owner = await roleNamed('Inhaber');
    const member = await roleNamed('Mitglied');

    await service.assign(workspaceId, memberId, owner.id);

    await expect(
      service.assign(workspaceId, ownerId, member.id),
    ).resolves.toBeDefined();
  });

  it('lässt von zwei Inhabern, die sich gleichzeitig herabstufen, einen übrig', async () => {
    const owner = await roleNamed('Inhaber');
    const member = await roleNamed('Mitglied');

    await service.assign(workspaceId, memberId, owner.id);

    for (let runde = 0; runde < 5; runde += 1) {
      const ergebnisse = await Promise.allSettled([
        service.assign(workspaceId, ownerId, member.id),
        service.assign(workspaceId, memberId, member.id),
      ]);

      expect(ergebnisse.filter((e) => e.status === 'fulfilled')).toHaveLength(
        1,
      );
      expect(await permissions.holdsEverything(ownerId, workspaceId)).not.toBe(
        await permissions.holdsEverything(memberId, workspaceId),
      );

      await service.assign(workspaceId, ownerId, owner.id);
      await service.assign(workspaceId, memberId, owner.id);
    }
  });

  it('refuses a role from another workspace', async () => {
    const theirs = await roleNamed('Nur Lesen', otherWorkspaceId);

    await expect(
      service.assign(workspaceId, memberId, theirs.id),
    ).rejects.toThrow();
  });

  it('refuses somebody who is not in this workspace', async () => {
    const reader = await roleNamed('Nur Lesen');

    await expect(
      service.assign(otherWorkspaceId, memberId, reader.id),
    ).rejects.toThrow();
  });
});

describe('asking what somebody may do', () => {
  it('lets the owner do everything', async () => {
    for (const permission of [
      Permission.BILLING_MANAGE,
      Permission.DATA_PRIVACY,
      Permission.DEAL_DELETE,
    ]) {
      expect(await permissions.can(als(ownerId, workspaceId), permission)).toBe(
        true,
      );
    }
  });

  it('stops a member reshaping the workspace', async () => {
    expect(
      await permissions.can(
        als(memberId, workspaceId),
        Permission.FIELD_MANAGE,
      ),
    ).toBe(false);
  });

  it('answers no for somebody who is not a member at all', async () => {
    expect(
      await permissions.can(
        als(memberId, otherWorkspaceId),
        Permission.DEAL_VIEW,
      ),
    ).toBe(false);
  });

  it('refuses out loud, in a sentence a person can act on', async () => {
    await expect(
      permissions.assert(
        als(memberId, workspaceId),
        Permission.BILLING_MANAGE,
        'die Abrechnung zu ändern',
      ),
    ).rejects.toThrow(/Berechtigung, die Abrechnung zu ändern/u);
  });

  it('falls back to the old enum when a membership has no role yet', async () => {
    await dataSource.query(
      'UPDATE memberships SET "roleId" = NULL WHERE "userId" = $1',
      [ownerId],
    );

    expect(
      await permissions.can(
        als(ownerId, workspaceId),
        Permission.BILLING_MANAGE,
      ),
    ).toBe(true);
  });
});
