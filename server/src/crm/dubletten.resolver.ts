import { BadRequestException, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
  registerEnumType,
} from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { DublettenService, MAX_ZUSAMMENFUEHREN } from './dubletten.service';

export enum DublettenArt {
  FIRMA = 'firma',
  KONTAKT = 'kontakt',
}

registerEnumType(DublettenArt, { name: 'DublettenArt' });

@ObjectType('Dublette')
export class DubletteView {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field(() => String, { nullable: true })
  detail: string | null;
}

@ObjectType('ZusammenfuehrenFeld')
export class ZusammenfuehrenFeldView {
  @Field()
  feld: string;

  @Field(() => ID)
  vonId: string;
}

@ObjectType('ZusammenfuehrenAnzahl')
export class ZusammenfuehrenAnzahlView {
  @Field()
  was: string;

  @Field(() => Int)
  anzahl: number;
}

@ObjectType('ZusammenfuehrenErgebnis')
export class ZusammenfuehrenErgebnisView {
  @Field(() => [ZusammenfuehrenFeldView])
  felder: ZusammenfuehrenFeldView[];

  @Field(() => Int)
  eigeneFelder: number;

  @Field(() => [ZusammenfuehrenAnzahlView])
  umgehaengt: ZusammenfuehrenAnzahlView[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const pruefeIds = (ids: string[]): string[] => {
  if (ids.length >= MAX_ZUSAMMENFUEHREN || !ids.every((id) => UUID.test(id))) {
    throw new BadRequestException(
      `Wählen Sie zwischen 2 und ${String(MAX_ZUSAMMENFUEHREN)} Datensätze.`,
    );
  }

  return ids;
};

const RECHTE = {
  [DublettenArt.FIRMA]: [Permission.COMPANY_WRITE, Permission.COMPANY_DELETE],
  [DublettenArt.KONTAKT]: [Permission.CONTACT_WRITE, Permission.CONTACT_DELETE],
};

@Resolver()
@UseGuards(GqlAuthGuard)
export class DublettenResolver {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly dubletten: DublettenService,
  ) {}

  @Query(() => [DubletteView])
  async moeglicheFirmenDubletten(
    @CurrentUser() user: RequestUser,
    @Args('name') name: string,
    @Args('domain', { type: () => String, nullable: true })
    domain: string | null,
    @Args('ausser', { type: () => ID, nullable: true }) ausser: string | null,
  ): Promise<DubletteView[]> {
    await this.permissions.assert(
      user,
      Permission.COMPANY_VIEW,
      'Firmen zu sehen',
    );

    return this.dubletten.firmen(
      user.workspaceId,
      name.slice(0, 200),
      domain,
      ausser,
    );
  }

  @Query(() => [DubletteView])
  async moeglicheKontaktDubletten(
    @CurrentUser() user: RequestUser,
    @Args('vorname') vorname: string,
    @Args('nachname') nachname: string,
    @Args('email', { type: () => String, nullable: true }) email: string | null,
    @Args('ausser', { type: () => ID, nullable: true }) ausser: string | null,
  ): Promise<DubletteView[]> {
    await this.permissions.assert(
      user,
      Permission.CONTACT_VIEW,
      'Kontakte zu sehen',
    );

    return this.dubletten.kontakte(
      user.workspaceId,
      vorname.slice(0, 100),
      nachname.slice(0, 100),
      email?.slice(0, 254),
      ausser,
    );
  }

  @Mutation(() => Boolean)
  @UseGuards(BillingWriteGuard)
  async zusammenfuehren(
    @CurrentUser() user: RequestUser,
    @Args('art', { type: () => DublettenArt }) art: DublettenArt,
    @Args('behaltenId', { type: () => ID }, ParseUUIDPipe) behaltenId: string,
    @Args('wegId', { type: () => ID }, ParseUUIDPipe) wegId: string,
  ): Promise<boolean> {
    for (const recht of RECHTE[art]) {
      await this.permissions.assert(user, recht, 'Datensätze zusammenzuführen');
    }

    await this.dubletten.zusammenfuehren(
      user.workspaceId,
      art,
      behaltenId,
      wegId,
      user.apiKey === undefined ? user.userId : null,
    );

    return true;
  }

  @Query(() => ZusammenfuehrenErgebnisView)
  async zusammenfuehrenVorschau(
    @CurrentUser() user: RequestUser,
    @Args('art', { type: () => DublettenArt }) art: DublettenArt,
    @Args('behaltenId', { type: () => ID }, ParseUUIDPipe) behaltenId: string,
    @Args('wegIds', { type: () => [ID] }) wegIds: string[],
  ): Promise<ZusammenfuehrenErgebnisView> {
    for (const recht of RECHTE[art]) {
      await this.permissions.assert(user, recht, 'Datensätze zusammenzuführen');
    }

    return this.dubletten.vorschau(
      user.workspaceId,
      art,
      behaltenId,
      pruefeIds(wegIds),
    );
  }

  @Mutation(() => ZusammenfuehrenErgebnisView)
  @UseGuards(BillingWriteGuard)
  async zusammenfuehrenMehrere(
    @CurrentUser() user: RequestUser,
    @Args('art', { type: () => DublettenArt }) art: DublettenArt,
    @Args('behaltenId', { type: () => ID }, ParseUUIDPipe) behaltenId: string,
    @Args('wegIds', { type: () => [ID] }) wegIds: string[],
  ): Promise<ZusammenfuehrenErgebnisView> {
    for (const recht of RECHTE[art]) {
      await this.permissions.assert(user, recht, 'Datensätze zusammenzuführen');
    }

    return this.dubletten.zusammenfuehrenMehrere(
      user.workspaceId,
      art,
      behaltenId,
      pruefeIds(wegIds),
      user.apiKey === undefined ? user.userId : null,
    );
  }
}
