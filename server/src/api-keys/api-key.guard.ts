import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';
import { type Request } from 'express';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { istSchluessel, pruefeSchluessel } from './api-key.pruefung';
import { ApiKeysService } from './api-keys.service';

@Injectable()
export class ZugangsWache extends AuthGuard('jwt') {
  constructor(private readonly apiKeys: ApiKeysService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = istSchluessel(request);

    if (token === null) {
      return (await super.canActivate(context)) as boolean;
    }

    return pruefeSchluessel(this.apiKeys, request, token);
  }
}

@Injectable()
export class NurMenschWache implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const gql = GqlExecutionContext.create(context).getContext() as
      | { req?: Request & { user?: RequestUser } }
      | undefined;
    const request =
      gql?.req ??
      context.switchToHttp().getRequest<Request & { user?: RequestUser }>();

    if (request?.user?.apiKey !== undefined) {
      throw new ForbiddenException(
        'Das geht nur als angemeldete Person, nicht mit einem Schlüssel.',
      );
    }

    return true;
  }
}
