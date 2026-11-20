import { type DataSource } from 'typeorm';

import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import {
  CustomFieldEntity,
  CustomFieldType,
} from '../custom-fields/custom-field.types';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { DealsService } from './deals.service';
import { DealEntity, DealStage } from './entities/deal.entity';
import { mitVerantwortlichem } from './verantwortlich';

const SUITE = 'deals';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: DealsService;
let workspaceId: string;
let otherWorkspaceId: string;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  service = new DealsService(
    dataSource.getRepository(DealEntity),
    new CustomFieldsService(dataSource.getRepository(CustomFieldDefinition)),
  );

  const workspaces = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Unsere', slug: 'unsere' }))
  ).id;
  otherWorkspaceId = (
    await workspaces.save(workspaces.create({ name: 'Fremde', slug: 'fremde' }))
  ).id;
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query('TRUNCATE TABLE deals CASCADE');
});

const addDeal = (
  stage: DealStage,
  amount: number | null,
  workspace = workspaceId,
) =>
  dataSource.getRepository(DealEntity).save(
    dataSource.getRepository(DealEntity).create({
      workspaceId: workspace,
      name: `${stage} ${String(amount)}`,
      stage,
      amount,
    }),
  );

const stageIn = (
  summary: { stage: DealStage; dealCount: number; totalAmount: number }[],
  stage: DealStage,
) => summary.find((entry) => entry.stage === stage);

describe('the pipeline by stage', () => {
  it('returns every stage, including the empty ones', async () => {
    await addDeal(DealStage.LEAD, 1000);

    const summary = await service.pipelineByStage(workspaceId);

    expect(summary.map((entry) => entry.stage)).toEqual(
      Object.values(DealStage),
    );
    expect(stageIn(summary, DealStage.WON)).toMatchObject({
      dealCount: 0,
      totalAmount: 0,
    });
  });

  it('adds up the deals in each stage', async () => {
    await addDeal(DealStage.PROPOSAL, 1000);
    await addDeal(DealStage.PROPOSAL, 2500);
    await addDeal(DealStage.WON, 400);

    const summary = await service.pipelineByStage(workspaceId);

    expect(stageIn(summary, DealStage.PROPOSAL)).toMatchObject({
      dealCount: 2,
      totalAmount: 3500,
    });
    expect(stageIn(summary, DealStage.WON)).toMatchObject({
      dealCount: 1,
      totalAmount: 400,
    });
  });

  it('counts a deal with no amount without breaking the total', async () => {
    await addDeal(DealStage.LEAD, null);
    await addDeal(DealStage.LEAD, 1000);

    expect(
      stageIn(await service.pipelineByStage(workspaceId), DealStage.LEAD),
    ).toMatchObject({ dealCount: 2, totalAmount: 1000 });
  });

  it('returns numbers, not the strings Postgres sends back', async () => {
    await addDeal(DealStage.LEAD, 1000);

    const [entry] = await service.pipelineByStage(workspaceId);

    expect(typeof entry.dealCount).toBe('number');
    expect(typeof entry.totalAmount).toBe('number');
  });

  it('ignores another workspace', async () => {
    await addDeal(DealStage.LEAD, 1000);
    await addDeal(DealStage.LEAD, 9999, otherWorkspaceId);

    expect(
      stageIn(await service.pipelineByStage(workspaceId), DealStage.LEAD),
    ).toMatchObject({ dealCount: 1, totalAmount: 1000 });
  });
});

describe('the open pipeline', () => {
  it('leaves out what is already won or lost', async () => {
    await addDeal(DealStage.LEAD, 1000);
    await addDeal(DealStage.NEGOTIATION, 2000);
    await addDeal(DealStage.WON, 500_000);
    await addDeal(DealStage.LOST, 500_000);

    expect(await service.openPipelineValue(workspaceId)).toBe(3000);
    expect(await service.countOpen(workspaceId)).toBe(2);
  });

  it('is zero when nothing is open', async () => {
    await addDeal(DealStage.WON, 1000);

    expect(await service.openPipelineValue(workspaceId)).toBe(0);
    expect(await service.countOpen(workspaceId)).toBe(0);
  });

  it('is zero for a workspace with no deals at all', async () => {
    expect(await service.openPipelineValue(workspaceId)).toBe(0);
  });

  it('ignores another workspace', async () => {
    await addDeal(DealStage.LEAD, 1000);
    await addDeal(DealStage.LEAD, 9999, otherWorkspaceId);

    expect(await service.openPipelineValue(workspaceId)).toBe(1000);
    expect(await service.countOpen(workspaceId)).toBe(1);
  });
});

