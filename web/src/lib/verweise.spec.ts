import { describe, expect, it, vi } from 'vitest';

import {
  istVerweisArt,
  MAX_ALTER_MS,
  MAX_JE_ANFRAGE,
  verweisDazu,
  verweisIds,
  VerweisLader,
  verweisPfad,
  verweisSenden,
  verweisText,
  type VerweisTitel,
  verweisWeg,
} from './verweise';

describe('Werte einer Verknüpfung', () => {
  it('liest eine Kennung oder eine Liste', () => {
    expect(verweisIds('a')).toEqual(['a']);
    expect(verweisIds(['a', 'b', 3])).toEqual(['a', 'b']);
    expect(verweisIds('')).toEqual([]);
    expect(verweisIds(null)).toEqual([]);
  });

  it('schickt Kennungen mit Semikolon, ohne Doppel', () => {
    expect(verweisSenden(['a', 'b', 'a'])).toBe('a;b');
    expect(verweisSenden([])).toBe('');
  });

  it('ersetzt bei einem Verweis und ergänzt bei mehreren', () => {
    expect(verweisDazu({ mehrere: false }, ['a'], 'b')).toEqual(['b']);
    expect(verweisDazu({ mehrere: true }, ['a'], 'b')).toEqual(['a', 'b']);
    expect(verweisDazu({ mehrere: true }, ['a'], 'a')).toEqual(['a']);
    expect(verweisWeg(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('führt zur Akte und kennt nur Firmen, Kontakte und Geschäfte', () => {
    expect(verweisPfad('COMPANY', 'x')).toBe('/firmen/x');
    expect(verweisPfad('CONTACT', 'x')).toBe('/kontakte/x');
    expect(verweisPfad('DEAL', 'x')).toBe('/geschaefte/x');
    expect(istVerweisArt('TASK')).toBe(false);
    expect(istVerweisArt(null)).toBe(false);
    expect(istVerweisArt('DEAL')).toBe(true);
  });

  it('zeigt den Namen oder „Nicht sichtbar“', () => {
    expect(verweisText(undefined)).toBeNull();
    expect(verweisText({ id: 'a', titel: 'Alpha', sichtbar: true })).toBe(
      'Alpha',
    );
    expect(verweisText({ id: 'a', titel: null, sichtbar: false })).toBe(
      'Nicht sichtbar',
    );
    expect(verweisText({ id: 'a', titel: '', sichtbar: true })).toBe(
      'Ohne Namen',
    );
  });
});

const lader = (antworten: Record<string, VerweisTitel>, jetzt = () => 0) => {
  const laeufe: (() => void)[] = [];
  const holen = vi.fn((_art: string, ids: string[]) =>
    Promise.resolve(
      ids
        .map((id) => antworten[id])
        .filter((t): t is VerweisTitel => t !== undefined),
    ),
  );
  const l = new VerweisLader(holen, (lauf) => laeufe.push(lauf), jetzt);
  const laufen = async () => {
    for (const lauf of laeufe.splice(0)) {
      lauf();
    }

    await new Promise((fertig) => setTimeout(fertig, 0));
  };

  return { l, holen, laufen };
};

describe('VerweisLader', () => {
  it('fragt alles, was zugleich gebraucht wird, in einer Anfrage', async () => {
    const { l, holen, laufen } = lader({
      a: { id: 'a', titel: 'Alpha', sichtbar: true },
      b: { id: 'b', titel: null, sichtbar: false },
    });
    const gemeldet = vi.fn();

    l.abonnieren(gemeldet);
    l.anfordern('COMPANY', ['a']);
    l.anfordern('COMPANY', ['b', 'a']);
    await laufen();

    expect(holen).toHaveBeenCalledTimes(1);
    expect(holen).toHaveBeenCalledWith('COMPANY', ['a', 'b']);
    expect(l.lesen('COMPANY', 'a')?.titel).toBe('Alpha');
    expect(l.lesen('COMPANY', 'b')?.sichtbar).toBe(false);
    expect(gemeldet).toHaveBeenCalled();
  });

  it('merkt sich, was es nicht gibt, und fragt nicht noch einmal', async () => {
    const { l, holen, laufen } = lader({});

    l.anfordern('DEAL', ['weg']);
    await laufen();
    l.anfordern('DEAL', ['weg']);
    await laufen();

    expect(l.lesen('DEAL', 'weg')).toBeNull();
    expect(holen).toHaveBeenCalledTimes(1);
  });

  it('trennt die Arten und teilt große Mengen', async () => {
    const { l, holen, laufen } = lader({});
    const viele = Array.from({ length: MAX_JE_ANFRAGE + 1 }, (_, i) =>
      String(i),
    );

    l.anfordern('COMPANY', viele);
    l.anfordern('CONTACT', ['k']);
    await laufen();

    expect(holen).toHaveBeenCalledTimes(3);
    expect(holen.mock.calls.map(([art, ids]) => [art, ids.length])).toEqual(
      expect.arrayContaining([
        ['COMPANY', MAX_JE_ANFRAGE],
        ['COMPANY', 1],
        ['CONTACT', 1],
      ]),
    );
  });

  it('fragt nach einer Weile neu, damit Umbenanntes ankommt', async () => {
    let zeit = 0;
    const { l, holen, laufen } = lader(
      { a: { id: 'a', titel: 'Alpha', sichtbar: true } },
      () => zeit,
    );

    l.anfordern('COMPANY', ['a']);
    await laufen();
    l.anfordern('COMPANY', ['a']);
    await laufen();
    expect(holen).toHaveBeenCalledTimes(1);

    zeit = MAX_ALTER_MS + 1;
    l.anfordern('COMPANY', ['a']);
    await laufen();
    expect(holen).toHaveBeenCalledTimes(2);
  });

  it('merkt nach einem Fehler nichts und fragt beim nächsten Mal wieder', async () => {
    const laeufe: (() => void)[] = [];
    const holen = vi
      .fn<(art: string, ids: string[]) => Promise<VerweisTitel[]>>()
      .mockRejectedValueOnce(new Error('weg'))
      .mockResolvedValueOnce([{ id: 'a', titel: 'Alpha', sichtbar: true }]);
    const l = new VerweisLader(holen, (lauf) => laeufe.push(lauf));
    const laufen = async () => {
      for (const lauf of laeufe.splice(0)) {
        lauf();
      }

      await new Promise((fertig) => setTimeout(fertig, 0));
    };

    l.anfordern('COMPANY', ['a']);
    await laufen();
    expect(l.lesen('COMPANY', 'a')).toBeUndefined();

    l.anfordern('COMPANY', ['a']);
    await laufen();
    expect(l.lesen('COMPANY', 'a')?.titel).toBe('Alpha');
  });

  it('fragt nach dem Vergessen neu und zeigt bis dahin den alten Namen', async () => {
    const antworten: Record<string, VerweisTitel> = {
      a: { id: 'a', titel: 'Alpha', sichtbar: true },
    };
    const { l, holen, laufen } = lader(antworten);
    const gemeldet = vi.fn();

    l.anfordern('COMPANY', ['a', 'b']);
    await laufen();
    l.abonnieren(gemeldet);

    const vorher = l.stand;

    l.vergessen();

    expect(l.stand).toBe(vorher + 1);
    expect(gemeldet).toHaveBeenCalledTimes(1);
    expect(l.lesen('COMPANY', 'a')?.titel).toBe('Alpha');

    antworten.a = { id: 'a', titel: 'Alpha neu', sichtbar: true };
    antworten.b = { id: 'b', titel: 'Beta', sichtbar: true };
    l.anfordern('COMPANY', ['a', 'b']);
    await laufen();

    expect(holen).toHaveBeenCalledTimes(2);
    expect(l.lesen('COMPANY', 'a')?.titel).toBe('Alpha neu');
    expect(l.lesen('COMPANY', 'b')?.titel).toBe('Beta');
  });
});
