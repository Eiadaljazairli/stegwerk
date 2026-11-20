import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { type DataSource } from 'typeorm';

import { SubscriptionEntity } from '../billing/subscription.entity';
import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { NoteEntity } from '../crm/entities/note.entity';
import { TaskEntity } from '../crm/entities/task.entity';
import { CustomFieldGroupEntity } from '../custom-fields/custom-field-group.entity';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import {
  CustomFieldEntity,
  CustomFieldType,
} from '../custom-fields/custom-field.types';
import { SavedViewDefaultEntity } from '../saved-views/saved-view-default.entity';
import { SavedViewEntity } from '../saved-views/saved-view.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { InvitationEntity } from '../workspaces/invitation.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { PrivacyService } from './privacy.service';

const SUITE = 'privacy';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: PrivacyService;
let workspaceId: string;
let ownerId: string;
let memberId: string;

const fillWorkspace = async () => {
  const workspace = await dataSource
    .getRepository(WorkspaceEntity)
    .save(
      dataSource
        .getRepository(WorkspaceEntity)
        .create({ name: 'Mein Vertrieb', slug: 'mein-vertrieb' }),
    );

  workspaceId = workspace.id;

  const users = dataSource.getRepository(UserEntity);
  const owner = await users.save(
    users.create({
      email: 'inhaberin@example.de',
      passwordHash: bcrypt.hashSync(PASSWORT, 4),
      firstName: 'Ada',
      lastName: 'Lovelace',
    }),
  );
  const member = await users.save(
    users.create({
      email: 'kollege@example.de',
      passwordHash: 'x',
      firstName: 'Grace',
      lastName: 'Hopper',
    }),
  );

  ownerId = owner.id;
  memberId = member.id;

  const memberships = dataSource.getRepository(MembershipEntity);

  await memberships.save(
    memberships.create({
      userId: ownerId,
      workspaceId,
      role: MembershipRole.OWNER,
    }),
  );
  await memberships.save(
    memberships.create({
      userId: memberId,
      workspaceId,
      role: MembershipRole.MEMBER,
    }),
  );

  await dataSource
    .getRepository(SubscriptionEntity)
    .save(dataSource.getRepository(SubscriptionEntity).create({ workspaceId }));

  await dataSource.getRepository(InvitationEntity).save(
    dataSource.getRepository(InvitationEntity).create({
      workspaceId,
      email: 'neue@example.de',
      role: MembershipRole.MEMBER,
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 86_400_000),
      invitedById: ownerId,
    }),
  );

  const company = await dataSource
    .getRepository(CompanyEntity)
    .save(
      dataSource
        .getRepository(CompanyEntity)
        .create({ workspaceId, name: 'Nordwind GmbH' }),
    );

  const contact = await dataSource.getRepository(ContactEntity).save(
    dataSource.getRepository(ContactEntity).create({
      workspaceId,
      firstName: 'Katrin',
      lastName: 'Böhm',
      companyId: company.id,
    }),
  );

  const deal = await dataSource.getRepository(DealEntity).save(
    dataSource.getRepository(DealEntity).create({
      workspaceId,
      name: 'Rahmenvertrag',
      companyId: company.id,
    }),
  );

  await dataSource.getRepository(TaskEntity).save(
    dataSource.getRepository(TaskEntity).create({
      workspaceId,
      title: 'Angebot nachfassen',
      assigneeId: ownerId,
      createdById: ownerId,
      dealId: deal.id,
    }),
  );

  await dataSource.getRepository(NoteEntity).save(
    dataSource.getRepository(NoteEntity).create({
      workspaceId,
      body: 'Erstgespräch gut verlaufen',
      authorId: ownerId,
      contactId: contact.id,
    }),
  );

  const field = await dataSource.getRepository(CustomFieldDefinition).save(
    dataSource.getRepository(CustomFieldDefinition).create({
      workspaceId,
      entity: CustomFieldEntity.COMPANY,
      key: 'region',
      label: 'Region',
      type: CustomFieldType.SELECT,
      options: ['Nord'],
    }),
  );

  const view = await dataSource.getRepository(SavedViewEntity).save(
    dataSource.getRepository(SavedViewEntity).create({
      workspaceId,
      entity: CustomFieldEntity.COMPANY,
      name: 'Nord',
      createdById: ownerId,
    }),
  );

  await dataSource.getRepository(SavedViewDefaultEntity).save(
    dataSource.getRepository(SavedViewDefaultEntity).create({
      userId: ownerId,
      workspaceId,
      entity: CustomFieldEntity.COMPANY,
      savedViewId: view.id,
    }),
  );

  return { workspace, company, contact, deal, field };
};

