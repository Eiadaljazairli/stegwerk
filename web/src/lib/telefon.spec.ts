import { describe, expect, it } from 'vitest';

import { formatTelefon, telLink } from './telefon';

describe('formatTelefon', () => {
  it('zeigt deutsche Nummern national, fremde international', () => {
    expect(formatTelefon('+49301234567')).toBe('030 1234567');
    expect(formatTelefon('+4315123456')).toBe('+43 1 5123456');
  });

  it('lässt Unlesbares und Leeres erkennbar', () => {
    expect(formatTelefon('Durchwahl 12')).toBe('Durchwahl 12');
    expect(formatTelefon(null)).toBe('—');
  });

  it('baut den tel:-Link in E.164', () => {
    expect(telLink('030 1234567')).toBe('tel:+49301234567');
    expect(telLink('Durchwahl 12')).toBe('tel:12');
  });
});
