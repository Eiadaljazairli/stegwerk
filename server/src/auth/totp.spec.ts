import {
  base32Decode,
  base32Encode,
  codeFuer,
  neuesGeheimnis,
  otpauthUrl,
  pruefeCode,
  SCHRITT_SEKUNDEN,
  zaehlerFuer,
} from './totp';

describe('Base32', () => {
  it.each([
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ])('kodiert %p als %p', (klartext, erwartet) => {
    expect(base32Encode(Buffer.from(klartext, 'utf8'))).toBe(erwartet);
  });

  it('dekodiert zurück', () => {
    for (const text of ['', 'f', 'fo', 'foo', 'foobar']) {
      expect(
        base32Decode(base32Encode(Buffer.from(text, 'utf8'))).toString('utf8'),
      ).toBe(text);
    }
  });

  it('nimmt Leerzeichen, Bindestriche und Kleinschreibung an', () => {
    expect(base32Decode('mzxw 6ytb-oi')).toEqual(base32Decode('MZXW6YTBOI'));
  });

  it('weist ein fremdes Zeichen ab', () => {
    expect(() => base32Decode('MZXW1')).toThrow(/Base32/u);
  });
});

describe('gegen RFC 6238', () => {
  const geheimnis = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

  it.each([
    [59, '287082'],
    [1_111_111_109, '081804'],
    [1_111_111_111, '050471'],
    [1_234_567_890, '005924'],
    [2_000_000_000, '279037'],
  ])('rechnet für %i den Code %s', (sekunden, erwartet) => {
    expect(codeFuer(geheimnis, zaehlerFuer(sekunden * 1000))).toBe(erwartet);
  });

  it('rechnet auch für einen sehr späten Zeitpunkt richtig', () => {
    expect(codeFuer(geheimnis, zaehlerFuer(20_000_000_000 * 1000))).toBe(
      '353130',
    );
  });

  it('verwirft die oberen 32 Bit des Zählers nicht', () => {
    const klein = 12_345;
    const gross = klein + 2 ** 32;

    expect(codeFuer(geheimnis, gross)).not.toBe(codeFuer(geheimnis, klein));
  });
});

describe('das Fenster', () => {
  const geheimnis = neuesGeheimnis();
  const jetzt = 1_700_000_000_000;

  it('nimmt den Code des laufenden Fensters an', () => {
    const code = codeFuer(geheimnis, zaehlerFuer(jetzt));

    expect(pruefeCode(geheimnis, code, jetzt)).toBe(zaehlerFuer(jetzt));
  });

  it('nimmt ein Fenster davor und danach an', () => {
    for (const versatz of [-1, 1]) {
      const code = codeFuer(geheimnis, zaehlerFuer(jetzt) + versatz);

      expect(pruefeCode(geheimnis, code, jetzt)).toBe(
        zaehlerFuer(jetzt) + versatz,
      );
    }
  });

  it('nimmt zwei Fenster entfernt nicht mehr an', () => {
    for (const versatz of [-2, 2]) {
      const code = codeFuer(geheimnis, zaehlerFuer(jetzt) + versatz);

      expect(pruefeCode(geheimnis, code, jetzt)).toBeNull();
    }
  });

  it('gibt das getroffene Fenster zurück, nicht nur ein Ja', () => {
    const zaehler = zaehlerFuer(jetzt);

    expect(pruefeCode(geheimnis, codeFuer(geheimnis, zaehler), jetzt)).toBe(
      zaehler,
    );
  });

  it.each(['', '12345', '1234567', 'abcdef', '12 34 56'])(
    'weist %p als Form ab',
    (eingabe) => {
      expect(pruefeCode(geheimnis, eingabe, jetzt)).toBeNull();
    },
  );

  it('nimmt einen Code mit Leerzeichen an, wenn die Ziffern stimmen', () => {
    const code = codeFuer(geheimnis, zaehlerFuer(jetzt));
    const mitLuecke = `${code.slice(0, 3)} ${code.slice(3)}`;

    expect(pruefeCode(geheimnis, mitLuecke, jetzt)).toBe(zaehlerFuer(jetzt));
  });

  it('weist den Code eines anderen Geheimnisses ab', () => {
    const anderes = neuesGeheimnis();

    expect(
      pruefeCode(geheimnis, codeFuer(anderes, zaehlerFuer(jetzt)), jetzt),
    ).toBeNull();
  });
});

describe('das Geheimnis', () => {
  it('ist lang genug für HMAC-SHA1', () => {
    expect(base32Decode(neuesGeheimnis())).toHaveLength(20);
  });

  it('ist bei jedem Aufruf ein anderes', () => {
    const gesehen = new Set(Array.from({ length: 20 }, () => neuesGeheimnis()));

    expect(gesehen.size).toBe(20);
  });
});

describe('die Adresse für den QR-Code', () => {
  const url = otpauthUrl({
    geheimnis: 'MZXW6YTBOI',
    konto: 'max@beispiel.de',
    herausgeber: 'Stegwerk',
  });

  it('nennt den Herausgeber im Pfad und als Parameter', () => {
    expect(url).toContain('otpauth://totp/Stegwerk%3Amax%40beispiel.de');
    expect(url).toContain('issuer=Stegwerk');
  });

  it('nennt Verfahren, Stellen und Fensterlänge', () => {
    expect(url).toContain('algorithm=SHA1');
    expect(url).toContain('digits=6');
    expect(url).toContain(`period=${String(SCHRITT_SEKUNDEN)}`);
  });

  it('trägt das Geheimnis', () => {
    expect(url).toContain('secret=MZXW6YTBOI');
  });
});
