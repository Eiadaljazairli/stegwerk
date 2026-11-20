import * as Sentry from '@sentry/react';

let enabled = false;

let lastSentEventId: string | undefined;

const recentlyReported = new Map<string, number>();
const ECHO_WINDOW_MS = 3000;

const isEcho = (event: { exception?: { values?: { value?: string }[] } }) => {
  const message = event.exception?.values?.[0]?.value;

  if (message === undefined) {
    return false;
  }

  const now = Date.now();

  for (const [seen, at] of recentlyReported) {
    if (now - at > ECHO_WINDOW_MS) {
      recentlyReported.delete(seen);
    }
  }

  if (recentlyReported.has(message)) {
    return true;
  }

  recentlyReported.set(message, now);

  return false;
};

export const isErrorTrackingEnabled = (): boolean => enabled;

export const initialiseSentry = (): boolean => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (typeof dsn !== 'string' || dsn === '') {
    return false;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    sendDefaultPii: false,

    beforeSend(event) {
      if (isEcho(event)) {
        return null;
      }

      if (event.request?.url !== undefined) {
        event.request.url = event.request.url.split('?')[0];
      }

      delete event.request?.cookies;
      delete event.request?.headers;

      lastSentEventId = event.event_id;

      return event;
    },
  });

  enabled = true;

  return true;
};

export const ErrorBoundary = Sentry.ErrorBoundary;

export const getLastEventId = (): string | undefined => lastSentEventId;
