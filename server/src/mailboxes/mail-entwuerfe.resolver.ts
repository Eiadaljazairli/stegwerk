import { UseGuards } from '@nestjs/common';
import {
  Args,
  Context,
  Field,
  ID,
  InputType,
  Int,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { NurMenschWache } from '../api-keys/api-key.guard';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { GqlThrottlerGuard } from '../auth/guards/gql-throttler.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { MailEntwurfEntity } from './mail-entwurf.entity';
import { MailEntwuerfeService } from './mail-entwuerfe.service';
import { MAX_BETREFF, MAX_EMPFAENGER, MAX_RUMPF } from './outbound-mail';

const ARTEN = ['company', 'contact', 'deal'] as const;

const LESERECHT = {
  company: Permission.COMPANY_VIEW,
  contact: Permission.CONTACT_VIEW,
  deal: Permission.DEAL_VIEW,
} as const;

@InputType()
export class MailEntwurfFelderInput {
  @Field(() => [String])
  @IsArray()
  @ArrayMaxSize(MAX_EMPFAENGER)
  @IsString({ each: true })
  an: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_EMPFAENGER)
  @IsString({ each: true })
  cc?: string[];

  @Field()
  @IsString()
  @MaxLength(MAX_BETREFF)
  betreff: string;

  @Field()
  @IsString()
  @MaxLength(MAX_RUMPF)
  rumpf: string;
}

@InputType()
export class MailEntwurfAnlegenInput {
  @Field(() => String)
  @IsIn([...ARTEN])
  art: (typeof ARTEN)[number];

  @Field(() => ID)
  @IsUUID()
  id: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_EMPFAENGER)
  @IsString({ each: true })
  an?: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_EMPFAENGER)
  @IsString({ each: true })
  cc?: string[];

  @Field()
  @IsString()
  @MaxLength(MAX_BETREFF)
  betreff: string;

  @Field()
  @IsString()
  @MaxLength(MAX_RUMPF)
  rumpf: string;
}

@Resolver(() => MailEntwurfEntity)
@UseGuards(GqlAuthGuard)
export class MailEntwuerfeResolver {
  constructor(
    private readonly entwuerfe: MailEntwuerfeService,
    private readonly permissions: PermissionsService,
  ) {}

  @Query(() => [MailEntwurfEntity])
  @UseGuards(NurMenschWache)
  mailEntwuerfe(
    @CurrentUser() user: RequestUser,
    @Args('auchErledigte', { nullable: true }) auchErledigte?: boolean,
  ): Promise<MailEntwurfEntity[]> {
    return this.entwuerfe.liste(
      user,
      auchErledigte === true
        ? ['entwurf', 'sendet', 'gesendet', 'verworfen']
        : ['entwurf', 'sendet'],
    );
  }

  @Query(() => Int)
  @UseGuards(NurMenschWache)
  offeneMailEntwuerfe(@CurrentUser() user: RequestUser): Promise<number> {
    return this.entwuerfe.anzahlOffen(user);
  }

  @Mutation(() => MailEntwurfEntity)
  @UseGuards(BillingWriteGuard)
  async mailEntwurfAnlegen(
    @CurrentUser() user: RequestUser,
    @Args('input') input: MailEntwurfAnlegenInput,
    @Context('kiVorschlagId') kiVorschlagId?: string,
  ): Promise<MailEntwurfEntity> {
    await this.permissions.assert(
      user,
      LESERECHT[input.art],
      'an diese Akte zu schreiben',
    );

    return this.entwuerfe.anlegen(
      user,
      input,
      kiVorschlagId ?? null,
      await this.permissions.can(user, Permission.CONTACT_VIEW),
    );
  }

  @Mutation(() => MailEntwurfEntity)
  @UseGuards(NurMenschWache, BillingWriteGuard)
  mailEntwurfAendern(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: MailEntwurfFelderInput,
  ): Promise<MailEntwurfEntity> {
    return this.entwuerfe.aendern(user, id, input);
  }

  @Mutation(() => MailEntwurfEntity)
  @UseGuards(NurMenschWache, GqlThrottlerGuard, BillingWriteGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  mailEntwurfSenden(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: MailEntwurfFelderInput,
  ): Promise<MailEntwurfEntity> {
    return this.entwuerfe.senden(user, id, input);
  }

  @Mutation(() => MailEntwurfEntity)
  @UseGuards(NurMenschWache, BillingWriteGuard)
  mailEntwurfVerwerfen(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<MailEntwurfEntity> {
    return this.entwuerfe.verwerfen(user, id);
  }
}
