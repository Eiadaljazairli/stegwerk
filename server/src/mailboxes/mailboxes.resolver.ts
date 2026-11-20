import { BadRequestException, UseGuards } from '@nestjs/common';
import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { Throttle } from '@nestjs/throttler';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { NurMenschWache } from '../api-keys/api-key.guard';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { GqlThrottlerGuard } from '../auth/guards/gql-throttler.guard';
import { rechteFuerZiel } from '../attachments/attachment-rechte';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import {
  AddMailSperreInput,
  ConnectMailboxInput,
  KontaktVorschlag,
  MailboxSyncResult,
  MailInhaltView,
  PostfachEinstellungenInput,
  PostfachGespraechView,
  SendMailInput,
} from './dto/mailbox.dto';
import { MailMessageEntity } from './mail-message.entity';
import { MailSperreEntity } from './mail-sperre.entity';
import {
  MAIL_SICHTBARKEITEN,
  type MailSichtbarkeit,
  MailboxEntity,
} from './mailbox.entity';
import {
  MailboxesService,
  POSTFACH_FILTER,
  type PostfachFilter,
} from './mailboxes.service';

const POST_SEHEN = [
  Permission.CONTACT_VIEW,
  Permission.COMPANY_VIEW,
  Permission.DEAL_VIEW,
] as const;

@Resolver(() => MailboxEntity)
@UseGuards(GqlAuthGuard)
export class MailboxesResolver {
  constructor(
    private readonly mailboxesService: MailboxesService,
    private readonly permissions: PermissionsService,
  ) {}

  private darfGemeinsame(user: RequestUser): Promise<boolean> {
    return this.permissions.can(user, Permission.MAILBOX_SHARED_MANAGE);
  }

  @Query(() => MailboxEntity, { nullable: true })
  @UseGuards(NurMenschWache)
  myMailbox(@CurrentUser() user: RequestUser): Promise<MailboxEntity | null> {
    return this.mailboxesService.verbunden(user.workspaceId, user.userId);
  }

  @Query(() => [MailboxEntity])
  @UseGuards(NurMenschWache)
  async postfaecher(
    @CurrentUser() user: RequestUser,
  ): Promise<MailboxEntity[]> {
    return this.mailboxesService.postfaecher(
      user.workspaceId,
      user.userId,
      await this.darfGemeinsame(user),
    );
  }

  @Mutation(() => MailboxEntity)
  @UseGuards(NurMenschWache)
  async setMailSichtbarkeit(
    @CurrentUser() user: RequestUser,
    @Args('sichtbarkeit') sichtbarkeit: string,
    @Args('mailboxId', { type: () => ID, nullable: true })
    mailboxId?: string | null,
  ): Promise<MailboxEntity> {
    if (!(MAIL_SICHTBARKEITEN as readonly string[]).includes(sichtbarkeit)) {
      throw new BadRequestException(
        'Die Sichtbarkeit ist alles, kopf oder privat.',
      );
    }

    return this.mailboxesService.sichtbarkeitSetzen(
      user.workspaceId,
      user.userId,
      sichtbarkeit as MailSichtbarkeit,
      mailboxId ?? null,
      await this.darfGemeinsame(user),
    );
  }

  @Mutation(() => MailboxEntity)
  @UseGuards(NurMenschWache, BillingWriteGuard)
  async setPostfachMitglieder(
    @CurrentUser() user: RequestUser,
    @Args('mailboxId', { type: () => ID }) mailboxId: string,
    @Args('userIds', { type: () => [ID] }) userIds: string[],
  ): Promise<MailboxEntity> {
    await this.permissions.assert(
      user,
      Permission.MAILBOX_SHARED_MANAGE,
      'gemeinsame Postfächer zu verwalten',
    );

    return this.mailboxesService.mitgliederSetzen(
      user.workspaceId,
      user.userId,
      mailboxId,
      userIds,
      true,
    );
  }

