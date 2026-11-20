import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { type Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';

import { rechteFuerZiel } from './attachment-rechte';
import { AttachmentEntity } from './attachment.entity';
import { AttachmentsService } from './attachments.service';

@Resolver(() => AttachmentEntity)
@UseGuards(GqlAuthGuard)
export class AttachmentsResolver {
  constructor(
    private readonly dienst: AttachmentsService,
    private readonly permissions: PermissionsService,
  ) {}

  @Query(() => [AttachmentEntity])
  async attachments(
    @CurrentUser() user: RequestUser,
    @Args('companyId', { type: () => ID, nullable: true })
    companyId?: string,
    @Args('contactId', { type: () => ID, nullable: true })
    contactId?: string,
    @Args('dealId', { type: () => ID, nullable: true }) dealId?: string,
    @Args('quoteId', { type: () => ID, nullable: true }) quoteId?: string,
    @Args('invoiceId', { type: () => ID, nullable: true })
    invoiceId?: string,
    @Args('taskId', { type: () => ID, nullable: true }) taskId?: string,
    @Args('noteId', { type: () => ID, nullable: true }) noteId?: string,
  ): Promise<AttachmentEntity[]> {
    const ziel = {
      companyId,
      contactId,
      dealId,
      quoteId,
      invoiceId,
      taskId,
      noteId,
    };

    await this.pruefe(
      user,
      rechteFuerZiel(
        await this.dienst.mitAkte(user.workspaceId, ziel),
        'sehen',
      ),
      'Anhänge zu sehen',
    );

    return this.dienst.list(user.workspaceId, ziel);
  }

  @Mutation(() => Boolean)
  async deleteAttachment(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    const ziel = await this.dienst.zielVon(user.workspaceId, id);

    await this.pruefe(
      user,
      rechteFuerZiel(ziel, 'aendern'),
      'Anhänge zu löschen',
    );
    await this.dienst.assertSchreibbar(ziel);

    return this.dienst.remove(user.workspaceId, id);
  }

  private async pruefe(
    user: RequestUser,
    rechte: readonly Permission[],
    was: string,
  ): Promise<void> {
    for (const recht of rechte) {
      await this.permissions.assert(user, recht, was);
    }
  }
}
