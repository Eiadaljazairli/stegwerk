export type AppConfig = {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  databaseCaCert: string | undefined;
  jwtSecret: string;
  jwtExpiresIn: string;
  refreshTokenDays: number;
  webOrigin: string;
  webRoot?: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  stripePrice: Record<string, Record<string, string>>;
  mail: {
    host: string;
    port: number;
    user: string;
    password: string;
    from: string;
    fromName: string;
  };
  retention: {
    days: number;
    enabled: boolean;
  };
  protokolle: {
    aenderungenMonate: number;
    sicherheitMonate: number;
    wartungsmodus: boolean;
  };
  appVersion: string;
  mailEncryptionKey: string;
  mailEncryptionKeyAlt: string;
  oauth: {
    apiOrigin: string;
    google: { clientId: string; clientSecret: string };
    microsoft: { clientId: string; clientSecret: string; tenant: string };
  };
  totpEncryptionKey: string;
  totpEncryptionKeyAlt: string;
  legal: Record<string, string>;
  betreiberEmails: string[];
  arbeitsnachweisSchluessel: string;
  sicherungStand: string;
};

const requireEnv = (name: string): string => {
  const value = process.env[name];

  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

export const configuration = (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: requireEnv('DATABASE_URL'),
  databaseCaCert: process.env.DATABASE_CA_CERT,
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS ?? 30),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5273',
  webRoot: process.env.WEB_ROOT,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  stripePrice: {
    starter: {
      month: process.env.STRIPE_PRICE_STARTER_MONTH ?? '',
      year: process.env.STRIPE_PRICE_STARTER_YEAR ?? '',
    },
    professional: {
      month: process.env.STRIPE_PRICE_PROFESSIONAL_MONTH ?? '',
      year: process.env.STRIPE_PRICE_PROFESSIONAL_YEAR ?? '',
    },
  },
  mail: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    from: process.env.MAIL_FROM ?? 'noreply@localhost',
    fromName: process.env.MAIL_FROM_NAME ?? 'Stegwerk',
  },
  mailEncryptionKey: process.env.MAIL_ENCRYPTION_KEY ?? '',
  mailEncryptionKeyAlt: process.env.MAIL_ENCRYPTION_KEY_ALT ?? '',
  oauth: {
    apiOrigin:
      process.env.OAUTH_REDIRECT_ORIGIN ||
      process.env.WEB_ORIGIN ||
      'http://localhost:4000',
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID ?? '',
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
      tenant: process.env.MICROSOFT_TENANT || 'common',
    },
  },
  totpEncryptionKey: process.env.TOTP_ENCRYPTION_KEY ?? '',
  totpEncryptionKeyAlt: process.env.TOTP_ENCRYPTION_KEY_ALT ?? '',
  retention: {
    days: Number(process.env.RETENTION_DAYS ?? 90),
    enabled: process.env.RETENTION_SWEEP_ENABLED === 'true',
  },
  protokolle: {
    aenderungenMonate: Number(process.env.PROTOKOLL_AENDERUNGEN_MONATE ?? 24),
    sicherheitMonate: Number(process.env.PROTOKOLL_SICHERHEIT_MONATE ?? 12),
    wartungsmodus: process.env.WARTUNGSMODUS === 'true',
  },
  appVersion: process.env.APP_VERSION ?? '',
  arbeitsnachweisSchluessel: process.env.ARBEITSNACHWEIS_SCHLUESSEL ?? '',
  sicherungStand: process.env.SICHERUNG_STAND ?? '',
  betreiberEmails: (process.env.BETREIBER_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email !== ''),
  legal: {
    companyName: process.env.LEGAL_COMPANY_NAME ?? '',
    legalForm: process.env.LEGAL_FORM ?? '',
    street: process.env.LEGAL_STREET ?? '',
    postalCode: process.env.LEGAL_POSTAL_CODE ?? '',
    city: process.env.LEGAL_CITY ?? '',
    country: process.env.LEGAL_COUNTRY ?? 'Deutschland',
    email: process.env.LEGAL_EMAIL ?? '',
    phone: process.env.LEGAL_PHONE ?? '',
    representative: process.env.LEGAL_REPRESENTATIVE ?? '',
    registerEntry: process.env.LEGAL_REGISTER_ENTRY ?? '',
    vatId: process.env.LEGAL_VAT_ID ?? '',
  },
});
