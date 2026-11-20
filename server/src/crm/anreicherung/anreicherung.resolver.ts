import { UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  InputType,
  Mutation,
  ObjectType,
  Parent,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import {
  CurrentUser,
  type RequestUser,
} from '../../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../../auth/guards/gql-auth.guard';
import { GqlThrottlerGuard } from '../../auth/guards/gql-throttler.guard';
import { BillingWriteGuard } from '../../billing/guards/billing-write.guard';
import { Permission } from '../../workspaces/permissions';
import { PermissionsService } from '../../workspaces/permissions.service';
import { CompanyEntity } from '../entities/company.entity';
import { AnreicherungService } from './anreicherung.service';
import { type FirmenlogoEntity } from './firmenlogo.entity';
import { bildDataUrl } from './logo';

@ObjectType()
export class ImpressumFeld {
  @Field()
  feld: string;

  @Field()
  label: string;

  @Field()
  wert: string;

  @Field(() => String, { nullable: true })
  aktuell: string | null;

  @Field()
  uebernehmbar: boolean;

  @Field(() => String, { nullable: true })
  grund: string | null;
}

@ObjectType()
export class ImpressumVorschau {
  @Field()
  quelle: string;

  @Field(() => [ImpressumFeld])
  felder: ImpressumFeld[];
}

@InputType()
export class ImpressumWertInput {
  @Field()
  @IsString()
  @MaxLength(40)
  feld: string;

  @Field()
  @IsString()
  @MaxLength(500)
  wert: string;
}

@InputType()
export class ImpressumUebernahmeInput {
  @Field(() => ID)
  @IsUUID()
  companyId: string;

  @Field(() => [ImpressumWertInput])
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ImpressumWertInput)
  werte: ImpressumWertInput[];
}

@Resolver(() => CompanyEntity)
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class AnreicherungResolver {
  private readonly geladen = new WeakMap<
    CompanyEntity,
    Promise<FirmenlogoEntity | null>
  >();

  constructor(
    private readonly anreicherung: AnreicherungService,
    private readonly permissions: PermissionsService,
  ) {}

  private logoVon(firma: CompanyEntity): Promise<FirmenlogoEntity | null> {
    if (firma.id === undefined || firma.workspaceId === undefined) {
      return Promise.resolve(null);
    }

    let laden = this.geladen.get(firma);

    if (laden === undefined) {
      laden = this.anreicherung.logo(firma.workspaceId, firma.id);
      this.geladen.set(firma, laden);
    }

    return laden;
  }

  @ResolveField('logo', () => String, { nullable: true })
  async logo(@Parent() firma: CompanyEntity): Promise<string | null> {
    const logo = await this.logoVon(firma);

    return logo === null ? null : bildDataUrl(logo.bild, logo.mime);
  }

  @ResolveField('logoQuelle', () => String, { nullable: true })
  async logoQuelle(@Parent() firma: CompanyEntity): Promise<string | null> {
    return (await this.logoVon(firma))?.quelle ?? null;
  }

  @Mutation(() => ImpressumVorschau)
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async impressumLesen(
    @CurrentUser() user: RequestUser,
    @Args('companyId', { type: () => ID }) companyId: string,
  ): Promise<ImpressumVorschau> {
    await this.darfAendern(user);

    return this.anreicherung.impressumVorschau(user.workspaceId, companyId);
  }

  @Mutation(() => CompanyEntity)
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async impressumUebernehmen(
    @CurrentUser() user: RequestUser,
    @Args('input') input: ImpressumUebernahmeInput,
  ): Promise<CompanyEntity> {
    await this.darfAendern(user);

    return this.anreicherung.uebernehmen(
      user.workspaceId,
      input.companyId,
      input.werte,
    );
  }

  @Mutation(() => CompanyEntity)
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async firmenlogoLaden(
    @CurrentUser() user: RequestUser,
    @Args('companyId', { type: () => ID }) companyId: string,
  ): Promise<CompanyEntity> {
    await this.darfAendern(user);

    return this.anreicherung.logoLaden(user.workspaceId, companyId);
  }

  @Mutation(() => CompanyEntity)
  async firmenlogoEntfernen(
    @CurrentUser() user: RequestUser,
    @Args('companyId', { type: () => ID }) companyId: string,
  ): Promise<CompanyEntity> {
    await this.darfAendern(user);

    return this.anreicherung.logoEntfernen(user.workspaceId, companyId);
  }

  private darfAendern(user: RequestUser): Promise<void> {
    return this.permissions.assert(
      user,
      Permission.COMPANY_WRITE,
      'Firmendaten zu ergänzen',
    );
  }
}
