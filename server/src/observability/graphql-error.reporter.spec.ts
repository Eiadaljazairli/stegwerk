import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import * as Sentry from '@sentry/nestjs';
import { type GraphQLFormattedError } from 'graphql';

import { reportGraphQLError } from './graphql-error.reporter';

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

const captureException = Sentry.captureException as jest.Mock;
const formatted = { message: 'x', path: ['company'] } as GraphQLFormattedError;

const asGraphQLError = (originalError: unknown) => ({ originalError });

describe('reportGraphQLError', () => {
  beforeEach(() => captureException.mockClear());

  it.each([
    ['a rejected sign-in', new UnauthorizedException('Incorrect password')],
    ['a missing record', new NotFoundException('Company not found')],
    [
      'a validation failure',
      new BadRequestException('name should not be empty'),
    ],
  ])('does not report %s', (_label, error) => {
    reportGraphQLError(formatted, asGraphQLError(error));

    expect(captureException).not.toHaveBeenCalled();
  });

  it('reports a fault the application raised deliberately as 5xx', () => {
    const error = new InternalServerErrorException('Stripe unreachable');

    reportGraphQLError(formatted, asGraphQLError(error));

    expect(captureException).toHaveBeenCalledWith(error, expect.anything());
  });

  it('reports anything that is not an HttpException at all', () => {
    const error = new Error('invalid input syntax for type uuid');

    reportGraphQLError(formatted, asGraphQLError(error));

    expect(captureException).toHaveBeenCalledWith(error, expect.anything());
  });

  it('tags the report with the field that failed', () => {
    reportGraphQLError(formatted, asGraphQLError(new Error('boom')));

    expect(captureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tags: expect.objectContaining({ graphqlPath: 'company' }),
      }),
    );
  });

  it('returns the error to the client unchanged', () => {
    expect(
      reportGraphQLError(formatted, asGraphQLError(new Error('boom'))),
    ).toBe(formatted);
  });

  it('sagt auf Deutsch, dass gedrosselt wurde', () => {
    const antwort = reportGraphQLError(
      formatted,
      asGraphQLError(new ThrottlerException()),
    );

    expect(antwort.message).toContain('Zu viele Versuche');
    expect(captureException).not.toHaveBeenCalled();
  });

  it('reicht die Sätze der Eingabeprüfung durch statt "Bad Request Exception"', () => {
    const error = new BadRequestException([
      'Die Beraternummer hat 4 bis 7 Ziffern.',
      'Die Mandantennummer hat 1 bis 5 Ziffern.',
    ]);

    expect(reportGraphQLError(formatted, asGraphQLError(error)).message).toBe(
      'Die Beraternummer hat 4 bis 7 Ziffern. Die Mandantennummer hat 1 bis 5 Ziffern.',
    );
  });

  it('lässt eine eigene Meldung, wie sie ist', () => {
    const error = new BadRequestException('Bitte einen Zeitraum wählen.');

    expect(reportGraphQLError(formatted, asGraphQLError(error))).toBe(
      formatted,
    );
  });

  it('meldet „nicht gefunden“ als NOT_FOUND, nicht als Serverfehler', () => {
    const mitApolloCode = {
      ...formatted,
      extensions: { code: 'INTERNAL_SERVER_ERROR', stacktrace: ['…'] },
    } as GraphQLFormattedError;
    const antwort = reportGraphQLError(
      mitApolloCode,
      asGraphQLError(new NotFoundException('Das liegt nicht im Papierkorb.')),
    );

    expect(antwort.extensions).toEqual({
      code: 'NOT_FOUND',
      stacktrace: ['…'],
    });
    expect(antwort.message).toBe('x');
    expect(
      reportGraphQLError(
        mitApolloCode,
        asGraphQLError(new BadRequestException('Bitte einen Zeitraum wählen.')),
      ),
    ).toBe(mitApolloCode);
  });
});

describe('deutsche Meldungen statt englischer', () => {
  it('übersetzt die Standardsätze der Eingabeprüfung', () => {
    const fehler = new BadRequestException([
      'amount must not be less than 0',
      'email must be an email',
      'name should not be empty',
      'weitereEmails.0.email must be shorter than or equal to 320 characters',
    ]);

    expect(reportGraphQLError(formatted, asGraphQLError(fehler)).message).toBe(
      'Betrag darf nicht kleiner als 0 sein. E-Mail: bitte eine gültige E-Mail-Adresse. Name darf nicht leer sein. E-Mail darf höchstens 320 Zeichen lang sein.',
    );
  });

  it('lässt eigene deutsche Sätze unverändert', () => {
    const fehler = new BadRequestException([
      'Die Wahrscheinlichkeit liegt zwischen 0 und 100 %.',
    ]);

    expect(reportGraphQLError(formatted, asGraphQLError(fehler)).message).toBe(
      'Die Wahrscheinlichkeit liegt zwischen 0 und 100 %.',
    );
  });

  it('sagt auf Deutsch, was die Datenbank an der Eingabe störte', () => {
    const ueberlauf = Object.assign(new Error('numeric field overflow'), {
      driverError: { code: '22003' },
    });
    const datum = Object.assign(
      new Error('date/time field value out of range'),
      { driverError: { code: '22008' } },
    );

    expect(
      reportGraphQLError(formatted, asGraphQLError(ueberlauf)).message,
    ).toBe('Eine Zahl ist zu groß.');
    expect(reportGraphQLError(formatted, asGraphQLError(datum)).message).toBe(
      'Dieses Datum gibt es nicht.',
    );
    expect(captureException).toHaveBeenCalled();
  });
});
