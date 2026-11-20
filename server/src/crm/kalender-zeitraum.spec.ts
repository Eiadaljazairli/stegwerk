import { BadRequestException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import {
  CustomFieldEntity,
  CustomFieldFilterOperator as Op,
  CustomFieldType,
} from '../custom-fields/custom-field.types';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { runWithRequestContext } from '../observability/request-context';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { type Feldrechte } from '../workspaces/feldrechte';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { setzeSichtfeld, type Sichtbarkeit } from '../workspaces/sichtbarkeit';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { CompaniesService } from './companies.service';
import { DealsService } from './deals.service';
import { FilterVerknuepfung } from './dto/pagination.dto';
import { CompanyEntity } from './entities/company.entity';
import { DealEntity, DealStage } from './entities/deal.entity';
import { TaskEntity } from './entities/task.entity';
import { TasksService } from './tasks.service';

const SUITE = 'kalender_zeitraum';

jest.setTimeout(60_000);

let dataSource: DataSource;
let companies: CompaniesService;
let deals: DealsService;
let tasks: TasksService;
let customFields: CustomFieldsService;
let workspaceId: string;
let otherWorkspaceId: string;
let annaId: string;
let jonasId: string;

const als = <T>(
  ich: string,
  arten: Partial<Sichtbarkeit>,
  felder: Feldrechte,
  callback: () => Promise<T>,
): Promise<T> =>
  runWithRequestContext({ requestId: 'test' }, () => {
    setzeSichtfeld(() =>
      Promise.resolve({
        ich,
        arten: { company: 'alle', contact: 'alle', deal: 'alle', ...arten },
        felder,
      }),
    );

    return callback();
  });

const MAERZ = { von: '2026-03-01', bis: '2026-03-31' };

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  customFields = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
  );
  companies = new CompaniesService(
    dataSource.getRepository(CompanyEntity),
    customFields,
  );
  deals = new DealsService(dataSource.getRepository(DealEntity), customFields);
  tasks = new TasksService(dataSource.getRepository(TaskEntity), customFields);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE tasks, deals, companies, custom_fields, memberships, users, workspaces CASCADE',
  );

  const workspaces = dataSource.getRepository(WorkspaceEntity);
  const users = dataSource.getRepository(UserEntity);

  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Wir', slug: 'wir' }))
  ).id;
  otherWorkspaceId = (
    await workspaces.save(workspaces.create({ name: 'Andere', slug: 'andere' }))
  ).id;

  const person = async (vorname: string) =>
    (
      await users.save(
        users.create({
          email: `${vorname.toLowerCase()}@wir.de`,
          passwordHash: 'x',
          firstName: vorname,
          lastName: 'Muster',
        }),
      )
    ).id;

  annaId = await person('Anna');
  jonasId = await person('Jonas');

  const memberships = dataSource.getRepository(MembershipEntity);

  await memberships.save([
    memberships.create({
      workspaceId,
      userId: annaId,
      role: MembershipRole.OWNER,
    }),
    memberships.create({
      workspaceId,
      userId: jonasId,
      role: MembershipRole.MEMBER,
    }),
  ]);
});

const namen = (page: { items: { name?: string; title?: string }[] }) =>
  page.items.map((item) => item.name ?? item.title).sort();

