import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  abschnitteBilden,
  anzahlLeere,
  immerSichtbar,
  istEingeklappt,
  istLeer,
  leereSichtbar,
  merkeEingeklappt,
  merkeLeereSichtbar,
  OHNE_ABSCHNITT,
} from './feldgruppen';
import { type CustomField, type CustomFieldGroup } from './types';

const feld = (key: string, extra: Partial<CustomField> = {}): CustomField => ({
  id: key,
  entity: 'COMPANY',
  key,
  label: key,
  type: 'TEXT',
  options: [],
  farben: [],
  waehrung: null,
  eindeutig: false,
  required: false,
  position: 0,
  archivedAt: null,
  ...extra,
});

const gruppe = (
  id: string,
  position: number,
  extra: Partial<CustomFieldGroup> = {},
): CustomFieldGroup => ({
  id,
  entity: 'COMPANY',
  name: id,
  position,
  eingeklappt: false,
  ...extra,
});

describe('istLeer', () => {
  it.each([
    [null, true],
    [undefined, true],
    ['  ', true],
    [[], true],
    [{ ort: '', plz: null }, true],
    [false, false],
    [0, false],
    ['x', false],
    [['A'], false],
    [{ ort: 'Köln' }, false],
  ])('%j → %s', (wert, leer) => {
    expect(istLeer(wert)).toBe(leer);
  });
});

describe('immerSichtbar', () => {
  it('hält Pflichtfelder und Pflicht ab Phase sichtbar', () => {
    expect(immerSichtbar(feld('a', { required: true }))).toBe(true);
    expect(immerSichtbar(feld('b', { pflichtAbPhase: 'proposal' }))).toBe(true);
    expect(immerSichtbar(feld('c'))).toBe(false);
  });
});

describe('abschnitteBilden', () => {
  const felder = [
    feld('laufzeit', { gruppeId: 'vertrag' }),
    feld('kuendigung', { gruppeId: 'vertrag' }),
    feld('server', { gruppeId: 'technik' }),
    feld('region'),
    feld('verwaist', { gruppeId: 'gibt-es-nicht' }),
  ];
  const gruppen = [gruppe('technik', 1), gruppe('vertrag', 0)];

  it('ordnet nach Abschnitt und stellt die übrigen ans Ende', () => {
    const abschnitte = abschnitteBilden(
      felder,
      gruppen,
      { laufzeit: '2027-01-01', server: 'eu-1', region: 'Nord', verwaist: 'x' },
      true,
    );

    expect(abschnitte.map((a) => a.name)).toEqual([
      'vertrag',
      'technik',
      OHNE_ABSCHNITT,
    ]);
    expect(abschnitte[2].felder.map((f) => f.key)).toEqual([
      'region',
      'verwaist',
    ]);
  });

  it('stellt leere Felder hinter den Schalter und zählt sie', () => {
    const abschnitte = abschnitteBilden(
      felder,
      gruppen,
      { laufzeit: '2027-01-01' },
      false,
    );

    expect(abschnitte[0].felder.map((f) => f.key)).toEqual(['laufzeit']);
    expect(abschnitte[0].leere.map((f) => f.key)).toEqual(['kuendigung']);
    expect(anzahlLeere(abschnitte)).toBe(4);
  });

  it('versteckt Pflichtfelder nie, auch leer nicht', () => {
    const [ohne] = abschnitteBilden(
      [feld('pflicht', { required: true }), feld('frei')],
      [],
      {},
      false,
    );

    expect(ohne.felder.map((f) => f.key)).toEqual(['pflicht']);
    expect(ohne.leere.map((f) => f.key)).toEqual(['frei']);
  });

  it('lässt Abschnitte ohne Felder weg', () => {
    expect(
      abschnitteBilden([feld('a')], [gruppe('leer', 0)], { a: 'x' }, false).map(
        (a) => a.id,
      ),
    ).toEqual([null]);
  });
});

const speicher = () => {
  const werte = new Map<string, string>();

  return {
    getItem: (key: string) => werte.get(key) ?? null,
    setItem: (key: string, wert: string) => void werte.set(key, wert),
  };
};

describe('gemerkt im Browser', () => {
  beforeEach(() => vi.stubGlobal('window', { localStorage: speicher() }));
  afterEach(() => vi.unstubAllGlobals());

  const abschnitt = {
    id: 'vertrag',
    name: 'Vertrag',
    felder: [],
    leere: [],
    eingeklappt: true,
  };

  it('nimmt zu Beginn die Einstellung des Abschnitts, danach die eigene Wahl', () => {
    expect(istEingeklappt(abschnitt, 'COMPANY')).toBe(true);

    merkeEingeklappt('vertrag', 'COMPANY', false);

    expect(istEingeklappt(abschnitt, 'COMPANY')).toBe(false);
  });

  it('merkt „Weitere Angaben“ je Art von Akte', () => {
    const ohne = { ...abschnitt, id: null, eingeklappt: false };

    merkeEingeklappt(null, 'COMPANY', true);

    expect(istEingeklappt(ohne, 'COMPANY')).toBe(true);
    expect(istEingeklappt(ohne, 'CONTACT')).toBe(false);
    expect(istEingeklappt(ohne, 'DEAL')).toBe(false);
  });

  it('merkt sich leere Felder je Art von Akte', () => {
    expect(leereSichtbar('COMPANY')).toBe(false);

    merkeLeereSichtbar('COMPANY', true);

    expect(leereSichtbar('COMPANY')).toBe(true);
    expect(leereSichtbar('DEAL')).toBe(false);
  });

  it('kommt ohne Speicher aus', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('gesperrt');
        },
        setItem: () => {
          throw new Error('gesperrt');
        },
      },
    });

    expect(() => merkeLeereSichtbar('COMPANY', true)).not.toThrow();
    expect(leereSichtbar('COMPANY')).toBe(false);
    expect(istEingeklappt(abschnitt, 'COMPANY')).toBe(true);
  });

  it('liest Unsinn als nichts gemerkt', () => {
    window.localStorage.setItem('stegwerk.feldgruppen.leere', '{kaputt');

    expect(leereSichtbar('COMPANY')).toBe(false);
  });
});
