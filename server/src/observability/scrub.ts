import { type ErrorEvent } from '@sentry/nestjs';

import { type RequestContext } from './request-context';

export const scrubEvent = (
  event: ErrorEvent,
  context: RequestContext | undefined,
): ErrorEvent => {
  if (context !== undefined) {
    event.tags = {
      ...event.tags,
      requestId: context.requestId,
      workspaceId: context.workspaceId ?? 'anonymous',
    };

    if (context.userId !== undefined) {
      event.user = { id: context.userId };
    }
  }

  if (event.request !== undefined) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;

    if (event.request.url !== undefined) {
      event.request.url = event.request.url.split('?')[0];
    }
  }

  return event;
};
