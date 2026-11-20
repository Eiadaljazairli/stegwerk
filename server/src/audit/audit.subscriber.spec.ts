import { type DataSource } from 'typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import { NoteEntity } from '../crm/entities/note.entity';
import { runWithRequestContext } from '../observability/request-context';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { AuditAction, AuditLogEntity } from './audit-log.entity';
import { AuditSubscriber } from './audit.subscriber';

const SUITE = 'audit';

jest.setTimeout(60_000);

let dataSource: DataSource;
let workspaceId: string;
let userId: string;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);

  new AuditSubscriber(dataSource);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE workspaces, users, companies, notes, audit_log CASCADE',
  );

  const workspace = await dataSource
    .getRepository(WorkspaceEntity)
    .save(
      dataSource
        .getRepository(WorkspaceEntity)
        .create({ name: 'Mein Vertrieb', slug: 'mein-vertrieb' }),
    );

  workspaceId = workspace.id;

  const user = await dataSource.getRepository(UserEntity).save(
    dataSource.getRepository(UserEntity).create({
      email: 'inhaberin@example.de',
      passwordHash: 'x',
      firstName: 'Ada',
      lastName: 'Lovelace',
    }),
  );

  userId = user.id;
});

const companies = () => dataSource.getRepository(CompanyEntity);
const entries = () =>
  dataSource
    .getRepository(AuditLogEntity)
    .find({ order: { createdAt: 'ASC' } });

const addCompany = (name = 'Nordwind GmbH') =>
  companies().save(companies().create({ workspaceId, name }));

describe('what gets recorded', () => {
  it('notes a record being created', async () => {
    const company = await addCompany();

    const [entry] = await entries();

    expect(entry).toMatchObject({
      workspaceId,
      action: AuditAction.CREATED,
      entityType: 'Company',
      entityId: company.id,
      summary: 'Nordwind GmbH',
    });
  });

  it('notes what a change was, from and to', async () => {
    const company = await addCompany();

    company.industry = 'Logistik';
    await companies().save(company);

    company.industry = 'Handel';
    await companies().save(company);

    const [, first, second] = await entries();

    expect(first.changes).toEqual({ industry: [null, 'Logistik'] });
    expect(second.action).toBe(AuditAction.UPDATED);
    expect(second.changes).toEqual({ industry: ['Logistik', 'Handel'] });
  });

  it('writes nothing when a save changed no field', async () => {
    const company = await addCompany();

    await companies().save(company);

    expect(await entries()).toHaveLength(1);
  });

  it('keeps bookkeeping columns out of the change list', async () => {
    const company = await addCompany();

    company.city = 'Hamburg';
    await companies().save(company);

    const [, update] = await entries();

    for (const field of ['id', 'workspaceId', 'createdAt', 'updatedAt']) {
      expect(update.changes).not.toHaveProperty(field);
    }
  });

  it('says what a deleted record was, not only that one went', async () => {
    const company = await addCompany();

    await companies().remove(company);

    const [, removal] = await entries();

    expect(removal.action).toBe(AuditAction.DELETED);
    expect(removal.summary).toBe('Nordwind GmbH');
  });

  it('labels a note by its text, since it has no name', async () => {
    await dataSource.getRepository(NoteEntity).save(
      dataSource.getRepository(NoteEntity).create({
        workspaceId,
        body: 'Erstgespräch gut verlaufen',
        authorId: userId,
      }),
    );

    const [entry] = await entries();

    expect(entry.entityType).toBe('Note');
    expect(entry.summary).toBe('Erstgespräch gut verlaufen');
  });
});

describe('what does not get recorded', () => {
  it('ignores the audit log itself', async () => {
    await addCompany();

    const before = (await entries()).length;

    await dataSource.getRepository(AuditLogEntity).save(
      dataSource.getRepository(AuditLogEntity).create({
        workspaceId,
        action: AuditAction.CREATED,
        entityType: 'Company',
        entityId: '00000000-0000-0000-0000-000000000000',
      }),
    );

    expect(await entries()).toHaveLength(before + 1);
  });

  it('ignores a table with no workspace to attribute it to', async () => {
    await dataSource.getRepository(UserEntity).save(
      dataSource.getRepository(UserEntity).create({
        email: 'zweite@example.de',
        passwordHash: 'x',
        firstName: 'Grace',
        lastName: 'Hopper',
      }),
    );

    expect(await entries()).toHaveLength(0);
  });
});

describe('who did it', () => {
  it('records the person and the request when there is one', async () => {
    await runWithRequestContext(
      { requestId: 'req-1', userId, workspaceId },
      async () => {
        await addCompany();
      },
    );

    const [entry] = await entries();

    expect(entry.actorId).toBe(userId);
    expect(entry.requestId).toBe('req-1');
  });

  it('still records the change when nothing says who', async () => {
    await addCompany();

    const [entry] = await entries();

    expect(entry.actorId).toBeNull();
    expect(entry.action).toBe(AuditAction.CREATED);
  });
});
