import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import { type RequestUser } from '../../auth/decorators/current-user.decorator';
import { BillingService } from '../billing.service';

@Injectable()
export class BillingWriteGuard implements CanActivate {
  constructor(private readonly billingService: BillingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const gqlContext = GqlExecutionContext.create(context);

    if (gqlContext.getInfo().operation.operation !== 'mutation') {
      return true;
    }

    const user = gqlContext.getContext().req.user as RequestUser | undefined;

    if (user === undefined) {
      return true;
    }

    await this.billingService.assertCanWrite(user.workspaceId);

    return true;
  }
}
