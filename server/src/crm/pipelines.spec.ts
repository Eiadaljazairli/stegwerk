import { BadRequestException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import { CustomFieldFilterOperator as Op } from '../custom-fields/custom-field.types';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { ImportEntity } from '../import/dto/import.dto';
import { ImportService } from '../import/import.service';
import { Pipelines1792303600000 } from '../database/migrations/1792303600000-Pipelines';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { AuswertungService } from './auswertung.service';
import { DealStagesService } from './deal-stages.service';
import { DealsService } from './deals.service';
import { DealStageSettingEntity } from './entities/deal-stage-setting.entity';
import { DealEntity, DealStage } from './entities/deal.entity';
import { PipelineEntity } from './entities/pipeline.entity';
import { PipelinesService } from './pipelines.service';

const SUITE = 'd3_pipelines';

jest.setTimeout(60_000);

let dataSource: DataSource;
let deals: DealsService;
let phasen: DealStagesService;
let pipelines: PipelinesService;
let auswertung: AuswertungService;
let workspaceId: string;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  deals = new DealsService(
    dataSource.getRepository(DealEntity),
    new CustomFieldsService(dataSource.getRepository(CustomFieldDefinition)),
  );
  phasen = new DealStagesService(
    dataSource.getRepository(DealStageSettingEntity),
    dataSource.getRepository(DealEntity),
  );
  pipelines = new PipelinesService(dataSource.getRepository(PipelineEntity));
  auswertung = new AuswertungService(
    dataSource.getRepository(DealEntity),
    dataSource.getRepository(UserEntity),
  );
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query('TRUNCATE TABLE workspaces CASCADE');

  workspaceId = (
    await dataSource
      .getRepository(WorkspaceEntity)
      .save({ name: 'Unser Vertrieb', slug: 'unser-vertrieb' })
  ).id;
});

const namen = (seite: { items: DealEntity[] }) =>
  seite.items.map((deal) => deal.name).sort();

describe('die Umstellung', () => {
  it('gibt jedem Bereich eine Standard-Pipeline und ordnet alle Geschäfte zu', async () => {
    const migration = new Pipelines1792303600000();
    const runner = dataSource.createQueryRunner();

    try {
      await migration.down(runner);

      await runner.query(
        `INSERT INTO deals ("workspaceId", name) VALUES ($1, 'Alt'), ($1, 'Gelöscht')`,
        [workspaceId],
      );
      await runner.query(
        `UPDATE deals SET "deletedAt" = now() WHERE name = 'Gelöscht'`,
      );
      await runner.query(
        `INSERT INTO deal_stage_settings ("workspaceId", stage, label) VALUES ($1, 'lead', 'Anfrage')`,
        [workspaceId],
      );

      await migration.up(runner);
    } finally {
      await runner.release();
    }

    const [pipeline] = await dataSource.query(
      `SELECT id, name FROM pipelines WHERE "workspaceId" = $1`,
      [workspaceId],
    );
    const zugeordnet = await dataSource.query(
      `SELECT name, "pipelineId" FROM deals WHERE "workspaceId" = $1 ORDER BY name`,
      [workspaceId],
    );

    expect(pipeline.name).toBe('Vertrieb');
    expect(zugeordnet).toEqual([
      { name: 'Alt', pipelineId: pipeline.id },
      { name: 'Gelöscht', pipelineId: pipeline.id },
    ]);
    expect(
      (await phasen.list(workspaceId, pipeline.id)).find(
        (p) => p.stage === DealStage.LEAD,
      )?.label,
    ).toBe('Anfrage');
  });
});

