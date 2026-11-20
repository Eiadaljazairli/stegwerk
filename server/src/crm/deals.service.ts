import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  type DeepPartial,
  type FindOptionsOrder,
  type FindOptionsRelations,
  Repository,
  type SelectQueryBuilder,
} from 'typeorm';

import {
  DealEntity,
  DealStage,
  OPEN_DEAL_STAGES,
} from './entities/deal.entity';
import { CustomFieldEntity } from '../custom-fields/custom-field.types';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import {
  alsRohesSql,
  sichtbarkeitsBedingung,
} from '../workspaces/sichtbarkeit';
import { WorkspaceScopedService } from './workspace-scoped.service';
import { letzteAktivitaetSql } from './aktivitaet';
import { fehlendePflichtfelder } from './pflicht-ab-phase';
import { type Verweise } from '../workspaces/verweise';
import {
  phasenFuer,
  pipelineBedingung,
  pipelineImBereich,
  standardPipeline,
} from './pipelines';

export type PipelineStageSummary = {
  stage: DealStage;
  dealCount: number;
  totalAmount: number;
};

@Injectable()
export class DealsService extends WorkspaceScopedService<DealEntity> {
  constructor(
    @InjectRepository(DealEntity) repository: Repository<DealEntity>,
    private readonly felder: CustomFieldsService,
  ) {
    super(repository, 'Geschäft', felder, CustomFieldEntity.DEAL);
  }

  protected override async vorDemSpeichern(
    workspaceId: string,
    deal: DealEntity,
    phaseVorher: unknown,
  ): Promise<void> {
    await this.pruefePipeline(workspaceId, deal, phaseVorher);

    if (deal.stage === phaseVorher || deal.stage === DealStage.LOST) {
      return;
    }

    const fehlend = fehlendePflichtfelder(
      await this.felder.list(workspaceId, CustomFieldEntity.DEAL),
      deal.stage,
      deal.customFields,
    );

    if (fehlend.length > 0) {
      throw new BadRequestException(
        `Für diese Phase fehlt noch: ${fehlend.join(', ')}.`,
      );
    }
  }

  private async pruefePipeline(
    workspaceId: string,
    deal: DealEntity,
    phaseVorher: unknown,
  ): Promise<void> {
    const manager = this.repo.manager;
    const neu = phaseVorher === undefined;

    if (deal.pipelineId !== null && deal.pipelineId !== undefined) {
      await pipelineImBereich(manager, workspaceId, deal.pipelineId);
    } else if (neu) {
      deal.pipelineId = (await standardPipeline(manager, workspaceId)).id;
    }

    const vorher = neu
      ? undefined
      : await this.repo.findOne({
          where: { id: deal.id, workspaceId },
          select: { id: true, pipelineId: true },
          withDeleted: true,
        });
    const pipelineGewechselt =
      vorher !== undefined &&
      vorher !== null &&
      (vorher.pipelineId ?? null) !== (deal.pipelineId ?? null);

    if (!neu && deal.stage === phaseVorher && !pipelineGewechselt) {
      return;
    }

    const stufe = deal.stage ?? DealStage.LEAD;
    const phasen = await phasenFuer(manager, workspaceId, deal.pipelineId);
    const phase = phasen.find((eintrag) => eintrag.stage === stufe);

    if (neu && phase?.ausgeblendet === true && stufe === DealStage.LEAD) {
      deal.stage =
        phasen.find((eintrag) => !eintrag.ausgeblendet)?.stage ??
        DealStage.LEAD;

      return;
    }

    if (phase?.ausgeblendet === true) {
      throw new BadRequestException(
        `Die Phase „${phase.label}“ ist in dieser Pipeline ausgeblendet.`,
      );
    }
  }

  protected override relations(): FindOptionsRelations<DealEntity> {
    return { company: true, primaryContact: true, owner: true };
  }

  protected override verweise(input: DeepPartial<DealEntity>): Verweise {
    return {
      companyId: input.companyId,
      contactId: input.primaryContactId,
      userIds: [input.ownerId],
    };
  }

  protected defaultOrder(): FindOptionsOrder<DealEntity> {
    return { createdAt: 'DESC' };
  }

  protected searchableColumns(): string[] {
    return ['name'];
  }

  protected override gruppierbareSpalten(): string[] {
    return ['stage', 'ownerId', 'companyId', 'currency', 'lostReason'];
  }

