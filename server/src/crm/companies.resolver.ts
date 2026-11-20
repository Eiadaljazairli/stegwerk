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
import { PermissionsService } from '../workspaces/permissions.service';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { CompaniesService } from './companies.service';
import { ContactsService } from './contacts.service';
import { DealsService } from './deals.service';
import { CreateCompanyInput, UpdateCompanyInput } from './dto/company.dto';
import { CompanyPage } from './dto/page.dto';
import { CompanyListArgs } from './dto/list-args.dto';
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
@Resolver(() => CompanyEntity)
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class CompaniesResolver {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly companiesService: CompaniesService,
    private readonly contactsService: ContactsService,
    private readonly dealsService: DealsService,
    private readonly notesService: NotesService,
    private readonly tasksService: TasksService,
    private readonly appointmentsService: AppointmentsService,
  ) {}

  @ResolveField(() => [ContactEntity])
  async contacts(
    @CurrentUser() user: RequestUser,
    @Parent() company: CompanyEntity,
  ): Promise<ContactEntity[]> {
    if (!(await this.darf(user, Permission.CONTACT_VIEW))) {
      return [];
    }

    return this.contactsService.findByCompany(user.workspaceId, company.id);
  }

  @ResolveField('parentCompany', () => CompanyEntity, { nullable: true })
  parentCompany(
    @CurrentUser() user: RequestUser,
    @Parent() company: CompanyEntity,
  ): Promise<CompanyEntity | null> {
    return this.companiesService.mutterfirma(user.workspaceId, company);
  }

  @ResolveField('tochterfirmen', () => [CompanyEntity])
  tochterfirmen(
    @CurrentUser() user: RequestUser,
    @Parent() company: CompanyEntity,
  ): Promise<CompanyEntity[]> {
    return this.companiesService.tochterfirmen(user.workspaceId, company.id);
  }

  @ResolveField(() => [DealEntity])
  async deals(
    @CurrentUser() user: RequestUser,
    @Parent() company: CompanyEntity,
  ): Promise<DealEntity[]> {
    if (!(await this.darf(user, Permission.DEAL_VIEW))) {
      return [];
    }

    return this.dealsService.findByCompany(user.workspaceId, company.id);
  }

  @ResolveField(() => [TaskEntity])
  async tasks(
    @CurrentUser() user: RequestUser,
    @Parent() company: CompanyEntity,
  ): Promise<TaskEntity[]> {
    if (!(await this.darf(user, Permission.TASK_VIEW))) {
      return [];
    }

    return this.tasksService.findForRecord(
      user.workspaceId,
      'companyId',
      company.id,
    );
  }

  @ResolveField(() => [AppointmentEntity])
  async appointments(
    @CurrentUser() user: RequestUser,
    @Parent() company: CompanyEntity,
  ): Promise<AppointmentEntity[]> {
    if (!(await this.darf(user, Permission.APPOINTMENT_VIEW))) {
      return [];
    }

    return this.appointmentsService.fuerAkte(
      user.workspaceId,
      user.userId,
      await this.appointmentsService.forRecord(
        user.workspaceId,
        'companyId',
        company.id,
      ),
    );
  }

  @ResolveField(() => [NoteEntity])
  notes(
    @CurrentUser() user: RequestUser,
    @Parent() company: CompanyEntity,
  ): Promise<NoteEntity[]> {
    return this.notesService.findForCompany(user.workspaceId, company.id);
  }

  @ResolveField(() => [NoteEntity])
  async kontaktNotizen(
    @CurrentUser() user: RequestUser,
    @Parent() company: CompanyEntity,
  ): Promise<NoteEntity[]> {
    if (!(await this.darf(user, Permission.CONTACT_VIEW))) {
      return [];
    }

    return this.notesService.fuerKontakteDerFirma(user.workspaceId, company.id);
  }

  @ResolveField(() => [TaskEntity])
  async kontaktAufgaben(
    @CurrentUser() user: RequestUser,
    @Parent() company: CompanyEntity,
  ): Promise<TaskEntity[]> {
    if (
      !(await this.darf(user, Permission.TASK_VIEW)) ||
      !(await this.darf(user, Permission.CONTACT_VIEW))
    ) {
      return [];
    }

    return this.tasksService.fuerKontakteDerFirma(user.workspaceId, company.id);
  }

  @ResolveField(() => [AppointmentEntity])
  async kontaktTermine(
    @CurrentUser() user: RequestUser,
    @Parent() company: CompanyEntity,
  ): Promise<AppointmentEntity[]> {
    if (
      !(await this.darf(user, Permission.APPOINTMENT_VIEW)) ||
      !(await this.darf(user, Permission.CONTACT_VIEW))
    ) {
      return [];
    }

    return this.appointmentsService.fuerAkte(
      user.workspaceId,
      user.userId,
      await this.appointmentsService.fuerKontakteDerFirma(
        user.workspaceId,
        company.id,
      ),
    );
  }

  @Query(() => CompanyPage)
  async companies(
    @CurrentUser() user: RequestUser,
    @Args() args: CompanyListArgs,
  ): Promise<CompanyPage> {
    await this.assert(user, Permission.COMPANY_VIEW, 'Firmen zu sehen');

    const filter = {
      industry: args.industry,
      country: args.country,
      ownerId: args.ownerId,
    };
    const [seite, summen, gruppen] = await Promise.all([
      this.companiesService.list(user.workspaceId, args, filter),
      this.companiesService.summen(
        user.workspaceId,
        args,
        filter,
        'annualRevenue',
      ),
      this.companiesService.gruppen(user.workspaceId, args, filter),
    ]);

    return { ...seite, summen, gruppen };
  }

  @Query(() => [String])
  async companyIndustries(@CurrentUser() user: RequestUser): Promise<string[]> {
    await this.assert(user, Permission.COMPANY_VIEW, 'Firmen zu sehen');

    return this.companiesService.distinctIndustries(user.workspaceId);
  }

  @Query(() => CompanyEntity)
  async company(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<CompanyEntity> {
    await this.assert(user, Permission.COMPANY_VIEW, 'eine Firma zu sehen');

    return this.companiesService.findOne(user.workspaceId, id);
  }

  @Mutation(() => CompanyEntity)
  async createCompany(
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateCompanyInput,
  ): Promise<CompanyEntity> {
    await this.assert(user, Permission.COMPANY_WRITE, 'Firmen anzulegen');

    return this.companiesService.create(user.workspaceId, {
      ...mitVerantwortlichem(user, input),
      herkunft: herkunftFuer(user, input.herkunft),
    });
  }

  @Mutation(() => CompanyEntity)
  async updateCompany(
    @CurrentUser() user: RequestUser,
    @Args('input') input: UpdateCompanyInput,
  ): Promise<CompanyEntity> {
    await this.assert(user, Permission.COMPANY_WRITE, 'Firmen zu ändern');

    return this.companiesService.update(user.workspaceId, input.id, input);
  }

  @Mutation(() => Boolean)
  async deleteCompany(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.permissions.assert(
      user,
      Permission.COMPANY_DELETE,
      'Firmen zu löschen',
    );

    return this.companiesService.remove(user.workspaceId, id, user.userId);
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
