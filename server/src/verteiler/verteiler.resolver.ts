import { BadRequestException, UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  InputType,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { ContactEntity } from '../crm/entities/contact.entity';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { VerteilerEntity, VerteilerMitgliedView } from './verteiler.entity';
import { MAX_MITGLIEDER, VerteilerService } from './verteiler.service';

@InputType()
export class VerteilerInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  beschreibung?: string | null;
}

@Resolver(() => VerteilerEntity)
@UseGuards(GqlAuthGuard)
export class VerteilerResolver {
  constructor(
    private readonly service: VerteilerService,
    private readonly permissions: PermissionsService,
  ) {}

  private pruefe(
    user: RequestUser,
    art: 'sehen' | 'bearbeiten',
  ): Promise<void> {
    return art === 'sehen'
      ? this.permissions.assert(
          user,
          Permission.CONTACT_VIEW,
          'Verteiler zu sehen',
        )
      : this.permissions.assert(
          user,
          Permission.CONTACT_WRITE,
          'Verteiler zu bearbeiten',
        );
  }

  @Query(() => [VerteilerEntity])
  async verteilerListe(
    @CurrentUser() user: RequestUser,
  ): Promise<VerteilerEntity[]> {
    await this.pruefe(user, 'sehen');

    return this.service.liste(user.workspaceId);
  }

  @Query(() => VerteilerEntity)
  async verteiler(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<VerteilerEntity> {
    await this.pruefe(user, 'sehen');

    return this.service.einer(user.workspaceId, id);
  }

  @Query(() => [VerteilerMitgliedView])
  async verteilerMitglieder(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<VerteilerMitgliedView[]> {
    await this.pruefe(user, 'sehen');

    return this.service.mitgliederListe(user.workspaceId, id);
  }

  @Mutation(() => VerteilerEntity)
  @UseGuards(BillingWriteGuard)
  async verteilerAnlegen(
    @CurrentUser() user: RequestUser,
    @Args('input') input: VerteilerInput,
  ): Promise<VerteilerEntity> {
    await this.pruefe(user, 'bearbeiten');

    return this.service.anlegen(user, input);
  }

  @Mutation(() => VerteilerEntity)
  @UseGuards(BillingWriteGuard)
  async verteilerAendern(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: VerteilerInput,
  ): Promise<VerteilerEntity> {
    await this.pruefe(user, 'bearbeiten');

    return this.service.aendern(user, id, input);
  }

  @Mutation(() => Boolean)
  @UseGuards(BillingWriteGuard)
  async verteilerLoeschen(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.pruefe(user, 'bearbeiten');

    return this.service.loeschen(user, id);
  }

  @Mutation(() => VerteilerEntity)
  @UseGuards(BillingWriteGuard)
  async verteilerMitgliederHinzufuegen(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('kontaktIds', { type: () => [ID] }) kontaktIds: string[],
  ): Promise<VerteilerEntity> {
    await this.pruefe(user, 'bearbeiten');
    pruefeKennungen(kontaktIds);

    return this.service.hinzufuegen(user, id, kontaktIds);
  }

  @Mutation(() => VerteilerEntity)
  @UseGuards(BillingWriteGuard)
  async verteilerMitgliederEntfernen(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('kontaktIds', { type: () => [ID] }) kontaktIds: string[],
  ): Promise<VerteilerEntity> {
    await this.pruefe(user, 'bearbeiten');
    pruefeKennungen(kontaktIds);

    return this.service.entfernen(user, id, kontaktIds);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const pruefeKennungen = (ids: string[]): void => {
  if (ids.length > MAX_MITGLIEDER || ids.some((id) => !UUID.test(id))) {
    throw new BadRequestException('Ungültige Kontaktkennungen.');
  }
};

@Resolver(() => ContactEntity)
@UseGuards(GqlAuthGuard)
export class KontaktVerteilerResolver {
  constructor(private readonly service: VerteilerService) {}

  @ResolveField(() => [VerteilerEntity])
  verteiler(
    @CurrentUser() user: RequestUser,
    @Parent() kontakt: ContactEntity,
  ): Promise<VerteilerEntity[]> {
    return this.service.fuerKontakt(user.workspaceId, kontakt.id);
  }
}
