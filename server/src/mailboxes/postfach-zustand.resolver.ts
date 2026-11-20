import { UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  ObjectType,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { GqlThrottlerGuard } from '../auth/guards/gql-throttler.guard';
import { fehlerZeigen } from './abruf-fehler';
import { type GemerktePruefung, pruefeAbsenderGemerkt } from './absender-dns';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { MailboxEntity } from './mailbox.entity';
import { MailboxesService } from './mailboxes.service';

@ObjectType('AbsenderPruefung')
export class AbsenderPruefungView implements GemerktePruefung {
  @Field()
  domain: string;

  @Field(() => String)
  spf: GemerktePruefung['spf'];

  @Field(() => String)
  dmarc: GemerktePruefung['dmarc'];

  @Field(() => String)
  ampel: GemerktePruefung['ampel'];

  @Field(() => [String])
  hinweise: string[];

  @Field()
  geprueftAm: Date;
}

@Resolver(() => MailboxEntity)
@UseGuards(GqlAuthGuard)
export class PostfachZustandResolver {
  constructor(
    private readonly mailboxesService: MailboxesService,
    private readonly permissions: PermissionsService,
  ) {}

  @ResolveField(() => Boolean)
  getrennt(@Parent() mailbox: MailboxEntity): boolean {
    return mailbox.getrenntAm !== null && mailbox.getrenntAm !== undefined;
  }

  @ResolveField(() => Boolean)
  async darfVerwalten(
    @Parent() mailbox: MailboxEntity,
    @CurrentUser() user: RequestUser,
  ): Promise<boolean> {
    if (mailbox.art !== 'gemeinsam') {
      return mailbox.userId === user.userId;
    }

    return this.permissions.can(user, Permission.MAILBOX_SHARED_MANAGE);
  }

  @ResolveField(() => [ID])
  async mitglieder(
    @Parent() mailbox: MailboxEntity,
    @CurrentUser() user: RequestUser,
  ): Promise<string[]> {
    if (mailbox.art !== 'gemeinsam') {
      return [];
    }

    const mitglieder = await this.mailboxesService.mitglieder(mailbox.id);

    return mitglieder.includes(user.userId) ||
      (await this.permissions.can(user, Permission.MAILBOX_SHARED_MANAGE))
      ? mitglieder
      : [];
  }

  @ResolveField(() => Boolean)
  fehlerZeigen(@Parent() mailbox: MailboxEntity): boolean {
    return fehlerZeigen({ ...mailbox, fehler: mailbox.lastError });
  }

  @ResolveField(() => Boolean)
  istGmail(@Parent() mailbox: MailboxEntity): boolean {
    return (
      mailbox.oauthAnbieter === 'google' ||
      /(^|\.)(gmail|googlemail)\.com$/iu.test(mailbox.host)
    );
  }

  @Query(() => AbsenderPruefungView, { nullable: true })
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async absenderPruefung(
    @CurrentUser() user: RequestUser,
    @Args('frisch', { type: () => Boolean, nullable: true })
    frisch?: boolean | null,
  ): Promise<AbsenderPruefungView | null> {
    const postfach = await this.mailboxesService.verbunden(
      user.workspaceId,
      user.userId,
    );

    if (postfach === null) {
      return null;
    }

    return pruefeAbsenderGemerkt(
      postfach.username,
      postfach.smtpHost,
      Date.now(),
      undefined,
      frisch === true,
    );
  }
}
