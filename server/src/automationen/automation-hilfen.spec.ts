import { AutomationRhythmus } from './automation.entity';
import {
  genannteVariablen,
  MAX_FELD,
  MAX_WERT,
  setzeEin,
} from './automation-variablen';
import { naechsterLauf, pruefeZeitplan } from './automation-zeitplan';

describe('Variablen', () => {
  const variablen = {
    ausloeser: { name: 'Müller GmbH', felder: { budget: 5000 } },
    schritt1: {
      anzahl: 2,
      treffer: [{ email: 'a@b.de' }, { email: 'c@d.de' }],
      json: { daten: { id: 'x-1' } },
    },
  };

  it('setzt Werte aus dem Auslöser und früheren Schritten ein', () => {
    expect(
      setzeEin(
        'Neu: {{ausloeser.name}} ({{ausloeser.felder.budget}} €), {{schritt1.anzahl}} Treffer, erster {{schritt1.treffer.0.email}}, Kennung {{ schritt1.json.daten.id }}',
        variablen,
      ),
    ).toBe('Neu: Müller GmbH (5000 €), 2 Treffer, erster a@b.de, Kennung x-1');
  });

  it('lässt Unbekanntes leer, statt Fehler zu werfen', () => {
    expect(setzeEin('[{{schritt2.id}}][{{ausloeser.fehlt}}]', variablen)).toBe(
      '[][]',
    );
  });

  it('erreicht nichts außer eigenen Eigenschaften', () => {
    expect(
      setzeEin(
        '{{ausloeser.constructor}}{{ausloeser.__proto__}}{{ausloeser.toString}}{{schritt1.treffer.length}}',
        variablen,
      ),
    ).toBe('');
  });

  it('wertet nichts aus: andere Formen bleiben Text', () => {
    const text = '{{ausloeser.name()}} {{process.env}} {{ausloeser["name"]}}';

    expect(setzeEin(text, variablen)).toBe(text);
    expect(genannteVariablen(text)).toEqual([]);
  });

  it('kürzt einzelne Werte und das ganze Feld', () => {
    const lang = { ausloeser: { text: 'x'.repeat(MAX_WERT * 2) } };

    expect(setzeEin('{{ausloeser.text}}', lang)).toHaveLength(MAX_WERT);
    expect(
      setzeEin('{{ausloeser.text}}'.repeat(10), lang).length,
    ).toBeLessThanOrEqual(MAX_FELD);
  });

  it('gibt Objekte als JSON weiter', () => {
    expect(setzeEin('{{schritt1.json}}', variablen)).toBe(
      '{"daten":{"id":"x-1"}}',
    );
  });
});

describe('Zeitplan', () => {
  it('täglich um 8 Uhr deutscher Zeit, auch im Sommer', () => {
    const plan = { rhythmus: AutomationRhythmus.TAEGLICH, uhrzeit: '08:00' };

    expect(
      naechsterLauf(plan, new Date('2026-07-10T05:00:00Z')).toISOString(),
    ).toBe('2026-07-10T06:00:00.000Z');
    expect(
      naechsterLauf(plan, new Date('2026-07-10T06:00:00Z')).toISOString(),
    ).toBe('2026-07-11T06:00:00.000Z');
    expect(
      naechsterLauf(plan, new Date('2026-12-10T08:00:00Z')).toISOString(),
    ).toBe('2026-12-11T07:00:00.000Z');
  });

  it('springt über die Zeitumstellung, ohne eine Stunde zu verlieren', () => {
    const plan = { rhythmus: AutomationRhythmus.TAEGLICH, uhrzeit: '09:30' };

    expect(
      naechsterLauf(plan, new Date('2026-10-24T08:00:00Z')).toISOString(),
    ).toBe('2026-10-25T08:30:00.000Z');
  });

  it('wöchentlich am gewählten Tag', () => {
    const plan = {
      rhythmus: AutomationRhythmus.WOECHENTLICH,
      uhrzeit: '07:15',
      wochentag: 1,
    };

    expect(
      naechsterLauf(plan, new Date('2026-10-22T12:00:00Z')).toISOString(),
    ).toBe('2026-10-26T06:15:00.000Z');
  });

  it('monatlich am gewählten Tag, auch über das Jahresende', () => {
    const plan = {
      rhythmus: AutomationRhythmus.MONATLICH,
      uhrzeit: '06:00',
      monatstag: 3,
    };

    expect(
      naechsterLauf(plan, new Date('2026-12-05T00:00:00Z')).toISOString(),
    ).toBe('2027-01-03T05:00:00.000Z');
  });

  it('lehnt unvollständige Pläne ab', () => {
    expect(
      pruefeZeitplan({ rhythmus: AutomationRhythmus.TAEGLICH, uhrzeit: '8' }),
    ).not.toBeNull();
    expect(
      pruefeZeitplan({
        rhythmus: AutomationRhythmus.WOECHENTLICH,
        uhrzeit: '08:00',
      }),
    ).not.toBeNull();
    expect(
      pruefeZeitplan({
        rhythmus: AutomationRhythmus.MONATLICH,
        uhrzeit: '08:00',
        monatstag: 31,
      }),
    ).not.toBeNull();
    expect(
      pruefeZeitplan({
        rhythmus: AutomationRhythmus.MONATLICH,
        uhrzeit: '08:00',
        monatstag: 28,
      }),
    ).toBeNull();
  });
});