describe('Geschäfte nach Abschlussdatum', () => {
  beforeEach(async () => {
    const geschaeft = (
      name: string,
      closeDate: string | null,
      ownerId: string | null = null,
      bereich = workspaceId,
    ) =>
      deals.create(bereich, {
        name,
        stage: DealStage.LEAD,
        closeDate,
        ownerId,
      });

    await geschaeft('Februar', '2026-02-28');
    await geschaeft('Monatserster', '2026-03-01', annaId);
    await geschaeft('Mitte', '2026-03-15', jonasId);
    await geschaeft('Monatsletzter', '2026-03-31', annaId);
    await geschaeft('April', '2026-04-01');
    await geschaeft('Ohne Datum', null);
    await geschaeft('Fremd', '2026-03-10', null, otherWorkspaceId);
  });

  it('zeigt dem Inhaber den Monat mit beiden Rändern, ohne fremden Bereich', async () => {
    const page = await deals.list(workspaceId, {
      zeitraum: { feld: 'std:closeDate', ...MAERZ },
    });

    expect(namen(page)).toEqual(['Mitte', 'Monatserster', 'Monatsletzter']);
  });

  it('bleibt bei ODER-Filtern im Zeitraum', async () => {
    const page = await deals.list(workspaceId, {
      filterVerknuepfung: FilterVerknuepfung.ODER,
      customFilters: [
        { key: 'std:name', operator: Op.EQUALS, value: 'April' },
        { key: 'std:name', operator: Op.EQUALS, value: 'Mitte' },
      ],
      zeitraum: { feld: 'std:closeDate', ...MAERZ },
    });

    expect(namen(page)).toEqual(['Mitte']);
  });

  it('zeigt einer Rolle mit „nur eigene“ nur ihre Geschäfte im Monat', async () => {
    const page = await als(annaId, { deal: 'eigene' }, {}, () =>
      deals.list(workspaceId, {
        zeitraum: { feld: 'std:closeDate', ...MAERZ },
      }),
    );

    expect(namen(page)).toEqual(['Monatserster', 'Monatsletzter']);
  });

  it('gibt einem fremden Bereich nichts aus diesem', async () => {
    const page = await deals.list(otherWorkspaceId, {
      zeitraum: { feld: 'std:closeDate', ...MAERZ },
    });

    expect(namen(page)).toEqual(['Fremd']);
  });

  it('lehnt einen Zeitraum ab, der keiner ist', async () => {
    await expect(
      deals.list(workspaceId, {
        zeitraum: {
          feld: 'std:closeDate',
          von: '2026-03-31',
          bis: '2026-03-01',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      deals.list(workspaceId, {
        zeitraum: {
          feld: 'std:closeDate',
          von: '2026-02-30',
          bis: '2026-03-01',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      deals.list(workspaceId, {
        zeitraum: {
          feld: 'std:closeDate',
          von: '2024-01-01',
          bis: '2026-01-01',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lehnt ein Feld ab, das kein Datum ist', async () => {
    await expect(
      deals.list(workspaceId, {
        zeitraum: { feld: 'std:name', ...MAERZ },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Firmen nach einem eigenen Datumsfeld', () => {
  beforeEach(async () => {
    await customFields.create(workspaceId, {
      entity: CustomFieldEntity.COMPANY,
      label: 'Vertragsende',
      type: CustomFieldType.DATE,
    });
    await companies.create(workspaceId, {
      name: 'Im März',
      customFields: { vertragsende: '2026-03-20' },
    });
    await companies.create(workspaceId, {
      name: 'Im Mai',
      customFields: { vertragsende: '2026-05-02' },
    });
    await companies.create(workspaceId, { name: 'Ohne' });
  });

  it('legt nur die Firmen des Monats in den Kalender', async () => {
    const page = await companies.list(workspaceId, {
      zeitraum: { feld: 'custom:vertragsende', ...MAERZ },
    });

    expect(namen(page)).toEqual(['Im März']);
  });

  it('verweigert einer Rolle, der das Feld verborgen ist, den Kalender danach', async () => {
    await expect(
      als(jonasId, {}, { 'custom:company:vertragsende': 'verborgen' }, () =>
        companies.list(workspaceId, {
          zeitraum: { feld: 'custom:vertragsende', ...MAERZ },
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lässt eine Rolle, die das Feld nur lesen darf, den Kalender sehen', async () => {
    const page = await als(
      jonasId,
      {},
      { 'custom:company:vertragsende': 'lesen' },
      () =>
        companies.list(workspaceId, {
          zeitraum: { feld: 'custom:vertragsende', ...MAERZ },
        }),
    );

    expect(namen(page)).toEqual(['Im März']);
  });

  it('kennt das Feld eines fremden Bereichs nicht', async () => {
    await expect(
      companies.list(otherWorkspaceId, {
        zeitraum: { feld: 'custom:vertragsende', ...MAERZ },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Aufgaben nach Fälligkeit', () => {
  it('zeigt die im Monat fälligen', async () => {
    await tasks.create(workspaceId, {
      title: 'Im März',
      dueDate: '2026-03-03',
      assigneeId: annaId,
      createdById: annaId,
    });
    await tasks.create(workspaceId, {
      title: 'Danach',
      dueDate: '2026-04-03',
      assigneeId: annaId,
      createdById: annaId,
    });

    const page = await tasks.list(workspaceId, {
      zeitraum: { feld: 'std:dueDate', ...MAERZ },
    });

    expect(namen(page)).toEqual(['Im März']);
  });
});
