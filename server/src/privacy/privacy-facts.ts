import { fristen } from '../ueberwachung/protokoll-aufbewahrung';

export type PrivacyFacts = {
  reviewed: boolean;

  dpaReviewed: boolean;

  backupDescription: string | null;

  hosting: string | null;

  privacyContact: string | null;

  supervisoryAuthority: string | null;

  billing: boolean;

  errorReporting: boolean;

  outgoingMail: boolean;

  mailboxes: boolean;

  retentionDays: number;

  retentionEnabled: boolean;

  protokollAenderungenMonate: number;
  protokollSicherheitMonate: number;
};

const oderNichts = (wert: string | undefined): string | null =>
  wert === undefined || wert.trim() === '' ? null : wert.trim();

export type PrivacyEnvironment = {
  LEGAL_PRIVACY_REVIEWED?: string;
  LEGAL_DPA_REVIEWED?: string;
  LEGAL_BACKUP_DESCRIPTION?: string;
  LEGAL_HOSTING?: string;
  LEGAL_PRIVACY_CONTACT?: string;
  LEGAL_SUPERVISORY_AUTHORITY?: string;
  STRIPE_SECRET_KEY?: string;
  SENTRY_DSN?: string;
  SMTP_HOST?: string;
  MAIL_ENCRYPTION_KEY?: string;
  RETENTION_DAYS?: string;
  RETENTION_SWEEP_ENABLED?: string;
  PROTOKOLL_AENDERUNGEN_MONATE?: string;
  PROTOKOLL_SICHERHEIT_MONATE?: string;
};

export const privacyFacts = (env: PrivacyEnvironment): PrivacyFacts => ({
  reviewed: env.LEGAL_PRIVACY_REVIEWED === 'true',
  dpaReviewed: env.LEGAL_DPA_REVIEWED === 'true',
  backupDescription: oderNichts(env.LEGAL_BACKUP_DESCRIPTION),

  hosting: oderNichts(env.LEGAL_HOSTING),
  privacyContact: oderNichts(env.LEGAL_PRIVACY_CONTACT),
  supervisoryAuthority: oderNichts(env.LEGAL_SUPERVISORY_AUTHORITY),

  billing: oderNichts(env.STRIPE_SECRET_KEY) !== null,
  errorReporting: oderNichts(env.SENTRY_DSN) !== null,
  outgoingMail: oderNichts(env.SMTP_HOST) !== null,
  mailboxes: oderNichts(env.MAIL_ENCRYPTION_KEY) !== null,

  retentionDays: Number(env.RETENTION_DAYS ?? 90),
  retentionEnabled: env.RETENTION_SWEEP_ENABLED === 'true',

  protokollAenderungenMonate: fristen({
    aenderungenMonate: env.PROTOKOLL_AENDERUNGEN_MONATE,
  }).aenderungen,
  protokollSicherheitMonate: fristen({
    sicherheitMonate: env.PROTOKOLL_SICHERHEIT_MONATE,
  }).sicherheit,
});
