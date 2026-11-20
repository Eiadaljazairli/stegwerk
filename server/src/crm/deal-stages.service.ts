import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';

import { berlinDate } from '../calendar/berlin-time';
import { OPTION_FARBEN } from '../custom-fields/custom-field.types';
import {
  DealEntity,
  DealStage,
  OPEN_DEAL_STAGES,
} from './entities/deal.entity';
import { DealStageSettingEntity } from './entities/deal-stage-setting.entity';
import {
  NIE_AUSGEBLENDET,
  type Phase,
  type Prognose,
  prognose,
  STANDARD_PHASEN,
} from './phasen';
import { istStandard, phasenFuer, pipelineImBereich } from './pipelines';

type PhaseMitStandard = Phase & { defaultLabel: string };

@Injectable()
export class DealStagesService {
  constructor(
    @InjectRepository(DealStageSettingEntity)
    private readonly settings: Repository<DealStageSettingEntity>,
    @InjectRepository(DealEntity)
    private readonly deals: Repository<DealEntity>,
  ) {}

  async list(
    workspaceId: string,
    pipelineId?: string | null,
  ): Promise<PhaseMitStandard[]> {
    if (pipelineId !== undefined && pipelineId !== null) {
      await pipelineImBereich(this.settings.manager, workspaceId, pipelineId);
    }

    return (
      await phasenFuer(this.settings.manager, workspaceId, pipelineId)
    ).map((phase) => ({
      ...phase,
      defaultLabel: STANDARD_PHASEN[phase.stage].label,
    }));
  }

  async update(
    workspaceId: string,
    input: {
      stage: DealStage;
      label?: string | null;
      probability?: number | null;
      farbe?: string | null;
      ausgeblendet?: boolean | null;
    }[],
    pipelineId?: string | null,
  ): Promise<PhaseMitStandard[]> {
    if (pipelineId !== undefined && pipelineId !== null) {
      await pipelineImBereich(this.settings.manager, workspaceId, pipelineId);
    }

    const ziel = (await istStandard(
      this.settings.manager,
      workspaceId,
      pipelineId,
    ))
      ? null
      : (pipelineId as string);

    for (const zeile of input) {
      if (!Object.values(DealStage).includes(zeile.stage)) {
        throw new BadRequestException('Diese Phase gibt es nicht.');
      }

      const prozent = zeile.probability ?? null;

      if (
        prozent !== null &&
        (!Number.isInteger(prozent) || prozent < 0 || prozent > 100)
      ) {
        throw new BadRequestException(
          'Die Wahrscheinlichkeit liegt zwischen 0 und 100 %.',
        );
      }

      const label = (zeile.label ?? '').trim();

      if (label.length > 40) {
        throw new BadRequestException(
          'Ein Phasenname hat höchstens 40 Zeichen.',
        );
      }

      const farbe = (zeile.farbe ?? '').trim();

      if (
        farbe !== '' &&
        !(OPTION_FARBEN as readonly string[]).includes(farbe)
      ) {
        throw new BadRequestException('Diese Farbe gibt es nicht.');
      }

      if (
        zeile.ausgeblendet === true &&
        NIE_AUSGEBLENDET.includes(zeile.stage)
      ) {
        throw new BadRequestException(
          'Gewonnen und Verloren lassen sich nicht ausblenden.',
        );
      }

      const vorhanden = await this.settings.findOne({
        where: {
          workspaceId,
          stage: zeile.stage,
          pipelineId: ziel === null ? IsNull() : ziel,
        },
      });

      await this.settings.save({
        ...(vorhanden === null ? {} : { id: vorhanden.id }),
        workspaceId,
        pipelineId: ziel,
        stage: zeile.stage,
        label: label === '' ? null : label,
        probability: prozent,
        farbe: farbe === '' ? null : farbe,
        ausgeblendet: zeile.ausgeblendet ?? null,
      });
    }

    return this.list(workspaceId, pipelineId);
  }

  async forecast(workspaceId: string, months: number): Promise<Prognose> {
    const offen = await this.deals.find({
      where: { workspaceId, stage: In([...OPEN_DEAL_STAGES]) },
      select: {
        stage: true,
        amount: true,
        probability: true,
        closeDate: true,
        pipelineId: true,
      },
    });

    const jePipeline = new Map<string | null, Phase[]>();

    for (const deal of offen) {
      if (deal.probability !== null || jePipeline.has(deal.pipelineId)) {
        continue;
      }

      jePipeline.set(
        deal.pipelineId,
        await phasenFuer(this.settings.manager, workspaceId, deal.pipelineId),
      );
    }

    const mitWahrscheinlichkeit = offen.map((deal) => ({
      ...deal,
      probability:
        deal.probability ??
        jePipeline
          .get(deal.pipelineId)
          ?.find((phase) => phase.stage === deal.stage)?.probability ??
        null,
    }));

    return prognose(
      mitWahrscheinlichkeit,
      await this.list(workspaceId),
      berlinDate(new Date()),
      Math.min(Math.max(months, 1), 12),
    );
  }
}
