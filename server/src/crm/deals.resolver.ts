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

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { istVerborgen } from '../workspaces/feldrechte';
import { sichtbareAkte } from '../workspaces/ziel-sichtbarkeit';
import { Permission, roleAllows } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { CompaniesService } from './companies.service';
import { ContactsService } from './contacts.service';
import { DealKontakteService } from './deal-kontakte.service';
import { DealsService } from './deals.service';
import { DealKontaktEntity } from './entities/deal-kontakt.entity';
import { CreateDealInput, UpdateDealInput } from './dto/deal.dto';
import { DealPage } from './dto/page.dto';
import { DealListArgs } from './dto/list-args.dto';
import { PipelineStageSummary, WorkspaceSummary } from './dto/pipeline.dto';
import { CompanyEntity } from './entities/company.entity';
import { ContactEntity } from './entities/contact.entity';
import { DealEntity, DealStage } from './entities/deal.entity';
import { NoteEntity } from './entities/note.entity';
import { TaskEntity } from './entities/task.entity';
import { NotesService } from './notes.service';
import { AppointmentEntity } from '../calendar/appointment.entity';
import { AppointmentsService } from '../calendar/appointments.service';
import { TasksService } from './tasks.service';
import { mitVerantwortlichem } from './verantwortlich';
import { herkunftFuer } from './herkunft';
import { RUHEND_AB_TAGEN, VERLUSTGRUENDE } from './aktivitaet';

