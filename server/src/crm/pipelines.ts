import { NotFoundException } from '@nestjs/common';
import { type EntityManager, IsNull } from 'typeorm';

import { DealStageSettingEntity } from './entities/deal-stage-setting.entity';
import { PipelineEntity } from './entities/pipeline.entity';
import { type Phase, phasenAus } from './phasen';

export const standardPipeline = async (
  manager: EntityManager,
  workspaceId: string,
): Promise<PipelineEntity> => {
  const vorhanden = await manager.findOne(PipelineEntity, {
    where: { workspaceId },
    order: { position: 'ASC', createdAt: 'ASC' },
  });

  if (vorhanden !== null) {
    return vorhanden;
  }

  return manager.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `pipeline:${workspaceId}`,
    ]);

    const nochmal = await tx.findOne(PipelineEntity, {
      where: { workspaceId },
      order: { position: 'ASC', createdAt: 'ASC' },
    });

    return (
      nochmal ??
      tx.save(
        tx.create(PipelineEntity, {
          workspaceId,
          name: 'Vertrieb',
          position: 0,
        }),
      )
    );
  });
};

export const pipelineImBereich = async (
  manager: EntityManager,
  workspaceId: string,
  pipelineId: string,
): Promise<PipelineEntity> => {
  const pipeline = await manager.findOne(PipelineEntity, {
    where: { id: pipelineId, workspaceId },
  });

  if (pipeline === null) {
    throw new NotFoundException('Diese Pipeline gibt es nicht.');
  }

  return pipeline;
};

export const istStandard = async (
  manager: EntityManager,
  workspaceId: string,
  pipelineId: string | null | undefined,
): Promise<boolean> =>
  pipelineId === null ||
  pipelineId === undefined ||
  (await standardPipeline(manager, workspaceId)).id === pipelineId;

export const phasenFuer = async (
  manager: EntityManager,
  workspaceId: string,
  pipelineId: string | null | undefined,
): Promise<Phase[]> => {
  const bereich = await manager.find(DealStageSettingEntity, {
    where: { workspaceId, pipelineId: IsNull() },
  });

  if (await istStandard(manager, workspaceId, pipelineId)) {
    return phasenAus(bereich);
  }

  return phasenAus(
    bereich,
    await manager.find(DealStageSettingEntity, {
      where: { workspaceId, pipelineId: pipelineId as string },
    }),
  );
};

export const pipelineBedingung = (alias: string, param: string): string =>
  `(${alias}."pipelineId" = ${param} OR (${alias}."pipelineId" IS NULL AND ${param} = (
     SELECT p."id" FROM "pipelines" p
      WHERE p."workspaceId" = ${alias}."workspaceId"
      ORDER BY p."position", p."createdAt" LIMIT 1)))`;
