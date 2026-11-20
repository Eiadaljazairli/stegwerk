import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  type DeepPartial,
  type FindOptionsOrder,
  type FindOptionsRelations,
  Repository,
  type SelectQueryBuilder,
} from 'typeorm';

import { type AufgabenStatus } from './aufgaben-status';
import { TaskEntity } from './entities/task.entity';
import { CustomFieldEntity } from '../custom-fields/custom-field.types';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import {
  webhookDaten,
  WorkspaceScopedService,
} from './workspace-scoped.service';
import { type Verweise } from '../workspaces/verweise';
import {
  assertMehrfachZielSchreibbar,
  assertNeueZieleSchreibbar,
  assertUnsichtbareZieleUnveraendert,
  aufgabenBedingung,
  istIch,
  mehrfachZielSichtbar,
  neueZiele,
  type Ziel,
} from '../workspaces/ziel-sichtbarkeit';

export type TaskTarget = {
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
};

const UHRZEIT_OHNE_DATUM = 'Eine Uhrzeit braucht ein Fälligkeitsdatum.';

const mitUhrzeit = (input: DeepPartial<TaskEntity>): boolean =>
  typeof input.dueTime === 'string' && input.dueTime !== '';

const mitDatum = (datum: unknown): boolean =>
  datum !== null && datum !== undefined && datum !== '';

const UEBERFAELLIG_SQL = `(record.dueDate < (now() AT TIME ZONE 'Europe/Berlin')::date
  OR (record.dueDate = (now() AT TIME ZONE 'Europe/Berlin')::date
      AND record.dueTime IS NOT NULL
      AND record.dueTime < to_char(now() AT TIME ZONE 'Europe/Berlin', 'HH24:MI')))`;

@Injectable()
export class TasksService extends WorkspaceScopedService<TaskEntity> {
  constructor(
    @InjectRepository(TaskEntity) repository: Repository<TaskEntity>,
    customFieldsService: CustomFieldsService,
  ) {
    super(repository, 'Aufgabe', customFieldsService, CustomFieldEntity.TASK);
  }

  protected override relations(): FindOptionsRelations<TaskEntity> {
    return { company: true, contact: true, deal: true };
  }

  protected override verweise(input: DeepPartial<TaskEntity>): Verweise {
    return {
      companyId: input.companyId,
      contactId: input.contactId,
      dealId: input.dealId,
      userIds: [input.assigneeId],
    };
  }

  protected override sichtbarkeitsFilter(alias: string) {
    return aufgabenBedingung(alias);
  }

  protected override sichtbar(record: TaskEntity): Promise<boolean> {
    return mehrfachZielSichtbar(
      this.repository.manager,
      record,
      record.assigneeId,
    );
  }

  protected override async assertSchreibbar(record: TaskEntity): Promise<void> {
    if (await istIch(record.assigneeId)) {
      return;
    }

    await assertMehrfachZielSchreibbar(this.repository.manager, record);
  }

  override async create(
    workspaceId: string,
    input: DeepPartial<TaskEntity>,
  ): Promise<TaskEntity> {
    if (mitUhrzeit(input) && !mitDatum(input.dueDate)) {
      throw new BadRequestException(UHRZEIT_OHNE_DATUM);
    }

    await assertNeueZieleSchreibbar(this.repository.manager, input as Ziel);

    return super.create(workspaceId, input);
  }

  override async update(
    workspaceId: string,
    id: string,
    input: DeepPartial<TaskEntity>,
  ): Promise<TaskEntity> {
    if (
      mitUhrzeit(input) &&
      (input.dueDate === undefined
        ? !mitDatum((await this.findOne(workspaceId, id)).dueDate)
        : !mitDatum(input.dueDate))
    ) {
      throw new BadRequestException(UHRZEIT_OHNE_DATUM);
    }

    if (
      [input.companyId, input.contactId, input.dealId].some(
        (ziel) => ziel !== undefined,
      )
    ) {
      const vorher = await this.findOne(workspaceId, id);

      await assertUnsichtbareZieleUnveraendert(
        this.repository.manager,
        vorher,
        input as Ziel,
      );
      await assertNeueZieleSchreibbar(
        this.repository.manager,
        neueZiele(input as Ziel, vorher),
      );
    }

    return super.update(workspaceId, id, input);
  }

  protected override vorDemSpeichern(
    _workspaceId: string,
    record: TaskEntity,
  ): Promise<void> {
    if (record.dueDate === null || record.dueDate === undefined) {
      record.dueTime = null;
    }

    return Promise.resolve();
  }

  protected defaultOrder(): FindOptionsOrder<TaskEntity> {
    return { dueDate: 'ASC' };
  }

  protected searchableColumns(): string[] {
    return ['title', 'description'];
  }

  protected sortableColumns(): string[] {
    return ['title', 'dueDate', 'completedAt', 'createdAt'];
  }

  protected override applyFilters(
    queryBuilder: SelectQueryBuilder<TaskEntity>,
    filters: Record<string, unknown>,
  ): void {
    if (typeof filters.assigneeId === 'string') {
      queryBuilder.andWhere('record.assigneeId = :assigneeId', {
        assigneeId: filters.assigneeId,
      });
    }

    if (typeof filters.completed === 'boolean') {
      queryBuilder.andWhere(
        filters.completed
          ? 'record.completedAt IS NOT NULL'
          : 'record.completedAt IS NULL',
      );
    }

    if (filters.overdue === true) {
      queryBuilder
        .andWhere('record.completedAt IS NULL')
        .andWhere('record.dueDate IS NOT NULL')
        .andWhere(UEBERFAELLIG_SQL);
    }

    if (filters.status === 'erledigt') {
      queryBuilder.andWhere('record.completedAt IS NOT NULL');
    } else if (filters.status === 'in_arbeit') {
      queryBuilder
        .andWhere('record.completedAt IS NULL')
        .andWhere('record.inArbeitSeit IS NOT NULL');
    } else if (filters.status === 'offen') {
      queryBuilder
        .andWhere('record.completedAt IS NULL')
        .andWhere('record.inArbeitSeit IS NULL');
    }

    for (const key of ['companyId', 'contactId', 'dealId'] as const) {
      if (typeof filters[key] === 'string') {
        queryBuilder.andWhere(`record.${key} = :${key}`, {
          [key]: filters[key],
        });
      }
    }
  }

