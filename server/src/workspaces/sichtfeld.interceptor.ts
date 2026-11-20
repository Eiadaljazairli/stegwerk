import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { type Request } from 'express';
import { type Observable } from 'rxjs';

import { PermissionsService } from './permissions.service';
import { setzeSichtfeld } from './sichtbarkeit';

@Injectable()
export class SichtfeldInterceptor implements NestInterceptor {
  constructor(private readonly permissions: PermissionsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    let request: Request | undefined;

    if (context.getType<string>() === 'graphql') {
      request = GqlExecutionContext.create(context).getContext<{
        req?: Request;
      }>().req;
    } else if (context.getType() === 'http') {
      request = context.switchToHttp().getRequest<Request>();
    }

    const user = request?.user;

    if (user !== undefined) {
      setzeSichtfeld(() => this.permissions.sichtfeldFuer(user));
    }

    return next.handle();
  }
}
