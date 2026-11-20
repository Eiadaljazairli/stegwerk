import { UseGuards } from '@nestjs/common';
import { Args, Query, Mutation, Resolver } from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import {
  CsvInspection,
  ImportEntity,
  ImportableField,
  ImportInput,
  ImportReport,
  InspectCsvInput,
} from './dto/import.dto';
import { ImportService } from './import.service';

const IMPORTRECHT: Partial<Record<ImportEntity, [Permission, string]>> = {
  [ImportEntity.COMPANY]: [Permission.COMPANY_WRITE, 'Firmen zu importieren'],
  [ImportEntity.CONTACT]: [Permission.CONTACT_WRITE, 'Kontakte zu importieren'],
  [ImportEntity.DEAL]: [Permission.DEAL_WRITE, 'Geschäfte zu importieren'],
  [ImportEntity.TASK]: [Permission.TASK_WRITE, 'Aufgaben zu importieren'],
};

const NOTIZ_VERWEISRECHT: Record<string, Permission> = {
  companyRef: Permission.COMPANY_WRITE,
  contactRef: Permission.CONTACT_WRITE,
  dealRef: Permission.DEAL_WRITE,
};

@Resolver()
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class ImportResolver {
  constructor(
    private readonly importService: ImportService,
    private readonly permissions: PermissionsService,
  ) {}

  @Query(() => [ImportableField])
  importableFields(
    @CurrentUser() user: RequestUser,
    @Args('entity', { type: () => ImportEntity }) entity: ImportEntity,
  ): Promise<ImportableField[]> {
    return this.importService.felder(user.workspaceId, entity);
  }

  @Mutation(() => CsvInspection)
  inspectCsv(@Args('input') input: InspectCsvInput): CsvInspection {
    return this.importService.inspect(input.csv, input.kopfzeile ?? 0);
  }

  @Mutation(() => ImportReport)
  async importRecords(
    @CurrentUser() user: RequestUser,
    @Args('input') input: ImportInput,
  ): Promise<ImportReport> {
    const recht = IMPORTRECHT[input.entity];

    if (recht !== undefined) {
      await this.permissions.assert(user, recht[0], recht[1]);
    } else if (input.entity === ImportEntity.PRODUCT) {
      await this.permissions.assertAny(
        user,
        [Permission.QUOTE_WRITE, Permission.INVOICE_WRITE],
        'den Artikelstamm zu ändern',
      );
    } else {
      const verweise = input.mapping
        .map(({ field }) => NOTIZ_VERWEISRECHT[field])
        .filter((eintrag) => eintrag !== undefined);

      for (const verweis of verweise) {
        await this.permissions.assert(user, verweis, 'Notizen zu importieren');
      }
    }

    return this.importService.run(
      user.workspaceId,
      input,
      user.apiKey === undefined ? user.userId : undefined,
    );
  }
}