  protected override gruppenSumme(): { spalte: string; je: string } {
    return { spalte: 'amount', je: 'currency' };
  }

  protected sortableColumns(): string[] {
    return ['name', 'amount', 'stage', 'closeDate', 'createdAt'];
  }

  protected override filterFelder(): Record<string, string> {
    return { minAmount: 'amount' };
  }

  protected override applyFilters(
    queryBuilder: SelectQueryBuilder<DealEntity>,
    filters: Record<string, unknown>,
  ): void {
    if (typeof filters.stage === 'string') {
      queryBuilder.andWhere('record.stage = :stage', { stage: filters.stage });
    }

    if (typeof filters.companyId === 'string') {
      queryBuilder.andWhere('record.companyId = :companyId', {
        companyId: filters.companyId,
      });
    }

    if (filters.openOnly === true) {
      queryBuilder.andWhere('record.stage IN (:...openStages)', {
        openStages: OPEN_DEAL_STAGES,
      });
    }

    if (typeof filters.minAmount === 'number') {
      queryBuilder.andWhere('record.amount >= :minAmount', {
        minAmount: filters.minAmount,
      });
    }

    if (typeof filters.ruhendTage === 'number') {
      queryBuilder
        .andWhere('record.stage IN (:...ruhendOffen)', {
          ruhendOffen: OPEN_DEAL_STAGES,
        })
        .andWhere(
          `${letzteAktivitaetSql('record')} < now() - make_interval(days => :ruhendTage)`,
          { ruhendTage: filters.ruhendTage },
        );
    }

    if (typeof filters.pipelineId === 'string') {
      queryBuilder.andWhere(pipelineBedingung('record', ':pipelineId'), {
        pipelineId: filters.pipelineId,
      });
    }

    if (typeof filters.closeBefore === 'string') {
      queryBuilder.andWhere('record.closeDate <= :closeBefore', {
        closeBefore: filters.closeBefore,
      });
    }
  }

  async beteiligteAlsText(
    workspaceId: string,
    dealIds: string[],
  ): Promise<Map<string, string>> {
    if (dealIds.length === 0) {
      return new Map();
    }

    const bedingung = await sichtbarkeitsBedingung('contact', 'kontakt');
    const parameter: unknown[] = [workspaceId, dealIds];
    let zusatz = '';

    if (bedingung !== null) {
      const roh = alsRohesSql(bedingung, parameter.length + 1);

      parameter.push(...roh.werte);
      zusatz = ` AND ${roh.sql}`;
    }

    const zeilen = (await this.repository.manager.query(
      `SELECT b."dealId", kontakt."firstName", kontakt."lastName", b."rolle"
         FROM "deal_kontakte" b
         JOIN "contacts" kontakt ON kontakt."id" = b."contactId"
          AND kontakt."deletedAt" IS NULL
         JOIN "deals" g ON g."id" = b."dealId"
          AND b."contactId" IS DISTINCT FROM g."primaryContactId"
        WHERE b."workspaceId" = $1 AND b."dealId" = ANY($2::uuid[])${zusatz}
        ORDER BY b."createdAt"`,
      parameter,
    )) as {
      dealId: string;
      firstName: string;
      lastName: string;
      rolle: string | null;
    }[];

    const text = new Map<string, string>();

    for (const zeile of zeilen) {
      const eintrag = `${zeile.firstName} ${zeile.lastName}`.trim();
      const mit =
        zeile.rolle === null ? eintrag : `${eintrag} (${zeile.rolle})`;
      const bisher = text.get(zeile.dealId);

      text.set(zeile.dealId, bisher === undefined ? mit : `${bisher}; ${mit}`);
    }

    return text;
  }

  async findByCompany(
    workspaceId: string,
    companyId: string,
  ): Promise<DealEntity[]> {
    const abfrage = this.repository
      .createQueryBuilder('deal')
      .where('deal.workspaceId = :workspaceId', { workspaceId })
      .andWhere('deal.companyId = :companyId', { companyId })
      .orderBy('deal.createdAt', 'DESC');

    return (await this.nurSichtbare(abfrage, 'deal')).getMany();
  }

