import { UseGuards } from '@nestjs/common';
import { Field, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource } from 'typeorm';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { LetterheadsService } from '../quotes/letterheads.service';

@ObjectType('ErsteSchritte')
export class ErsteSchritte {
  @Field()
  briefkopf: boolean;

  @Field()
  kontakte: boolean;

  @Field()
  geschaeft: boolean;

  @Field()
  team: boolean;

  @Field()
  angebot: boolean;

  @Field()
  zweiFaktor: boolean;

  @Field()
  postfach: boolean;
}

@Resolver()
@UseGuards(GqlAuthGuard)
export class ErsteSchritteResolver {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly letterheads: LetterheadsService,
  ) {}

  @Query(() => ErsteSchritte)
  async ersteSchritte(
    @CurrentUser() user: RequestUser,
  ): Promise<ErsteSchritte> {
    const [zeile] = (await this.dataSource.query(
      `SELECT
         EXISTS (SELECT 1 FROM "contacts" WHERE "workspaceId" = $1 AND "deletedAt" IS NULL AND "herkunft" IS DISTINCT FROM 'beispiel') AS "kontakte",
         EXISTS (SELECT 1 FROM "deals" WHERE "workspaceId" = $1 AND "deletedAt" IS NULL AND "herkunft" IS DISTINCT FROM 'beispiel') AS "geschaeft",
         (SELECT count(*) FROM "memberships" WHERE "workspaceId" = $1) > 1
           OR EXISTS (SELECT 1 FROM "invitations" WHERE "workspaceId" = $1 AND "acceptedAt" IS NULL AND "expiresAt" > now()) AS "team",
         EXISTS (SELECT 1 FROM "quotes" WHERE "workspaceId" = $1) AS "angebot",
         EXISTS (SELECT 1 FROM "users" WHERE "id" = $2 AND "totpEnabledAt" IS NOT NULL) AS "zweiFaktor",
         EXISTS (SELECT 1 FROM "mailboxes" WHERE "workspaceId" = $1 AND "userId" = $2) AS "postfach"`,
      [user.workspaceId, user.userId],
    )) as Omit<ErsteSchritte, 'briefkopf'>[];

    const luecken = await this.letterheads.gaps(user.workspaceId);

    return { ...zeile, briefkopf: luecken.length === 0 };
  }
}
