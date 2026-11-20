import { type ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';
import { type Request } from 'express';

import { ApiKeysService } from '../../api-keys/api-keys.service';
import {
  istSchluessel,
  pruefeSchluessel,
} from '../../api-keys/api-key.pruefung';

@Injectable()
export class GqlAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly apiKeys: ApiKeysService) {
    super();
  }

  getRequest(context: ExecutionContext) {
    return GqlExecutionContext.create(context).getContext().req;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = this.getRequest(context) as Request;
    const token = istSchluessel(request);

    if (token === null) {
      return (await super.canActivate(context)) as boolean;
    }

    return pruefeSchluessel(this.apiKeys, request, token);
  }
}
