import { adresseErlaubt, normalisiereDomains } from './einladungs-domains';

describe('Einladungs-Domains', () => {
  it('nimmt Domains mit Umlauten an, in ASCII-Form', () => {
    expect(normalisiereDomains(['Müller.de', '@xn--mller-kva.de'])).toEqual([
      'xn--mller-kva.de',
    ]);
  });

  it('lässt Adressen mit Umlaut-Domain zu, gleich in welcher Schreibweise', () => {
    const domains = normalisiereDomains(['müller.de']);

    expect(adresseErlaubt('anna@müller.de', domains)).toBe(true);
    expect(adresseErlaubt('anna@vertrieb.Müller.de', domains)).toBe(true);
    expect(adresseErlaubt('anna@xn--mller-kva.de', domains)).toBe(true);
    expect(adresseErlaubt('anna@muller.de', domains)).toBe(false);
    expect(
      adresseErlaubt(
        'anna@müller.de',
        normalisiereDomains(['xn--mller-kva.de']),
      ),
    ).toBe(true);
  });

  it('lehnt Unsinn weiter ab und nennt ihn, wie eingegeben', () => {
    expect(() => normalisiereDomains(['kein domain'])).toThrow('kein domain');
  });
});
