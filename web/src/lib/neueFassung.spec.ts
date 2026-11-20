import { describe, expect, it } from 'vitest';

import { istNeuer } from './neueFassung';

describe('neue Fassung', () => {
  it('meldet nur eine andere, ausgelieferte Kennung', () => {
    expect(istNeuer('a1-202610201200', 'b2-202610211200')).toBe(true);
    expect(istNeuer('a1-202610201200', 'a1-202610201200')).toBe(false);
  });

  it('meldet nichts bei fehlender oder fremder Antwort', () => {
    expect(istNeuer('a1', undefined)).toBe(false);
    expect(istNeuer('a1', '')).toBe(false);
    expect(istNeuer('a1', 42)).toBe(false);
    expect(istNeuer('', 'b2')).toBe(false);
  });
});
