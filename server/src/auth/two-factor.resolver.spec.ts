import 'reflect-metadata';

import { GUARDS_METADATA } from '@nestjs/common/constants';

import { GqlThrottlerGuard } from './guards/gql-throttler.guard';
import { TwoFactorResolver } from './two-factor.resolver';

const metadaten = (name: keyof TwoFactorResolver, schluessel: string) =>
  Reflect.getMetadata(
    schluessel,
    TwoFactorResolver.prototype[name] as unknown as object,
  ) as unknown;

describe('TwoFactorResolver', () => {
  it.each(['confirmTwoFactorSetup', 'disableTwoFactor'] as const)(
    'drosselt %s wie die Anmeldung',
    (name) => {
      expect(metadaten(name, GUARDS_METADATA)).toContain(GqlThrottlerGuard);
      expect(metadaten(name, 'THROTTLER:LIMITdefault')).toBe(5);
      expect(metadaten(name, 'THROTTLER:TTLdefault')).toBe(60_000);
    },
  );
});
