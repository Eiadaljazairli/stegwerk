import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { NurMenschWache } from '../api-keys/api-key.guard';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { NUR_LESEN } from '../workspaces/sichtbarkeit';
import { meldeSicherheit } from '../sicherheit/melden';
import { CustomFieldFilterOperator } from '../custom-fields/custom-field.types';
import {
  AusfuehrungStatus,
  AutomationAusfuehrungEntity,
} from './automation-ausfuehrung.entity';
import {
  AutomationAktion,
  type AutomationAktionDaten,
  AutomationAusloeser,
  AutomationEntity,
  AutomationMailAn,
  AutomationRhythmus,
} from './automation.entity';
import {
  artDerRegel,
  AutomationenService,
  MAX_EINGANG_BYTES,
  MAX_SCHRITTE,
} from './automationen.service';

import {
  KANAL_DIENSTE,
  type KanalDienst,
  MAX_KANAL_TEXT,
} from './kanal-nachricht';

const ARTEN = ['deal', 'contact', 'company'] as const;

type Art = (typeof ARTEN)[number];

const artPruefen = (roh: string): Art => {
  if (!(ARTEN as readonly string[]).includes(roh)) {
    throw new ForbiddenException('Diese Art Datensatz gibt es nicht.');
  }

  return roh as Art;
};

const LESERECHT: Record<Art, Permission> = {
  deal: Permission.DEAL_VIEW,
  contact: Permission.CONTACT_VIEW,
  company: Permission.COMPANY_VIEW,
};

const SCHREIBRECHT: Record<Art, Permission> = {
  deal: Permission.DEAL_WRITE,
  contact: Permission.CONTACT_WRITE,
  company: Permission.COMPANY_WRITE,
};

@InputType()
export class AutomationBedingungInput {
  @Field()
  @IsNotEmpty()
  @MaxLength(80)
  key: string;

  @Field(() => CustomFieldFilterOperator)
  @IsEnum(CustomFieldFilterOperator)
  operator: CustomFieldFilterOperator;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  value?: string | null;
}

@ObjectType()
export class AutomationBedingung {
  @Field()
  key: string;

  @Field(() => CustomFieldFilterOperator)
  operator: CustomFieldFilterOperator;

  @Field(() => String, { nullable: true })
  value: string | null;
}

@InputType()
export class AutomationWertInput {
  @Field()
  @IsNotEmpty()
  @MaxLength(40)
  feld: string;

  @Field()
  @IsString()
  @MaxLength(500)
  wert: string;
}

@ObjectType()
export class AutomationWert {
  @Field()
  feld: string;

  @Field()
  wert: string;
}

@InputType()
export class AutomationKopfInput {
  @Field()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  wert?: string | null;
}

@InputType()
export class AutomationSchrittInput {
  @Field(() => AutomationAktion)
  @IsEnum(AutomationAktion)
  aktion: AutomationAktion;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  titel?: string | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  faelligInTagen?: number | null;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  zustaendigUserId?: string | null;

  @Field(() => [ID], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  reihumUserIds?: string[] | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  feldKey?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  feldWert?: string | null;

  @Field(() => AutomationMailAn, { nullable: true })
  @IsOptional()
  @IsEnum(AutomationMailAn)
  mailAn?: AutomationMailAn | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  mailText?: string | null;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  vorlageId?: string | null;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  mailAlsEntwurf?: boolean | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SCHRITTE - 1)
  zielSchritt?: number | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(ARTEN)
  suchArt?: Art | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  suchFeld?: string | null;

  @Field(() => CustomFieldFilterOperator, { nullable: true })
  @IsOptional()
  @IsEnum(CustomFieldFilterOperator)
  suchVergleich?: CustomFieldFilterOperator | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  suchWert?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(ARTEN)
  upsertArt?: Art | null;

  @Field(() => [AutomationWertInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AutomationWertInput)
  upsertWerte?: AutomationWertInput[] | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  terminInTagen?: number | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/u, {
    message: 'Die Uhrzeit bitte als HH:MM.',
  })
  terminUhrzeit?: string | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  terminDauer?: number | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  terminOrt?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
  httpMethode?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  httpUrl?: string | null;

