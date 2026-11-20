import { neuerCode, normalisieren, SALT_ROUNDS } from './recovery-codes';

describe('neuerCode', () => {
  it('gibt vier Vierergruppen aus Hexziffern', () => {
    expect(neuerCode()).toMatch(/^[0-9a-f]{4}(-[0-9a-f]{4}){3}$/u);
  });

  it('gibt nicht zweimal dasselbe aus', () => {
    const gesehen = new Set(Array.from({ length: 200 }, () => neuerCode()));

    expect(gesehen.size).toBe(200);
  });

  it('schöpft den Zufall aus — alle Hexziffern kommen vor', () => {
    const alles = Array.from({ length: 200 }, () => neuerCode()).join('');

    for (const ziffer of '0123456789abcdef') {
      expect(alles).toContain(ziffer);
    }
  });
});

describe('normalisieren', () => {
  const CODE = '1a2b-3c4d-5e6f-7890';

  it.each([
    ['wie ausgegeben', CODE],
    ['in Großbuchstaben', '1A2B-3C4D-5E6F-7890'],
    ['ohne Bindestriche', '1a2b3c4d5e6f7890'],
    ['mit Leerzeichen aus der Zwischenablage', ' 1a2b 3c4d 5e6f 7890 '],
    ['mit Bindestrichen an falscher Stelle', '1a2-b3c4-d5e6f-7890'],
  ])('nimmt den Code %s an', (_wie, eingabe) => {
    expect(normalisieren(eingabe)).toBe(CODE);
  });

  it('weist einen sechsstelligen Zeitcode ab', () => {
    expect(normalisieren('123456')).toBeNull();
  });

  it.each([
    ['zu kurz', '1a2b-3c4d-5e6f-789'],
    ['zu lang', '1a2b-3c4d-5e6f-7890-1'],
    ['leer', ''],
    ['nur Bindestriche', '----'],
  ])('weist %s ab', (_wie, eingabe) => {
    expect(normalisieren(eingabe)).toBeNull();
  });

  it('zählt Buchstaben jenseits von f nicht mit', () => {
    expect(normalisieren('1a2b-3c4d-5e6f-78zz')).toBeNull();
  });

  it('lässt nichts durch, was der Generator nie ausgibt', () => {
    const code = neuerCode();

    expect(normalisieren(code)).toBe(code);
  });
});

describe('SALT_ROUNDS', () => {
  it('bleibt in dem Bereich, der geprüft wurde', () => {
    expect(SALT_ROUNDS).toBeGreaterThanOrEqual(8);
    expect(SALT_ROUNDS).toBeLessThanOrEqual(10);
  });
});
