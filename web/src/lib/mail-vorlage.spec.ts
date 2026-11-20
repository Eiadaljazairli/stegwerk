import { describe, expect, it } from 'vitest';

import { fuelleVorlage, signaturBlock, vorlageEinsetzen } from './mail-vorlage';

describe('fuelleVorlage', () => {
  it('setzt bekannte Werte ein', () => {
    expect(
      fuelleVorlage('Hallo {{vorname}} {{nachname}}, Grüße {{ mein_name }}', {
        vorname: 'Erika',
        nachname: 'Muster',
        mein_name: 'Anna Pruefer',
      }),
    ).toBe('Hallo Erika Muster, Grüße Anna Pruefer');
  });

  it('lässt Unbekanntes leer und räumt die Lücke auf', () => {
    expect(fuelleVorlage('Hallo {{vorname}}, wie geht es?', {})).toBe(
      'Hallo, wie geht es?',
    );
    expect(fuelleVorlage('Bei {{firma}} {{unbekannt}} alles gut', {})).toBe(
      'Bei alles gut',
    );
  });

  it('lässt Zeilenumbrüche stehen', () => {
    expect(
      fuelleVorlage('Hallo {{vorname}},\n\nDanke.', { vorname: 'Erika' }),
    ).toBe('Hallo Erika,\n\nDanke.');
  });

  it('setzt den Ersatz ein, wo der Wert fehlt', () => {
    expect(fuelleVorlage('Hallo {{vorname|zusammen}},', {})).toBe(
      'Hallo zusammen,',
    );
    expect(
      fuelleVorlage('Hallo {{ vorname | zusammen }},', { vorname: 'Erika' }),
    ).toBe('Hallo Erika,');
  });
});

describe('Signatur', () => {
  const sig = signaturBlock('Viele Grüße\nAnna');

  it('bekommt den Trenner, leer bleibt leer', () => {
    expect(sig).toBe('\n\n-- \nViele Grüße\nAnna');
    expect(signaturBlock('  ')).toBe('');
    expect(signaturBlock(null)).toBe('');
  });

  it('setzt eine Vorlage über die Signatur', () => {
    expect(vorlageEinsetzen(sig, 'Hallo', sig)).toBe(`Hallo${sig}`);
    expect(vorlageEinsetzen(`Erst${sig}`, 'Hallo', sig)).toBe(
      `Erst\n\nHallo${sig}`,
    );
  });

  it('hängt an, wenn die Signatur nicht mehr am Ende steht', () => {
    expect(vorlageEinsetzen('Text', 'Hallo', sig)).toBe('Text\n\nHallo');
    expect(vorlageEinsetzen('', 'Hallo', '')).toBe('Hallo');
  });
});
