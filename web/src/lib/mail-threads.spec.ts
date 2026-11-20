import { describe, expect, it } from 'vitest';

import { antwortAn, antwortBetreff, gruppiereFaeden } from './mail-threads';
import { type MailMessage } from './types';

const n = (
  teil: Partial<MailMessage> & { id: string; sentAt: string },
): MailMessage => ({
  subject: 'Anfrage Lagersystem',
  snippet: null,
  fromAddress: 'anna@nordwind.de',
  fromName: 'Anna Schmidt',
  toAddresses: 'ich@wir.de',
  threadKey: 'wurzel@nordwind.de',
  outgoing: false,
  ...teil,
});

describe('gruppiereFaeden', () => {
  it('macht aus drei Nachrichten eines Schlüssels ein Gespräch', () => {
    const faeden = gruppiereFaeden([
      n({ id: 'a', sentAt: '2026-03-01T10:00:00Z' }),
      n({ id: 'b', sentAt: '2026-03-02T10:00:00Z' }),
      n({ id: 'c', sentAt: '2026-03-03T10:00:00Z' }),
    ]);

    expect(faeden).toHaveLength(1);
    expect(faeden[0].nachrichten).toHaveLength(3);
  });

  it('ordnet innerhalb eines Gesprächs von alt nach neu', () => {
    const faeden = gruppiereFaeden([
      n({ id: 'spät', sentAt: '2026-03-03T10:00:00Z' }),
      n({ id: 'früh', sentAt: '2026-03-01T10:00:00Z' }),
      n({ id: 'mitte', sentAt: '2026-03-02T10:00:00Z' }),
    ]);

    expect(faeden[0].nachrichten.map((m) => m.id)).toEqual([
      'früh',
      'mitte',
      'spät',
    ]);
  });

  it('ordnet die Gespräche von neu nach alt', () => {
    const faeden = gruppiereFaeden([
      n({ id: 'alt', sentAt: '2026-01-01T10:00:00Z', threadKey: 'alt@x' }),
      n({ id: 'neu', sentAt: '2026-06-01T10:00:00Z', threadKey: 'neu@x' }),
    ]);

    expect(faeden.map((f) => f.key)).toEqual(['neu@x', 'alt@x']);
  });

  it('nimmt den Betreff der ersten Nachricht, nicht der letzten', () => {
    const faeden = gruppiereFaeden([
      n({ id: 'b', sentAt: '2026-03-02T10:00:00Z', subject: 'Re: Anfrage' }),
      n({ id: 'a', sentAt: '2026-03-01T10:00:00Z', subject: 'Anfrage' }),
    ]);

    expect(faeden[0].betreff).toBe('Anfrage');
  });

  it('nennt die jüngste Nachricht für die zusammengeklappte Ansicht', () => {
    const faeden = gruppiereFaeden([
      n({ id: 'a', sentAt: '2026-03-01T10:00:00Z' }),
      n({ id: 'b', sentAt: '2026-03-05T10:00:00Z' }),
    ]);

    expect(faeden[0].neueste.id).toBe('b');
    expect(faeden[0].zuletzt).toBe('2026-03-05T10:00:00Z');
  });

  it('lässt Nachrichten ohne Schlüssel für sich stehen', () => {
    const faeden = gruppiereFaeden([
      n({ id: 'a', sentAt: '2026-03-01T10:00:00Z', threadKey: '' }),
      n({ id: 'b', sentAt: '2026-03-02T10:00:00Z', threadKey: '' }),
    ]);

    expect(faeden).toHaveLength(2);
  });

  it('wirft ein unlesbares Datum nicht an den Anfang', () => {
    const faeden = gruppiereFaeden([
      n({ id: 'kaputt', sentAt: 'nicht-datum', threadKey: 'k@x' }),
      n({ id: 'gut', sentAt: '2026-03-01T10:00:00Z', threadKey: 'g@x' }),
    ]);

    expect(faeden[0].key).toBe('g@x');
  });

  it('kommt mit einer leeren Liste zurecht', () => {
    expect(gruppiereFaeden([])).toEqual([]);
  });

  it('verändert die übergebene Liste nicht', () => {
    const eingabe = [
      n({ id: 'b', sentAt: '2026-03-02T10:00:00Z' }),
      n({ id: 'a', sentAt: '2026-03-01T10:00:00Z' }),
    ];

    gruppiereFaeden(eingabe);

    expect(eingabe.map((m) => m.id)).toEqual(['b', 'a']);
  });
});

