import { BadRequestException } from '@nestjs/common';

import {
  PASSWORT_ZU_SCHWACH,
  eigenerAnteil,
  istZuSchwach,
  pruefePasswort,
} from './passwort-regeln';

describe('Passwortregeln', () => {
  it.each([
    'Passwort2024!',
    'password1234',
    'P4ssw0rt1234',
    '123456789012',
    'qwertzuiop12',
    '1q2w3e4r5t6z',
    'abcabcabcabc',
    'aaaaaaaaaaaa',
    'Sommer2023!!',
    'Willkommen123',
    'iloveyou2020',
    'asdfghjklöä1',
  ])('lehnt „%s“ ab', (passwort) => {
    expect(istZuSchwach(passwort)).toBe(true);
  });

  it.each([
    'sommer-haus-boot-tisch',
    'Kxq7#mVb2!pRz',
    'MeinHundBello2019',
    'grüne Tasse am Fenster',
    'k9$Lm2#vQ8wz',
  ])('lässt „%s“ durch', (passwort) => {
    expect(istZuSchwach(passwort)).toBe(false);
  });

  it('rechnet die eigene Adresse und den Namen heraus', () => {
    const bezug = {
      email: 'mareike.brandt@nordwind-gmbh.de',
      namen: ['Mareike', 'Brandt'],
    };

    expect(istZuSchwach('MareikeBrandt2024', bezug)).toBe(true);
    expect(istZuSchwach('nordwind-2024!!', bezug)).toBe(true);
    expect(istZuSchwach('MareikeBrandt2024')).toBe(false);
  });

  it('meldet den Grund, nicht nur einen Satz', () => {
    expect.assertions(2);

    try {
      pruefePasswort('Passwort1234');
    } catch (fehler) {
      expect(fehler).toBeInstanceOf(BadRequestException);
      expect(
        ((fehler as BadRequestException).getResponse() as { reason: string })
          .reason,
      ).toBe(PASSWORT_ZU_SCHWACH);
    }
  });

  it('nimmt Folgen auch rückwärts heraus', () => {
    expect(eigenerAnteil('9876543210xy')).toBe('xy');
  });
});
