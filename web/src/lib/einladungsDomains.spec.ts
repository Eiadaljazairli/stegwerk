import { describe, expect, it } from 'vitest';

import {
  domainsAlsText,
  domainsAusText,
  eigeneDomainFehlt,
} from './einladungsDomains';

describe('domainsAusText', () => {
  it('zerlegt an Komma, Leerraum und Semikolon', () => {
    expect(domainsAusText('beispiel.de, nordwind.de;\nsued.de  ')).toEqual([
      'beispiel.de',
      'nordwind.de',
      'sued.de',
    ]);
  });

  it('nimmt @ und Großschreibung weg und doppelte heraus', () => {
    expect(domainsAusText('@Beispiel.DE beispiel.de')).toEqual(['beispiel.de']);
  });

  it('gibt für ein leeres Feld eine leere Liste', () => {
    expect(domainsAusText('  ,  ')).toEqual([]);
  });

  it('schreibt die Liste so zurück, wie man sie tippt', () => {
    expect(domainsAlsText(['a.de', 'b.de'])).toBe('a.de, b.de');
  });
});

describe('eigeneDomainFehlt', () => {
  it('warnt, wenn die eigene Domain nicht dabei ist', () => {
    expect(eigeneDomainFehlt('anna@privat.de', ['beispiel.de'])).toBe(true);
  });

  it('zählt Unterdomains mit und schweigt ohne Einschränkung', () => {
    expect(eigeneDomainFehlt('anna@nord.beispiel.de', ['beispiel.de'])).toBe(
      false,
    );
    expect(eigeneDomainFehlt('anna@privat.de', [])).toBe(false);
  });
});
