import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { type Request } from 'express';
import { type GraphQLResolveInfo } from 'graphql';
import { from, type Observable, switchMap } from 'rxjs';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { BetriebService } from './betrieb.service';
import { WartungService } from './wartung.service';

export const IN_WARTUNG_ERLAUBT = new Set([
  'signIn',
  'signOut',
  'refresh',
  'switchWorkspace',
  'verifyEmail',
  'requestPasswordReset',
  'resetPassword',
  'sitzungBeenden',
  'andereSitzungenBeenden',
]);

const LESEND = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class WartungInterceptor implements NestInterceptor {
  constructor(
    private readonly wartung: WartungService,
    private readonly betrieb: BetriebService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const art = context.getType<'http' | 'graphql'>();
    let request: (Request & { user?: RequestUser }) | undefined;

    if (art === 'graphql') {
      const gql = GqlExecutionContext.create(context);
      const info = gql.getInfo<GraphQLResolveInfo>();

      if (
        info.operation.operation !== 'mutation' ||
        info.path.prev !== undefined ||
        IN_WARTUNG_ERLAUBT.has(info.fieldName)
      ) {
        return next.handle();
      }

      request = gql.getContext<{ req?: Request & { user?: RequestUser } }>()
        .req;
    } else if (art === 'http') {
      request = context
        .switchToHttp()
        .getRequest<Request & { user?: RequestUser }>();

      if (
        LESEND.has(request.method) ||
        request.path.startsWith('/public/') ||
        request.path.startsWith('/billing/')
      ) {
        return next.handle();
      }
    } else {
      return next.handle();
    }

    return from(this.wartung.wartungLaeuft()).pipe(
      switchMap((hinweis) => {
        const email = request?.user?.email;

        if (
          hinweis === null ||
          (email !== undefined && this.betrieb.istBetreiber(email))
        ) {
          return next.handle();
        }

        throw new ServiceUnavailableException(
          `Wartung: ${hinweis.text} Ihre Änderung wurde nicht gespeichert.`,
        );
      }),
    );
  }
}
