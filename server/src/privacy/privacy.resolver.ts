import { UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { NurMenschWache } from '../api-keys/api-key.guard';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import {
  DeleteWorkspaceInput,
  LegalEntityInfo,
  PrivacyFactsInfo,
} from './dto/privacy.dto';
import { privacyFacts } from './privacy-facts';
import { PrivacyService } from './privacy.service';

@Resolver()
export class PrivacyResolver {
  constructor(
    private readonly privacyService: PrivacyService,
    private readonly configService: ConfigService,
  ) {}

  @Query(() => LegalEntityInfo)
  legalEntity(): LegalEntityInfo {
    const legal = this.configService.get<Record<string, string>>('legal') ?? {};
    const value = (key: string): string | null =>
      legal[key] === undefined || legal[key] === '' ? null : legal[key];

    return {
      configured: value('companyName') !== null,
      companyName: value('companyName'),
      legalForm: value('legalForm'),
      street: value('street'),
      postalCode: value('postalCode'),
      city: value('city'),
      country: value('country'),
      email: value('email'),
      phone: value('phone'),
      representative: value('representative'),
      registerEntry: value('registerEntry'),
      vatId: value('vatId'),
    };
  }

  @Query(() => PrivacyFactsInfo)
  privacyFacts(): PrivacyFactsInfo {
    return privacyFacts(process.env);
  }

  @Query(() => String)
  @UseGuards(GqlAuthGuard, NurMenschWache)
  async exportWorkspaceData(@CurrentUser() user: RequestUser): Promise<string> {
    const data = await this.privacyService.exportWorkspace(
      user.userId,
      user.workspaceId,
    );

    return JSON.stringify(data, null, 2);
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard, NurMenschWache)
  deleteWorkspace(
    @CurrentUser() user: RequestUser,
    @Args('input') input: DeleteWorkspaceInput,
  ): Promise<boolean> {
    return this.privacyService.deleteWorkspace(
      user.userId,
      user.workspaceId,
      input.confirmationName,
      input.password,
    );
  }
}
