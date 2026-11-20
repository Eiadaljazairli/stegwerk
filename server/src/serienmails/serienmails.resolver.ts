import { UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  InputType,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { NurMenschWache } from '../api-keys/api-key.guard';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import {
  KampagneEntity,
  KampagnenEmpfaengerEntity,
} from './serienmail.entities';
import { MAX_EMPFAENGER, SerienmailsService } from './serienmails.service';

@InputType()
export class KampagneInput {
  @Field()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @Field()
  @MaxLength(200)
  betreff: string;

  @Field()
  @MaxLength(100_000)
  text: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(60)
  thema?: string;
}

@InputType()
export class KampagneAendernInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(200)
  betreff?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(100_000)
  text?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(60)
  thema?: string;
}

@InputType()
export class EmpfaengerAuswahlInput {
  @Field(() => [ID], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_EMPFAENGER)
  @IsUUID('all', { each: true })
  kontaktIds?: string[];

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  ansichtId?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  verteilerId?: string;
}

@ObjectType()
export class AbmeldungEintrag {
  @Field(() => ID)
  id: string;

  @Field()
  email: string;

  @Field()
  thema: string;

  @Field()
  zeitpunkt: Date;
}

@ObjectType()
export class KampagnenVorschau {
  @Field()
  an: string;

  @Field()
  betreff: string;

  @Field()
  text: string;
}

@Resolver(() => KampagneEntity)
@UseGuards(GqlAuthGuard, NurMenschWache)
export class SerienmailsResolver {
  constructor(
    private readonly service: SerienmailsService,
    private readonly permissions: PermissionsService,
  ) {}

  private darf(user: RequestUser): Promise<void> {
    return this.permissions.assert(
      user,
      Permission.CAMPAIGN_SEND,
      'Serienmails zu verschicken',
    );
  }

  @Query(() => [KampagneEntity])
  async kampagnen(@CurrentUser() user: RequestUser): Promise<KampagneEntity[]> {
    await this.darf(user);

    return this.service.liste(user.workspaceId);
  }

  @Query(() => [AbmeldungEintrag])
  async abmeldungen(
    @CurrentUser() user: RequestUser,
    @Args('suche', { nullable: true }) suche?: string,
  ): Promise<AbmeldungEintrag[]> {
    await this.darf(user);

    return this.service.abmeldungsListe(user.workspaceId, suche);
  }

  @Query(() => [String])
  async kampagnenThemen(@CurrentUser() user: RequestUser): Promise<string[]> {
    await this.darf(user);

    return this.service.themen(user.workspaceId);
  }

  @Query(() => KampagneEntity)
  async kampagne(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<KampagneEntity> {
    await this.darf(user);

    return this.service.eine(user.workspaceId, id);
  }

  @Query(() => [KampagnenEmpfaengerEntity])
  async kampagnenEmpfaenger(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('status', { type: () => String, nullable: true }) status?: string,
  ): Promise<KampagnenEmpfaengerEntity[]> {
    await this.darf(user);

    return this.service.empfaengerListe(user.workspaceId, id, status ?? null);
  }

  @Query(() => KampagnenVorschau)
  async kampagnenVorschau(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<KampagnenVorschau> {
    await this.darf(user);

    return this.service.vorschau(user, id);
  }

  @Mutation(() => KampagneEntity)
  @UseGuards(BillingWriteGuard)
  async kampagneAnlegen(
    @CurrentUser() user: RequestUser,
    @Args('input') input: KampagneInput,
  ): Promise<KampagneEntity> {
    await this.darf(user);

    return this.service.anlegen(user, input);
  }

  @Mutation(() => KampagneEntity)
  @UseGuards(BillingWriteGuard)
  async kampagneAendern(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: KampagneAendernInput,
  ): Promise<KampagneEntity> {
    await this.darf(user);

    return this.service.aendern(user, id, input);
  }

  @Mutation(() => Boolean)
  async kampagneLoeschen(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.darf(user);

    return this.service.loeschen(user, id);
  }

  @Mutation(() => KampagneEntity)
  @UseGuards(BillingWriteGuard)
  async kampagnenEmpfaengerFestlegen(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('auswahl') auswahl: EmpfaengerAuswahlInput,
  ): Promise<KampagneEntity> {
    await this.darf(user);
    await this.permissions.assert(
      user,
      Permission.CONTACT_VIEW,
      'Kontakte zu sehen',
    );

    return this.service.empfaengerFestlegen(user, id, auswahl);
  }

  @Mutation(() => String)
  async kampagneTestmail(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<string> {
    await this.darf(user);

    return this.service.testmail(user, id);
  }

  @Mutation(() => KampagneEntity)
  async kampagneStarten(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<KampagneEntity> {
    await this.darf(user);

    return this.service.starten(user, id);
  }

  @Mutation(() => KampagneEntity)
  async kampagneAbbrechen(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<KampagneEntity> {
    await this.darf(user);

    return this.service.abbrechen(user, id);
  }
}
