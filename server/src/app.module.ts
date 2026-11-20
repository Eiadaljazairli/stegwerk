import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { SentryModule } from '@sentry/nestjs/setup';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';

import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import { CalendarModule } from './calendar/calendar.module';
import { RemindersModule } from './reminders/reminders.module';
import { RetentionModule } from './retention/retention.module';
import { SavedViewsModule } from './saved-views/saved-views.module';
import { MailModule } from './mail/mail.module';
import { MailboxesModule } from './mailboxes/mailboxes.module';
import { KalenderSyncModule } from './kalender-sync/kalender-sync.module';
import { OAuthModule } from './oauth/oauth.module';
import { OAuthRueckrufModule } from './oauth/oauth-rueckruf.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { AuditModule } from './audit/audit.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { McpModule } from './mcp/mcp.module';
import { KiModule } from './ki/ki.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AutomationenModule } from './automationen/automationen.module';
import { WebFormsModule } from './web-forms/web-forms.module';
import { AuthModule } from './auth/auth.module';
import { BetriebModule } from './betrieb/betrieb.module';
import { UeberwachungModule } from './ueberwachung/ueberwachung.module';
import { PapierkorbModule } from './papierkorb/papierkorb.module';
import { FavoritenModule } from './favoriten/favoriten.module';
import { LiveModule } from './live/live.module';
import { UebersichtModule } from './uebersicht/uebersicht.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { SicherheitModule } from './sicherheit/sicherheit.module';
import { ArbeitsnachweisModule } from './sicherheit/arbeitsnachweis.module';
import { GlobalThrottlerGuard } from './auth/guards/gql-throttler.guard';
import { BillingModule } from './billing/billing.module';
import { configuration } from './config/configuration';
import { LegalModule } from './legal/legal.module';
import { SerienmailsModule } from './serienmails/serienmails.module';
import { VerteilerModule } from './verteiler/verteiler.module';
import { InvoicesModule } from './invoices/invoices.module';
import { BuchhaltungModule } from './buchhaltung/buchhaltung.module';
import { QuotesModule } from './quotes/quotes.module';
import { BegleitbelegeModule } from './begleitbelege/begleitbelege.module';
import { CrmModule } from './crm/crm.module';
import { HealthModule } from './health/health.module';
import { abfrageGrenzen } from './observability/abfrage-grenzen';
import { reportGraphQLError } from './observability/graphql-error.reporter';
import { RequestIdMiddleware } from './observability/request-id.middleware';
import { databaseSsl, databaseUrl } from './database/database-ssl';
import { DATABASE_ENTITIES } from './database/entities';
import { ExportModule } from './export/export.module';
import { ImportModule } from './import/import.module';
import { PrivacyModule } from './privacy/privacy.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { ObjektBezeichnungenModule } from './objekt-bezeichnungen/objekt-bezeichnungen.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isDevelopment =
          configService.get<string>('nodeEnv') === 'development';

        return {
          type: 'postgres' as const,
          url: databaseUrl(
            configService.getOrThrow<string>('databaseUrl'),
            configService.get<string>('databaseCaCert'),
          ),
          ssl: databaseSsl(configService.get<string>('databaseCaCert')),
          entities: DATABASE_ENTITIES,
          migrations: [join(__dirname, 'database/migrations/*.{ts,js}')],
          synchronize: false,
          logging: isDevelopment ? ['error', 'warn'] : ['error'],
        };
      },
    }),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isDevelopment =
          configService.get<string>('nodeEnv') === 'development';

        return {
          autoSchemaFile: join(process.cwd(), 'schema.gql'),
          sortSchema: true,
          playground: false,
          introspection: isDevelopment,
          context: ({ req }: { req: unknown }) => ({ req }),
          formatError: reportGraphQLError,
          validationRules: [abfrageGrenzen({ tiefe: 6, felder: 300 })],
        };
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
    ApiKeysModule,
    WebhooksModule,
    BuchhaltungModule,
    McpModule,
    KiModule,
    AutomationenModule,
    WebFormsModule,
    AuthModule,
    UeberwachungModule,
    BetriebModule,
    PapierkorbModule,
    FavoritenModule,
    LiveModule,
    UebersichtModule,
    OnboardingModule,
    SicherheitModule,
    ArbeitsnachweisModule,
    AttachmentsModule,
    AuditModule,
    MailModule,
    MailboxesModule,
    KalenderSyncModule,
    OAuthModule,
    OAuthRueckrufModule,
    CustomFieldsModule,
    SavedViewsModule,
    RetentionModule,
    BillingModule,
    WorkspacesModule,
    ObjektBezeichnungenModule,
    CrmModule,
    QuotesModule,
    InvoicesModule,
    BegleitbelegeModule,
    RemindersModule,
    CalendarModule,
    ImportModule,
    ExportModule,
    HealthModule,
    LegalModule,
    SerienmailsModule,
    VerteilerModule,
    PrivacyModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: GlobalThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
