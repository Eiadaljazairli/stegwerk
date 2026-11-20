import { ForbiddenException, UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  InputType,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
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
import { InvoiceEntity } from '../invoices/invoice.entity';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import {
  BUCHHALTUNGS_ANBIETER,
  type BuchhaltungsAnbieter,
  BuchhaltungUebertragungEntity,
  BuchhaltungVerbindungEntity,
} from './buchhaltung.entities';
import { BuchhaltungService } from './buchhaltung.service';

@InputType()
export class BuchhaltungVerbindenInput {
  @Field()
  @IsIn(BUCHHALTUNGS_ANBIETER)
  anbieter: string;

  @Field()
  @IsNotEmpty()
  @MaxLength(500)
  schluessel: string;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  automatisch?: boolean | null;
}

@InputType()
export class BuchhaltungEinstellungenInput {
  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  automatisch?: boolean | null;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  zahlungenAbgleichen?: boolean | null;
}

@Resolver(() => BuchhaltungVerbindungEntity)
@UseGuards(GqlAuthGuard, NurMenschWache)
export class BuchhaltungResolver {
  constructor(
    private readonly dienst: BuchhaltungService,
    private readonly permissions: PermissionsService,
  ) {}

  private async verwalten(user: RequestUser): Promise<void> {
    for (const recht of [
      Permission.API_MANAGE,
      Permission.INVOICE_VIEW,
      Permission.INVOICE_WRITE,
    ]) {
      await this.permissions.assert(
        user,
        recht,
        'die Buchhaltung zu verbinden',
      );
    }

    const sicht = await this.permissions.sichtfeldFuer(user);
    const eingeschraenkt =
      Object.values(sicht.arten).some((weite) => weite !== 'alle') ||
      Object.values(sicht.felder).some((recht) => recht === 'verborgen');

    if (eingeschraenkt) {
      throw new ForbiddenException(
        'Die Buchhaltung bekommt jede Rechnung des Bereichs mit Kunde und Anschrift. Verbinden und einstellen darf sie deshalb nur, wer alle Firmen, Kontakte und Geschäfte samt ihren Feldern sehen darf. Wenden Sie sich an eine Person mit Administratorrechten.',
      );
    }
  }

  private trennenDarf(user: RequestUser): Promise<void> {
    return this.permissions.assert(
      user,
      Permission.API_MANAGE,
      'die Buchhaltung zu trennen',
    );
  }

  private senden(user: RequestUser): Promise<void> {
    return this.permissions.assert(
      user,
      Permission.INVOICE_ISSUE,
      'Rechnungen an die Buchhaltung zu senden',
    );
  }

  @Query(() => BuchhaltungVerbindungEntity, { nullable: true })
  async buchhaltungVerbindung(
    @CurrentUser() user: RequestUser,
  ): Promise<BuchhaltungVerbindungEntity | null> {
    await this.permissions.assertAny(
      user,
      [Permission.API_MANAGE, Permission.INVOICE_VIEW],
      'die Buchhaltung zu sehen',
    );

    return this.dienst.stand(user.workspaceId);
  }

  @Mutation(() => BuchhaltungVerbindungEntity)
  @UseGuards(GqlThrottlerGuard, BillingWriteGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async buchhaltungVerbinden(
    @CurrentUser() user: RequestUser,
    @Args('input') input: BuchhaltungVerbindenInput,
  ): Promise<BuchhaltungVerbindungEntity> {
    await this.verwalten(user);

    return this.dienst.verbinden(user, {
      anbieter: input.anbieter as BuchhaltungsAnbieter,
      schluessel: input.schluessel,
      automatisch: input.automatisch,
    });
  }

  @Mutation(() => BuchhaltungVerbindungEntity)
  @UseGuards(BillingWriteGuard)
  async buchhaltungEinstellen(
    @CurrentUser() user: RequestUser,
    @Args('input') input: BuchhaltungEinstellungenInput,
  ): Promise<BuchhaltungVerbindungEntity> {
    await this.verwalten(user);

    return this.dienst.einstellen(user, input);
  }

  @Mutation(() => Boolean)
  async buchhaltungTrennen(@CurrentUser() user: RequestUser): Promise<boolean> {
    await this.trennenDarf(user);

    return this.dienst.trennen(user);
  }

  @Mutation(() => BuchhaltungUebertragungEntity)
  @UseGuards(GqlThrottlerGuard, BillingWriteGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async rechnungAnBuchhaltung(
    @CurrentUser() user: RequestUser,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
  ): Promise<BuchhaltungUebertragungEntity> {
    await this.senden(user);

    return this.dienst.einreihen(user.workspaceId, invoiceId);
  }

  @Mutation(() => Int)
  @UseGuards(GqlThrottlerGuard, BillingWriteGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async offeneAnBuchhaltung(@CurrentUser() user: RequestUser): Promise<number> {
    await this.senden(user);

    return this.dienst.alleEinreihen(user.workspaceId);
  }

  @ResolveField(() => Boolean)
  fehlerZeigen(@Parent() verbindung: BuchhaltungVerbindungEntity): boolean {
    return verbindung.anmeldungFehler !== null;
  }

  @ResolveField(() => Int)
  async wartend(
    @Parent() verbindung: BuchhaltungVerbindungEntity,
  ): Promise<number> {
    return (await this.dienst.zaehlen(verbindung.workspaceId)).wartend;
  }

  @ResolveField(() => Int)
  async fehlerhaft(
    @Parent() verbindung: BuchhaltungVerbindungEntity,
  ): Promise<number> {
    return (await this.dienst.zaehlen(verbindung.workspaceId)).fehlerhaft;
  }

  @ResolveField(() => Int)
  async nichtUebertragen(
    @Parent() verbindung: BuchhaltungVerbindungEntity,
  ): Promise<number> {
    return (await this.dienst.zaehlen(verbindung.workspaceId)).nichtUebertragen;
  }
}

@Resolver(() => InvoiceEntity)
export class RechnungBuchhaltungResolver {
  constructor(private readonly dienst: BuchhaltungService) {}

  @ResolveField(() => BuchhaltungUebertragungEntity, { nullable: true })
  buchhaltung(
    @Parent() invoice: InvoiceEntity,
  ): Promise<BuchhaltungUebertragungEntity | null> {
    return this.dienst.uebertragungFuer(invoice.workspaceId, invoice.id);
  }
}