describe('Geschäfte je Pipeline', () => {
  it('legt neue in die Standard-Pipeline und filtert nach Pipeline', async () => {
    const [standard] = await pipelines.liste(workspaceId);
    const wartung = await pipelines.anlegen(workspaceId, 'Wartungsverträge');

    const neu = await deals.create(workspaceId, { name: 'Neukunde' });
    await deals.create(workspaceId, {
      name: 'Wartung A',
      pipelineId: wartung.id,
    });
    await dataSource.query(
      `INSERT INTO deals ("workspaceId", name) VALUES ($1, 'Ohne')`,
      [workspaceId],
    );

    expect(neu.pipelineId).toBe(standard.id);
    expect(
      namen(await deals.list(workspaceId, {}, { pipelineId: standard.id })),
    ).toEqual(['Neukunde', 'Ohne']);
    expect(
      namen(await deals.list(workspaceId, {}, { pipelineId: wartung.id })),
    ).toEqual(['Wartung A']);
  });

  it('nimmt keine Pipeline aus einem fremden Bereich', async () => {
    const fremd = await dataSource
      .getRepository(WorkspaceEntity)
      .save({ name: 'Fremd', slug: 'fremd' });
    const fremde = await pipelines.anlegen(fremd.id, 'Fremde');

    await expect(
      deals.create(workspaceId, { name: 'X', pipelineId: fremde.id }),
    ).rejects.toThrow('Diese Pipeline gibt es nicht.');
  });

  it('findet Geschäfte einer Pipeline auch über die Bedingung einer Regel', async () => {
    const [standard] = await pipelines.liste(workspaceId);
    const wartung = await pipelines.anlegen(workspaceId, 'Wartung');

    await deals.create(workspaceId, { name: 'S' });
    await deals.create(workspaceId, { name: 'W', pipelineId: wartung.id });

    const ist = await deals.list(workspaceId, {
      customFilters: [
        { key: 'std:pipelineId', operator: Op.EQUALS, value: standard.id },
      ],
    });
    const istNicht = await deals.list(workspaceId, {
      customFilters: [
        { key: 'std:pipelineId', operator: Op.NOT_EQUALS, value: standard.id },
      ],
    });

    expect(namen(ist)).toEqual(['S']);
    expect(namen(istNicht)).toEqual(['W']);
    await expect(
      deals.list(workspaceId, {
        customFilters: [
          { key: 'std:pipelineId', operator: Op.CONTAINS, value: 'x' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Phasen je Pipeline', () => {
  it('trägt Name und Farbe je Pipeline, mit dem Bereich als Rückfall', async () => {
    const [standard] = await pipelines.liste(workspaceId);
    const wartung = await pipelines.anlegen(workspaceId, 'Wartung');

    await phasen.update(
      workspaceId,
      [
        {
          stage: DealStage.PROPOSAL,
          label: 'Kostenvoranschlag',
          farbe: 'blau',
        },
      ],
      standard.id,
    );
    await phasen.update(
      workspaceId,
      [
        {
          stage: DealStage.PROPOSAL,
          label: null,
          farbe: 'gruen',
          probability: 80,
        },
      ],
      wartung.id,
    );

    const imStandard = (await phasen.list(workspaceId, standard.id)).find(
      (p) => p.stage === DealStage.PROPOSAL,
    );
    const inWartung = (await phasen.list(workspaceId, wartung.id)).find(
      (p) => p.stage === DealStage.PROPOSAL,
    );

    expect(imStandard).toMatchObject({
      label: 'Kostenvoranschlag',
      farbe: 'blau',
      probability: 50,
    });
    expect(inWartung).toMatchObject({
      label: 'Kostenvoranschlag',
      farbe: 'gruen',
      probability: 80,
    });
  });

  it('lässt eine ausgeblendete Phase nicht wählen, Gewonnen nie ausblenden', async () => {
    const wartung = await pipelines.anlegen(workspaceId, 'Wartung');

    await phasen.update(
      workspaceId,
      [{ stage: DealStage.PROPOSAL, ausgeblendet: true }],
      wartung.id,
    );

    const w = await deals.create(workspaceId, {
      name: 'W',
      pipelineId: wartung.id,
    });
    const s = await deals.create(workspaceId, { name: 'S' });

    await expect(
      deals.update(workspaceId, w.id, { stage: DealStage.PROPOSAL }),
    ).rejects.toThrow('ausgeblendet');
    expect(
      (await deals.update(workspaceId, s.id, { stage: DealStage.PROPOSAL }))
        .stage,
    ).toBe(DealStage.PROPOSAL);
    await expect(
      deals.update(workspaceId, s.id, { pipelineId: wartung.id }),
    ).rejects.toThrow('ausgeblendet');

    await expect(
      phasen.update(
        workspaceId,
        [{ stage: DealStage.WON, ausgeblendet: true }],
        wartung.id,
      ),
    ).rejects.toThrow('nicht ausblenden');
  });

  it('beginnt ein neues Geschäft in der ersten sichtbaren Phase', async () => {
    const wartung = await pipelines.anlegen(workspaceId, 'Wartung');

    await phasen.update(
      workspaceId,
      [{ stage: DealStage.LEAD, ausgeblendet: true }],
      wartung.id,
    );

    const neu = await deals.create(workspaceId, {
      name: 'W',
      pipelineId: wartung.id,
    });

    expect(neu.stage).toBe(DealStage.QUALIFIED);
  });

  it('nimmt per Import keine ausgeblendete Phase an', async () => {
    const wartung = await pipelines.anlegen(workspaceId, 'Wartung');

    await phasen.update(
      workspaceId,
      [
        { stage: DealStage.LEAD, ausgeblendet: true },
        { stage: DealStage.PROPOSAL, ausgeblendet: true },
      ],
      wartung.id,
    );

    const importe = new ImportService(
      dataSource,
      new CustomFieldsService(dataSource.getRepository(CustomFieldDefinition)),
    );
    const bericht = await importe.run(workspaceId, {
      entity: ImportEntity.DEAL,
      csv: 'Name;Phase;Pipeline\nVersteckt;proposal;Wartung\nOhne Phase;;Wartung\nStandard;proposal;\n',
      mapping: [
        { column: 'Name', field: 'name' },
        { column: 'Phase', field: 'stage' },
        { column: 'Pipeline', field: 'pipelineName' },
      ],
      dryRun: false,
    });

    expect(bericht.created).toBe(2);
    expect(bericht.rejections[0].reason).toContain('ausgeblendet');

    const ohne = await dataSource
      .getRepository(DealEntity)
      .findOneByOrFail({ workspaceId, name: 'Ohne Phase' });

    expect(ohne.stage).toBe(DealStage.QUALIFIED);
  });
});

describe('Auswertung je Pipeline', () => {
  it('zählt nur die gewählte Pipeline, ohne Wahl alle', async () => {
    const [standard] = await pipelines.liste(workspaceId);
    const wartung = await pipelines.anlegen(workspaceId, 'Wartung');

    await deals.create(workspaceId, {
      name: 'S',
      stage: DealStage.WON,
      amount: 1000,
      closeDate: '2026-05-10',
    });
    await deals.create(workspaceId, {
      name: 'W',
      stage: DealStage.WON,
      amount: 300,
      closeDate: '2026-05-12',
      pipelineId: wartung.id,
    });

    const alle = await auswertung.berechne(
      workspaceId,
      '2026-05-01',
      '2026-05-31',
      null,
    );
    const nurWartung = await auswertung.berechne(
      workspaceId,
      '2026-05-01',
      '2026-05-31',
      null,
      wartung.id,
    );
    const nurStandard = await auswertung.berechne(
      workspaceId,
      '2026-05-01',
      '2026-05-31',
      null,
      standard.id,
    );

    expect(alle.gewonnenSumme).toBe(1300);
    expect(nurWartung.gewonnenSumme).toBe(300);
    expect(nurStandard.gewonnenSumme).toBe(1000);
  });
});

describe('Pipelines verwalten', () => {
  it('löscht nur leer oder mit Ziel, die Standard-Pipeline nie', async () => {
    const [standard] = await pipelines.liste(workspaceId);
    const wartung = await pipelines.anlegen(workspaceId, 'Wartung');
    const deal = await deals.create(workspaceId, {
      name: 'W',
      pipelineId: wartung.id,
    });

    await expect(pipelines.loeschen(workspaceId, standard.id)).rejects.toThrow(
      'Standard-Pipeline',
    );
    await expect(pipelines.loeschen(workspaceId, wartung.id)).rejects.toThrow(
      'Geschäfte',
    );

    await pipelines.loeschen(workspaceId, wartung.id, standard.id);

    expect((await deals.findOne(workspaceId, deal.id)).pipelineId).toBe(
      standard.id,
    );
    expect((await pipelines.liste(workspaceId)).map((p) => p.name)).toEqual([
      'Vertrieb',
    ]);
  });

  it('verweigert doppelte Namen', async () => {
    await pipelines.anlegen(workspaceId, 'Wartung');

    await expect(pipelines.anlegen(workspaceId, 'wartung')).rejects.toThrow(
      'schon',
    );
  });
});
