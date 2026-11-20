import {
  normalisiereId,
  suchschluessel,
  verkettung,
  zerlegeReferences,
  zuordnen,
} from './mail-threading';

describe('normalisiereId', () => {
  it.each([
    ['spitze Klammern', '<abc@example.com>', 'abc@example.com'],
    ['Leerzeichen außen', '  <abc@example.com>  ', 'abc@example.com'],
    ['ohne Klammern', 'abc@example.com', 'abc@example.com'],
    ['doppelte Klammern', '<<abc@example.com>>', 'abc@example.com'],
  ])('nimmt %s', (_wie, roh, erwartet) => {
    expect(normalisiereId(roh)).toBe(erwartet);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['leer', ''],
    ['nur Leerzeichen', '   '],
    ['nur Klammern', '<>'],
  ])('gibt für %s nichts zurück', (_wie, roh) => {
    expect(normalisiereId(roh)).toBeNull();
  });

  it('weist zu lange Kennungen ab, statt sie zu kürzen', () => {
    expect(normalisiereId(`<${'a'.repeat(501)}@example.com>`)).toBeNull();
  });

  it('lässt eine Kennung an der Grenze durch', () => {
    const gerade = 'a'.repeat(500);

    expect(normalisiereId(`<${gerade}>`)).toBe(gerade);
  });
});

describe('zerlegeReferences', () => {
  it('liest mehrere Kennungen in der Reihenfolge der Norm', () => {
    expect(zerlegeReferences('<a@x> <b@x> <c@x>')).toEqual([
      'a@x',
      'b@x',
      'c@x',
    ]);
  });

  it('kommt mit umgebrochenen Kopfzeilen zurecht', () => {
    expect(zerlegeReferences('<a@x>\r\n\t<b@x>\r\n <c@x>')).toEqual([
      'a@x',
      'b@x',
      'c@x',
    ]);
  });

  it('wiederholt keine Kennung', () => {
    expect(zerlegeReferences('<a@x> <b@x> <a@x>')).toEqual(['a@x', 'b@x']);
  });

  it('versteht auch einen Kopf ohne Klammern', () => {
    expect(zerlegeReferences('a@x b@x')).toEqual(['a@x', 'b@x']);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['leer', ''],
  ])('gibt für %s eine leere Liste', (_wie, roh) => {
    expect(zerlegeReferences(roh)).toEqual([]);
  });
});

describe('verkettung', () => {
  it('nennt die eigene Kennung und die Vorgänger', () => {
    expect(
      verkettung({
        messageId: '<neu@x>',
        inReplyTo: '<b@x>',
        references: '<a@x> <b@x>',
      }),
    ).toEqual({ eigene: 'neu@x', verweise: ['a@x', 'b@x'] });
  });

  it('hängt den unmittelbaren Vorgänger an, wenn er in der Kette fehlt', () => {
    expect(
      verkettung({
        messageId: '<neu@x>',
        inReplyTo: '<z@x>',
        references: '<a@x>',
      }),
    ).toEqual({ eigene: 'neu@x', verweise: ['a@x', 'z@x'] });
  });

  it('kommt ohne jeden Vorgänger aus', () => {
    expect(verkettung({ messageId: '<erste@x>' })).toEqual({
      eigene: 'erste@x',
      verweise: [],
    });
  });

  it('lässt eine Nachricht nicht auf sich selbst verweisen', () => {
    expect(
      verkettung({ messageId: '<a@x>', references: '<a@x> <b@x>' }),
    ).toEqual({ eigene: 'a@x', verweise: ['b@x'] });
  });

  it('gibt nichts zurück, wenn die eigene Kennung unbrauchbar ist', () => {
    expect(verkettung({ messageId: '' })).toBeNull();
  });
});

describe('suchschluessel', () => {
  it('sucht unter der eigenen Kennung und allen Vorgängern', () => {
    expect(suchschluessel({ eigene: 'c@x', verweise: ['a@x', 'b@x'] })).toEqual(
      ['c@x', 'a@x', 'b@x'],
    );
  });
});

describe('zuordnen', () => {
  const kette = { eigene: 'c@x', verweise: ['a@x', 'b@x'] };

  it('nimmt die Wurzel als Schlüssel, wenn nichts bekannt ist', () => {
    expect(zuordnen(kette, [])).toEqual({
      schluessel: 'a@x',
      zusammenfuehren: [],
    });
  });

  it('nimmt die eigene Kennung, wenn es keine Vorgänger gibt', () => {
    expect(zuordnen({ eigene: 'erste@x', verweise: [] }, [])).toEqual({
      schluessel: 'erste@x',
      zusammenfuehren: [],
    });
  });

  it('ordnet in den gefundenen Faden ein', () => {
    expect(zuordnen(kette, ['faden-1'])).toEqual({
      schluessel: 'faden-1',
      zusammenfuehren: [],
    });
  });

  it('führt zwei Fäden zusammen, die sich als einer erweisen', () => {
    expect(zuordnen(kette, ['faden-2', 'faden-1'])).toEqual({
      schluessel: 'faden-1',
      zusammenfuehren: ['faden-2'],
    });
  });

  it('entscheidet unabhängig von der Reihenfolge des Eintreffens', () => {
    const vorwaerts = zuordnen(kette, ['faden-1', 'faden-2', 'faden-3']);
    const rueckwaerts = zuordnen(kette, ['faden-3', 'faden-2', 'faden-1']);

    expect(vorwaerts).toEqual(rueckwaerts);
  });

  it('zählt denselben Faden nicht doppelt', () => {
    expect(zuordnen(kette, ['faden-1', 'faden-1'])).toEqual({
      schluessel: 'faden-1',
      zusammenfuehren: [],
    });
  });

  it('übergeht leere Angaben', () => {
    expect(zuordnen(kette, ['', 'faden-1'])).toEqual({
      schluessel: 'faden-1',
      zusammenfuehren: [],
    });
  });

  it('bringt zwei fremde Nachrichten nicht in einen Faden', () => {
    const eine = zuordnen({ eigene: 'eine@x', verweise: [] }, []);
    const andere = zuordnen({ eigene: 'andere@y', verweise: [] }, []);

    expect(eine.schluessel).not.toBe(andere.schluessel);
  });
});
