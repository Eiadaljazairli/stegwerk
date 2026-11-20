import { BadRequestException, UseGuards } from '@nestjs/common';
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
import { ApiKeyEntity } from '../api-keys/api-key.entity';
import { UserEntity } from '../users/user.entity';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import {
  AUFGABEN_STATUS,
  type AufgabenStatus,
  istUeberfaellig,
  statusVon,
} from './aufgaben-status';
import { TaskPage } from './dto/page.dto';
import { CreateTaskInput, TaskListArgs, UpdateTaskInput } from './dto/task.dto';
import { TaskEntity } from './entities/task.entity';
import { TasksService } from './tasks.service';
import { BenachrichtigungenService } from './benachrichtigungen.service';
import { CompanyEntity } from './entities/company.entity';
import { ContactEntity } from './entities/contact.entity';
import { DealEntity } from './entities/deal.entity';
import { sichtbareAkte } from '../workspaces/ziel-sichtbarkeit';

@Resolver(() => TaskEntity)
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class TasksResolver {
  constructor(
    private readonly tasksService: TasksService,
    private readonly permissions: PermissionsService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly benachrichtigungen: BenachrichtigungenService,
  ) {}

  @ResolveField(() => String)
  async assigneeName(@Parent() task: TaskEntity): Promise<string> {
    const assignee = await this.userRepository.findOne({
      where: { id: task.assigneeId },
    });

    if (assignee === null) {
      return 'Unbekannt';
    }

    return `${assignee.firstName} ${assignee.lastName}`;
  }

  @ResolveField(() => Boolean)
  isOverdue(@Parent() task: TaskEntity): boolean {
    return istUeberfaellig(task);
  }

  @ResolveField(() => String)
  status(@Parent() task: TaskEntity): AufgabenStatus {
    return statusVon(task);
  }

  @ResolveField('company', () => CompanyEntity, { nullable: true })
  company(@Parent() eintrag: TaskEntity): Promise<CompanyEntity | null> {
    return sichtbareAkte('company', eintrag.company);
  }

  @ResolveField('contact', () => ContactEntity, { nullable: true })
  contact(@Parent() eintrag: TaskEntity): Promise<ContactEntity | null> {
    return sichtbareAkte('contact', eintrag.contact);
  }

  @ResolveField('deal', () => DealEntity, { nullable: true })
  deal(@Parent() eintrag: TaskEntity): Promise<DealEntity | null> {
    return sichtbareAkte('deal', eintrag.deal);
  }

  @Query(() => TaskPage)
  async tasks(
    @CurrentUser() user: RequestUser,
    @Args() args: TaskListArgs,
  ): Promise<TaskPage> {
    await this.assert(user, Permission.TASK_VIEW, 'Aufgaben zu sehen');

    return this.tasksService.list(user.workspaceId, args, {
      assigneeId: args.assigneeId,
      completed: args.completed,
      overdue: args.overdue,
      status: args.status,
      companyId: args.companyId,
      contactId: args.contactId,
      dealId: args.dealId,
    });
  }

  @Query(() => TaskEntity)
  async task(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<TaskEntity> {
    await this.assert(user, Permission.TASK_VIEW, 'Aufgaben zu sehen');

    return this.tasksService.findOne(user.workspaceId, id);
  }

  @Query(() => [TaskEntity])
  async myOpenTasks(
    @CurrentUser() user: RequestUser,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<TaskEntity[]> {
    const darf = await this.permissions.can(user, Permission.TASK_VIEW);

    if (!darf) {
      return [];
    }

    return this.tasksService.findOpenForUser(
      user.workspaceId,
      user.userId,
      limit,
    );
  }

  @Mutation(() => TaskEntity)
  async createTask(
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateTaskInput,
  ): Promise<TaskEntity> {
    await this.assert(user, Permission.TASK_WRITE, 'Aufgaben anzulegen');

    const task = await this.tasksService.createForTarget(
      user.workspaceId,
      user.userId,
      {
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate ?? null,
        dueTime: input.dueTime ?? null,
        assigneeId: input.assigneeId ?? (await this.fuerSchluessel(user)),
      },
      input,
    );

    await this.benachrichtigungen.nachDemSpeichernVon(
      user,
      { taskId: task.id },
      null,
      task.description,
    );

    return task;
  }

  @Mutation(() => TaskEntity)
  async updateTask(
    @CurrentUser() user: RequestUser,
    @Args('input') input: UpdateTaskInput,
  ): Promise<TaskEntity> {
    await this.assert(user, Permission.TASK_WRITE, 'Aufgaben zu ändern');

    const vorher =
      input.description === undefined
        ? null
        : (await this.tasksService.findOne(user.workspaceId, input.id))
            .description;
    const task = await this.tasksService.update(
      user.workspaceId,
      input.id,
      input,
    );

    if (input.description !== undefined) {
      await this.benachrichtigungen.nachDemSpeichernVon(
        user,
        { taskId: task.id },
        vorher,
        task.description,
      );
    }

    return task;
  }

  @Mutation(() => TaskEntity)
  async setTaskCompleted(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('completed') completed: boolean,
  ): Promise<TaskEntity> {
    await this.assert(user, Permission.TASK_WRITE, 'Aufgaben abzuhaken');

    return this.tasksService.setCompleted(user.workspaceId, id, completed);
  }

  @Mutation(() => TaskEntity)
  async setTaskStatus(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('status') status: string,
  ): Promise<TaskEntity> {
    await this.assert(user, Permission.TASK_WRITE, 'Aufgaben zu ändern');

    if (!(AUFGABEN_STATUS as readonly string[]).includes(status)) {
      throw new BadRequestException(
        'Der Status ist offen, in_arbeit oder erledigt.',
      );
    }

    return this.tasksService.setStatus(
      user.workspaceId,
      id,
      status as AufgabenStatus,
    );
  }

  @Mutation(() => Boolean)
  async deleteTask(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.assert(user, Permission.TASK_WRITE, 'Aufgaben zu löschen');

    return this.tasksService.remove(user.workspaceId, id, user.userId);
  }

  private assert(
    user: RequestUser,
    permission: Permission,
    what: string,
  ): Promise<void> {
    return this.permissions.assert(user, permission, what);
  }

  private async fuerSchluessel(user: RequestUser): Promise<string | undefined> {
    if (user.apiKey === undefined) {
      return undefined;
    }

    const schluessel = await this.userRepository.manager.findOne(ApiKeyEntity, {
      where: { id: user.apiKey.id, workspaceId: user.workspaceId },
    });

    if (schluessel?.createdById == null) {
      throw new BadRequestException(
        'Bitte „assigneeId“ angeben: dieser Schlüssel hat niemanden, dem die Aufgabe sonst zufällt.',
      );
    }

    return schluessel.createdById;
  }
}