  @Field(() => [AutomationKopfInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AutomationKopfInput)
  httpHeader?: AutomationKopfInput[] | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  httpRumpf?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn([...KANAL_DIENSTE])
  kanalDienst?: KanalDienst | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  kanalUrl?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_KANAL_TEXT)
  kanalText?: string | null;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  kanalLink?: boolean | null;
}

@InputType()
export class AutomationZeitplanInput {
  @Field(() => AutomationRhythmus)
  @IsEnum(AutomationRhythmus)
  rhythmus: AutomationRhythmus;

  @Field()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/u, {
    message: 'Die Uhrzeit bitte als HH:MM.',
  })
  uhrzeit: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  wochentag?: number | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  monatstag?: number | null;
}

@ObjectType()
export class AutomationZeitplan {
  @Field(() => AutomationRhythmus)
  rhythmus: AutomationRhythmus;

  @Field()
  uhrzeit: string;

  @Field(() => Int, { nullable: true })
  wochentag: number | null;

  @Field(() => Int, { nullable: true })
  monatstag: number | null;
}

@InputType()
export class AutomationInput extends AutomationSchrittInput {
  @Field()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  aktiv?: boolean;

  @Field(() => AutomationAusloeser)
  @IsEnum(AutomationAusloeser)
  ausloeser: AutomationAusloeser;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phase?: string | null;

