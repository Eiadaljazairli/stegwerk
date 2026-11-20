import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserEntity } from '../users/user.entity';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
import { EmailVerificationEntity } from './email-verification.entity';
import { EmailVerificationsService } from './email-verifications.service';
import { JwtStrategy } from './jwt.strategy';
import { PasswordResetEntity } from './password-reset.entity';
import { PasswordResetsService } from './password-resets.service';
import { RefreshTokenEntity } from './refresh-token.entity';
import { RefreshTokensService } from './refresh-tokens.service';
import { SitzungenResolver } from './sitzungen.resolver';
import { KontoResolver } from './konto.resolver';
import { KontoService } from './konto.service';
import { EmailAenderungEntity } from './email-aenderung.entity';
import { MembershipEntity } from '../workspaces/membership.entity';
import { TwoFactorResolver } from './two-factor.resolver';
import { TwoFactorService } from './two-factor.service';
import { sichererTransport } from '../kalender-sync/caldav-client';
import {
  AnmeldeEinloesungEntity,
  AnmeldeVerknuepfungEntity,
  AnmeldeVorgangEntity,
} from './anmeldung-sso.entities';
import { SsoController } from './sso.controller';
import { SsoResolver } from './sso.resolver';
import { SSO_TRANSPORT, SsoService } from './sso.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      RefreshTokenEntity,
      PasswordResetEntity,
      EmailVerificationEntity,
      MembershipEntity,
      EmailAenderungEntity,
      AnmeldeVerknuepfungEntity,
      AnmeldeVorgangEntity,
      AnmeldeEinloesungEntity,
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('jwtSecret'),
        signOptions: {
          expiresIn: configService.getOrThrow<string>(
            'jwtExpiresIn',
          ) as `${number}m`,
        },
      }),
    }),
    WorkspacesModule,
  ],
  providers: [
    AuthService,
    AuthResolver,
    JwtStrategy,
    RefreshTokensService,
    TwoFactorService,
    TwoFactorResolver,
    SitzungenResolver,
    KontoResolver,
    KontoService,
    PasswordResetsService,
    EmailVerificationsService,
    SsoService,
    SsoResolver,
    { provide: SSO_TRANSPORT, useFactory: () => sichererTransport(false) },
  ],
  controllers: [SsoController],
  exports: [AuthService, RefreshTokensService, TwoFactorService],
})
export class AuthModule {}
