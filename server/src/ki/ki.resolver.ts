import { UseGuards } from '@nestjs/common';
import {
  Args,
  Context,
  Field,
  ID,
  InputType,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  MaxLength,
  ValidateNested,
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
import { KiEinstellungEntity, KI_NUTZUNG } from './ki-einstellung.entity';
import { KI_ANBIETER } from './ki-modelle';
import {
  type ChatBezug,
  ENTWURF_ARTEN,
  type EntwurfArt,
  KiService,
  MAX_NACHRICHT,
  MAX_NACHRICHTEN,
} from './ki.service';

@InputType()
export class KiEinrichtenInput {
  @Field()
  @IsIn(KI_ANBIETER)
  anbieter: string;

  @Field()
  @IsNotEmpty()
  @MaxLength(80)
  modell: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(500)
  schluessel?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(KI_NUTZUNG)
  nutzung?: string | null;
}

@InputType()
export class KiBezugInput {
  @Field()
  @IsIn(['company', 'contact', 'deal', 'quote'])
  art: string;

  @Field(() => ID)
  @IsUUID()
  id: string;
}

@InputType()
export class KiNachrichtInput {
  @Field()
  @IsIn(['user', 'assistant'])
  rolle: string;

  @Field()
  @MaxLength(MAX_NACHRICHT)
  text: string;
}

@InputType()
export class KiChatInput {
  @Field(() => [KiNachrichtInput])
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_NACHRICHTEN)
  @ValidateNested({ each: true })
  @Type(() => KiNachrichtInput)
  nachrichten: KiNachrichtInput[];

  @Field(() => KiBezugInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => KiBezugInput)
  bezug?: KiBezugInput | null;
}

@InputType()
export class KiEntwurfInput {
  @Field()
  @IsIn(ENTWURF_ARTEN)
  art: string;

  @Field({ defaultValue: '' })
  @MaxLength(2000)
  anweisung: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(10_000)
  bisher?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(300)
  betreff?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(300)
  empfaenger?: string | null;

  @Field(() => KiBezugInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => KiBezugInput)
  bezug?: KiBezugInput | null;
}

@ObjectType()
export class KiChatVorschlag {
  @Field(() => ID)
  id: string;

  @Field()
  zusammenfassung: string;
}

@ObjectType()
export class KiChatSchritt {
  @Field()
  werkzeug: string;

  @Field()
  titel: string;

  @Field()
  ok: boolean;
}

@ObjectType()
export class KiChatAntwort {
  @Field()
  antwort: string;

  @Field(() => [KiChatVorschlag])
  vorschlaege: KiChatVorschlag[];

  @Field(() => [KiChatSchritt])
  schritte: KiChatSchritt[];

  @Field()
  gekuerzt: boolean;
}

@Resolver(() => KiEinstellungEntity)
@UseGuards(GqlAuthGuard, NurMenschWache)
export class KiResolver {
  constructor(
    private readonly dienst: KiService,
    private readonly permissions: PermissionsService,
  ) {}

  @Query(() => KiEinstellungEntity, { nullable: true })
  kiEinstellung(
    @CurrentUser() user: RequestUser,
  ): Promise<KiEinstellungEntity | null> {
    return this.dienst.stand(user.workspaceId);
  }

  @Mutation(() => KiEinstellungEntity)
  @UseGuards(GqlThrottlerGuard, BillingWriteGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async kiEinrichten(
    @CurrentUser() user: RequestUser,
    @Args('input') input: KiEinrichtenInput,
  ): Promise<KiEinstellungEntity> {
    await this.permissions.assert(
      user,
      Permission.KI_APPROVE,
      'die KI einzurichten',
    );

    return this.dienst.einrichten(user, input);
  }

  @Mutation(() => KiEinstellungEntity)
  @UseGuards(BillingWriteGuard)
  async kiNutzungSetzen(
    @CurrentUser() user: RequestUser,
    @Args('nutzung') nutzung: string,
  ): Promise<KiEinstellungEntity> {
    await this.permissions.assert(
      user,
      Permission.KI_APPROVE,
      'die KI einzustellen',
    );

    return this.dienst.nutzungSetzen(user, nutzung);
  }

  @Mutation(() => Boolean)
  async kiEntfernen(@CurrentUser() user: RequestUser): Promise<boolean> {
    await this.permissions.assert(
      user,
      Permission.KI_APPROVE,
      'die KI zu entfernen',
    );

    return this.dienst.entfernen(user);
  }

  @Mutation(() => KiChatAntwort)
  @UseGuards(GqlThrottlerGuard, BillingWriteGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  kiChat(
    @CurrentUser() user: RequestUser,
    @Context('req') req: unknown,
    @Args('input') input: KiChatInput,
  ): Promise<KiChatAntwort> {
    return this.dienst.chat(
      user,
      req,
      input.nachrichten.map((nachricht) => ({
        rolle: nachricht.rolle as 'user' | 'assistant',
        text: nachricht.text,
      })),
      (input.bezug ?? null) as ChatBezug | null,
    );
  }

  @Mutation(() => String)
  @UseGuards(GqlThrottlerGuard, BillingWriteGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  kiEntwurf(
    @CurrentUser() user: RequestUser,
    @Context('req') req: unknown,
    @Args('input') input: KiEntwurfInput,
  ): Promise<string> {
    return this.dienst.entwurf(user, req, {
      art: input.art as EntwurfArt,
      anweisung: input.anweisung,
      bisher: input.bisher,
      betreff: input.betreff,
      empfaenger: input.empfaenger,
      bezug: (input.bezug ?? null) as ChatBezug | null,
    });
  }
}
