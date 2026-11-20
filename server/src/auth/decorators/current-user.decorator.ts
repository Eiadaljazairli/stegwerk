import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

export type RequestUser = {
  userId: string;
  workspaceId: string;
  email: string;
  apiKey?: {
    id: string;
    name: string;
    permissions: string[];
    schreibmodus?: 'direkt' | 'vorschlag';
  };
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser => {
    const gqlContext = GqlExecutionContext.create(context);

    return gqlContext.getContext().req.user;
  },
);
