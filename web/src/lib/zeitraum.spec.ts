import { describe, expect, it } from 'vitest';

import { zeitraum } from './zeitraum';

const heute = new Date(2026, 0, 15);

describe('zeitraum', () => {
  it('kennt Monatsenden, auch im Februar eines Schaltjahrs', () => {
    expect(zeitraum('monat', new Date(2028, 1, 3))).toEqual({
      von: '2028-02-01',
      bis: '2028-02-29',
    });
  });

  it('geht für den Vormonat über den Jahreswechsel zurück', () => {
    expect(zeitraum('vormonat', heute)).toEqual({
      von: '2025-12-01',
      bis: '2025-12-31',
    });
  });

  it('nimmt das ganze Quartal', () => {
    expect(zeitraum('quartal', new Date(2026, 4, 20))).toEqual({
      von: '2026-04-01',
      bis: '2026-06-30',
    });
  });

  it('zählt zwölf Monate einschließlich des laufenden', () => {
    expect(zeitraum('zwoelf', heute)).toEqual({
      von: '2025-02-01',
      bis: '2026-01-31',
    });
  });

  it('nimmt das Kalenderjahr', () => {
    expect(zeitraum('jahr', heute)).toEqual({
      von: '2026-01-01',
      bis: '2026-12-31',
    });
  });
});
