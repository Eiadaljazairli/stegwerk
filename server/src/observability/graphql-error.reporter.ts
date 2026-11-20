import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { type GraphQLFormattedError } from 'graphql';

import { datenbankMeldung, deutscherSatz } from './deutsche-meldung';
import { getRequestContext } from './request-context';

export const reportGraphQLError = (
  formatted: GraphQLFormattedError,
  error: unknown,
): GraphQLFormattedError => {
  const original =
    error !== null && typeof error === 'object' && 'originalError' in error
      ? (error as { originalError?: unknown }).originalError
      : undefined;

  const cause = original ?? error;

  const isExpected = cause instanceof HttpException && cause.getStatus() < 500;

  if (!isExpected) {
    const context = getRequestContext();

    Sentry.captureException(cause, {
      tags: {
        graphqlPath: formatted.path?.join('.') ?? 'unknown',
        requestId: context?.requestId ?? 'none',
      },
    });
  }

  const lesbar = lesbareMeldung(cause) ?? datenbankMeldung(cause);
  const ergebnis =
    lesbar === null ? formatted : { ...formatted, message: lesbar };

  return mitCode(ergebnis, cause);
};

const mitCode = (
  formatted: GraphQLFormattedError,
  cause: unknown,
): GraphQLFormattedError =>
  cause instanceof NotFoundException
    ? {
        ...formatted,
        extensions: { ...formatted.extensions, code: 'NOT_FOUND' },
      }
    : formatted;

const lesbareMeldung = (cause: unknown): string | null => {
  if (!(cause instanceof HttpException)) {
    return null;
  }

  if (cause.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
    return 'Zu viele Versuche in kurzer Zeit. Bitte warten Sie eine Minute und versuchen Sie es dann erneut.';
  }

  const antwort = cause.getResponse();

  if (
    typeof antwort === 'object' &&
    antwort !== null &&
    'message' in antwort &&
    Array.isArray(antwort.message) &&
    antwort.message.length > 0 &&
    antwort.message.every((teil) => typeof teil === 'string')
  ) {
    return (antwort.message as string[]).map(deutscherSatz).join(' ');
  }

  const einzeln = cause.message;
  const deutsch = deutscherSatz(einzeln);

  return deutsch === einzeln ? null : deutsch;
};