const tablesWithWorkspaceId = async (): Promise<string[]> => {
  const rows: { table_name: string }[] = await dataSource.query(
    `SELECT DISTINCT c.table_name
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE c.table_schema = 'public'
        AND c.column_name = 'workspaceId'
        AND t.table_type = 'BASE TABLE'
      ORDER BY 1`,
  );

  return rows.map((row) => row.table_name);
};

const PASSWORT = 'EinLangesPasswort1';

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  service = new PrivacyService(dataSource);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    `TRUNCATE TABLE workspaces, users, companies, contacts, deals, notes,
       tasks, invitations, memberships, subscriptions, custom_fields,
       saved_views, saved_view_defaults, audit_log CASCADE`,
  );
  await fillWorkspace();
});

describe('exporting', () => {
  it('refuses somebody who is not the owner', async () => {
    await expect(
      service.exportWorkspace(memberId, workspaceId),
    ).rejects.toThrow(ForbiddenException);
  });

  it('includes every kind of record', async () => {
    const data = (await service.exportWorkspace(
      ownerId,
      workspaceId,
    )) as Record<string, unknown[]>;

    for (const key of [
      'companies',
      'contacts',
      'deals',
      'notes',
      'tasks',
      'invitations',
      'customFieldDefinitions',
      'savedViews',
      'savedViewDefaults',
    ]) {
      expect(data[key]).toHaveLength(1);
    }
  });

  it('says what the custom field values mean', async () => {
    const data = (await service.exportWorkspace(ownerId, workspaceId)) as {
      customFieldDefinitions: { key: string; label: string }[];
    };

    expect(data.customFieldDefinitions[0]).toMatchObject({
      key: 'region',
      label: 'Region',
    });
  });

  it('nimmt Standardwert, Abschnitt und Abschnitte der Felder mit', async () => {
    const m = dataSource.manager;
    const gruppe = await m.save(
      m.create(CustomFieldGroupEntity, {
        workspaceId,
        entity: CustomFieldEntity.COMPANY,
        name: 'Vertrag',
        position: 2,
        eingeklappt: true,
      }),
    );

    await m.update(
      CustomFieldDefinition,
      { workspaceId, key: 'region' },
      { standardwertWert: 'Nord', gruppeId: gruppe.id },
    );

    const data = (await service.exportWorkspace(ownerId, workspaceId)) as {
      customFieldDefinitions: Record<string, unknown>[];
      customFieldGroups: Record<string, unknown>[];
    };

    expect(data.customFieldDefinitions[0]).toMatchObject({
      key: 'region',
      standardwert: 'Nord',
      gruppeId: gruppe.id,
    });
    expect(data.customFieldGroups).toEqual([
      {
        id: gruppe.id,
        entity: CustomFieldEntity.COMPANY,
        name: 'Vertrag',
        position: 2,
        eingeklappt: true,
      },
    ]);
  });

  it('carries the saved lists and whose default each one is', async () => {
    const data = (await service.exportWorkspace(ownerId, workspaceId)) as {
      savedViews: { id: string; name: string }[];
      savedViewDefaults: { userId: string; savedViewId: string }[];
    };

    expect(data.savedViews[0]).toMatchObject({ name: 'Nord' });
    expect(data.savedViewDefaults[0]).toMatchObject({
      userId: ownerId,
      savedViewId: data.savedViews[0].id,
    });
  });
  it('carries no password hashes and no invitation tokens', async () => {
    const data = await service.exportWorkspace(ownerId, workspaceId);
    const text = JSON.stringify(data);

    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain('tokenHash');
  });
});

