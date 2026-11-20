import * as Sentry from '@sentry/nestjs';
import { config as loadEnv } from 'dotenv';

import { getRequestContext } from './request-context';
import { scrubEvent } from './scrub';

export const initialiseSentry = (): boolean => {
  loadEnv();

  const dsn = process.env.SENTRY_DSN;

  if (dsn === undefined || dsn === '') {
    return false;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,

    sendDefaultPii: false,

    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),

    beforeSend: (event) => scrubEvent(event, getRequestContext()),
  });

  return true;
};
