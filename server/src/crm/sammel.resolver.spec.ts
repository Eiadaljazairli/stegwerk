import { type DataSource } from 'typeorm';

import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import {
  CustomFieldEntity,
  CustomFieldType,
} from '../custom-fields/custom-field.types';
import { PapierkorbArt } from '../papierkorb/papierkorb.dto';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { CompaniesService } from './companies.service';
import { ContactsService } from './contacts.service';
import { DealsService } from './deals.service';
import { CompanyEntity } from './entities/company.entity';
import { ContactEntity } from './entities/contact.entity';
import { DealEntity, DealStage } from './entities/deal.entity';
import { TaskEntity } from './entities/task.entity';
import { SAMMEL_GRENZE, SammelResolver } from './sammel.resolver';
import { TasksService } from './tasks.service';

const SUITE = 'sammel';

jest.setTimeout(60_000);

let dataSource: DataSource;
let sammel: SammelResolver;
let deals: DealsService;
let workspaceId: string;
let fremd: string;
let user: { userId: string; workspaceId: string; email: string };
const erlaubt = { assert: jest.fn().mockResolvedValue(undefined) };

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  const felder = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
  );

  deals = new DealsService(dataSource.getRepository(DealEntity), felder);
  sammel = new SammelResolver(
    erlaubt as never,
    new CompaniesService(dataSource.getRepository(CompanyEntity), felder),
    new ContactsService(dataSource.getRepository(ContactEntity), felder),
    deals,
    new TasksService(dataSource.getRepository(TaskEntity), felder),
  );

  const m = dataSource.manager;

  workspaceId = (
    await m.save(m.create(WorkspaceEntity, { name: 'Viel', slug: 'viel' }))
  ).id;
  fremd = (
    await m.save(m.create(WorkspaceEntity, { name: 'Fremd', slug: 'fremd2' }))
  ).id;

  const anna = await m.save(
    m.create(UserEntity, {
      email: 'anna@viel.test',
      passwordHash: 'x',
      firstName: 'Anna',
      lastName: 'Viel',
    }),
  );

  await m.save(
    m.create(MembershipEntity, {
      userId: anna.id,
      workspaceId,
      role: MembershipRole.OWNER,
    }),
  );
  user = { userId: anna.id, workspaceId, email: anna.email };
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

describe('Sammelaktionen', () => {
  it('setzt Phase und Verantwortliche für alle und überspringt Fremdes', async () => {
    const [a, b] = await Promise.all([
      deals.create(workspaceId, { name: 'A' }),
      deals.create(workspaceId, { name: 'B' }),
    ]);
    const fremdes = await deals.create(fremd, { name: 'Nicht meins' });

    await expect(
      sammel.sammelPhase(user, [a.id, b.id, fremdes.id], DealStage.PROPOSAL),
    ).resolves.toBe(2);
    expect((await deals.findOne(fremd, fremdes.id)).stage).not.toBe(
      DealStage.PROPOSAL,
    );

    await expect(
      sammel.sammelVerantwortlich(
        user,
        PapierkorbArt.GESCHAEFT,
        [a.id, b.id],
        user.userId,
      ),
    ).resolves.toBe(2);
    expect((await deals.findOne(workspaceId, a.id)).ownerId).toBe(user.userId);
  });

  it('verschiebt, was geht, und sagt, wie viele nicht gingen', async () => {
    const felder = new CustomFieldsService(
      dataSource.getRepository(CustomFieldDefinition),
    );
    const feld = await felder.create(workspaceId, {
      entity: CustomFieldEntity.DEAL,
      label: 'Budget',
      type: CustomFieldType.TEXT,
      pflichtAbPhase: DealStage.NEGOTIATION,
    });

    try {
      const [mit, ohne] = await Promise.all([
        deals.create(workspaceId, {
          name: 'Mit',
          customFields: { [feld.key]: '10.000' },
        }),
        deals.create(workspaceId, { name: 'Ohne' }),
      ]);

      await expect(
        sammel.sammelPhase(user, [mit.id, ohne.id], DealStage.NEGOTIATION),
      ).rejects.toThrow('1 verschoben, 1 nicht: Für diese Phase fehlt noch');
      expect((await deals.findOne(workspaceId, mit.id)).stage).toBe(
        DealStage.NEGOTIATION,
      );
      expect((await deals.findOne(workspaceId, ohne.id)).stage).not.toBe(
        DealStage.NEGOTIATION,
      );
    } finally {
      await felder.archive(workspaceId, feld.id);
    }
  });

  it('legt alle in den Papierkorb', async () => {
    const c = await deals.create(workspaceId, { name: 'C' });

    await expect(
      sammel.sammelLoeschen(user, PapierkorbArt.GESCHAEFT, [c.id, c.id]),
    ).resolves.toBe(1);
    await expect(deals.findOne(workspaceId, c.id)).rejects.toThrow();
  });

  it('nimmt nicht mehr als die Grenze', async () => {
    const zuViele = Array.from(
      { length: SAMMEL_GRENZE + 1 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );

    await expect(
      sammel.sammelLoeschen(user, PapierkorbArt.GESCHAEFT, zuViele),
    ).rejects.toThrow('zwischen 1');
  });
});
