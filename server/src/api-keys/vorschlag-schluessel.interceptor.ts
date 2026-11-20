import {
  type CallHandler,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { type Request } from 'express';
import { type GraphQLResolveInfo } from 'graphql';
import { type Observable } from 'rxjs';

import { type RequestUser } from '../auth/decorators/current-user.decorator';

export const VORSCHLAG_SCHLUESSEL_ERLAUBT: ReadonlySet<string> = new Set();

const LESEND = new Set(['GET', 'HEAD', 'OPTIONS']);

const ABGELEHNT =
  'Dieser Schlüssel schlägt nur vor und ändert nichts selbst. Änderungen legt der Assistent über den MCP-Server als Vorschlag zur Freigabe ab.';

@Injectable()
export class VorschlagSchluesselInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const art = context.getType<'http' | 'graphql'>();

    if (art === 'graphql') {
      const gql = GqlExecutionContext.create(context);
      const info = gql.getInfo<GraphQLResolveInfo>();

      if (
        info.operation.operation === 'mutation' &&
        info.path.prev === undefined &&
        !VORSCHLAG_SCHLUESSEL_ERLAUBT.has(info.fieldName) &&
        istVorschlagend(
          gql.getContext<{ req?: Request & { user?: RequestUser } }>().req,
        )
      ) {
        throw new ForbiddenException(ABGELEHNT);
      }
    } else if (art === 'http') {
      const request = context
        .switchToHttp()
        .getRequest<Request & { user?: RequestUser }>();

      if (
        !LESEND.has(request.method) &&
        request.path !== '/mcp' &&
        !request.path.startsWith('/mcp/') &&
        istVorschlagend(request)
      ) {
        throw new ForbiddenException(ABGELEHNT);
      }
    }

    return next.handle();
  }
}

const istVorschlagend = (
  request: (Request & { user?: RequestUser }) | undefined,
): boolean => request?.user?.apiKey?.schreibmodus === 'vorschlag';
