import { describe, expect, it } from 'vitest';

import { istBelegt, ohneDoppelteTermine } from './termine-zusammen';

describe('Termine aus mehreren Quellen', () => {
  it('nimmt jeden Termin einmal, der erste Fund gewinnt', () => {
    expect(
      ohneDoppelteTermine(
        [{ id: 'a', von: 'akte' }],
        [
          { id: 'a', von: 'kontakt' },
          { id: 'b', von: 'kontakt' },
        ],
      ),
    ).toEqual([
      { id: 'a', von: 'akte' },
      { id: 'b', von: 'kontakt' },
    ]);
  });

  it('erkennt geschwärzte Termine', () => {
    expect(istBelegt({ geschwaerzt: true })).toBe(true);
    expect(istBelegt({})).toBe(false);
  });
});
