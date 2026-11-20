import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { ApiKeysModule } from './api-keys.module';
import {
  VORSCHLAG_SCHLUESSEL_ERLAUBT,
  VorschlagSchluesselInterceptor,
} from './vorschlag-schluessel.interceptor';

const person: RequestUser = {
  userId: 'u1',
  workspaceId: 'w1',
  email: 'anna@example.test',
};

const schluessel = (schreibmodus: 'direkt' | 'vorschlag'): RequestUser => ({
  userId: 'k1',
  workspaceId: 'w1',
  email: 'Assistent (Schlüssel)',
  apiKey: {
    id: 'k1',
    name: 'Assistent',
    permissions: ['deal:view'],
    schreibmodus,
  },
});

const graphql = (
  user: RequestUser,
  fieldName: string,
  operation: 'mutation' | 'query' = 'mutation',
  verschachtelt = false,
): ExecutionContext => {
  const args = [
    {},
    {},
    { req: { user } },
    {
      fieldName,
      operation: { operation },
      path: verschachtelt
        ? { key: fieldName, prev: { key: 'oben', prev: undefined } }
        : { key: fieldName, prev: undefined },
    },
  ];

  return {
    getType: () => 'graphql',
    getArgs: () => args,
    getArgByIndex: (index: number) => args[index],
    getClass: () => Object,
    getHandler: () => () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
};

const http = (
  user: RequestUser,
  method: string,
  path: string,
): ExecutionContext =>
  ({
    getType: () => 'http',
    getArgs: () => [],
    getClass: () => Object,
    getHandler: () => () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user, method, path }) }),
  }) as unknown as ExecutionContext;

const wache = new VorschlagSchluesselInterceptor();
const weiter = { handle: () => of('ok') };

const laeuft = (context: ExecutionContext) =>
  lastValueFrom(wache.intercept(context, weiter));

describe('VorschlagSchluesselInterceptor', () => {
  it.each([
    'sendMail',
    'connectMailbox',
    'disconnectMailbox',
    'setMailSichtbarkeit',
    'setPostfachEinstellungen',
    'updateDeal',
    'mailEntwurfAnlegen',
  ])('lehnt %s für einen vorschlagenden Schlüssel ab', (feld) => {
    expect(() =>
      wache.intercept(graphql(schluessel('vorschlag'), feld), weiter),
    ).toThrow(ForbiddenException);
  });

  it('lässt Abfragen eines vorschlagenden Schlüssels durch', async () => {
    await expect(
      laeuft(graphql(schluessel('vorschlag'), 'deals', 'query')),
    ).resolves.toBe('ok');
  });

  it('prüft nur das oberste Feld einer Mutation', async () => {
    await expect(
      laeuft(graphql(schluessel('vorschlag'), 'company', 'mutation', true)),
    ).resolves.toBe('ok');
  });

  it('lässt direkte Schlüssel und Menschen schreiben', async () => {
    await expect(
      laeuft(graphql(schluessel('direkt'), 'sendMail')),
    ).resolves.toBe('ok');
    await expect(laeuft(graphql(person, 'sendMail'))).resolves.toBe('ok');
  });

  it('erlaubt von sich aus keine einzige Mutation', () => {
    expect(VORSCHLAG_SCHLUESSEL_ERLAUBT.size).toBe(0);
  });

  it('lehnt schreibende HTTP-Aufrufe ab, ausser am MCP-Einstieg', async () => {
    expect(() =>
      wache.intercept(
        http(schluessel('vorschlag'), 'POST', '/attachments'),
        weiter,
      ),
    ).toThrow(ForbiddenException);
    await expect(
      laeuft(http(schluessel('vorschlag'), 'POST', '/mcp')),
    ).resolves.toBe('ok');
    await expect(
      laeuft(http(schluessel('vorschlag'), 'GET', '/export/deals.csv')),
    ).resolves.toBe('ok');
    await expect(
      laeuft(http(schluessel('direkt'), 'POST', '/attachments')),
    ).resolves.toBe('ok');
  });

  it('ist als globaler Interceptor eingetragen', () => {
    const anbieter = Reflect.getMetadata('providers', ApiKeysModule) as {
      provide?: unknown;
      useClass?: unknown;
    }[];

    expect(anbieter).toContainEqual({
      provide: APP_INTERCEPTOR,
      useClass: VorschlagSchluesselInterceptor,
    });
  });
});
