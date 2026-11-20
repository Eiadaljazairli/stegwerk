import { type RequestUser } from '../auth/decorators/current-user.decorator';

export const mitVerantwortlichem = <T extends { ownerId?: string | null }>(
  user: RequestUser,
  input: T,
): T => ({
  ...input,
  ownerId:
    input.ownerId !== undefined
      ? input.ownerId
      : user.apiKey === undefined
        ? user.userId
        : null,
});