describe('der Verantwortliche', () => {
  const person = async (email: string, bereich?: string) => {
    const users = dataSource.getRepository(UserEntity);
    const user = await users.save(
      users.create({
        email,
        passwordHash: 'x',
        firstName: 'Vera',
        lastName: 'Kauf',
      }),
    );

    if (bereich !== undefined) {
      await dataSource.getRepository(MembershipEntity).save({
        userId: user.id,
        workspaceId: bereich,
        role: MembershipRole.MEMBER,
      });
    }

    return user;
  };

  it('filtert "Meine" und lädt den Namen mit', async () => {
    const vera = await person('vera@unsere.test', workspaceId);
    const max = await person('max@unsere.test', workspaceId);

    await service.create(workspaceId, { name: 'Veras', ownerId: vera.id });
    await service.create(workspaceId, { name: 'Max', ownerId: max.id });
    await service.create(workspaceId, { name: 'Niemand' });

    const meine = await service.list(workspaceId, {}, { ownerId: vera.id });

    expect(meine.items.map((d) => d.name)).toEqual(['Veras']);
    expect(meine.items[0].owner?.firstName).toBe('Vera');
  });

  it('lässt sich ändern und wieder leeren', async () => {
    const vera = await person('vera2@unsere.test', workspaceId);
    const deal = await service.create(workspaceId, {
      name: 'Wechsel',
      ownerId: vera.id,
    });

    const geleert = await service.update(workspaceId, deal.id, {
      ownerId: null,
    });

    expect(geleert.ownerId).toBeNull();
    expect(geleert.owner).toBeNull();
    expect((await service.findOne(workspaceId, deal.id)).ownerId).toBeNull();
  });

  it('nimmt niemanden aus einem fremden Bereich', async () => {
    const fremd = await person('fremd@fremde.test', otherWorkspaceId);

    await expect(
      service.create(workspaceId, { name: 'Unterwandert', ownerId: fremd.id }),
    ).rejects.toThrow();
  });

  it('setzt beim Anlegen die anlegende Person, bei einem Schlüssel niemanden', () => {
    const mensch = { userId: 'u1', workspaceId, email: 'a@b.c' };

    expect(
      mitVerantwortlichem(mensch, { name: 'x' } as {
        name: string;
        ownerId?: string;
      }).ownerId,
    ).toBe('u1');
    expect(mitVerantwortlichem(mensch, { ownerId: null }).ownerId).toBeNull();
    expect(
      mitVerantwortlichem(
        { ...mensch, apiKey: { id: 'k', name: 'k', permissions: [] } },
        { name: 'x' } as { name: string; ownerId?: string },
      ).ownerId,
    ).toBeNull();
  });
});