  async createForTarget(
    workspaceId: string,
    createdById: string,
    input: Partial<TaskEntity> & { title: string },
    target: TaskTarget,
  ): Promise<TaskEntity> {
    const created = await this.create(workspaceId, {
      ...input,
      createdById,
      assigneeId: input.assigneeId ?? createdById,
      companyId: target.companyId ?? null,
      contactId: target.contactId ?? null,
      dealId: target.dealId ?? null,
    });

    return this.findOne(workspaceId, created.id);
  }

  async setCompleted(
    workspaceId: string,
    id: string,
    completed: boolean,
  ): Promise<TaskEntity> {
    const task = await this.findOne(workspaceId, id);

    await this.assertSchreibbar(task);

    if (completed && task.completedAt !== null) {
      return task;
    }

    const vorher = webhookDaten(task);

    task.completedAt = completed ? new Date() : null;

    if (!completed) {
      task.inArbeitSeit = null;
    }

    const saved = await this.repository.save(task);

    this.meldeGeaendert(workspaceId, vorher, saved);

    return saved;
  }

  async setStatus(
    workspaceId: string,
    id: string,
    status: AufgabenStatus,
  ): Promise<TaskEntity> {
    if (status === 'erledigt') {
      return this.setCompleted(workspaceId, id, true);
    }

    const task = await this.findOne(workspaceId, id);

    await this.assertSchreibbar(task);

    const vorher = webhookDaten(task);

    task.completedAt = null;
    task.inArbeitSeit =
      status === 'in_arbeit' ? (task.inArbeitSeit ?? new Date()) : null;

    const saved = await this.repository.save(task);

    this.meldeGeaendert(workspaceId, vorher, saved);

    return saved;
  }

  findOpenForUser(
    workspaceId: string,
    assigneeId: string,
    limit = 10,
  ): Promise<TaskEntity[]> {
    return this.repository
      .createQueryBuilder('record')
      .leftJoinAndSelect('record.company', 'company')
      .leftJoinAndSelect('record.contact', 'contact')
      .leftJoinAndSelect('record.deal', 'deal')
      .where('record.workspaceId = :workspaceId', { workspaceId })
      .andWhere('record.assigneeId = :assigneeId', { assigneeId })
      .andWhere('record.completedAt IS NULL')
      .orderBy('record.dueDate', 'ASC', 'NULLS LAST')
      .addOrderBy('record.dueTime', 'ASC', 'NULLS LAST')
      .addOrderBy('record.createdAt', 'ASC')
      .take(limit)
      .getMany();
  }

  countOpenForUser(workspaceId: string, assigneeId: string): Promise<number> {
    return this.repository
      .createQueryBuilder('record')
      .where('record.workspaceId = :workspaceId', { workspaceId })
      .andWhere('record.assigneeId = :assigneeId', { assigneeId })
      .andWhere('record.completedAt IS NULL')
      .getCount();
  }

  countOverdueForUser(
    workspaceId: string,
    assigneeId: string,
  ): Promise<number> {
    return this.repository
      .createQueryBuilder('record')
      .where('record.workspaceId = :workspaceId', { workspaceId })
      .andWhere('record.assigneeId = :assigneeId', { assigneeId })
      .andWhere('record.completedAt IS NULL')
      .andWhere('record.dueDate IS NOT NULL')
      .andWhere(UEBERFAELLIG_SQL)
      .getCount();
  }

  async fuerKontakteDerFirma(
    workspaceId: string,
    companyId: string,
  ): Promise<TaskEntity[]> {
    const abfrage = this.repository
      .createQueryBuilder('record')
      .leftJoinAndSelect('record.contact', 'aufgabeKontakt')
      .where('record.workspaceId = :workspaceId', { workspaceId })
      .andWhere(
        `record."contactId" IN (SELECT kontakt."id" FROM "contacts" kontakt
            WHERE kontakt."workspaceId" = :workspaceId
              AND kontakt."companyId" = :companyId
              AND kontakt."deletedAt" IS NULL)`,
        { companyId },
      )
      .andWhere('record."companyId" IS DISTINCT FROM :companyId', { companyId })
      .orderBy('record.completedAt', 'ASC', 'NULLS FIRST')
      .addOrderBy('record.dueDate', 'ASC', 'NULLS LAST')
      .take(100);

    return (await this.nurSichtbare(abfrage, 'record')).getMany();
  }

  findForRecord(
    workspaceId: string,
    column: 'companyId' | 'contactId' | 'dealId',
    recordId: string,
  ): Promise<TaskEntity[]> {
    return this.repository
      .createQueryBuilder('record')
      .where('record.workspaceId = :workspaceId', { workspaceId })
      .andWhere(`record.${column} = :recordId`, { recordId })
      .orderBy('record.completedAt', 'ASC', 'NULLS FIRST')
      .addOrderBy('record.dueDate', 'ASC', 'NULLS LAST')
      .getMany();
  }
}
