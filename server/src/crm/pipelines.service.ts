import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DealEntity } from './entities/deal.entity';
import { PipelineEntity } from './entities/pipeline.entity';
import { pipelineImBereich, standardPipeline } from './pipelines';

const HOECHSTENS = 20;

@Injectable()
export class PipelinesService {
  constructor(
    @InjectRepository(PipelineEntity)
    private readonly pipelines: Repository<PipelineEntity>,
  ) {}

  async liste(workspaceId: string): Promise<PipelineEntity[]> {
    await standardPipeline(this.pipelines.manager, workspaceId);

    return this.pipelines.find({
      where: { workspaceId },
      order: { position: 'ASC', createdAt: 'ASC' },
    });
  }

  async anlegen(workspaceId: string, name: string): Promise<PipelineEntity> {
    const vorhandene = await this.liste(workspaceId);
    const sauber = this.pruefeName(name, vorhandene);

    if (vorhandene.length >= HOECHSTENS) {
      throw new BadRequestException(
        `Mehr als ${String(HOECHSTENS)} Pipelines gibt es nicht.`,
      );
    }

    return this.pipelines.save(
      this.pipelines.create({
        workspaceId,
        name: sauber,
        position:
          Math.max(...vorhandene.map((pipeline) => pipeline.position)) + 1,
      }),
    );
  }

  async umbenennen(
    workspaceId: string,
    id: string,
    name: string,
  ): Promise<PipelineEntity> {
    const pipeline = await pipelineImBereich(
      this.pipelines.manager,
      workspaceId,
      id,
    );

    pipeline.name = this.pruefeName(
      name,
      (await this.liste(workspaceId)).filter((andere) => andere.id !== id),
    );

    return this.pipelines.save(pipeline);
  }

  async loeschen(
    workspaceId: string,
    id: string,
    verschiebenNach?: string | null,
  ): Promise<boolean> {
    const pipeline = await pipelineImBereich(
      this.pipelines.manager,
      workspaceId,
      id,
    );

    if (
      (await standardPipeline(this.pipelines.manager, workspaceId)).id === id
    ) {
      throw new BadRequestException(
        'Die erste Pipeline ist die Standard-Pipeline und bleibt.',
      );
    }

    await this.pipelines.manager.transaction(async (tx) => {
      const anzahl = await tx.count(DealEntity, {
        where: { workspaceId, pipelineId: id },
        withDeleted: true,
      });

      if (anzahl > 0) {
        if (verschiebenNach === undefined || verschiebenNach === null) {
          throw new BadRequestException(
            `In „${pipeline.name}“ liegen noch ${String(anzahl)} Geschäfte. Wählen Sie, wohin sie wandern.`,
          );
        }

        if (verschiebenNach === id) {
          throw new BadRequestException(
            'Die Geschäfte können nicht in die Pipeline wandern, die gelöscht wird.',
          );
        }

        await pipelineImBereich(tx, workspaceId, verschiebenNach);
        await tx.update(
          DealEntity,
          { workspaceId, pipelineId: id },
          { pipelineId: verschiebenNach },
        );
      }

      await tx.delete(PipelineEntity, { id, workspaceId });
    });

    return true;
  }

  private pruefeName(name: string, andere: PipelineEntity[]): string {
    const sauber = name.trim();

    if (sauber === '' || sauber.length > 80) {
      throw new BadRequestException(
        'Eine Pipeline braucht einen Namen mit höchstens 80 Zeichen.',
      );
    }

    if (
      andere.some(
        (pipeline) => pipeline.name.toLowerCase() === sauber.toLowerCase(),
      )
    ) {
      throw new BadRequestException(`Es gibt schon eine Pipeline „${sauber}“.`);
    }

    return sauber;
  }
}
