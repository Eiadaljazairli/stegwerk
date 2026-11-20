import { UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  Int,
  Mutation,
  ObjectType,
  Resolver,
} from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { WorkspaceRolesService } from '../workspaces/workspace-roles.service';
import { RetentionService } from './retention.service';

@ObjectType()
export class RetentionPreviewEntry {
  @Field()
  workspaceName: string;

  @Field(() => Int)
  daysLeft: number;

  @Field()
  deleteOn: Date;
}

@ObjectType()
export class RetentionPreview {
  @Field()
  enabled: boolean;

  @Field(() => Int)
  retentionDays: number;

  @Field(() => Int)
  wouldWarn: number;

  @Field(() => Int)
  wouldDelete: number;

  @Field(() => [RetentionPreviewEntry])
  entries: RetentionPreviewEntry[];
}

@Resolver()
@UseGuards(GqlAuthGuard)
export class RetentionResolver {
  constructor(
    private readonly retentionService: RetentionService,
    private readonly rolesService: WorkspaceRolesService,
  ) {}

  @Mutation(() => RetentionPreview)
  async previewRetention(
    @CurrentUser() user: RequestUser,
    @Args('workspaceOnly', { nullable: true, defaultValue: true })
    _workspaceOnly: boolean,
  ): Promise<RetentionPreview> {
    await this.rolesService.assertCanAdminister(
      user,
      'zu sehen, was die Aufbewahrungsfrist löschen würde',
    );

    const jetzt = new Date();
    const entries = (await this.retentionService.candidates(jetzt)).filter(
      (candidate) => candidate.workspaceId === user.workspaceId,
    );
    let wouldWarn = 0;

    for (const candidate of entries) {
      if (
        candidate.daysLeft > 0 &&
        (await this.retentionService.shouldWarn(candidate, jetzt))
      ) {
        wouldWarn += 1;
      }
    }

    return {
      enabled: this.retentionService.enabled,
      retentionDays: this.retentionService.retentionDays,
      wouldWarn,
      wouldDelete: entries.filter((candidate) => candidate.daysLeft <= 0)
        .length,
      entries: entries.map(({ workspaceName, daysLeft, deleteOn }) => ({
        workspaceName,
        daysLeft,
        deleteOn,
      })),
    };
  }
}