describe('ruhende Geschäfte', () => {
  it('erkennt offene Geschäfte ohne Aktivität und zählt eine neue Notiz als Aktivität', async () => {
    const alt = await service.create(workspaceId, { name: 'Alt' });
    const frisch = await service.create(workspaceId, { name: 'Frisch' });
    const verloren = await service.create(workspaceId, {
      name: 'Verloren',
      stage: DealStage.LOST,
      lostReason: 'Preis zu hoch',
    });

    await dataSource.query(
      `UPDATE "deals" SET "updatedAt" = now() - interval '30 days' WHERE "id" = ANY($1)`,
      [[alt.id, verloren.id]],
    );

    const ruhend = await service.list(workspaceId, {}, { ruhendTage: 14 });

    expect(ruhend.items.map((d) => d.name)).toEqual(['Alt']);
    expect(await service.anzahlRuhend(workspaceId, 14)).toBe(1);
    expect((await service.findOne(workspaceId, verloren.id)).lostReason).toBe(
      'Preis zu hoch',
    );

    const anna = await dataSource.getRepository(UserEntity).save(
      dataSource.getRepository(UserEntity).create({
        email: 'notiz@unsere.test',
        passwordHash: 'x',
        firstName: 'N',
        lastName: 'O',
      }),
    );

    await dataSource.query(
      `INSERT INTO "notes" ("workspaceId", "body", "dealId", "authorId") VALUES ($1, 'Anruf', $2, $3)`,
      [workspaceId, alt.id, anna.id],
    );

    expect(await service.anzahlRuhend(workspaceId, 14)).toBe(0);
    expect(
      (await service.letzteAktivitaet(workspaceId, alt.id))?.getTime(),
    ).toBeGreaterThan(Date.now() - 60_000);
    expect(frisch.id).toBeDefined();
  });
});

describe('Summen über die Liste', () => {
  it('zählt alle Treffer des Filters, je Währung getrennt', async () => {
    await addDeal(DealStage.LEAD, 1000);
    await addDeal(DealStage.NEGOTIATION, 2000);
    await addDeal(DealStage.WON, 500);
    await addDeal(DealStage.LEAD, 7000, otherWorkspaceId);
    await service.create(workspaceId, {
      name: 'Dollar',
      amount: 300,
      currency: 'USD',
      stage: DealStage.LEAD,
    });

    expect(
      await service.summen(workspaceId, {}, {}, 'amount', 'currency'),
    ).toEqual([
      { gruppe: 'EUR', summe: 3500 },
      { gruppe: 'USD', summe: 300 },
    ]);

    expect(
      await service.summen(
        workspaceId,
        { limit: 1 },
        { openOnly: true },
        'amount',
        'currency',
      ),
    ).toEqual([
      { gruppe: 'EUR', summe: 3000 },
      { gruppe: 'USD', summe: 300 },
    ]);
  });

  it('ist leer, wenn nichts passt', async () => {
    expect(
      await service.summen(workspaceId, {}, {}, 'amount', 'currency'),
    ).toEqual([]);
  });
});

describe('Pflichtfelder ab einer Phase', () => {
  const felder = () =>
    new CustomFieldsService(dataSource.getRepository(CustomFieldDefinition));

  afterEach(async () => {
    await dataSource.query('TRUNCATE TABLE custom_fields CASCADE');
  });

  it('hält ein Geschäft vor der Phase auf, bis das Feld gefüllt ist', async () => {
    const feld = await felder().create(workspaceId, {
      entity: CustomFieldEntity.DEAL,
      label: 'Ansprechpartner Einkauf',
      type: CustomFieldType.TEXT,
    });
    await felder().update(workspaceId, feld.id, { pflichtAbPhase: 'proposal' });

    const deal = await service.create(workspaceId, { name: 'Pflichttest' });

    await service.update(workspaceId, deal.id, {
      stage: DealStage.QUALIFIED,
    });
    await expect(
      service.update(workspaceId, deal.id, { stage: DealStage.NEGOTIATION }),
    ).rejects.toThrow('Ansprechpartner Einkauf');

    await service.update(workspaceId, deal.id, { stage: DealStage.LOST });

    await service.update(workspaceId, deal.id, {
      customFields: { [feld.key]: 'Frau Kern' },
    });
    const weiter = await service.update(workspaceId, deal.id, {
      stage: DealStage.PROPOSAL,
    });

    expect(weiter.stage).toBe(DealStage.PROPOSAL);
  });

  it('lässt die Regel nur an Geschäften zu', async () => {
    const feld = await felder().create(workspaceId, {
      entity: CustomFieldEntity.COMPANY,
      label: 'Kundennummer Pflicht',
      type: CustomFieldType.TEXT,
    });

    await expect(
      felder().update(workspaceId, feld.id, { pflichtAbPhase: 'proposal' }),
    ).rejects.toThrow('nur für Felder an Geschäften');
  });
});
