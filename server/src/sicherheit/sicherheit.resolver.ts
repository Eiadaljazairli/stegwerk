import { UseGuards } from '@nestjs/common';
import { Field, ID, ObjectType, Query, Resolver } from '@nestjs/graphql';

import { NurMenschWache } from '../api-keys/api-key.guard';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { type EreignisMitNamen, SicherheitService } from './sicherheit.service';

@ObjectType('SicherheitsEreignis')
export class SicherheitsEreignisView {
  @Field(() => ID)
  id: string;

  @Field()
  art: string;

  @Field(() => String, { nullable: true })
  person: string | null;

  @Field(() => String, { nullable: true })
  handelnd: string | null;

  @Field(() => String, { nullable: true })
  geraet: string | null;

  @Field(() => String, { nullable: true })
  ipGekuerzt: string | null;

  @Field(() => String, { nullable: true })
  details: string | null;

  @Field()
  wann: Date;
}

const alsView = (e: EreignisMitNamen): SicherheitsEreignisView => ({
  id: e.id,
  art: e.art,
  person: e.person,
  handelnd: e.actorId !== null && e.actorId !== e.userId ? e.handelnd : null,
  geraet: e.geraet,
  ipGekuerzt: e.ipGekuerzt,
  details: e.details === null ? null : JSON.stringify(e.details),
  wann: e.createdAt,
});

@Resolver()
@UseGuards(GqlAuthGuard, NurMenschWache)
export class SicherheitResolver {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly sicherheit: SicherheitService,
  ) {}

  @Query(() => [SicherheitsEreignisView])
  async meinSicherheitsverlauf(
    @CurrentUser() user: RequestUser,
  ): Promise<SicherheitsEreignisView[]> {
    return (await this.sicherheit.meinVerlauf(user.userId)).map(alsView);
  }

  @Query(() => [SicherheitsEreignisView])
  async sicherheitsprotokoll(
    @CurrentUser() user: RequestUser,
  ): Promise<SicherheitsEreignisView[]> {
    await this.permissions.assert(
      user,
      Permission.AUDIT_VIEW,
      'das Sicherheitsprotokoll zu sehen',
    );

    return (await this.sicherheit.bereich(user.workspaceId)).map(alsView);
  }
}