describe('antwortAn', () => {
  const faden = (nachrichten: MailMessage[]) => gruppiereFaeden(nachrichten)[0];

  it('antwortet dem, der zuletzt geschrieben hat', () => {
    expect(
      antwortAn(
        faden([n({ id: 'a', sentAt: '2026-03-01T10:00:00Z' })]),
        'ich@wir.de',
      ),
    ).toEqual(['anna@nordwind.de']);
  });

  it('antwortet nicht an die eigene Adresse', () => {
    const f = faden([
      n({
        id: 'a',
        sentAt: '2026-03-02T10:00:00Z',
        outgoing: true,
        fromAddress: 'ich@wir.de',
        toAddresses: 'anna@nordwind.de',
      }),
    ]);

    expect(antwortAn(f, 'ich@wir.de')).toEqual(['anna@nordwind.de']);
  });

  it('nimmt die jüngste Nachricht, in der die Gegenseite vorkommt', () => {
    const f = faden([
      n({
        id: 'alt',
        sentAt: '2026-01-01T10:00:00Z',
        fromAddress: 'frueher@nordwind.de',
      }),
      n({
        id: 'neu',
        sentAt: '2026-06-01T10:00:00Z',
        fromAddress: 'jetzt@nordwind.de',
      }),
    ]);

    expect(antwortAn(f, 'ich@wir.de')).toEqual(['jetzt@nordwind.de']);
  });

  it('nimmt mehrere Empfänger mit', () => {
    const f = faden([
      n({
        id: 'a',
        sentAt: '2026-03-02T10:00:00Z',
        outgoing: true,
        fromAddress: 'ich@wir.de',
        toAddresses: 'anna@nordwind.de, chef@nordwind.de',
      }),
    ]);

    expect(antwortAn(f, 'ich@wir.de')).toEqual([
      'anna@nordwind.de',
      'chef@nordwind.de',
    ]);
  });

  it('vergleicht die eigene Adresse ohne Rücksicht auf Groß- und Kleinschreibung', () => {
    const f = faden([
      n({
        id: 'a',
        sentAt: '2026-03-02T10:00:00Z',
        outgoing: true,
        fromAddress: 'ich@wir.de',
        toAddresses: 'ICH@WIR.DE, anna@nordwind.de',
      }),
    ]);

    expect(antwortAn(f, 'ich@wir.de')).toEqual(['anna@nordwind.de']);
  });

  it('gibt nichts zurück, wenn nur wir selbst vorkommen', () => {
    const f = faden([
      n({
        id: 'a',
        sentAt: '2026-03-02T10:00:00Z',
        outgoing: true,
        fromAddress: 'ich@wir.de',
        toAddresses: 'ich@wir.de',
      }),
    ]);

    expect(antwortAn(f, 'ich@wir.de')).toEqual([]);
  });
});

describe('antwortBetreff', () => {
  it.each([
    ['ohne Präfix', 'Anfrage Lagersystem', 'Re: Anfrage Lagersystem'],
    ['mit Re', 'Re: Anfrage', 'Re: Anfrage'],
    ['mit AW', 'AW: Anfrage', 'Re: Anfrage'],
    ['gestapelt', 'Re: AW: Re: Anfrage', 'Re: Anfrage'],
    ['mit Zähler', 'Re[2]: Anfrage', 'Re: Anfrage'],
    ['kleingeschrieben', 're: anfrage', 'Re: anfrage'],
    ['mit Leerzeichen', '  AW:  Anfrage  ', 'Re: Anfrage'],
  ])('setzt bei %s genau ein Re', (_wie, betreff, erwartet) => {
    expect(antwortBetreff(betreff)).toBe(erwartet);
  });

  it.each([
    ['null', null],
    ['leer', ''],
    ['nur ein Präfix', 'Re:'],
  ])('macht aus %s ein bloßes Re', (_wie, betreff) => {
    expect(antwortBetreff(betreff)).toBe('Re:');
  });
});
