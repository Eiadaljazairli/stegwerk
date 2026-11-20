import { HttpException } from '@nestjs/common';

import { Fehlversuche } from './fehlversuche';

describe('Fehlversuche', () => {
  it('sperrt nach der Grenze und gibt nach dem Fenster wieder frei', () => {
    const zaehler = new Fehlversuche(3, 1000);

    for (let i = 0; i < 3; i += 1) {
      zaehler.pruefe('konto', 0);
      zaehler.zaehle('konto', 0);
    }

    expect(() => zaehler.pruefe('konto', 10)).toThrow(HttpException);
    expect(() => zaehler.pruefe('anderes', 10)).not.toThrow();
    expect(() => zaehler.pruefe('konto', 2000)).not.toThrow();
  });

  it('vergisst nach Erfolg', () => {
    const zaehler = new Fehlversuche(2, 1000);

    zaehler.zaehle('konto', 0);
    zaehler.zaehle('konto', 0);
    zaehler.vergiss('konto');

    expect(() => zaehler.pruefe('konto', 1)).not.toThrow();
  });

  it('sagt genau beim Versuch, der sperrt, dass jetzt gesperrt ist', () => {
    const zaehler = new Fehlversuche(3, 1000);

    expect(zaehler.zaehle('konto', 0)).toBe(false);
    expect(zaehler.zaehle('konto', 0)).toBe(false);
    expect(zaehler.zaehle('konto', 0)).toBe(true);
    expect(zaehler.zaehle('konto', 0)).toBe(false);
    expect(zaehler.zaehle('konto', 2000)).toBe(false);
  });
});

describe('Fehlversuche: Dauer der Sperre', () => {
  it('sperrt volle Fensterlänge ab dem sperrenden Versuch, nicht ab dem ersten', () => {
    const zaehler = new Fehlversuche(3, 1000);

    zaehler.zaehle('konto', 0);
    zaehler.zaehle('konto', 500);
    expect(zaehler.zaehle('konto', 900)).toBe(true);

    expect(() => zaehler.pruefe('konto', 1100)).toThrow(HttpException);
    expect(() => zaehler.pruefe('konto', 1899)).toThrow(HttpException);
    expect(() => zaehler.pruefe('konto', 1901)).not.toThrow();
  });

  it('verlängert die Sperre nicht durch weitere Fehlversuche', () => {
    const zaehler = new Fehlversuche(2, 1000);

    zaehler.zaehle('konto', 0);
    zaehler.zaehle('konto', 0);
    expect(zaehler.zaehle('konto', 800)).toBe(false);

    expect(() => zaehler.pruefe('konto', 1001)).not.toThrow();
  });
});
