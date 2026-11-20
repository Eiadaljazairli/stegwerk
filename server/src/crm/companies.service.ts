import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  type DeepPartial,
  type FindOptionsOrder,
  type FindOptionsRelations,
  Repository,
  type SelectQueryBuilder,
} from 'typeorm';

import { CompanyEntity } from './entities/company.entity';
import { bereinigeZweitdomains, domainVon } from './domains';
import { normalisiereEmail, normalisiereTelefonOderNull } from './kontaktwege';
import { httpsOderNull } from './links';
import { CustomFieldEntity } from '../custom-fields/custom-field.types';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { WorkspaceScopedService } from './workspace-scoped.service';
import { type Verweise } from '../workspaces/verweise';
import { sichtbareAkte, zielSichtbar } from '../workspaces/ziel-sichtbarkeit';

@Injectable()
export class CompaniesService extends WorkspaceScopedService<CompanyEntity> {
  constructor(
    @InjectRepository(CompanyEntity) repository: Repository<CompanyEntity>,
    customFieldsService: CustomFieldsService,
  ) {
    super(repository, 'Firma', customFieldsService, CustomFieldEntity.COMPANY);
  }

  protected override relations(): FindOptionsRelations<CompanyEntity> {
    return { owner: true };
  }

  protected override verweise(input: DeepPartial<CompanyEntity>): Verweise {
    return {
      userIds: [input.ownerId],
      companyId: input.parentCompanyId as string | null | undefined,
    };
  }

  protected override async vorDemSpeichern(
    workspaceId: string,
    record: CompanyEntity,
  ): Promise<void> {
    if (
      record.parentCompanyId !== undefined &&
      record.parentCompanyId !== null
    ) {
      await this.pruefeMutter(workspaceId, record);
    }

    if (record.domain !== undefined) {
      record.domain = domainVon(record.domain);
    }

    record.zweitdomains = bereinigeZweitdomains(
      record.zweitdomains ?? [],
      record.domain,
    );

    if (record.website !== undefined) {
      record.website = httpsOderNull(record.website, 'Die Website');
    }

    if (record.linkedin !== undefined) {
      record.linkedin = httpsOderNull(record.linkedin, 'Das LinkedIn-Profil');
    }

    if (record.phone !== undefined) {
      record.phone = normalisiereTelefonOderNull(record.phone);
    }

    if (typeof record.email === 'string') {
      record.email = normalisiereEmail(record.email) || null;
    }

    if (typeof record.ustIdNr === 'string') {
      record.ustIdNr =
        record.ustIdNr.replace(/\s+/gu, '').toUpperCase() || null;
    }
  }

  private async pruefeMutter(
    workspaceId: string,
    record: CompanyEntity,
  ): Promise<void> {
    const mutterId = record.parentCompanyId as string;

    if (record.id !== undefined) {
      const vorher = await this.repo.findOne({
        where: { id: record.id, workspaceId },
        select: { id: true, parentCompanyId: true },
        withDeleted: true,
      });

      if (vorher?.parentCompanyId === mutterId) {
        return;
      }
    }

    if (mutterId === record.id) {
      throw new BadRequestException(
        'Eine Firma kann nicht ihre eigene Muttergesellschaft sein.',
      );
    }

    if (!(await zielSichtbar(this.repo.manager, { companyId: mutterId }))) {
      throw new BadRequestException(
        'Diese Firma gibt es in diesem Arbeitsbereich nicht.',
      );
    }

    if (record.id === undefined) {
      return;
    }

    const kreis: unknown[] = await this.repo.query(
      `WITH RECURSIVE kette AS (
         SELECT "id", "parentCompanyId", 1 AS tiefe
           FROM "companies"
          WHERE "id" = $1 AND "workspaceId" = $2
         UNION ALL
         SELECT firma."id", firma."parentCompanyId", kette.tiefe + 1
           FROM "companies" firma
           JOIN kette ON firma."id" = kette."parentCompanyId"
          WHERE firma."workspaceId" = $2 AND kette.tiefe < 100
       )
       SELECT 1 FROM kette WHERE "id" = $3 LIMIT 1`,
      [mutterId, workspaceId, record.id],
    );

    if (kreis.length > 0) {
      throw new BadRequestException(
        'Diese Firma gehört schon zum Konzern dieser Firma; als Mutter entstünde ein Kreis.',
      );
    }
  }

  async mutterfirma(
    workspaceId: string,
    firma: CompanyEntity,
  ): Promise<CompanyEntity | null> {
    if (firma.parentCompanyId === null || firma.parentCompanyId === undefined) {
      return null;
    }

    return sichtbareAkte(
      'company',
      await this.repository.findOne({
        where: { id: firma.parentCompanyId, workspaceId },
      }),
    );
  }

  async tochterfirmen(
    workspaceId: string,
    id: string,
  ): Promise<CompanyEntity[]> {
    const abfrage = this.repository
      .createQueryBuilder('company')
      .where('company.workspaceId = :workspaceId', { workspaceId })
      .andWhere('company.parentCompanyId = :id', { id })
      .orderBy('company.name', 'ASC');

    return (await this.nurSichtbare(abfrage, 'company')).getMany();
  }

  protected defaultOrder(): FindOptionsOrder<CompanyEntity> {
    return { name: 'ASC' };
  }

  protected searchableColumns(): string[] {
    return ['name', 'domain', 'zweitdomains', 'industry', 'city', 'country'];
  }

  protected override gruppierbareSpalten(): string[] {
    return ['industry', 'city', 'country', 'ownerId'];
  }

  protected override gruppenSumme(): { spalte: string } {
    return { spalte: 'annualRevenue' };
  }

  protected sortableColumns(): string[] {
    return [
      'name',
      'industry',
      'city',
      'country',
      'employeeCount',
      'annualRevenue',
      'createdAt',
    ];
  }

  protected override applyFilters(
    queryBuilder: SelectQueryBuilder<CompanyEntity>,
    filters: Record<string, unknown>,
  ): void {
    if (typeof filters.industry === 'string') {
      queryBuilder.andWhere('record.industry = :industry', {
        industry: filters.industry,
      });
    }

    if (typeof filters.country === 'string') {
      queryBuilder.andWhere('record.country = :country', {
        country: filters.country,
      });
    }
  }

  async distinctIndustries(workspaceId: string): Promise<string[]> {
    const rows = await this.repository
      .createQueryBuilder('record')
      .select('DISTINCT record.industry', 'industry')
      .where('record.workspaceId = :workspaceId', { workspaceId })
      .andWhere('record.industry IS NOT NULL')
      .orderBy('industry', 'ASC')
      .getRawMany<{ industry: string }>();

    return rows.map((row) => row.industry);
  }
}
