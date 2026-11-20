import {
  anzeige,
  hashe,
  neuerSchluessel,
  passt,
  PRAEFIX,
  zerlege,
} from './api-key';

describe('neuerSchluessel', () => {
  it('setzt das Präfix, an dem ein Schlüssel zu erkennen ist', () => {
    expect(neuerSchluessel().token.startsWith(`${PRAEFIX}_`)).toBe(true);
  });

  it('besteht aus drei Teilen', () => {
    expect(neuerSchluessel().token.split('_')).toHaveLength(3);
  });

  it('gibt nie zweimal denselben aus', () => {
    const gesehen = new Set(
      Array.from({ length: 500 }, () => neuerSchluessel().token),
    );

    expect(gesehen.size).toBe(500);
  });

  it('vergibt auch die Kennungen nur einmal', () => {
    const gesehen = new Set(
      Array.from({ length: 500 }, () => neuerSchluessel().kennung),
    );

    expect(gesehen.size).toBe(500);
  });

  it('gibt das Geheimnis nicht im Hash preis', () => {
    const { token, hash } = neuerSchluessel();
    const geheimnis = token.split('_')[2];

    expect(hash).not.toContain(geheimnis);
    expect(hash).toHaveLength(64);
  });

  it('liefert einen Hash, der zum eigenen Geheimnis passt', () => {
    const { token, hash } = neuerSchluessel();

    expect(passt(token.split('_')[2], hash)).toBe(true);
  });

  it('hat immer dieselbe Länge, nur aus Buchstaben und Ziffern', () => {
    for (let i = 0; i < 2000; i += 1) {
      const { token } = neuerSchluessel();
      const [, kennung, geheimnis] = token.split('_');

      expect(kennung).toMatch(/^[A-Za-z0-9]{8}$/u);
      expect(geheimnis).toMatch(/^[A-Za-z0-9]{43}$/u);
      expect(zerlege(token)).not.toBeNull();
    }
  });

  it('nimmt genug Zufall — das Geheimnis ist lang', () => {
    expect(neuerSchluessel().token.split('_')[2].length).toBeGreaterThanOrEqual(
      40,
    );
  });
});

describe('zerlege', () => {
  it('liest Kennung und Geheimnis aus einem echten Schlüssel', () => {
    const { token, kennung } = neuerSchluessel();
    const teile = zerlege(token);

    expect(teile?.kennung).toBe(kennung);
    expect(teile?.geheimnis).toBe(token.split('_')[2]);
  });

  it('nimmt einen Schlüssel mit Leerzeichen aussen', () => {
    const { token } = neuerSchluessel();

    expect(zerlege(`  ${token}  `)?.kennung).toBe(zerlege(token)?.kennung);
  });

  it.each([
    ['leer', ''],
    ['nur das Präfix', 'swk'],
    ['zu wenige Teile', 'swk_abcdef'],
    ['zu viele Teile', 'swk_abcdef_geheim_extra'],
    ['fremdes Präfix', 'ghp_abcdef_0123456789012345678901234567890123'],
    ['ohne Präfix', 'abcdef_0123456789012345678901234567890123'],
    ['Kennung zu kurz', 'swk_ab_0123456789012345678901234567890123'],
    ['Geheimnis zu kurz', 'swk_abcdef_kurz'],
    [
      'Sonderzeichen in der Kennung',
      'swk_ab-def_0123456789012345678901234567890123',
    ],
    [
      'Sonderzeichen im Geheimnis',
      'swk_abcdef_0123456789012345678901234567890!!',
    ],
    ['ein ganzer Satz', 'Bitte lassen Sie mich herein'],
  ])('weist %s ab', (_wie, token) => {
    expect(zerlege(token)).toBeNull();
  });

  it('weist einen sonst gültigen Schlüssel mit einem Teil zu viel ab', () => {
    const { token } = neuerSchluessel();

    expect(zerlege(`${token}_extra`)).toBeNull();
    expect(zerlege(`${token}_a_b`)).toBeNull();
  });

  it('weist ein übermäßig langes Geheimnis ab', () => {
    expect(zerlege(`swk_abcdef_${'a'.repeat(1000)}`)).toBeNull();
  });
});

describe('passt', () => {
  it('erkennt das richtige Geheimnis', () => {
    expect(passt('geheim', hashe('geheim'))).toBe(true);
  });

  it('weist ein falsches ab', () => {
    expect(passt('falsch', hashe('geheim'))).toBe(false);
  });

  it('weist ein Geheimnis ab, das nur so anfängt', () => {
    expect(passt('geheim', hashe('geheimnis'))).toBe(false);
    expect(passt('geheimnis', hashe('geheim'))).toBe(false);
  });

  it('stürzt bei einem unbrauchbaren Hash nicht ab', () => {
    expect(() => passt('geheim', '')).not.toThrow();
    expect(passt('geheim', '')).toBe(false);
    expect(passt('geheim', 'zu-kurz')).toBe(false);
  });

  it('unterscheidet Gross- und Kleinschreibung', () => {
    expect(passt('Geheim', hashe('geheim'))).toBe(false);
  });
});

describe('anzeige', () => {
  it('zeigt die Kennung und verbirgt das Geheimnis', () => {
    const { token, kennung } = neuerSchluessel();
    const gezeigt = anzeige(kennung);
    const geheimnis = token.split('_')[2];

    expect(gezeigt).toContain(kennung);
    expect(gezeigt).not.toContain(geheimnis);
    expect(gezeigt.split('_')[2]).toMatch(/^•+$/u);
  });

  it('zeigt auch keinen Teil des Geheimnisses', () => {
    const { token, kennung } = neuerSchluessel();
    const geheimnis = token.split('_')[2];

    for (let laenge = 4; laenge <= 12; laenge += 1) {
      expect(anzeige(kennung)).not.toContain(geheimnis.slice(0, laenge));
    }
  });
});