  async findByContact(
    workspaceId: string,
    primaryContactId: string,
  ): Promise<DealEntity[]> {
    const abfrage = this.repository
      .createQueryBuilder('deal')
      .leftJoinAndSelect('deal.company', 'company')
      .where('deal.workspaceId = :workspaceId', { workspaceId })
      .andWhere(
        `(deal.primaryContactId = :primaryContactId OR EXISTS (
          SELECT 1 FROM "deal_kontakte" beteiligt
           WHERE beteiligt."dealId" = deal.id
             AND beteiligt."contactId" = :primaryContactId))`,
        { primaryContactId },
      )
      .orderBy('deal.createdAt', 'DESC');

    return (await this.nurSichtbare(abfrage, 'deal')).getMany();
  }

  async findByStage(
    workspaceId: string,
    stage: DealStage,
  ): Promise<DealEntity[]> {
    const abfrage = this.repository
      .createQueryBuilder('deal')
      .leftJoinAndSelect('deal.company', 'company')
      .where('deal.workspaceId = :workspaceId', { workspaceId })
      .andWhere('deal.stage = :stage', { stage })
      .orderBy('deal.createdAt', 'DESC');

    return (await this.nurSichtbare(abfrage, 'deal')).getMany();
  }

  async pipelineByStage(
    workspaceId: string,
    pipelineId: string | null = null,
  ): Promise<PipelineStageSummary[]> {
    const abfrage = this.repository
      .createQueryBuilder('deal')
      .select('deal.stage', 'stage')
      .addSelect('COUNT(*)', 'dealCount')
      .addSelect('COALESCE(SUM(deal.amount), 0)', 'totalAmount')
      .where('deal.workspaceId = :workspaceId', { workspaceId });

    if (pipelineId !== null) {
      abfrage.andWhere(pipelineBedingung('deal', ':pipelineId'), {
        pipelineId,
      });
    }

    const rows = await (await this.nurSichtbare(abfrage, 'deal'))
      .groupBy('deal.stage')
      .getRawMany<{
        stage: DealStage;
        dealCount: string;
        totalAmount: string;
      }>();

    const byStage = new Map(rows.map((row) => [row.stage, row]));

    return Object.values(DealStage).map((stage) => {
      const row = byStage.get(stage);

      return {
        stage,
        dealCount: row === undefined ? 0 : Number(row.dealCount),
        totalAmount: row === undefined ? 0 : Number(row.totalAmount),
      };
    });
  }

  async openPipelineValue(workspaceId: string): Promise<number> {
    const abfrage = this.repository
      .createQueryBuilder('deal')
      .select('COALESCE(SUM(deal.amount), 0)', 'total')
      .where('deal.workspaceId = :workspaceId', { workspaceId })
      .andWhere('deal.stage IN (:...stages)', { stages: OPEN_DEAL_STAGES });
    const result = await (
      await this.nurSichtbare(abfrage, 'deal')
    ).getRawOne<{ total: string }>();

    return Number(result?.total ?? 0);
  }

  async letzteAktivitaet(
    workspaceId: string,
    id: string,
  ): Promise<Date | null> {
    const [zeile] = (await this.repository.query(
      `SELECT ${letzteAktivitaetSql('d')} AS "wann" FROM "deals" d WHERE d."id" = $1 AND d."workspaceId" = $2`,
      [id, workspaceId],
    )) as { wann: Date | null }[];

    return zeile?.wann ?? null;
  }

  async anzahlRuhend(
    workspaceId: string,
    tage: number,
    ownerId?: string,
  ): Promise<number> {
    const sicht = await this.sichtbarkeitsSql('d', 5);
    const [zeile] = (await this.repository.query(
      `SELECT count(*)::int AS "anzahl" FROM "deals" d
       WHERE d."workspaceId" = $1 AND d."deletedAt" IS NULL
         AND d."stage" = ANY($2)
         AND ($4::uuid IS NULL OR d."ownerId" = $4)
         AND ${letzteAktivitaetSql('d')} < now() - make_interval(days => $3)${sicht.sql}`,
      [
        workspaceId,
        [...OPEN_DEAL_STAGES],
        tage,
        ownerId ?? null,
        ...sicht.werte,
      ],
    )) as { anzahl: number }[];

    return zeile?.anzahl ?? 0;
  }

  async countOpen(workspaceId: string): Promise<number> {
    const abfrage = this.repository
      .createQueryBuilder('deal')
      .where('deal.workspaceId = :workspaceId', { workspaceId })
      .andWhere('deal.stage IN (:...stages)', { stages: OPEN_DEAL_STAGES });

    return (await this.nurSichtbare(abfrage, 'deal')).getCount();
  }
}
