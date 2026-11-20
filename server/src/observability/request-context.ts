import { AsyncLocalStorage } from 'async_hooks';

import { type Sichtfeld } from '../workspaces/sichtbarkeit';

export type RequestContext = {
  requestId: string;
  geraet?: string;
  ipGekuerzt?: string;
  userId?: string;
  workspaceId?: string;
  aenderungsHerkunft?: string;
  tab?: string;
  automationId?: string;
  sichtfeld?: () => Promise<Sichtfeld>;
};

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = <T>(
  context: RequestContext,
  callback: () => T,
): T => storage.run(context, callback);

export const getRequestContext = (): RequestContext | undefined =>
  storage.getStore();

export const setRequestUser = (userId: string, workspaceId: string): void => {
  const context = storage.getStore();

  if (context !== undefined) {
    context.userId = userId;
    context.workspaceId = workspaceId;
  }
};
