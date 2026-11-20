import { UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  Float,
  Int,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { CompaniesService } from './companies.service';
import { ContactsService } from './contacts.service';
import { DealsService } from './deals.service';
import { CompanyEntity } from './entities/company.entity';
import { ContactEntity } from './entities/contact.entity';
import { DealEntity } from './entities/deal.entity';

@ObjectType('SuchTreffer')
export class SuchTrefferView {
  @Field(() => String)
  art: 'firma' | 'kontakt' | 'geschaeft';

  @Field(() => Float)
  rang: number;

  @Field(() => CompanyEntity, { nullable: true })
  firma?: CompanyEntity;

  @Field(() => ContactEntity, { nullable: true })
  kontakt?: ContactEntity;

  @Field(() => DealEntity, { nullable: true })
  geschaeft?: DealEntity;
}

const MAX_TREFFER = 20;

@Resolver()
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class SucheResolver {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly companies: CompaniesService,
    private readonly contacts: ContactsService,
    private readonly deals: DealsService,
  ) {}

  @Query(() => [SuchTrefferView])
  async suche(
    @CurrentUser() user: RequestUser,
    @Args('text') text: string,
    @Args('limit', { type: () => Int, defaultValue: 10 }) limit: number,
  ): Promise<SuchTrefferView[]> {
    const begriff = text.trim().slice(0, 200);
    const anzahl = Math.min(Math.max(limit, 1), MAX_TREFFER);

    if (begriff.length < 2) {
      return [];
    }

    const [firmen, kontakte, geschaefte] = await Promise.all([
      this.permissions
        .can(user, Permission.COMPANY_VIEW)
        .then((darf) =>
          darf
            ? this.companies.rangSuche(user.workspaceId, begriff, anzahl)
            : [],
        ),
      this.permissions
        .can(user, Permission.CONTACT_VIEW)
        .then((darf) =>
          darf
            ? this.contacts.rangSuche(user.workspaceId, begriff, anzahl)
            : [],
        ),
      this.permissions
        .can(user, Permission.DEAL_VIEW)
        .then((darf) =>
          darf ? this.deals.rangSuche(user.workspaceId, begriff, anzahl) : [],
        ),
    ]);

    return [
      ...firmen.map(({ eintrag, rang }) => ({
        art: 'firma' as const,
        rang,
        firma: eintrag,
      })),
      ...kontakte.map(({ eintrag, rang }) => ({
        art: 'kontakt' as const,
        rang,
        kontakt: eintrag,
      })),
      ...geschaefte.map(({ eintrag, rang }) => ({
        art: 'geschaeft' as const,
        rang,
        geschaeft: eintrag,
      })),
    ]
      .sort((a, b) => b.rang - a.rang)
      .slice(0, anzahl);
  }
}
