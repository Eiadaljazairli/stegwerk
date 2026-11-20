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
import { UserEntity } from '../users/user.entity';
import { Permission, roleAllows } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { BenachrichtigungenService } from './benachrichtigungen.service';
import {
  CreateNoteInput,
  NotizZieleInput,
  UpdateNoteInput,
} from './dto/note.dto';
import { SortDirection } from './dto/pagination.dto';
import { NoteEntity } from './entities/note.entity';
import { NotesService } from './notes.service';
import { CompanyEntity } from './entities/company.entity';
import { ContactEntity } from './entities/contact.entity';
import { DealEntity } from './entities/deal.entity';
import { sichtbareAkte } from '../workspaces/ziel-sichtbarkeit';

const SCHREIBRECHT = {
  companyId: Permission.COMPANY_WRITE,
  contactId: Permission.CONTACT_WRITE,
  dealId: Permission.DEAL_WRITE,
} as const;

type NotizZiel = {
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
};

@Resolver(() => NoteEntity)
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class NotesResolver {
  constructor(
    private readonly notesService: NotesService,
    private readonly permissions: PermissionsService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly benachrichtigungen: BenachrichtigungenService,
  ) {}

  @ResolveField(() => String)
  async authorName(@Parent() note: NoteEntity): Promise<string> {
    const author = await this.userRepository.findOne({
      where: { id: note.authorId },
    });

    if (author === null) {
      return 'Unbekannt';
    }

    return `${author.firstName} ${author.lastName}`;
  }

  @Query(() => [NoteEntity])
  async notizSuche(
    @CurrentUser() user: RequestUser,
    @Args('text') text: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<NoteEntity[]> {
    const rolle = await this.permissions.permissionsOf(user);
    const darf = [
      Permission.COMPANY_VIEW,
      Permission.CONTACT_VIEW,
      Permission.DEAL_VIEW,
    ].every((recht) => roleAllows(rolle, recht));

    if (!darf || text.trim().length < 2) {
      return [];
    }

    const seite = await this.notesService.list(user.workspaceId, {
      search: text.trim().slice(0, 200),
      limit: Math.min(limit ?? 5, 20),
      sortField: 'createdAt',
      sortDirection: SortDirection.DESC,
    });

    return seite.items;
  }

  @Mutation(() => NoteEntity)
  async createNote(
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateNoteInput,
  ): Promise<NoteEntity> {
    await this.assertSchreibrecht(user, input, 'Notizen zu schreiben');

    const note = await this.notesService.createForTarget(
      user.workspaceId,
      user.userId,
      input.body,
      input,
    );

    await this.benachrichtigungen.nachDemSpeichernVon(
      user,
      { noteId: note.id },
      null,
      note.body,
    );

    return note;
  }

  @Mutation(() => NoteEntity)
  async updateNote(
    @CurrentUser() user: RequestUser,
    @Args('input') input: UpdateNoteInput,
  ): Promise<NoteEntity> {
    const note = await this.notesService.findOne(user.workspaceId, input.id);

    await this.assertSchreibrecht(user, note, 'Notizen zu bearbeiten');

    const neu = await this.notesService.bearbeiten(
      user.workspaceId,
      input.id,
      input.body,
      user.userId,
    );

    await this.benachrichtigungen.nachDemSpeichernVon(
      user,
      { noteId: note.id },
      note.body,
      neu.body,
    );

    return neu;
  }

  @ResolveField(() => String, { nullable: true })
  async bearbeitetVon(@Parent() note: NoteEntity): Promise<string | null> {
    if (note.bearbeitetVonId === null) {
      return null;
    }

    const von = await this.userRepository.findOne({
      where: { id: note.bearbeitetVonId },
    });

    return von === null ? 'Unbekannt' : `${von.firstName} ${von.lastName}`;
  }

  @Mutation(() => NoteEntity)
  async setzeNotizZiele(
    @CurrentUser() user: RequestUser,
    @Args('input') input: NotizZieleInput,
  ): Promise<NoteEntity> {
    const note = await this.notesService.findOne(user.workspaceId, input.id);
    const ziele = {
      companyId: input.companyId,
      contactId: input.contactId,
      dealId: input.dealId,
    };

    await this.assertSchreibrecht(user, note, 'Notizen zu verknüpfen');
    await this.assertSchreibrecht(user, ziele, 'Notizen zu verknüpfen');

    return this.notesService.zieleSetzen(user.workspaceId, input.id, ziele);
  }

  @ResolveField('company', () => CompanyEntity, { nullable: true })
  async company(@Parent() note: NoteEntity): Promise<CompanyEntity | null> {
    return note.companyId === null
      ? null
      : sichtbareAkte(
          'company',
          await this.userRepository.manager.findOne(CompanyEntity, {
            where: { id: note.companyId, workspaceId: note.workspaceId },
          }),
        );
  }

  @ResolveField('contact', () => ContactEntity, { nullable: true })
  async contact(@Parent() note: NoteEntity): Promise<ContactEntity | null> {
    return note.contactId === null
      ? null
      : sichtbareAkte(
          'contact',
          await this.userRepository.manager.findOne(ContactEntity, {
            where: { id: note.contactId, workspaceId: note.workspaceId },
          }),
        );
  }

  @ResolveField('deal', () => DealEntity, { nullable: true })
  async deal(@Parent() note: NoteEntity): Promise<DealEntity | null> {
    return note.dealId === null
      ? null
      : sichtbareAkte(
          'deal',
          await this.userRepository.manager.findOne(DealEntity, {
            where: { id: note.dealId, workspaceId: note.workspaceId },
          }),
        );
  }

  @Mutation(() => Boolean)
  async deleteNote(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    const note = await this.notesService.findOne(user.workspaceId, id);

    await this.assertSchreibrecht(user, note, 'Notizen zu löschen');

    return this.notesService.remove(user.workspaceId, id);
  }

  private async assertSchreibrecht(
    user: RequestUser,
    ziel: NotizZiel,
    what: string,
  ): Promise<void> {
    for (const spalte of Object.keys(SCHREIBRECHT) as (keyof NotizZiel)[]) {
      if (ziel[spalte] !== undefined && ziel[spalte] !== null) {
        await this.permissions.assert(user, SCHREIBRECHT[spalte], what);
      }
    }
  }
}
