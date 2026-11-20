import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

import { DealStage } from '../entities/deal.entity';

@ObjectType()
export class PipelineStageSummary {
  @Field(() => DealStage)
  stage: DealStage;

  @Field(() => Int)
  dealCount: number;

  @Field(() => Float)
  totalAmount: number;
}

@ObjectType()
export class WorkspaceSummary {
  @Field(() => Int, { nullable: true })
  companyCount: number | null;

  @Field(() => Int, { nullable: true })
  contactCount: number | null;

  @Field(() => Int, { nullable: true })
  openDealCount: number | null;

  @Field(() => Float, { nullable: true })
  openPipelineValue: number | null;

  @Field(() => Int, { nullable: true })
  openTaskCount: number | null;

  @Field(() => Int, { nullable: true })
  overdueTaskCount: number | null;

  @Field()
  betraegeVerborgen: boolean;
}