describe('erasing', () => {
  it('refuses somebody who is not the owner', async () => {
    await expect(
      service.deleteWorkspace(memberId, workspaceId, 'Mein Vertrieb', PASSWORT),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses a name that does not match', async () => {
    await expect(
      service.deleteWorkspace(ownerId, workspaceId, 'Mein Vertreib', PASSWORT),
    ).rejects.toThrow(BadRequestException);

    expect(await dataSource.getRepository(CompanyEntity).count()).toBe(1);
  });

  it('verlangt das Passwort', async () => {
    await expect(
      service.deleteWorkspace(ownerId, workspaceId, 'Mein Vertrieb', 'falsch'),
    ).rejects.toThrow('Passwort');
  });

  it('leaves no row behind in any table that has a workspace', async () => {
    await service.deleteWorkspace(
      ownerId,
      workspaceId,
      'Mein Vertrieb',
      PASSWORT,
    );

    const tables = await tablesWithWorkspaceId();

    expect(tables.length).toBeGreaterThan(8);

    for (const table of tables) {
      const [{ count }]: { count: string }[] = await dataSource.query(
        `SELECT count(*) FROM "${table}" WHERE "workspaceId" = $1`,
        [workspaceId],
      );

      expect({ table, count: Number(count) }).toEqual({ table, count: 0 });
    }
  });

  it('removes the workspace itself', async () => {
    await service.deleteWorkspace(
      ownerId,
      workspaceId,
      'Mein Vertrieb',
      PASSWORT,
    );

    expect(
      await dataSource
        .getRepository(WorkspaceEntity)
        .findOne({ where: { id: workspaceId } }),
    ).toBeNull();
  });

  it('removes people left belonging to nothing', async () => {
    await service.deleteWorkspace(
      ownerId,
      workspaceId,
      'Mein Vertrieb',
      PASSWORT,
    );

    expect(await dataSource.getRepository(UserEntity).count()).toBe(0);
  });

  it('keeps somebody who still belongs to another workspace', async () => {
    const other = await dataSource
      .getRepository(WorkspaceEntity)
      .save(
        dataSource
          .getRepository(WorkspaceEntity)
          .create({ name: 'Zweitfirma', slug: 'zweitfirma' }),
      );

    await dataSource.getRepository(MembershipEntity).save(
      dataSource.getRepository(MembershipEntity).create({
        userId: memberId,
        workspaceId: other.id,
        role: MembershipRole.OWNER,
      }),
    );

    await service.deleteWorkspace(
      ownerId,
      workspaceId,
      'Mein Vertrieb',
      PASSWORT,
    );

    expect(
      await dataSource
        .getRepository(UserEntity)
        .findOne({ where: { id: memberId } }),
    ).not.toBeNull();
  });

  it('does not touch another workspace', async () => {
    const other = await dataSource
      .getRepository(WorkspaceEntity)
      .save(
        dataSource
          .getRepository(WorkspaceEntity)
          .create({ name: 'Zweitfirma', slug: 'zweitfirma' }),
      );

    await dataSource
      .getRepository(CompanyEntity)
      .save(
        dataSource
          .getRepository(CompanyEntity)
          .create({ workspaceId: other.id, name: 'Fremde GmbH' }),
      );

    await service.deleteWorkspace(
      ownerId,
      workspaceId,
      'Mein Vertrieb',
      PASSWORT,
    );

    expect(
      await dataSource
        .getRepository(CompanyEntity)
        .countBy({ workspaceId: other.id }),
    ).toBe(1);
  });
});
