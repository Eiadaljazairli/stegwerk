import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { type Request } from 'express';
import { type GraphQLResolveInfo } from 'graphql';
import { type Observable } from 'rxjs';

import { bereichFuer, NutzungService } from './nutzung.service';

@Injectable()
export class NutzungInterceptor implements NestInterceptor {
  constructor(private readonly nutzung: NutzungService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    try {
      this.zaehle(context);
    } catch {}

    return next.handle();
  }

  private zaehle(context: ExecutionContext): void {
    let request: Request | undefined;
    let aendern: boolean;

    if (context.getType<string>() === 'graphql') {
      const gql = GqlExecutionContext.create(context);
      const info = gql.getInfo<GraphQLResolveInfo>();
      const oben = info.parentType.name;

      if (oben !== 'Query' && oben !== 'Mutation') {
        return;
      }

      request = gql.getContext<{ req?: Request }>().req;
      aendern = oben === 'Mutation';
    } else if (context.getType() === 'http') {
      request = context.switchToHttp().getRequest<Request>();
      aendern = request.method !== 'GET' && request.method !== 'HEAD';
    } else {
      return;
    }

    const user = request?.user;

    if (user === undefined || user.apiKey !== undefined) {
      return;
    }

    this.nutzung.merke(
      user.userId,
      bereichFuer(context.getClass().name, aendern),
      aendern,
    );
  }
}
