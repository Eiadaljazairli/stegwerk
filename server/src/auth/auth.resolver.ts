import { UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Args, Context, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { type Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserEntity } from '../users/user.entity';
import { AuthService } from './auth.service';
import { EmailVerificationsService } from './email-verifications.service';
import { PasswordResetsService } from './password-resets.service';
import { RefreshTokensService } from './refresh-tokens.service';
import {
  CurrentUser,
  type RequestUser,
} from './decorators/current-user.decorator';
import {
  AuthPayload,
  RefreshInput,
  RequestPasswordResetInput,
  ResetPasswordInput,
  SignInInput,
  SignUpInput,
  VerifyEmailInput,
} from './dto/auth.dto';
import { NurMenschWache } from '../api-keys/api-key.guard';
import { ArbeitsnachweisGuard } from '../sicherheit/arbeitsnachweis.guard';
import { GqlAuthGuard } from './guards/gql-auth.guard';
import { GqlThrottlerGuard } from './guards/gql-throttler.guard';
import { liesSitzung, loescheSitzung, setzeSitzung } from './sitzungs-cookie';

type Kontext = { req: Request };

@Resolver()
export class AuthResolver {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetsService: PasswordResetsService,
    private readonly emailVerificationsService: EmailVerificationsService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly config: ConfigService,
    private readonly refreshTokens: RefreshTokensService,
  ) {}

  private async mitCookie(
    kontext: Kontext,
    payload: Promise<AuthPayload>,
  ): Promise<AuthPayload> {
    const fertig = await payload;

    setzeSitzung(
      kontext.req.res,
      fertig.refreshToken,
      fertig.angemeldetBleiben
        ? (this.config.get<number>('refreshTokenDays') ?? 30)
        : null,
    );

    return { ...fertig, refreshToken: '' };
  }

  @Mutation(() => AuthPayload)
  @UseGuards(GqlThrottlerGuard, ArbeitsnachweisGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  signUp(
    @Args('input') input: SignUpInput,
    @Context() kontext: Kontext,
  ): Promise<AuthPayload> {
    return this.mitCookie(kontext, this.authService.signUp(input));
  }

  @Mutation(() => AuthPayload)
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  signIn(
    @Args('input') input: SignInInput,
    @Context() kontext: Kontext,
  ): Promise<AuthPayload> {
    return this.mitCookie(kontext, this.authService.signIn(input));
  }

  @Mutation(() => AuthPayload)
  refresh(
    @Context() kontext: Kontext,
    @Args('input', { nullable: true }) input?: RefreshInput,
  ): Promise<AuthPayload> {
    const token = input?.refreshToken ?? liesSitzung(kontext.req);

    if (token === null) {
      throw new UnauthorizedException(
        'Keine Sitzung. Bitte melden Sie sich an.',
      );
    }

    return this.mitCookie(
      kontext,
      this.authService.refresh(token, input?.letzteEingabe),
    );
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlThrottlerGuard, ArbeitsnachweisGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async requestPasswordReset(
    @Args('input') input: RequestPasswordResetInput,
  ): Promise<boolean> {
    await this.passwordResetsService.request(input.email);

    return true;
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPassword(
    @Args('input') input: ResetPasswordInput,
  ): Promise<boolean> {
    await this.passwordResetsService.complete(input.token, input.password);

    return true;
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard, NurMenschWache, GqlThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async verifyEmail(
    @CurrentUser() user: RequestUser,
    @Args('input') input: VerifyEmailInput,
  ): Promise<boolean> {
    await this.emailVerificationsService.verify(input.token, user.userId);

    return true;
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard, NurMenschWache, GqlThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async resendEmailVerification(
    @CurrentUser() user: RequestUser,
  ): Promise<boolean> {
    await this.emailVerificationsService.send(user.userId);

    return true;
  }

  @Mutation(() => Boolean)
  async signOut(
    @Context() kontext: Kontext,
    @Args('input', { nullable: true }) input?: RefreshInput,
  ): Promise<boolean> {
    const token = input?.refreshToken ?? liesSitzung(kontext.req);

    if (token !== null) {
      await this.authService.signOut(token);
    }

    loescheSitzung(kontext.req.res);

    return true;
  }

  @Mutation(() => AuthPayload)
  @UseGuards(GqlAuthGuard, NurMenschWache)
  async switchWorkspace(
    @CurrentUser() user: RequestUser,
    @Args('workspaceId', { type: () => ID }) workspaceId: string,
    @Context() kontext: Kontext,
  ): Promise<AuthPayload> {
    const dauerhaft = await this.refreshTokens.istDauerhaft(
      liesSitzung(kontext.req),
    );

    return this.mitCookie(
      kontext,
      this.authService.switchWorkspace(user.userId, workspaceId, dauerhaft),
    );
  }

  @Query(() => UserEntity)
  @UseGuards(GqlAuthGuard, NurMenschWache)
  me(@CurrentUser() user: RequestUser): Promise<UserEntity> {
    return this.userRepository.findOneOrFail({ where: { id: user.userId } });
  }
}
