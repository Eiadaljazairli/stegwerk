import { describe, expect, it } from 'vitest';

import {
  datumBeimAblegen,
  kalenderAnsage,
  kalenderZeitraum,
  KARTEN_JE_TAG,
  kartenJeTag,
  sichtbareKarten,
  tagVorgelesen,
  tasteImKalender,
} from './kalenderZiehen';

const MAERZ = kalenderZeitraum('2026-03-01');

describe('kalenderZeitraum', () => {
  it('lädt die sechs Wochen des Rasters, ab Montag', () => {
    expect(MAERZ).toEqual({ von: '2026-02-23', bis: '2026-04-05' });
  });
});

describe('kartenJeTag', () => {
  it('legt Karten auf ihren Tag und lässt die ohne Datum weg', () => {
    const jeTag = kartenJeTag(
      [
        { id: 'a', tag: '2026-03-03' },
        { id: 'b', tag: '2026-03-03T10:00:00.000Z' },
        { id: 'c', tag: null },
        { id: 'd', tag: '2026-03-04' },
      ],
      (karte) => karte.tag,
    );

    expect(jeTag.get('2026-03-03')?.map((karte) => karte.id)).toEqual([
      'a',
      'b',
    ]);
    expect(jeTag.get('2026-03-04')).toHaveLength(1);
    expect([...jeTag.keys()]).toHaveLength(2);
  });
});

describe('sichtbareKarten', () => {
  const karten = Array.from({ length: 6 }, (_, i) => i);

  it('zeigt einige und zählt den Rest', () => {
    expect(sichtbareKarten(karten, false)).toEqual({
      gezeigt: karten.slice(0, KARTEN_JE_TAG),
      weitere: 6 - KARTEN_JE_TAG,
    });
  });

  it('zeigt eine einzelne weitere Karte gleich, statt „+ 1“ zu schreiben', () => {
    const vier = karten.slice(0, KARTEN_JE_TAG + 1);

    expect(sichtbareKarten(vier, false)).toEqual({ gezeigt: vier, weitere: 0 });
  });

  it('zeigt aufgeklappt alle', () => {
    expect(sichtbareKarten(karten, true).weitere).toBe(0);
  });
});

describe('tasteImKalender', () => {
  it('nimmt mit Leertaste und Enter auf, sonst nichts', () => {
    expect(tasteImKalender(' ', 'a', '2026-03-03', null, MAERZ)).toEqual({
      art: 'aufnehmen',
      getragen: { id: 'a', von: '2026-03-03', ziel: '2026-03-03' },
    });
    expect(tasteImKalender('Enter', 'a', '2026-03-03', null, MAERZ).art).toBe(
      'aufnehmen',
    );
    expect(
      tasteImKalender('ArrowLeft', 'a', '2026-03-03', null, MAERZ),
    ).toEqual({ art: 'nichts' });
  });

  const getragen = { id: 'a', von: '2026-03-04', ziel: '2026-03-04' };
  const ziel = (taste: string) => {
    const ergebnis = tasteImKalender(taste, 'a', '2026-03-04', getragen, MAERZ);

    return ergebnis.art === 'ziel' ? ergebnis.getragen.ziel : ergebnis.art;
  };

  it('geht mit den Pfeilen einen Tag oder eine Woche weiter, Pos1/Ende an den Rand der Woche', () => {
    expect(ziel('ArrowRight')).toBe('2026-03-05');
    expect(ziel('ArrowLeft')).toBe('2026-03-03');
    expect(ziel('ArrowDown')).toBe('2026-03-11');
    expect(ziel('ArrowUp')).toBe('2026-02-25');
    expect(ziel('Home')).toBe('2026-03-02');
    expect(ziel('End')).toBe('2026-03-08');
  });

  it('bleibt im sichtbaren Raster', () => {
    const amRand = { id: 'a', von: '2026-02-24', ziel: '2026-02-24' };

    expect(
      tasteImKalender('ArrowUp', 'a', '2026-02-24', amRand, MAERZ).art,
    ).toBe('rand');
  });

  it('legt ab und bricht ab', () => {
    expect(ziel(' ')).toBe('ablegen');
    expect(ziel('Escape')).toBe('abbrechen');
    expect(ziel('Tab')).toBe('abbrechen');
    expect(ziel('x')).toBe('nichts');
  });
});

describe('kalenderAnsage', () => {
  it('liest den Tag aus, unabhängig von der Zeitzone des Rechners', () => {
    expect(tagVorgelesen('2026-03-03')).toBe('Dienstag, 3. März 2026');
  });

  it('sagt jeden Schritt an', () => {
    const getragen = { id: 'a', von: '2026-03-03', ziel: '2026-03-05' };

    expect(kalenderAnsage({ art: 'aufnehmen', getragen }, 'Angebot')).toContain(
      '„Angebot“ aufgenommen, Dienstag, 3. März 2026',
    );
    expect(kalenderAnsage({ art: 'ziel', getragen }, 'Angebot')).toBe(
      'Donnerstag, 5. März 2026',
    );
    expect(kalenderAnsage({ art: 'ablegen', getragen }, 'Angebot')).toBe(
      '„Angebot“ auf Donnerstag, 5. März 2026 gelegt.',
    );
    expect(
      kalenderAnsage(
        { art: 'ablegen', getragen: { ...getragen, ziel: getragen.von } },
        'Angebot',
      ),
    ).toContain('bleibt');
    expect(kalenderAnsage({ art: 'nichts' }, 'Angebot')).toBeNull();
  });
});

describe('datumBeimAblegen', () => {
  it('setzt das Datum des Felds, nach dem der Kalender liegt', () => {
    expect(datumBeimAblegen('std:closeDate', '2026-03-05')).toEqual({
      closeDate: '2026-03-05',
    });
    expect(datumBeimAblegen('std:dueDate', '2026-03-05')).toEqual({
      dueDate: '2026-03-05',
    });
    expect(datumBeimAblegen('custom:vertragsende', '2026-03-05')).toEqual({
      customFields: { vertragsende: '2026-03-05' },
    });
  });

  it('ändert kein Datum, das sich nicht ziehen lässt', () => {
    expect(datumBeimAblegen('std:createdAt', '2026-03-05')).toBeNull();
  });
});