  @Field(() => [AutomationBedingungInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AutomationBedingungInput)
  bedingungen?: AutomationBedingungInput[] | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  ruhendTage?: number | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  verzoegerungTage?: number | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(ARTEN)
  art?: Art | null;

  @Field(() => AutomationZeitplanInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => AutomationZeitplanInput)
  zeitplan?: AutomationZeitplanInput | null;

  @Field(() => [AutomationSchrittInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SCHRITTE - 1)
  @ValidateNested({ each: true })
  @Type(() => AutomationSchrittInput)
  weitereSchritte?: AutomationSchrittInput[] | null;
}

@ObjectType()
export class AutomationSchrittAnsicht {
  @Field(() => AutomationAktion)
  aktion: AutomationAktion;

  @Field(() => String, { nullable: true })
  titel: string | null;

  @Field(() => Int, { nullable: true })
  faelligInTagen: number | null;

  @Field(() => ID, { nullable: true })
  zustaendigUserId: string | null;

  @Field(() => [ID])
  reihumUserIds: string[];

  @Field(() => String, { nullable: true })
  feldKey: string | null;

  @Field(() => String, { nullable: true })
  feldWert: string | null;

  @Field(() => AutomationMailAn, { nullable: true })
  mailAn: AutomationMailAn | null;

  @Field(() => String, { nullable: true })
  mailText: string | null;

  @Field(() => ID, { nullable: true })
  vorlageId: string | null;

  @Field(() => Boolean)
  mailAlsEntwurf: boolean;

  @Field(() => Int, { nullable: true })
  zielSchritt: number | null;

  @Field(() => String, { nullable: true })
  suchArt: string | null;

  @Field(() => String, { nullable: true })
  suchFeld: string | null;

  @Field(() => CustomFieldFilterOperator, { nullable: true })
  suchVergleich: CustomFieldFilterOperator | null;

  @Field(() => String, { nullable: true })
  suchWert: string | null;

  @Field(() => String, { nullable: true })
  upsertArt: string | null;

  @Field(() => [AutomationWert])
  upsertWerte: AutomationWert[];

  @Field(() => Int, { nullable: true })
  terminInTagen: number | null;

  @Field(() => String, { nullable: true })
  terminUhrzeit: string | null;

  @Field(() => Int, { nullable: true })
  terminDauer: number | null;

  @Field(() => String, { nullable: true })
  terminOrt: string | null;

  @Field(() => String, { nullable: true })
  httpMethode: string | null;

  @Field(() => String, { nullable: true })
  httpUrl: string | null;

  @Field(() => [String])
  httpKoepfe: string[];

  @Field(() => String, { nullable: true })
  httpRumpf: string | null;

  @Field(() => String, { nullable: true })
  kanalDienst: string | null;

  @Field(() => String, { nullable: true })
  kanalUrlAnzeige: string | null;

  @Field(() => String, { nullable: true })
  kanalText: string | null;

  @Field(() => Boolean)
  kanalLink: boolean;
}

const alsAnsicht = (
  aktion: AutomationAktion,
  d: AutomationAktionDaten,
): AutomationSchrittAnsicht => ({
  aktion,
  titel: d.titel ?? null,
  faelligInTagen: d.faelligInTagen ?? null,
  zustaendigUserId: d.zustaendigUserId ?? null,
  reihumUserIds: d.reihumUserIds ?? [],
  feldKey: d.feldKey ?? null,
  feldWert: d.feldWert ?? null,
  mailAn: d.mailAn ?? null,
  mailText: d.mailText ?? null,
  vorlageId: d.vorlageId ?? null,
  mailAlsEntwurf: d.mailAlsEntwurf === true,
  zielSchritt: d.zielSchritt ?? null,
  suchArt: d.suchArt ?? null,
  suchFeld: d.suchFeld ?? null,
  suchVergleich: (d.suchVergleich ?? null) as CustomFieldFilterOperator | null,
  suchWert: d.suchWert ?? null,
  upsertArt: d.upsertArt ?? null,
  upsertWerte: Object.entries(d.upsertWerte ?? {}).map(([feld, wert]) => ({
    feld,
    wert,
  })),
  terminInTagen: d.terminInTagen ?? null,
  terminUhrzeit: d.terminUhrzeit ?? null,
  terminDauer: d.terminDauer ?? null,
  terminOrt: d.terminOrt ?? null,
  httpMethode: d.httpMethode ?? null,
  httpUrl: d.httpUrl ?? null,
  httpKoepfe: (d.httpHeader ?? []).map((kopf) => kopf.name),
  httpRumpf: d.httpRumpf ?? null,
  kanalDienst: d.kanalDienst ?? null,
  kanalUrlAnzeige:
    d.kanalUrlSealed == null ? null : (d.kanalUrlAnzeige ?? null),
  kanalText: d.kanalText ?? null,
  kanalLink: d.kanalLink === true,
});

@ObjectType()
export class AutomationLaufSchritt {
  @Field(() => Int)
  nr: number;

  @Field(() => AutomationAktion)
  aktion: AutomationAktion;

  @Field(() => AusfuehrungStatus)
  status: AusfuehrungStatus;

  @Field(() => String, { nullable: true })
  grund: string | null;

  @Field()
  eingabe: string;

  @Field()
  ausgabe: string;
}

@ObjectType()
export class AutomationEingang {
  @Field()
  url: string;

  @Field(() => String, { nullable: true })
  geheimnis: string | null;
}

@ObjectType()
export class AutomationKnopf {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;
}

@Resolver(() => AutomationAusfuehrungEntity)
export class AutomationAusfuehrungResolver {
  constructor(private readonly permissions: PermissionsService) {}

  @ResolveField(() => [AutomationLaufSchritt])
  async schritte(
    @CurrentUser() user: RequestUser,
    @Parent() ausfuehrung: AutomationAusfuehrungEntity,
  ): Promise<AutomationLaufSchritt[]> {
    if (!(await this.permissions.can(user, Permission.FIELD_MANAGE))) {
      return [];
    }

    return (ausfuehrung.schritte ?? []).map((schritt) => ({
      nr: schritt.nr,
      aktion: schritt.aktion as AutomationAktion,
      status: schritt.status,
      grund: schritt.grund,
      eingabe: JSON.stringify(schritt.eingabe ?? {}),
      ausgabe: JSON.stringify(schritt.ausgabe ?? null),
    }));
  }
}

const melden = (
  art:
    | 'automation_angelegt'
    | 'automation_geaendert'
    | 'automation_geloescht'
    | 'automation_eingang_erneuert',
  user: RequestUser,
  automation: { id: string; name: string },
  weiteres: Record<string, string | number | boolean | null> = {},
): void =>
  meldeSicherheit({
    art,
    workspaceId: user.workspaceId,
    actorId: user.userId,
    details: { automation: automation.id, name: automation.name, ...weiteres },
  });

@Resolver(() => AutomationEntity)
@UseGuards(GqlAuthGuard, NurMenschWache)
export class AutomationenResolver {
  constructor(
    private readonly dienst: AutomationenService,
    private readonly permissions: PermissionsService,
  ) {}

  @ResolveField(() => String, { nullable: true })
  phase(@Parent() automation: AutomationEntity): string | null {
    return automation.bedingung.phase ?? null;
  }

  @ResolveField(() => String, { nullable: true })
  titel(@Parent() automation: AutomationEntity): string | null {
    return automation.aktionDaten.titel ?? null;
  }

  @ResolveField(() => Int, { nullable: true })
  faelligInTagen(@Parent() automation: AutomationEntity): number | null {
    return automation.aktionDaten.faelligInTagen ?? null;
  }

  @ResolveField(() => ID, { nullable: true })
  zustaendigUserId(@Parent() automation: AutomationEntity): string | null {
    return automation.aktionDaten.zustaendigUserId ?? null;
  }

  @ResolveField(() => [ID])
  reihumUserIds(@Parent() automation: AutomationEntity): string[] {
    return automation.aktionDaten.reihumUserIds ?? [];
  }

  @ResolveField(() => [AutomationBedingung])
  bedingungen(@Parent() automation: AutomationEntity): AutomationBedingung[] {
    return (automation.bedingung.filter ?? []).map((eintrag) => ({
      key: eintrag.key,
      operator: eintrag.operator as CustomFieldFilterOperator,
      value: eintrag.value ?? null,
    }));
  }

  @ResolveField(() => Int, { nullable: true })
  ruhendTage(@Parent() automation: AutomationEntity): number | null {
    return automation.bedingung.ruhendTage ?? null;
  }

  @ResolveField(() => String, { nullable: true })
  feldKey(@Parent() automation: AutomationEntity): string | null {
    return automation.aktionDaten.feldKey ?? null;
  }

  @ResolveField(() => String, { nullable: true })
  feldWert(@Parent() automation: AutomationEntity): string | null {
    return automation.aktionDaten.feldWert ?? null;
  }

  @ResolveField(() => AutomationMailAn, { nullable: true })
  mailAn(@Parent() automation: AutomationEntity): AutomationMailAn | null {
    return automation.aktionDaten.mailAn ?? null;
  }

  @ResolveField(() => String, { nullable: true })
  mailText(@Parent() automation: AutomationEntity): string | null {
    return automation.aktionDaten.mailText ?? null;
  }

  @ResolveField(() => ID, { nullable: true })
  vorlageId(@Parent() automation: AutomationEntity): string | null {
    return automation.aktionDaten.vorlageId ?? null;
  }

  @ResolveField(() => [AutomationSchrittAnsicht])
  schritte(@Parent() automation: AutomationEntity): AutomationSchrittAnsicht[] {
    return [
      alsAnsicht(automation.aktion, automation.aktionDaten),
      ...(automation.schritte ?? []).map((schritt) =>
        alsAnsicht(schritt.aktion, schritt.daten),
      ),
    ];
  }

  @ResolveField(() => String, { nullable: true })
  art(@Parent() automation: AutomationEntity): string | null {
    return automation.bedingung.art ?? null;
  }

  @ResolveField(() => AutomationZeitplan, { nullable: true })
  zeitplan(@Parent() automation: AutomationEntity): AutomationZeitplan | null {
    const plan = automation.bedingung.zeitplan;

    return plan == null
      ? null
      : {
          rhythmus: plan.rhythmus,
          uhrzeit: plan.uhrzeit,
          wochentag: plan.wochentag ?? null,
          monatstag: plan.monatstag ?? null,
        };
  }

  @ResolveField(() => Boolean)
  eingangEingerichtet(@Parent() automation: AutomationEntity): boolean {
    return automation.eingangTokenHash !== null;
  }

  @ResolveField(() => Boolean)
  eingangSigniert(@Parent() automation: AutomationEntity): boolean {
    return automation.eingangGeheimnisSealed !== null;
  }

  @Query(() => [AutomationKnopf])
  async automationKnoepfe(
    @CurrentUser() user: RequestUser,
    @Args('art') art: string,
  ): Promise<AutomationKnopf[]> {
    const gepruefteArt = artPruefen(art);

    await this.permissions.assert(
      user,
      LESERECHT[gepruefteArt],
      'diese Datensätze zu sehen',
    );

    if (!(await this.permissions.can(user, SCHREIBRECHT[gepruefteArt]))) {
      return [];
    }

    return (await this.dienst.manuelleFuer(user.workspaceId, gepruefteArt)).map(
      (automation) => ({ id: automation.id, name: automation.name }),
    );
  }

  @Mutation(() => AutomationAusfuehrungEntity)
  @UseGuards(BillingWriteGuard)
  async automationStarten(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('zielId', { type: () => ID }) zielId: string,
  ): Promise<AutomationAusfuehrungEntity> {
    const knopf = (await this.dienst.list(user.workspaceId)).find(
      (automation) =>
        automation.id === id &&
        automation.ausloeser === AutomationAusloeser.MANUELL,
    );
    const art = knopf?.bedingung.art;

    if (knopf === undefined || art == null) {
      throw new NotFoundException('Diese Automation gibt es nicht.');
    }

    await this.permissions.assert(
      user,
      SCHREIBRECHT[art],
      'diesen Datensatz zu ändern',
    );

    if (!(await this.dienst.sichtbarFuerAnrufer(art, zielId))) {
      throw new NotFoundException('Den Datensatz gibt es nicht.');
    }

    if (
      !(await this.dienst.schreibbarFuerAnrufer(user.workspaceId, art, zielId))
    ) {
      throw new ForbiddenException(NUR_LESEN);
    }

    return this.dienst.manuellStarten(user.workspaceId, id, zielId);
  }

  @Mutation(() => AutomationAusfuehrungEntity)
  @UseGuards(BillingWriteGuard)
  async automationTesten(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('zielId', { type: () => ID, nullable: true }) zielId?: string | null,
    @Args('beispiel', { type: () => String, nullable: true })
    beispiel?: string | null,
  ): Promise<AutomationAusfuehrungEntity> {
    await this.permissions.assert(
      user,
      Permission.FIELD_MANAGE,
      'Automationen zu verwalten',
    );

    let probe: Record<string, unknown> | null = null;

    if (beispiel != null && beispiel.trim() !== '') {
      let gelesen: unknown = null;

      try {
        gelesen =
          beispiel.length > MAX_EINGANG_BYTES
            ? null
            : (JSON.parse(beispiel) as unknown);
      } catch {
        gelesen = null;
      }

      if (
        gelesen === null ||
        typeof gelesen !== 'object' ||
        Array.isArray(gelesen)
      ) {
        throw new BadRequestException(
          'Das Beispiel muss ein JSON-Objekt sein.',
        );
      }

      probe = gelesen as Record<string, unknown>;
    }

    if (zielId != null) {
      const regel = (await this.dienst.list(user.workspaceId)).find(
        (automation) => automation.id === id,
      );
      const art =
        regel === undefined
          ? null
          : artDerRegel(regel.ausloeser, regel.bedingung.art ?? null);

      if (
        art !== null &&
        !(await this.dienst.sichtbarFuerAnrufer(art, zielId))
      ) {
        throw new NotFoundException('Den Datensatz gibt es nicht.');
      }

      if (
        art !== null &&
        !(await this.dienst.schreibbarFuerAnrufer(
          user.workspaceId,
          art,
          zielId,
        ))
      ) {
        throw new ForbiddenException(NUR_LESEN);
      }
    }

    return this.dienst.testen(
      user.workspaceId,
      id,
      zielId ?? null,
      probe,
      user,
    );
  }

  @Mutation(() => AutomationAusfuehrungEntity)
  @UseGuards(BillingWriteGuard)
  async automationLaufWiederholen(
    @CurrentUser() user: RequestUser,
    @Args('ausfuehrungId', { type: () => ID }) ausfuehrungId: string,
  ): Promise<AutomationAusfuehrungEntity> {
    await this.permissions.assert(
      user,
      Permission.FIELD_MANAGE,
      'Automationen zu verwalten',
    );

    return this.dienst.wiederholen(user.workspaceId, ausfuehrungId);
  }

  @Mutation(() => Boolean)
  async automationLaufAbbrechen(
    @CurrentUser() user: RequestUser,
    @Args('ausfuehrungId', { type: () => ID }) ausfuehrungId: string,
  ): Promise<boolean> {
    await this.permissions.assert(
      user,
      Permission.FIELD_MANAGE,
      'Automationen zu verwalten',
    );

    return this.dienst.abbrechen(user.workspaceId, ausfuehrungId);
  }

  @Mutation(() => AutomationEingang)
  @UseGuards(BillingWriteGuard)
  async automationEingangErneuern(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('mitSignatur', { type: () => Boolean, defaultValue: false })
    mitSignatur: boolean,
  ): Promise<AutomationEingang> {
    await this.permissions.assert(
      user,
      Permission.FIELD_MANAGE,
      'Automationen zu verwalten',
    );

    const eingang = await this.dienst.eingangErneuern(
      user.workspaceId,
      id,
      mitSignatur,
    );

    melden(
      'automation_eingang_erneuert',
      user,
      {
        id,
        name: (await this.dienst.nameVon(user.workspaceId, id)) ?? '',
      },
      { mitSignatur },
    );

    return eingang;
  }

  @Query(() => [AutomationAusfuehrungEntity])
  async automationProtokoll(
    @CurrentUser() user: RequestUser,
    @Args('automationId', { type: () => ID }) automationId: string,
  ): Promise<AutomationAusfuehrungEntity[]> {
    await this.permissions.assert(
      user,
      Permission.FIELD_MANAGE,
      'Automationen zu verwalten',
    );

    return this.dienst.protokoll(user.workspaceId, automationId);
  }

  @Query(() => [AutomationEntity])
  async automationen(
    @CurrentUser() user: RequestUser,
  ): Promise<AutomationEntity[]> {
    await this.permissions.assert(
      user,
      Permission.FIELD_MANAGE,
      'Automationen zu verwalten',
    );

    return this.dienst.list(user.workspaceId);
  }

  @Mutation(() => AutomationEntity)
  @UseGuards(BillingWriteGuard)
  async createAutomation(
    @CurrentUser() user: RequestUser,
    @Args('input') input: AutomationInput,
  ): Promise<AutomationEntity> {
    await this.permissions.assert(
      user,
      Permission.FIELD_MANAGE,
      'Automationen zu verwalten',
    );

    const angelegt = await this.dienst.create(
      user.workspaceId,
      user.userId,
      input,
    );

    melden('automation_angelegt', user, angelegt);

    return angelegt;
  }

  @Mutation(() => AutomationEntity)
  @UseGuards(BillingWriteGuard)
  async updateAutomation(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: AutomationInput,
  ): Promise<AutomationEntity> {
    await this.permissions.assert(
      user,
      Permission.FIELD_MANAGE,
      'Automationen zu verwalten',
    );

    const geaendert = await this.dienst.update(
      user.workspaceId,
      id,
      input,
      user.userId,
    );

    melden('automation_geaendert', user, geaendert);

    return geaendert;
  }

  @Mutation(() => AutomationEntity)
  @UseGuards(BillingWriteGuard)
  async setAutomationAktiv(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('aktiv') aktiv: boolean,
  ): Promise<AutomationEntity> {
    await this.permissions.assert(
      user,
      Permission.FIELD_MANAGE,
      'Automationen zu verwalten',
    );

    const geschaltet = await this.dienst.setAktiv(user.workspaceId, id, aktiv);

    melden('automation_geaendert', user, geschaltet, { aktiv });

    return geschaltet;
  }

  @Mutation(() => Boolean)
  async deleteAutomation(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.permissions.assert(
      user,
      Permission.FIELD_MANAGE,
      'Automationen zu verwalten',
    );

    const name = await this.dienst.nameVon(user.workspaceId, id);
    const geloescht = await this.dienst.remove(user.workspaceId, id);

    if (geloescht) {
      melden('automation_geloescht', user, { id, name: name ?? '' });
    }

    return geloescht;
  }
}
