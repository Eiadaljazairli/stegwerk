import { BadRequestException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { type CookieOptions, type Request } from 'express';
import { DataSource } from 'typeorm';

import { NurMenschWache } from '../api-keys/api-key.guard';
import { ArbeitsnachweisGuard } from '../sicherheit/arbeitsnachweis.guard';
import { UserEntity } from '../users/user.entity';
import { AnmeldeVerknuepfungEntity } from './anmeldung-sso.entities';
import {
  CurrentUser,
  type RequestUser,
} from './decorators/current-user.decorator';
import { AuthPayload } from './dto/auth.dto';
import { GqlAuthGuard } from './guards/gql-auth.guard';
import { GqlThrottlerGuard } from './guards/gql-throttler.guard';
import { PasswordResetsService } from './password-resets.service';
import { liesCookie, setzeSitzung } from './sitzungs-cookie';
import { SsoService } from './sso.service';

export const SSO_COOKIE = 'stegwerk_anmeldung';

export const ssoCookieOptionen = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/oauth/anmelden',
  maxAge: 10 * 60_000,
});

export const SSO_EINLOESE_COOKIE = 'stegwerk_einloesung';

export const ssoEinloeseCookieOptionen = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/graphql',
  maxAge: 5 * 60_000,
});

type Kontext = { req: Request };

const begrenzt = (wert: string | null | undefined, laenge: number): string => {
  const text = (wert ?? '').trim();

  if (text.length > laenge) {
    throw new BadRequestException('Die Eingabe ist zu lang.');
  }

  return text;
};

@Resolver()
export class SsoResolver {
  constructor(
    private readonly sso: SsoService,
    private readonly config: ConfigService,
    private readonly passwordResets: PasswordResetsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private mitBindung(
    kontext: Kontext,
    start: { url: string; bindung: string },
  ) {
    kontext.req.res?.cookie(SSO_COOKIE, start.bindung, ssoCookieOptionen());

    return start.url;
  }

  @Query(() => [String])
  anmeldeAnbieter(): string[] {
    return this.sso.konfiguriert();
  }

  @Mutation(() => String)
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async anmeldungStarten(
    @Args('anbieter') anbieter: string,
    @Context() kontext: Kontext,
    @Args('angemeldetBleiben', { type: () => Boolean, nullable: true })
    angemeldetBleiben: boolean | null,
  ): Promise<string> {
    return this.mitBindung(
      kontext,
      await this.sso.starten({
        anbieter: begrenzt(anbieter, 20),
        zweck: 'anmelden',
        angemeldetBleiben: angemeldetBleiben ?? true,
      }),
    );
  }

  @Mutation(() => String)
  @UseGuards(GqlThrottlerGuard, ArbeitsnachweisGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async registrierungStarten(
    @Args('anbieter') anbieter: string,
    @Args('arbeitsbereich') arbeitsbereich: string,
    @Context() kontext: Kontext,
  ): Promise<string> {
    return this.mitBindung(
      kontext,
      await this.sso.starten({
        anbieter: begrenzt(anbieter, 20),
        zweck: 'registrieren',
        arbeitsbereich: begrenzt(arbeitsbereich, 120),
      }),
    );
  }

  @Mutation(() => AuthPayload)
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async anmeldungEinloesen(
    @Args('token') token: string,
    @Args('totpCode', { type: () => String, nullable: true })
    totpCode: string | null,
    @Context() kontext: Kontext,
  ): Promise<AuthPayload> {
    const code = begrenzt(totpCode, 64);
    const fertig = await this.sso.einloesen(
      begrenzt(token, 100),
      liesCookie(kontext.req, SSO_EINLOESE_COOKIE),
      code === '' ? undefined : code,
    );

    kontext.req.res?.clearCookie(SSO_EINLOESE_COOKIE, {
      ...ssoEinloeseCookieOptionen(),
      maxAge: undefined,
    });

    setzeSitzung(
      kontext.req.res,
      fertig.refreshToken,
      fertig.angemeldetBleiben
        ? (this.config.get<number>('refreshTokenDays') ?? 30)
        : null,
    );

    return { ...fertig, refreshToken: '' };
  }

  @Query(() => [AnmeldeVerknuepfungEntity])
  @UseGuards(GqlAuthGuard, NurMenschWache)
  anmeldeVerknuepfungen(
    @CurrentUser() user: RequestUser,
  ): Promise<AnmeldeVerknuepfungEntity[]> {
    return this.sso.verknuepfungenVon(user.userId);
  }

  @Mutation(() => String)
  @UseGuards(GqlAuthGuard, NurMenschWache, GqlThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async anmeldungVerknuepfenStarten(
    @CurrentUser() user: RequestUser,
    @Args('anbieter') anbieter: string,
    @Args('passwort', { type: () => String, nullable: true })
    passwort: string | null,
    @Context() kontext: Kontext,
  ): Promise<string> {
    await this.sso.verknuepfenErlaubt(
      user.userId,
      passwort === null ? undefined : begrenzt(passwort, 128),
    );

    return this.mitBindung(
      kontext,
      await this.sso.starten({
        anbieter: begrenzt(anbieter, 20),
        zweck: 'verknuepfen',
        userId: user.userId,
      }),
    );
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard, NurMenschWache, GqlThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async anmeldungTrennen(
    @CurrentUser() user: RequestUser,
    @Args('anbieter') anbieter: string,
  ): Promise<boolean> {
    await this.sso.trennen(user.userId, begrenzt(anbieter, 20));

    return true;
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard, NurMenschWache, GqlThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async passwortLinkSenden(@CurrentUser() user: RequestUser): Promise<boolean> {
    const konto = await this.dataSource
      .getRepository(UserEntity)
      .findOneOrFail({ where: { id: user.userId } });

    await this.passwordResets.request(konto.email);

    return true;
  }
}
