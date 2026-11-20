import { type RequestUser } from '../auth/decorators/current-user.decorator';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    // oxlint-disable-next-line no-empty-interface
    interface User extends RequestUser {}
  }
}

export {};
