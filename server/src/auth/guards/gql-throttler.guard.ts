import { type ExecutionContext, Injectable } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(context: ExecutionContext) {
    if (context.getType<string>() !== 'graphql') {
      return super.getRequestResponse(context);
    }

    const gqlContext = GqlExecutionContext.create(context).getContext();

    return { req: gqlContext.req, res: gqlContext.req.res };
  }
}

const hatEigeneDrossel = (ziel: object): boolean =>
  (
    (Reflect.getMetadata(GUARDS_METADATA, ziel) as unknown[] | undefined) ?? []
  ).some(
    (guard) =>
      typeof guard === 'function' &&
      (guard === ThrottlerGuard || guard.prototype instanceof ThrottlerGuard),
  );

@Injectable()
export class GlobalThrottlerGuard extends GqlThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    return (
      hatEigeneDrossel(context.getHandler()) ||
      hatEigeneDrossel(context.getClass()) ||
      super.shouldSkip(context)
    );
  }
}