  @Mutation(() => MailboxEntity)
  @UseGuards(NurMenschWache, BillingWriteGuard)
  setHauptpostfach(
    @CurrentUser() user: RequestUser,
    @Args('mailboxId', { type: () => ID }) mailboxId: string,
  ): Promise<MailboxEntity> {
    return this.mailboxesService.hauptSetzen(
      user.workspaceId,
      user.userId,
      mailboxId,
    );
  }

  @Query(() => [PostfachGespraechView])
  @UseGuards(NurMenschWache)
  postfachGespraeche(
    @CurrentUser() user: RequestUser,
    @Args('mailboxId', { type: () => ID }) mailboxId: string,
    @Args('filter', { type: () => String, nullable: true })
    filter?: string | null,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number | null,
  ): Promise<PostfachGespraechView[]> {
    const gewaehlt = filter ?? 'offen';

    if (!(POSTFACH_FILTER as readonly string[]).includes(gewaehlt)) {
      throw new BadRequestException(
        'Der Filter ist offen, mir, erledigt oder alle.',
      );
    }

    return this.mailboxesService.gespraeche(
      user.workspaceId,
      user.userId,
      mailboxId,
      gewaehlt as PostfachFilter,
      limit ?? 50,
    );
  }

  @Query(() => [MailMessageEntity])
  @UseGuards(NurMenschWache)
  postfachGespraech(
    @CurrentUser() user: RequestUser,
    @Args('mailboxId', { type: () => ID }) mailboxId: string,
    @Args('threadKey') threadKey: string,
  ): Promise<MailMessageEntity[]> {
    return this.mailboxesService.gespraechNachrichten(
      user.workspaceId,
      user.userId,
      mailboxId,
      threadKey.slice(0, 500),
    );
  }

  @Mutation(() => Boolean)
  @UseGuards(NurMenschWache, BillingWriteGuard)
  postfachZuweisen(
    @CurrentUser() user: RequestUser,
    @Args('mailboxId', { type: () => ID }) mailboxId: string,
    @Args('threadKey') threadKey: string,
    @Args('userId', { type: () => ID, nullable: true }) anId?: string | null,
  ): Promise<boolean> {
    return this.mailboxesService.zuweisen(
      user.workspaceId,
      user.userId,
      mailboxId,
      threadKey.slice(0, 500),
      anId ?? null,
    );
  }

  @Mutation(() => Boolean)
  @UseGuards(NurMenschWache, BillingWriteGuard)
  postfachErledigt(
    @CurrentUser() user: RequestUser,
    @Args('mailboxId', { type: () => ID }) mailboxId: string,
    @Args('threadKey') threadKey: string,
    @Args('erledigt') erledigt: boolean,
  ): Promise<boolean> {
    return this.mailboxesService.erledigen(
      user.workspaceId,
      user.userId,
      mailboxId,
      threadKey.slice(0, 500),
      erledigt,
    );
  }

  @Query(() => [KontaktVorschlag])
  kontaktVorschlaege(
    @CurrentUser() user: RequestUser,
  ): Promise<KontaktVorschlag[]> {
    return this.mailboxesService.kontaktVorschlaege(
      user.workspaceId,
      user.userId,
    );
  }

  @Query(() => [String])
  async unzustellbareAdressen(
    @CurrentUser() user: RequestUser,
    @Args('adressen', { type: () => [String] }) adressen: string[],
  ): Promise<string[]> {
    await this.permissions.assert(
      user,
      Permission.CONTACT_VIEW,
      'Kontakte zu sehen',
    );

    return this.mailboxesService.unzustellbar(user.workspaceId, adressen);
  }

