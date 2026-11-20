import { UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  InputType,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { IsBoolean, IsOptional, MaxLength } from 'class-validator';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { WebFormEntity } from './web-form.entity';
import { WebFormsService } from './web-forms.service';

@InputType()
export class WebFormInput {
  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(120)
  title?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(500)
  intro?: string | null;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(500)
  thankYou?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(500)
  privacyUrl?: string | null;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  createDeal?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

@Resolver(() => WebFormEntity)
@UseGuards(GqlAuthGuard)
export class WebFormsResolver {
  constructor(
    private readonly forms: WebFormsService,
    private readonly permissions: PermissionsService,
  ) {}

  @Query(() => WebFormEntity, { nullable: true })
  async webForm(
    @CurrentUser() user: RequestUser,
  ): Promise<WebFormEntity | null> {
    await this.permissions.assert(
      user,
      Permission.FIELD_MANAGE,
      'das Webformular einzurichten',
    );

    return this.forms.get(user.workspaceId);
  }

  @Mutation(() => WebFormEntity)
  @UseGuards(BillingWriteGuard)
  async saveWebForm(
    @CurrentUser() user: RequestUser,
    @Args('input') input: WebFormInput,
  ): Promise<WebFormEntity> {
    await this.permissions.assert(
      user,
      Permission.FIELD_MANAGE,
      'das Webformular einzurichten',
    );

    return this.forms.save(user.workspaceId, user.userId, input);
  }
}
