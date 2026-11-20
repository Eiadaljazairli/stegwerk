import { UseGuards } from '@nestjs/common';
import {
  Args,
  ID,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { sichtbarkeitsBedingung } from '../workspaces/sichtbarkeit';
import { DealStageSetting } from './deal-stages.resolver';
import { DealStagesService } from './deal-stages.service';
import { DealEntity } from './entities/deal.entity';
import { PipelineEntity } from './entities/pipeline.entity';
import { PipelinesService } from './pipelines.service';

@Resolver(() => PipelineEntity)
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class PipelinesResolver {
  constructor(
    private readonly dienst: PipelinesService,
    private readonly stages: DealStagesService,
    private readonly permissions: PermissionsService,
    @InjectRepository(DealEntity)
    private readonly deals: Repository<DealEntity>,
  ) {}

  @Query(() => [PipelineEntity])
  async pipelines(@CurrentUser() user: RequestUser): Promise<PipelineEntity[]> {
    await this.permissions.assert(
      user,
      Permission.DEAL_VIEW,
      'Geschäfte zu sehen',
    );

    return this.dienst.liste(user.workspaceId);
  }

  @ResolveField(() => [DealStageSetting])
  phasen(@Parent() pipeline: PipelineEntity): Promise<DealStageSetting[]> {
    return this.stages.list(pipeline.workspaceId, pipeline.id);
  }

  @ResolveField(() => Int)
  async anzahlGeschaefte(@Parent() pipeline: PipelineEntity): Promise<number> {
    const standard = (await this.dienst.liste(pipeline.workspaceId))[0];
    const abfrage = this.deals
      .createQueryBuilder('deal')
      .where('deal.workspaceId = :workspaceId', {
        workspaceId: pipeline.workspaceId,
      })
      .andWhere(
        standard?.id === pipeline.id
          ? '(deal.pipelineId = :id OR deal.pipelineId IS NULL)'
          : 'deal.pipelineId = :id',
        { id: pipeline.id },
      );
    const sichtbar = await sichtbarkeitsBedingung('deal', 'deal');

    if (sichtbar !== null) {
      abfrage.andWhere(sichtbar.where, sichtbar.parameters);
    }

    return abfrage.getCount();
  }

  @Mutation(() => PipelineEntity)
  async createPipeline(
    @CurrentUser() user: RequestUser,
    @Args('name') name: string,
  ): Promise<PipelineEntity> {
    await this.permissions.assert(
      user,
      Permission.FIELD_MANAGE,
      'Pipelines zu verwalten',
    );

    return this.dienst.anlegen(user.workspaceId, name);
  }

  @Mutation(() => PipelineEntity)
  async renamePipeline(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('name') name: string,
  ): Promise<PipelineEntity> {
    await this.permissions.assert(
      user,
      Permission.FIELD_MANAGE,
      'Pipelines zu verwalten',
    );

    return this.dienst.umbenennen(user.workspaceId, id, name);
  }

  @Mutation(() => Boolean)
  async deletePipeline(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('verschiebenNach', { type: () => ID, nullable: true })
    verschiebenNach?: string,
  ): Promise<boolean> {
    await this.permissions.assert(
      user,
      Permission.FIELD_MANAGE,
      'Pipelines zu verwalten',
    );

    return this.dienst.loeschen(user.workspaceId, id, verschiebenNach);
  }
}
