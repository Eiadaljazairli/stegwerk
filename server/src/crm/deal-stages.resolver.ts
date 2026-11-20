import { UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  Float,
  ID,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { istVerborgen } from '../workspaces/feldrechte';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { OPTION_FARBEN } from '../custom-fields/custom-field.types';
import { DealStagesService } from './deal-stages.service';
import { DealStage } from './entities/deal.entity';

@ObjectType()
export class DealStageSetting {
  @Field(() => DealStage)
  stage: DealStage;

  @Field()
  label: string;

  @Field()
  defaultLabel: string;

  @Field(() => Int)
  probability: number;

  @Field(() => String, { nullable: true })
  farbe: string | null;

  @Field()
  ausgeblendet: boolean;
}

@InputType()
export class DealStageSettingInput {
  @Field(() => DealStage)
  @IsEnum(DealStage)
  stage: DealStage;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(40, { message: 'Ein Phasenname hat höchstens 40 Zeichen.' })
  label?: string | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0, { message: 'Die Wahrscheinlichkeit liegt zwischen 0 und 100 %.' })
  @Max(100, { message: 'Die Wahrscheinlichkeit liegt zwischen 0 und 100 %.' })
  probability?: number | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn([...OPTION_FARBEN, ''])
  farbe?: string | null;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  ausgeblendet?: boolean | null;
}

@ObjectType()
export class ForecastMonth {
  @Field()
  month: string;

  @Field(() => Int)
  dealCount: number;

  @Field(() => Float)
  totalAmount: number;

  @Field(() => Float)
  weightedAmount: number;
}

@ObjectType()
export class DealForecast {
  @Field(() => Float)
  openAmount: number;

  @Field(() => Float)
  weightedAmount: number;

  @Field(() => [ForecastMonth])
  months: ForecastMonth[];

  @Field()
  betraegeVerborgen: boolean;
}

@Resolver()
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class DealStagesResolver {
  constructor(
    private readonly stages: DealStagesService,
    private readonly permissions: PermissionsService,
  ) {}

  @Query(() => [DealStageSetting])
  async dealStages(
    @CurrentUser() user: RequestUser,
    @Args('pipelineId', { type: () => ID, nullable: true })
    pipelineId?: string,
  ): Promise<DealStageSetting[]> {
    await this.permissions.assert(
      user,
      Permission.DEAL_VIEW,
      'Geschäfte zu sehen',
    );

    return this.stages.list(user.workspaceId, pipelineId);
  }

  @Mutation(() => [DealStageSetting])
  async updateDealStages(
    @CurrentUser() user: RequestUser,
    @Args('input', { type: () => [DealStageSettingInput] })
    input: DealStageSettingInput[],
    @Args('pipelineId', { type: () => ID, nullable: true })
    pipelineId?: string,
  ): Promise<DealStageSetting[]> {
    await this.permissions.assert(
      user,
      Permission.FIELD_MANAGE,
      'die Phasen anzupassen',
    );

    return this.stages.update(user.workspaceId, input, pipelineId);
  }

  @Query(() => DealForecast)
  async dealForecast(
    @CurrentUser() user: RequestUser,
    @Args('months', { type: () => Int, nullable: true }) months?: number,
  ): Promise<DealForecast> {
    await this.permissions.assert(
      user,
      Permission.DEAL_VIEW,
      'Geschäfte zu sehen',
    );

    const prognose = await this.stages.forecast(user.workspaceId, months ?? 6);

    if (!(await istVerborgen('deal.amount'))) {
      return { ...prognose, betraegeVerborgen: false };
    }

    return {
      openAmount: 0,
      weightedAmount: 0,
      months: prognose.months.map((monat) => ({
        ...monat,
        totalAmount: 0,
        weightedAmount: 0,
      })),
      betraegeVerborgen: true,
    };
  }
}
