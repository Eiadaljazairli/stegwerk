import { UseGuards } from '@nestjs/common';
import {
  Args,
  ID,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { Permission } from '../workspaces/permissions';
import { sichtbareAkte } from '../workspaces/ziel-sichtbarkeit';
import { PermissionsService } from '../workspaces/permissions.service';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { ContactsService } from './contacts.service';
import { DealKontakteService } from './deal-kontakte.service';
import { DealsService } from './deals.service';
import { DealKontaktEntity } from './entities/deal-kontakt.entity';
import { CreateContactInput, UpdateContactInput } from './dto/contact.dto';
import { ContactPage } from './dto/page.dto';
import { ContactListArgs } from './dto/list-args.dto';
import { CompanyEntity } from './entities/company.entity';
import { ContactEntity } from './entities/contact.entity';
import { DealEntity } from './entities/deal.entity';
import { NoteEntity } from './entities/note.entity';
import { NotesService } from './notes.service';
import { TaskEntity } from './entities/task.entity';
import { AppointmentEntity } from '../calendar/appointment.entity';
import { AppointmentsService } from '../calendar/appointments.service';
import { TasksService } from './tasks.service';

import { mitVerantwortlichem } from './verantwortlich';
import { herkunftFuer } from './herkunft';
@Resolver(() => ContactEntity)
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class ContactsResolver {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly contactsService: ContactsService,
    private readonly dealsService: DealsService,
    private readonly notesService: NotesService,
    private readonly tasksService: TasksService,
    private readonly appointmentsService: AppointmentsService,
    private readonly beteiligteService: DealKontakteService,
  ) {}

  @ResolveField(() => [DealKontaktEntity])
  async beteiligungen(
    @CurrentUser() user: RequestUser,
    @Parent() contact: ContactEntity,
  ): Promise<DealKontaktEntity[]> {
    if (!(await this.darf(user, Permission.DEAL_VIEW))) {
      return [];
    }

    return this.beteiligteService.fuerKontakt(user.workspaceId, contact.id);
  }

  @ResolveField('company', () => CompanyEntity, { nullable: true })
  company(@Parent() contact: ContactEntity): Promise<CompanyEntity | null> {
    return sichtbareAkte('company', contact.company);
  }

  @ResolveField(() => [DealEntity])
  async deals(
    @CurrentUser() user: RequestUser,
    @Parent() contact: ContactEntity,
  ): Promise<DealEntity[]> {
    if (!(await this.darf(user, Permission.DEAL_VIEW))) {
      return [];
    }

    return this.dealsService.findByContact(user.workspaceId, contact.id);
  }

  @ResolveField(() => [TaskEntity])
  async tasks(
    @CurrentUser() user: RequestUser,
    @Parent() contact: ContactEntity,
  ): Promise<TaskEntity[]> {
    if (!(await this.darf(user, Permission.TASK_VIEW))) {
      return [];
    }

    return this.tasksService.findForRecord(
      user.workspaceId,
      'contactId',
      contact.id,
    );
  }

  @ResolveField(() => [AppointmentEntity])
  async appointments(
    @CurrentUser() user: RequestUser,
    @Parent() contact: ContactEntity,
  ): Promise<AppointmentEntity[]> {
    if (!(await this.darf(user, Permission.APPOINTMENT_VIEW))) {
      return [];
    }

    return this.appointmentsService.fuerAkte(
      user.workspaceId,
      user.userId,
      await this.appointmentsService.fuerKontakt(user.workspaceId, contact.id),
    );
  }

  @ResolveField(() => [NoteEntity])
  notes(
    @CurrentUser() user: RequestUser,
    @Parent() contact: ContactEntity,
  ): Promise<NoteEntity[]> {
    return this.notesService.findForContact(user.workspaceId, contact.id);
  }

  @Query(() => ContactPage)
  async contacts(
    @CurrentUser() user: RequestUser,
    @Args() args: ContactListArgs,
  ): Promise<ContactPage> {
    await this.assert(user, Permission.CONTACT_VIEW, 'Kontakte zu sehen');

    const filter = { companyId: args.companyId, ownerId: args.ownerId };
    const [seite, gruppen] = await Promise.all([
      this.contactsService.list(user.workspaceId, args, filter),
      this.contactsService.gruppen(user.workspaceId, args, filter),
    ]);

    return { ...seite, gruppen };
  }

  @Query(() => ContactEntity)
  async contact(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ContactEntity> {
    await this.assert(user, Permission.CONTACT_VIEW, 'einen Kontakt zu sehen');

    return this.contactsService.findOne(user.workspaceId, id);
  }

  @Mutation(() => ContactEntity)
  async createContact(
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateContactInput,
  ): Promise<ContactEntity> {
    await this.assert(user, Permission.CONTACT_WRITE, 'Kontakte anzulegen');

    return this.contactsService.create(user.workspaceId, {
      ...mitVerantwortlichem(user, input),
      herkunft: herkunftFuer(user, input.herkunft),
    });
  }

  @Mutation(() => ContactEntity)
  async updateContact(
    @CurrentUser() user: RequestUser,
    @Args('input') input: UpdateContactInput,
  ): Promise<ContactEntity> {
    await this.assert(user, Permission.CONTACT_WRITE, 'Kontakte zu ändern');

    return this.contactsService.update(user.workspaceId, input.id, input);
  }

  @Mutation(() => Boolean)
  async deleteContact(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.permissions.assert(
      user,
      Permission.CONTACT_DELETE,
      'Kontakte zu löschen',
    );

    return this.contactsService.remove(user.workspaceId, id, user.userId);
  }

  private assert(
    user: RequestUser,
    permission: Permission,
    what: string,
  ): Promise<void> {
    return this.permissions.assert(user, permission, what);
  }

  private darf(user: RequestUser, permission: Permission): Promise<boolean> {
    return this.permissions.can(user, permission);
  }
}
