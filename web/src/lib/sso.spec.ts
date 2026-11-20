import { describe, expect, it } from 'vitest';

import {
  darfTrennen,
  markeAusFragment,
  ohneSsoParameter,
  sichtbareAnbieter,
  ssoName,
  ssoRueckmeldung,
} from './sso';

describe('sichtbareAnbieter', () => {
  it('zeigt nur, was der Server eingerichtet hat, in fester Reihenfolge', () => {
    expect(sichtbareAnbieter(['microsoft', 'google'])).toEqual([
      'google',
      'microsoft',
    ]);
    expect(sichtbareAnbieter(['microsoft'])).toEqual(['microsoft']);
    expect(sichtbareAnbieter([])).toEqual([]);
    expect(sichtbareAnbieter(undefined)).toEqual([]);
    expect(sichtbareAnbieter(['github'])).toEqual([]);
  });
});

describe('markeAusFragment', () => {
  it('liest die Marke nur in der erwarteten Form', () => {
    const marke = 'a'.repeat(43);

    expect(markeAusFragment(`#sso=${marke}`)).toBe(marke);
    expect(markeAusFragment('')).toBeNull();
    expect(markeAusFragment('#sso=kurz')).toBeNull();
    expect(markeAusFragment(`#sso=${marke}&x=1`)).toBeNull();
    expect(markeAusFragment(`#andere=${marke}`)).toBeNull();
  });
});

describe('ssoRueckmeldung', () => {
  it('nimmt den Satz zum Kennzeichen aus der eigenen Tabelle', () => {
    expect(ssoRueckmeldung('?sso=fehler&grund=abgebrochen')).toEqual({
      art: 'fehler',
      text: 'Die Anmeldung wurde beim Anbieter abgebrochen.',
    });
    expect(
      ssoRueckmeldung('?sso=fehler&grund=konto_vorhanden&anbieter=microsoft'),
    ).toEqual({
      art: 'fehler',
      text: expect.stringContaining('verknüpfen Sie Microsoft unter Team'),
    });
  });

  it('zeigt keinen Text aus der Adresse an', () => {
    const allgemein = {
      art: 'fehler',
      text: 'Die Anmeldung beim Anbieter ist fehlgeschlagen.',
    };

    expect(
      ssoRueckmeldung(
        '?sso=fehler&grund=Ihr+Konto+ist+gesperrt,+rufen+Sie+0900+an',
      ),
    ).toEqual(allgemein);
    expect(ssoRueckmeldung('?sso=fehler&grund=toString')).toEqual(allgemein);
    expect(ssoRueckmeldung('?sso=fehler')).toEqual(allgemein);
    expect(
      ssoRueckmeldung(
        '?sso=fehler&grund=fremd_verknuepft&anbieter=Hotline+0900',
      ),
    ).toEqual({
      art: 'fehler',
      text: 'Dieses Anbieter-Konto gehört schon zu einem anderen Stegwerk-Konto.',
    });
  });

  it('meldet eine neue Verknüpfung mit dem Namen des Anbieters', () => {
    expect(ssoRueckmeldung('?sso=verknuepft&anbieter=microsoft')).toEqual({
      art: 'verknuepft',
      anbieter: 'microsoft',
      text: 'Ihr Konto lässt sich jetzt auch mit Microsoft anmelden.',
    });
    expect(ssoRueckmeldung('?sso=verknuepft&anbieter=Hotline+0900')).toBeNull();
  });

  it('ignoriert alles andere', () => {
    expect(ssoRueckmeldung('')).toBeNull();
    expect(ssoRueckmeldung('?oauth=ok')).toBeNull();
  });
});

describe('ohneSsoParameter', () => {
  it('nimmt nur die eigenen Parameter heraus', () => {
    expect(ohneSsoParameter('?sso=fehler&grund=x&tab=2')).toBe('?tab=2');
    expect(ohneSsoParameter('?sso=verknuepft&anbieter=google')).toBe('');
  });
});

describe('darfTrennen', () => {
  it('lässt den letzten Weg ins Konto stehen', () => {
    expect(darfTrennen(1, false)).toBe(false);
    expect(darfTrennen(2, false)).toBe(true);
    expect(darfTrennen(1, true)).toBe(true);
  });
});

describe('ssoName', () => {
  it('nennt die Anbieter beim Namen', () => {
    expect(ssoName('google')).toBe('Google');
    expect(ssoName('microsoft')).toBe('Microsoft');
    expect(ssoName('anders')).toBe('anders');
  });
});