  @Mutation(() => MailboxEntity)
  @UseGuards(NurMenschWache, BillingWriteGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async connectMailbox(
    @CurrentUser() user: RequestUser,
    @Args('input') input: ConnectMailboxInput,
  ): Promise<MailboxEntity> {
    return this.mailboxesService.connect(
      user.workspaceId,
      user.userId,
      {
        host: input.host,
        port: input.port ?? 993,
        secure: input.secure ?? true,
        username: input.username,
        password: input.password,
        folder: input.folder ?? 'INBOX',
        smtpHost: input.smtpHost ?? null,
        smtpPort: input.smtpPort ?? (input.smtpHost === undefined ? null : 587),
        smtpSecure: input.smtpSecure ?? false,
        gesendetOrdner: input.gesendetOrdner ?? null,
      },
      {
        mailboxId: input.mailboxId ?? null,
        neu: input.neu ?? null,
        bezeichnung: input.bezeichnung,
        darfGemeinsameVerwalten: await this.darfGemeinsame(user),
      },
    );
  }

  @Mutation(() => MailMessageEntity)
  @UseGuards(NurMenschWache, GqlThrottlerGuard, BillingWriteGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async sendMail(
    @CurrentUser() user: RequestUser,
    @Args('input') input: SendMailInput,
  ): Promise<MailMessageEntity> {
    const anhangIds = input.attachmentIds ?? [];

    if (anhangIds.length > 0) {
      const ziele = await this.mailboxesService.anhangZiele(
        user.workspaceId,
        anhangIds,
      );

      for (const recht of new Set(
        ziele.flatMap((ziel) => rechteFuerZiel(ziel, 'sehen')),
      )) {
        await this.permissions.assert(
          user,
          recht,
          'diese Datei zu verschicken',
        );
      }
    }

    return this.mailboxesService.senden(user.workspaceId, user.userId, {
      an: input.to,
      cc: input.cc ?? [],
      bcc: input.bcc ?? [],
      betreff: input.subject,
      rumpf: input.body,
      antwortAuf: input.inReplyToId ?? null,
      anhangIds,
      absender: input.from ?? null,
      postfachId: input.mailboxId ?? null,
    });
  }

  @Mutation(() => MailboxEntity)
  @UseGuards(NurMenschWache)
  async setPostfachEinstellungen(
    @CurrentUser() user: RequestUser,
    @Args('input') input: PostfachEinstellungenInput,
    @Args('mailboxId', { type: () => ID, nullable: true })
    mailboxId?: string | null,
  ): Promise<MailboxEntity> {
    return this.mailboxesService.einstellungenSetzen(
      user.workspaceId,
      user.userId,
      input,
      mailboxId ?? null,
      await this.darfGemeinsame(user),
    );
  }

  @Query(() => [MailInhaltView])
  async mailInhalte(
    @CurrentUser() user: RequestUser,
    @Args('ids', { type: () => [ID] }) ids: string[],
  ): Promise<MailInhaltView[]> {
    await this.permissions.assertAny(user, POST_SEHEN, 'Nachrichten zu sehen');

    return this.mailboxesService.mailInhalte(
      user.workspaceId,
      user.userId,
      ids,
    );
  }

  @Mutation(() => MailInhaltView)
  @UseGuards(GqlThrottlerGuard, BillingWriteGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async mailAnhangSpeichern(
    @CurrentUser() user: RequestUser,
    @Args('nachrichtId', { type: () => ID }) nachrichtId: string,
    @Args('index', { type: () => Int }) index: number,
  ): Promise<MailInhaltView> {
    await this.permissions.assertAny(user, POST_SEHEN, 'Nachrichten zu sehen');

    const ziel = await this.mailboxesService.anhangZielFuer(
      user.workspaceId,
      user.userId,
      nachrichtId,
    );

    for (const recht of rechteFuerZiel(ziel, 'aendern')) {
      await this.permissions.assert(user, recht, 'Anhänge hochzuladen');
    }

    return this.mailboxesService.anhangAnAkte(
      user.workspaceId,
      user.userId,
      nachrichtId,
      index,
    );
  }

  @Mutation(() => Boolean)
  @UseGuards(NurMenschWache)
  async disconnectMailbox(
    @CurrentUser() user: RequestUser,
    @Args('behalten', { nullable: true }) behalten?: boolean,
    @Args('mailboxId', { type: () => ID, nullable: true })
    mailboxId?: string | null,
  ): Promise<boolean> {
    return this.mailboxesService.disconnect(
      user.workspaceId,
      user.userId,
      behalten ?? false,
      mailboxId ?? null,
      await this.darfGemeinsame(user),
    );
  }

  @Mutation(() => MailboxSyncResult)
  @UseGuards(NurMenschWache, BillingWriteGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async syncMailbox(
    @CurrentUser() user: RequestUser,
    @Args('mailboxId', { type: () => ID, nullable: true })
    mailboxId?: string | null,
  ): Promise<MailboxSyncResult> {
    return this.mailboxesService.sync(
      user.workspaceId,
      user.userId,
      mailboxId ?? null,
      await this.darfGemeinsame(user),
    );
  }

  @Query(() => [MailMessageEntity])
  async mailSuche(
    @CurrentUser() user: RequestUser,
    @Args('text') text: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<MailMessageEntity[]> {
    await this.permissions.assert(
      user,
      Permission.CONTACT_VIEW,
      'Nachrichten zu durchsuchen',
    );
    await this.permissions.assert(
      user,
      Permission.COMPANY_VIEW,
      'Nachrichten zu durchsuchen',
    );

    const suchtext = text.trim().slice(0, 200);

    if (suchtext.length < 2) {
      return [];
    }

    return this.mailboxesService.suche(
      user.workspaceId,
      user.userId,
      suchtext,
      limit ?? 5,
    );
  }

  @Query(() => [MailMessageEntity])
  async contactMessages(
    @CurrentUser() user: RequestUser,
    @Args('contactId', { type: () => ID }) contactId: string,
  ): Promise<MailMessageEntity[]> {
    await this.permissions.assert(
      user,
      Permission.CONTACT_VIEW,
      'die Nachrichten eines Kontakts zu sehen',
    );

    return this.mailboxesService.forContact(
      user.workspaceId,
      contactId,
      user.userId,
    );
  }

  @Query(() => [MailMessageEntity])
  async companyMessages(
    @CurrentUser() user: RequestUser,
    @Args('companyId', { type: () => ID }) companyId: string,
  ): Promise<MailMessageEntity[]> {
    await this.permissions.assert(
      user,
      Permission.COMPANY_VIEW,
      'die Nachrichten einer Firma zu sehen',
    );

    return this.mailboxesService.forCompany(
      user.workspaceId,
      companyId,
      user.userId,
    );
  }

  @Query(() => [MailMessageEntity])
  async dealMessages(
    @CurrentUser() user: RequestUser,
    @Args('dealId', { type: () => ID }) dealId: string,
  ): Promise<MailMessageEntity[]> {
    await this.permissions.assert(
      user,
      Permission.DEAL_VIEW,
      'die Nachrichten eines Geschäfts zu sehen',
    );

    return this.mailboxesService.forDeal(user.workspaceId, dealId, user.userId);
  }

  @Query(() => [MailSperreEntity])
  mailSperren(@CurrentUser() user: RequestUser): Promise<MailSperreEntity[]> {
    return this.mailboxesService.listSperren(user.workspaceId);
  }

  @Mutation(() => MailSperreEntity)
  @UseGuards(BillingWriteGuard)
  async addMailSperre(
    @CurrentUser() user: RequestUser,
    @Args('input') input: AddMailSperreInput,
  ): Promise<MailSperreEntity> {
    await this.permissions.assert(
      user,
      Permission.MEMBER_MANAGE,
      'die Sperrliste des Postfachs zu ändern',
    );

    return this.mailboxesService.sperreHinzufuegen(
      user.workspaceId,
      user.userId,
      input.eintrag,
    );
  }

  @Mutation(() => Boolean)
  async removeMailSperre(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.permissions.assert(
      user,
      Permission.MEMBER_MANAGE,
      'die Sperrliste des Postfachs zu ändern',
    );

    return this.mailboxesService.sperreEntfernen(user.workspaceId, id);
  }
}
