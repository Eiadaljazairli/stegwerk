import { describe, expect, it } from 'vitest';

import {
  hostVon,
  type ImpressumFeld,
  leseQuelle,
  uebernahmeWerte,
  umschalten,
  vorauswahl,
} from './firmendaten';

const feld = (
  name: string,
  wert: string,
  uebernehmbar: boolean,
  aktuell: string | null = null,
): ImpressumFeld => ({
  feld: name,
  label: name,
  wert,
  aktuell,
  uebernehmbar,
  grund: uebernehmbar ? null : 'Schon belegt; überschrieben wird nichts.',
});

const FELDER = [
  feld('name', 'Nordwind GmbH', false, 'Nordwind'),
  feld('street', 'Hafenstraße 12a', true),
  feld('city', 'Hamburg', false, 'Altona'),
  feld('phone', '+49401234560', true),
  feld('ustIdNr', 'DE123456789', true),
];

describe('Auswahl aus dem Impressum', () => {
  it('hakt jedes freie Feld vorab an und kein belegtes', () => {
    expect([...vorauswahl(FELDER)].sort()).toEqual([
      'phone',
      'street',
      'ustIdNr',
    ]);
  });

  it('lässt einzelne Felder abwählen und wieder anhaken', () => {
    const ohneTelefon = umschalten(vorauswahl(FELDER), 'phone');

    expect(uebernahmeWerte(FELDER, ohneTelefon)).toEqual([
      { feld: 'street', wert: 'Hafenstraße 12a' },
      { feld: 'ustIdNr', wert: 'DE123456789' },
    ]);
    expect(umschalten(ohneTelefon, 'phone').has('phone')).toBe(true);
  });

  it('schickt nie ein belegtes Feld, auch wenn es in der Auswahl steht', () => {
    expect(uebernahmeWerte(FELDER, new Set(['city', 'name']))).toEqual([]);
  });
});

describe('Woher gelesen wird', () => {
  it('nimmt die Website vor der Domain', () => {
    expect(leseQuelle('https://www.nordwind.de/start', 'nordwind.de')).toBe(
      'www.nordwind.de',
    );
    expect(leseQuelle(null, ' nordwind.de ')).toBe('nordwind.de');
    expect(leseQuelle('', '')).toBeNull();
  });

  it('liest den Host aus einer Adresse und bleibt bei Unsinn still', () => {
    expect(hostVon('https://firma.de/apple.png')).toBe('firma.de');
    expect(hostVon('kein link')).toBeNull();
    expect(hostVon(null)).toBeNull();
  });
});
