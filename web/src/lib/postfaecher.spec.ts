import { describe, expect, it } from 'vitest';

import {
  absenderEingabe,
  absenderOptionen,
  gespraechStand,
  darfNutzen,
  kannSendenAls,
  kannSendenAus,
  mitgliederUmschalten,
  postfachName,
  vorgabeAbsender,
} from './postfaecher';

const postfach = (
  id: string,
  username: string,
  weiteres: Partial<{
    art: 'persoenlich' | 'gemeinsam';
    haupt: boolean;
    smtpHost: string | null;
    aliase: string[];
    bezeichnung: string | null;
    getrennt: boolean;
    mitglieder: string[];
  }> = {},
) => ({
  id,
  username,
  art: 'persoenlich' as const,
  haupt: false,
  smtpHost: 'smtp.wir.de',
  aliase: [],
  bezeichnung: null,
  ...weiteres,
});

describe('postfachName', () => {
  it('nennt die Bezeichnung mit Adresse, sonst nur die Adresse', () => {
    expect(postfachName({ username: 'info@wir.de', bezeichnung: 'Info' })).toBe(
      'Info (info@wir.de)',
    );
    expect(postfachName({ username: 'anna@wir.de', bezeichnung: ' ' })).toBe(
      'anna@wir.de',
    );
  });
});

describe('kannSendenAus', () => {
  it('braucht einen Postausgang und eine Verbindung', () => {
    expect(kannSendenAus(postfach('a', 'a@wir.de'))).toBe(true);
    expect(kannSendenAus(postfach('a', 'a@wir.de', { smtpHost: null }))).toBe(
      false,
    );
    expect(kannSendenAus(postfach('a', 'a@wir.de', { getrennt: true }))).toBe(
      false,
    );
  });
});

describe('darfNutzen und kannSendenAls', () => {
  it('lässt gemeinsame Postfächer nur ihre Mitglieder nutzen, eigene immer', () => {
    const info = postfach('info', 'info@wir.de', {
      art: 'gemeinsam',
      mitglieder: ['anna'],
    });

    expect(darfNutzen(info, 'anna')).toBe(true);
    expect(darfNutzen(info, 'chef')).toBe(false);
    expect(darfNutzen(info, null)).toBe(false);
    expect(
      darfNutzen(postfach('i', 'i@wir.de', { art: 'gemeinsam' }), 'anna'),
    ).toBe(false);
    expect(darfNutzen(postfach('a', 'a@wir.de'), null)).toBe(true);
    expect(kannSendenAls(info, 'chef')).toBe(false);
    expect(kannSendenAls(info, 'anna')).toBe(true);
  });

  it('bietet einem Verwalter ohne Mitgliedschaft und ohne eigenes Postfach keinen Absender an', () => {
    const nurVerwaltet = [
      postfach('buchhaltung', 'buchhaltung@wir.de', {
        art: 'gemeinsam',
        mitglieder: ['ben'],
      }),
    ];

    expect(absenderOptionen(nurVerwaltet, 'chef')).toEqual([]);
    expect(nurVerwaltet.some((p) => kannSendenAls(p, 'chef'))).toBe(false);
  });
});

describe('absenderOptionen', () => {
  const liste = [
    postfach('info', 'info@wir.de', {
      art: 'gemeinsam',
      bezeichnung: 'Info',
      mitglieder: ['anna'],
    }),
    postfach('buchhaltung', 'buchhaltung@wir.de', {
      art: 'gemeinsam',
      mitglieder: ['ben'],
    }),
    postfach('zwei', 'anna2@wir.de'),
    postfach('haupt', 'anna@wir.de', {
      haupt: true,
      aliase: ['vertrieb@wir.de'],
    }),
    postfach('still', 'still@wir.de', { smtpHost: '' }),
  ];

  it('stellt das Hauptpostfach vor die übrigen eigenen und die gemeinsamen, ohne die stummen', () => {
    expect(
      absenderOptionen(liste, 'anna').map((option) => option.text),
    ).toEqual([
      'anna@wir.de',
      'vertrieb@wir.de',
      'anna2@wir.de',
      'info@wir.de · gemeinsam: Info',
    ]);
  });

  it('schickt Postfach und, nur bei weiteren Adressen, den Absender', () => {
    const optionen = absenderOptionen(liste, 'anna');

    expect(absenderEingabe(optionen, 'haupt|anna@wir.de')).toEqual({
      mailboxId: 'haupt',
    });
    expect(absenderEingabe(optionen, 'haupt|vertrieb@wir.de')).toEqual({
      mailboxId: 'haupt',
      from: 'vertrieb@wir.de',
    });
    expect(absenderEingabe(optionen, 'fremd|x@y.de')).toBeNull();
  });

  it('antwortet vorgabemäßig aus dem Postfach der Nachricht, sonst aus dem Hauptpostfach', () => {
    const optionen = absenderOptionen(liste, 'anna');

    expect(vorgabeAbsender(optionen, 'info')).toBe('info|info@wir.de');
    expect(vorgabeAbsender(optionen, 'unbekannt')).toBe('haupt|anna@wir.de');
    expect(vorgabeAbsender(optionen)).toBe('haupt|anna@wir.de');
    expect(vorgabeAbsender([])).toBe('');
  });
});

describe('gespraechStand', () => {
  const namen = new Map([['b', 'Ben Test']]);

  it('sagt offen oder erledigt und bei wem', () => {
    expect(
      gespraechStand({ offen: true, zugewiesenAnId: null }, namen, 'a'),
    ).toBe('Offen, niemandem zugewiesen');
    expect(
      gespraechStand({ offen: true, zugewiesenAnId: 'a' }, namen, 'a'),
    ).toBe('Offen, mir zugewiesen');
    expect(
      gespraechStand({ offen: false, zugewiesenAnId: 'b' }, namen, 'a'),
    ).toBe('Erledigt, zugewiesen an Ben Test');
    expect(
      gespraechStand({ offen: true, zugewiesenAnId: 'weg' }, namen, 'a'),
    ).toBe('Offen, zugewiesen an jemanden, der nicht mehr im Team ist');
  });
});

describe('mitgliederUmschalten', () => {
  it('nimmt hinzu und wieder heraus, ohne die Reihenfolge zu ändern', () => {
    expect(mitgliederUmschalten(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(mitgliederUmschalten(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });
});