@Resolver(() => DealEntity)
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class DealsResolver {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly dealsService: DealsService,
    private readonly companiesService: CompaniesService,
    private readonly contactsService: ContactsService,
    private readonly notesService: NotesService,
    private readonly tasksService: TasksService,
    private readonly appointmentsService: AppointmentsService,
    private readonly beteiligteService: DealKontakteService,
  ) {}

  @ResolveField(() => [DealKontaktEntity])
  beteiligte(
    @CurrentUser() user: RequestUser,
    @Parent() deal: DealEntity,
  ): Promise<DealKontaktEntity[]> {
    return this.beteiligteService.fuerGeschaeft(user.workspaceId, deal.id);
  }

  @ResolveField('company', () => CompanyEntity, { nullable: true })
  company(@Parent() deal: DealEntity): Promise<CompanyEntity | null> {
    return sichtbareAkte('company', deal.company);
  }

  @ResolveField('primaryContact', () => ContactEntity, { nullable: true })
  primaryContact(@Parent() deal: DealEntity): Promise<ContactEntity | null> {
    return sichtbareAkte('contact', deal.primaryContact);
  }

  @ResolveField(() => Date, { nullable: true })
  letzteAktivitaet(
    @CurrentUser() user: RequestUser,
    @Parent() deal: DealEntity,
  ): Promise<Date | null> {
    return this.dealsService.letzteAktivitaet(user.workspaceId, deal.id);
  }

  @Query(() => Int)
  async anzahlRuhendeGeschaefte(
    @CurrentUser() user: RequestUser,
    @Args('tage', { type: () => Int, defaultValue: RUHEND_AB_TAGEN })
    tage: number,
    @Args('nurMeine', { defaultValue: false }) nurMeine: boolean,
  ): Promise<number> {
    await this.assert(user, Permission.DEAL_VIEW, 'Geschäfte zu sehen');

    return this.dealsService.anzahlRuhend(
      user.workspaceId,
      Math.min(Math.max(tage, 1), 365),
      nurMeine ? user.userId : undefined,
    );
  }

  @Query(() => [String])
  verlustgruende(): string[] {
    return VERLUSTGRUENDE;
  }

  @ResolveField(() => [AppointmentEntity])
  async appointments(
    @CurrentUser() user: RequestUser,
    @Parent() deal: DealEntity,
  ): Promise<AppointmentEntity[]> {
    if (!(await this.darf(user, Permission.APPOINTMENT_VIEW))) {
      return [];
    }

    return this.appointmentsService.fuerAkte(
      user.workspaceId,
      user.userId,
      await this.appointmentsService.forRecord(
        user.workspaceId,
        'dealId',
        deal.id,
      ),
    );
  }

  @ResolveField(() => [AppointmentEntity])
  async beteiligtenTermine(
    @CurrentUser() user: RequestUser,
    @Parent() deal: DealEntity,
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
      await this.appointmentsService.fuerBeteiligteDesGeschaefts(
        user.workspaceId,
        deal.id,
      ),
    );
  }

  @ResolveField(() => [NoteEntity])
  notes(
    @CurrentUser() user: RequestUser,
    @Parent() deal: DealEntity,
  ): Promise<NoteEntity[]> {
    return this.notesService.findForDeal(user.workspaceId, deal.id);
  }

  @ResolveField(() => [TaskEntity])
  async tasks(
    @CurrentUser() user: RequestUser,
    @Parent() deal: DealEntity,
  ): Promise<TaskEntity[]> {
    if (!(await this.darf(user, Permission.TASK_VIEW))) {
      return [];
    }

    return this.tasksService.findForRecord(user.workspaceId, 'dealId', deal.id);
  }

  @Query(() => DealPage)
  async deals(
    @CurrentUser() user: RequestUser,
    @Args() args: DealListArgs,
  ): Promise<DealPage> {
    await this.assert(user, Permission.DEAL_VIEW, 'Geschäfte zu sehen');

    const filter = {
      stage: args.stage,
      companyId: args.companyId,
      openOnly: args.openOnly,
      ruhendTage: args.ruhendTage,
      minAmount: args.minAmount,
      closeBefore: args.closeBefore,
      ownerId: args.ownerId,
      pipelineId: args.pipelineId,
    };
    const [seite, summen, gruppen] = await Promise.all([
      this.dealsService.list(user.workspaceId, args, filter),
      this.dealsService.summen(
        user.workspaceId,
        args,
        filter,
        'amount',
        'currency',
      ),
      this.dealsService.gruppen(user.workspaceId, args, filter),
    ]);

    return { ...seite, summen, gruppen };
  }

  @Query(() => DealEntity)
  async deal(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<DealEntity> {
    await this.assert(user, Permission.DEAL_VIEW, 'ein Geschäft zu sehen');

    return this.dealsService.findOne(user.workspaceId, id);
  }

  @Query(() => [PipelineStageSummary])
  async pipeline(
    @CurrentUser() user: RequestUser,
    @Args('pipelineId', { type: () => ID, nullable: true })
    pipelineId?: string,
  ): Promise<PipelineStageSummary[]> {
    if (!(await this.darf(user, Permission.DEAL_VIEW))) {
      return [];
    }

    const stufen = await this.dealsService.pipelineByStage(
      user.workspaceId,
      pipelineId ?? null,
    );

    return (await istVerborgen('deal.amount'))
      ? stufen.map((stufe) => ({ ...stufe, totalAmount: 0 }))
      : stufen;
  }

  @Query(() => WorkspaceSummary)
  async workspaceSummary(
    @CurrentUser() user: RequestUser,
  ): Promise<WorkspaceSummary> {
    const rolle = await this.permissions.permissionsOf(user);
    const nurMit = <T>(
      permission: Permission,
      zaehlen: () => Promise<T>,
    ): Promise<T | null> =>
      roleAllows(rolle, permission) ? zaehlen() : Promise.resolve(null);

    const [
      companyCount,
      contactCount,
      openDealCount,
      openPipelineValue,
      openTaskCount,
      overdueTaskCount,
    ] = await Promise.all([
      nurMit(Permission.COMPANY_VIEW, () =>
        this.companiesService.count(user.workspaceId),
      ),
      nurMit(Permission.CONTACT_VIEW, () =>
        this.contactsService.count(user.workspaceId),
      ),
      nurMit(Permission.DEAL_VIEW, () =>
        this.dealsService.countOpen(user.workspaceId),
      ),
      nurMit(Permission.DEAL_VIEW, () =>
        this.dealsService.openPipelineValue(user.workspaceId),
      ),
      nurMit(Permission.TASK_VIEW, () =>
        this.tasksService.countOpenForUser(user.workspaceId, user.userId),
      ),
      nurMit(Permission.TASK_VIEW, () =>
        this.tasksService.countOverdueForUser(user.workspaceId, user.userId),
      ),
    ]);

    const betraegeVerborgen = await istVerborgen('deal.amount');

    return {
      companyCount,
      contactCount,
      openDealCount,
      openPipelineValue: betraegeVerborgen ? null : openPipelineValue,
      openTaskCount,
      overdueTaskCount,
      betraegeVerborgen,
    };
  }

  @Mutation(() => DealEntity)
  async createDeal(
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateDealInput,
  ): Promise<DealEntity> {
    await this.assert(user, Permission.DEAL_WRITE, 'Geschäfte anzulegen');

    return this.dealsService.create(user.workspaceId, {
      ...mitVerantwortlichem(user, input),
      herkunft: herkunftFuer(user, input.herkunft),
    });
  }

  @Mutation(() => DealEntity)
  async updateDeal(
    @CurrentUser() user: RequestUser,
    @Args('input') input: UpdateDealInput,
  ): Promise<DealEntity> {
    await this.assert(user, Permission.DEAL_WRITE, 'Geschäfte zu ändern');

    return this.dealsService.update(user.workspaceId, input.id, input);
  }

  @Mutation(() => DealEntity)
  async moveDealToStage(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('stage', { type: () => DealStage }) stage: DealStage,
  ): Promise<DealEntity> {
    await this.assert(user, Permission.DEAL_WRITE, 'Geschäfte zu ändern');

    return this.dealsService.update(user.workspaceId, id, { stage });
  }

  @Mutation(() => Boolean)
  async deleteDeal(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.permissions.assert(
      user,
      Permission.DEAL_DELETE,
      'Geschäfte zu löschen',
    );

    return this.dealsService.remove(user.workspaceId, id, user.userId);
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
