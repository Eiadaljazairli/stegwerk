import {
  antwortkopf,
  kopfzeilenSicher,
  MAX_EMPFAENGER,
  neueKennung,
  pruefeBetreff,
  pruefeEmpfaenger,
  pruefeEmpfaengerliste,
  pruefePost,
} from './outbound-mail';

describe('Kopfzeilen-Einschleusung', () => {
  it.each([
    ['Zeilenvorschub', 'Angebot\nBcc: alle@example.test'],
    ['Wagenrücklauf', 'Angebot\rBcc: alle@example.test'],
    ['beides zusammen', 'Angebot\r\nBcc: alle@example.test'],
    ['zwei Umbrüche und ein Rumpf', 'Hallo\r\n\r\nDies ist jetzt der Rumpf.'],
    ['Nullbyte', 'Angebot\0Bcc: alle@example.test'],
    ['Umbruch am Anfang', '\nSubject: etwas anderes'],
    ['Umbruch am Ende', 'Angebot\n'],
  ])('weist einen Betreff mit %s ab', (_wie, betreff) => {
    expect(pruefeBetreff(betreff)).toBeNull();
  });

  it.each([
    ['Zeilenvorschub', 'kunde@example.test\nBcc: alle@example.test'],
    ['Wagenrücklauf', 'kunde@example.test\rBcc: alle@example.test'],
    ['Nullbyte', 'kunde@example.test\0'],
  ])('weist eine Adresse mit %s ab', (_wie, adresse) => {
    expect(pruefeEmpfaenger(adresse)).toBeNull();
  });

  it('lässt einen gewöhnlichen Betreff durch', () => {
    expect(pruefeBetreff('  Angebot für die Fertigungsstraße  ')).toBe(
      'Angebot für die Fertigungsstraße',
    );
  });

  it('erlaubt einen leeren Betreff', () => {
    expect(pruefeBetreff('')).toBe('');
  });

  it('weist einen zu langen Betreff ab', () => {
    expect(pruefeBetreff('a'.repeat(201))).toBeNull();
  });

  it.each([
    ['gewöhnlicher Text', 'Angebot', true],
    ['mit Umlauten', 'Grüße aus München', true],
    ['mit Zeilenumbruch', 'a\nb', false],
    ['mit Wagenrücklauf', 'a\rb', false],
    ['mit Nullbyte', 'a\0b', false],
  ])('kopfzeilenSicher erkennt %s', (_wie, wert, erwartet) => {
    expect(kopfzeilenSicher(wert)).toBe(erwartet);
  });
});

describe('Empfängeradressen', () => {
  it.each([
    ['einfach', 'kunde@example.test', 'kunde@example.test'],
    ['mit Namen', 'Anna Schmidt <anna@nordwind.de>', 'anna@nordwind.de'],
    ['Großschreibung', 'Anna@Nordwind.DE', 'anna@nordwind.de'],
    ['mit Leerzeichen außen', '  kunde@example.test  ', 'kunde@example.test'],
    ['mit Punkt im Namensteil', 'a.b@firma.de', 'a.b@firma.de'],
    ['mit Plus', 'anna+crm@firma.de', 'anna+crm@firma.de'],
  ])('nimmt eine Adresse %s', (_wie, roh, erwartet) => {
    expect(pruefeEmpfaenger(roh)).toBe(erwartet);
  });

  it.each([
    ['ohne @', 'kunde.example.test'],
    ['ohne Punkt in der Domain', 'kunde@localhost'],
    ['nur ein Anzeigename', 'Buchhaltung'],
    ['leer', ''],
    ['zwei Adressen in einer', 'a@x.de, b@y.de'],
    ['mit Leerzeichen mittendrin', 'a b@x.de'],
    ['mit spitzer Klammer im Namensteil', 'a<b@x.de'],
    ['Domain endet auf einen Punkt', 'a@x.'],
    ['Domainendung zu kurz', 'a@x.d'],
  ])('weist %s ab', (_wie, roh) => {
    expect(pruefeEmpfaenger(roh)).toBeNull();
  });

  it('weist eine übermäßig lange Adresse ab', () => {
    expect(pruefeEmpfaenger(`${'a'.repeat(320)}@x.de`)).toBeNull();
  });
});

describe('die Empfängerliste', () => {
  it('nimmt eine gewöhnliche Liste', () => {
    expect(pruefeEmpfaengerliste(['a@x.de', 'Bea <b@y.de>'])).toEqual({
      ok: true,
      adressen: ['a@x.de', 'b@y.de'],
    });
  });

  it('entfernt Doppelte', () => {
    expect(pruefeEmpfaengerliste(['a@x.de', 'A@X.DE'])).toEqual({
      ok: true,
      adressen: ['a@x.de'],
    });
  });

  it('weist eine leere Liste ab', () => {
    expect(pruefeEmpfaengerliste([]).ok).toBe(false);
  });

  it('weist die ganze Nachricht ab, wenn eine Adresse unbrauchbar ist', () => {
    const ergebnis = pruefeEmpfaengerliste(['a@x.de', 'kaputt', 'c@z.de']);

    expect(ergebnis.ok).toBe(false);
  });

  it(`nimmt genau ${String(MAX_EMPFAENGER)} Empfänger`, () => {
    const gerade = Array.from(
      { length: MAX_EMPFAENGER },
      (_, i) => `k${String(i)}@x.de`,
    );

    expect(pruefeEmpfaengerliste(gerade).ok).toBe(true);
  });

  it('weist einen mehr ab', () => {
    const zuviele = Array.from(
      { length: MAX_EMPFAENGER + 1 },
      (_, i) => `k${String(i)}@x.de`,
    );

    expect(pruefeEmpfaengerliste(zuviele).ok).toBe(false);
  });
});

