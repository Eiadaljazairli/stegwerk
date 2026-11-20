import { UnauthorizedException } from '@nestjs/common';
import { type Request } from 'express';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { setRequestUser } from '../observability/request-context';
import { PRAEFIX } from './api-key';
import { type ApiKeysService } from './api-keys.service';

export const istSchluessel = (request: Request | undefined): string | null => {
  const kopf = request?.headers?.authorization ?? '';
  const token = kopf.startsWith('Bearer ') ? kopf.slice(7).trim() : '';

  return token.startsWith(`${PRAEFIX}_`) ? token : null;
};

export type MitAnrufer = { user?: RequestUser };

export const pruefeSchluessel = async (
  apiKeys: ApiKeysService,
  request: MitAnrufer,
  token: string,
): Promise<boolean> => {
  const anrufer = await apiKeys.anrufer(token);

  if (anrufer === null) {
    throw new UnauthorizedException('Der Schlüssel gilt nicht.');
  }

  setRequestUser(anrufer.userId, anrufer.workspaceId);
  request.user = anrufer;

  return true;
};