describe('die eigene Kennung', () => {
  it('nimmt die Domain des Absenders', () => {
    expect(neueKennung('anna@nordwind.de', 'abc-123')).toBe(
      'abc-123@nordwind.de',
    );
  });

  it('kommt auch mit einer Adresse samt Namen zurecht', () => {
    expect(neueKennung('Anna Schmidt <anna@nordwind.de>', 'abc')).toBe(
      'abc@nordwind.de',
    );
  });

  it('gibt bei jedem Aufruf eine andere aus', () => {
    const gesehen = new Set(
      Array.from({ length: 50 }, () => neueKennung('a@x.de')),
    );

    expect(gesehen.size).toBe(50);
  });
});

describe('Antwortkopf', () => {
  it('gibt ohne Vorgänger nichts aus', () => {
    expect(antwortkopf(null)).toEqual({ inReplyTo: null, references: null });
  });

  it('nennt den unmittelbaren Vorgänger und die Kette', () => {
    expect(
      antwortkopf({ messageId: 'b@x.de', references: '<a@x.de>' }),
    ).toEqual({
      inReplyTo: '<b@x.de>',
      references: '<a@x.de> <b@x.de>',
    });
  });

  it('setzt beide Kopfzeilen, nicht nur eine', () => {
    const kopf = antwortkopf({ messageId: 'a@x.de', references: null });

    expect(kopf.inReplyTo).toBe('<a@x.de>');
    expect(kopf.references).toBe('<a@x.de>');
  });

  it('nennt den Vorgänger nicht zweimal', () => {
    expect(
      antwortkopf({ messageId: 'b@x.de', references: '<a@x.de> <b@x.de>' }),
    ).toEqual({
      inReplyTo: '<b@x.de>',
      references: '<a@x.de> <b@x.de>',
    });
  });

  it('kürzt eine lange Kette in der Mitte', () => {
    const lang = Array.from(
      { length: 40 },
      (_, i) => `<n${String(i)}@x.de>`,
    ).join(' ');
    const kopf = antwortkopf(
      { messageId: 'letzte@x.de', references: lang },
      20,
    );
    const kette = (kopf.references ?? '').split(' ');

    expect(kette).toHaveLength(20);
    expect(kette[0]).toBe('<n0@x.de>');
    expect(kette[kette.length - 1]).toBe('<letzte@x.de>');
  });

  it('kommt mit einer unbrauchbaren Kennung des Vorgängers zurecht', () => {
    expect(antwortkopf({ messageId: '', references: '<a@x.de>' })).toEqual({
      inReplyTo: null,
      references: null,
    });
  });
});

describe('pruefePost — alles auf einmal', () => {
  const gut = {
    an: ['kunde@example.test'],
    betreff: 'Angebot',
    rumpf: 'Guten Tag,\n\nanbei unser Angebot.\n\nMit freundlichen Grüßen',
    absender: 'anna@nordwind.de',
  };

  it('lässt eine gewöhnliche Nachricht durch', () => {
    const ergebnis = pruefePost(gut, null, 'abc');

    expect(ergebnis.ok).toBe(true);

    if (ergebnis.ok) {
      expect(ergebnis.post.an).toEqual(['kunde@example.test']);
      expect(ergebnis.post.betreff).toBe('Angebot');
      expect(ergebnis.post.kennung).toBe('abc@nordwind.de');
      expect(ergebnis.post.inReplyTo).toBeNull();
    }
  });

  it('erlaubt Zeilenumbrüche im Rumpf', () => {
    const ergebnis = pruefePost(gut, null, 'abc');

    expect(ergebnis.ok).toBe(true);
  });

  it('hängt eine Antwort an ihr Gespräch', () => {
    const ergebnis = pruefePost(
      gut,
      { messageId: 'vorher@x.de', references: '<wurzel@x.de>' },
      'abc',
    );

    expect(ergebnis.ok).toBe(true);

    if (ergebnis.ok) {
      expect(ergebnis.post.inReplyTo).toBe('<vorher@x.de>');
      expect(ergebnis.post.references).toBe('<wurzel@x.de> <vorher@x.de>');
    }
  });

  it.each([
    ['Betreff mit Umbruch', { betreff: 'a\nBcc: b@x.de' }],
    ['Empfänger mit Umbruch', { an: ['a@x.de\nBcc: b@x.de'] }],
    ['Absender mit Umbruch', { absender: 'a@x.de\nFrom: chef@firma.de' }],
    ['Nullbyte im Rumpf', { rumpf: 'Hallo\0' }],
    ['ohne Empfänger', { an: [] }],
    ['unbrauchbarer Absender', { absender: 'niemand' }],
  ])('weist %s ab', (_wie, aenderung) => {
    const ergebnis = pruefePost({ ...gut, ...aenderung }, null, 'abc');

    expect(ergebnis.ok).toBe(false);
  });

  it('weist einen übermäßig langen Rumpf ab', () => {
    const ergebnis = pruefePost(
      { ...gut, rumpf: 'a'.repeat(100_001) },
      null,
      'abc',
    );

    expect(ergebnis.ok).toBe(false);
  });

  it('nennt einen Grund, den man dem Anwender zeigen kann', () => {
    const ergebnis = pruefePost({ ...gut, an: [] }, null, 'abc');

    expect(ergebnis.ok).toBe(false);

    if (!ergebnis.ok) {
      expect(ergebnis.grund.length).toBeGreaterThan(5);
    }
  });
});
