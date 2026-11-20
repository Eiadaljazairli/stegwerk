import {
  domainOf,
  isPublicDomain,
  type Matchable,
  matchMessage,
  normaliseAddress,
  parseAddressList,
} from './address-match';

describe('reading one address', () => {
  it('takes the address out of a display name', () => {
    expect(normaliseAddress('Anna Schmidt <anna@nordwind.de>')).toBe(
      'anna@nordwind.de',
    );
  });

  it('handles a bare address', () => {
    expect(normaliseAddress('anna@nordwind.de')).toBe('anna@nordwind.de');
  });

  it('lowercases it, because a header may not', () => {
    expect(normaliseAddress('Anna@Nordwind.DE')).toBe('anna@nordwind.de');
  });

  it('trims the whitespace a folded header leaves behind', () => {
    expect(normaliseAddress('  anna@nordwind.de \t')).toBe('anna@nordwind.de');
  });

  it('handles a quoted display name holding a comma', () => {
    expect(normaliseAddress('"Muster, Hans" <hans@firma.de>')).toBe(
      'hans@firma.de',
    );
  });

  it('answers empty for a display name with no address', () => {
    expect(normaliseAddress('Buchhaltung')).toBe('');
    expect(normaliseAddress('')).toBe('');
  });

  it('does not strip a plus tag', () => {
    expect(normaliseAddress('anna+crm@firma.de')).toBe('anna+crm@firma.de');
  });

  it('does not remove dots', () => {
    expect(normaliseAddress('a.b@firma.de')).toBe('a.b@firma.de');
  });
});

describe('reading a header full of addresses', () => {
  it('finds several', () => {
    expect(
      parseAddressList('anna@nordwind.de, Jonas <jonas@nordwind.de>'),
    ).toEqual(['anna@nordwind.de', 'jonas@nordwind.de']);
  });

  it('is not fooled by a comma inside a quoted name', () => {
    expect(
      parseAddressList('"Muster, Hans" <hans@firma.de>, anna@nordwind.de'),
    ).toEqual(['hans@firma.de', 'anna@nordwind.de']);
  });

  it('does not invent an address out of a quoted name that holds one', () => {
    expect(parseAddressList('"anna@alt.de, Anna" <anna@neu.de>')).toEqual([
      'anna@neu.de',
    ]);
  });

  it('drops repeats', () => {
    expect(
      parseAddressList('anna@nordwind.de, Anna <ANNA@nordwind.de>'),
    ).toEqual(['anna@nordwind.de']);
  });

  it('handles nothing at all', () => {
    expect(parseAddressList(null)).toEqual([]);
    expect(parseAddressList(undefined)).toEqual([]);
    expect(parseAddressList('')).toEqual([]);
    expect(parseAddressList('   ')).toEqual([]);
  });

  it('skips entries that carry no address', () => {
    expect(
      parseAddressList('Undisclosed recipients:;, anna@nordwind.de'),
    ).toEqual(['anna@nordwind.de']);
  });
});

describe('the domain', () => {
  it('is what follows the last at sign', () => {
    expect(domainOf('anna@nordwind.de')).toBe('nordwind.de');
  });

  it('is empty when there is no at sign', () => {
    expect(domainOf('nordwind.de')).toBe('');
  });

  it('takes the last at sign, not the first', () => {
    expect(domainOf('"a@b"@firma.de')).toBe('firma.de');
  });

  it('recognises the free providers', () => {
    expect(isPublicDomain('gmail.com')).toBe(true);
    expect(isPublicDomain('GMX.de')).toBe(true);
    expect(isPublicDomain('web.de')).toBe(true);
    expect(isPublicDomain('t-online.de')).toBe(true);
  });

  it('treats a company domain as a company domain', () => {
    expect(isPublicDomain('nordwind-logistik.de')).toBe(false);
  });
});

describe('matching a message', () => {
  const known: Matchable = {
    contactsByEmail: new Map([
      ['anna@nordwind.de', { id: 'contact-anna', companyId: 'company-nord' }],
      ['jonas@nordwind.de', { id: 'contact-jonas', companyId: 'company-nord' }],
      ['privat@gmail.com', { id: 'contact-privat', companyId: null }],
    ]),
    companiesByDomain: new Map([
      ['nordwind.de', 'company-nord'],
      ['suedwind.de', 'company-sued'],
    ]),
  };

  it('finds the contact who sent it', () => {
    expect(
      matchMessage(
        { from: 'Anna <anna@nordwind.de>', to: 'ich@wir.de', cc: null },
        known,
      ),
    ).toEqual({
      contactId: 'contact-anna',
      companyId: 'company-nord',
      matchedOn: 'anna@nordwind.de',
    });
  });

  it('finds the contact it was sent to', () => {
    expect(
      matchMessage(
        { from: 'ich@wir.de', to: 'jonas@nordwind.de', cc: null },
        known,
      ).contactId,
    ).toBe('contact-jonas');
  });

  it('finds one in the copy line', () => {
    expect(
      matchMessage(
        { from: 'ich@wir.de', to: 'jemand@sonst.de', cc: 'anna@nordwind.de' },
        known,
      ).contactId,
    ).toBe('contact-anna');
  });

  it('prefers the sender over a later recipient', () => {
    expect(
      matchMessage(
        {
          from: 'anna@nordwind.de',
          to: 'jonas@nordwind.de, privat@gmail.com',
          cc: null,
        },
        known,
      ).contactId,
    ).toBe('contact-anna');
  });

  it('carries the company of the contact it matched', () => {
    expect(
      matchMessage({ from: 'jonas@nordwind.de', to: null, cc: null }, known)
        .companyId,
    ).toBe('company-nord');
  });

  it('leaves the company empty for a contact who has none', () => {
    expect(
      matchMessage({ from: 'privat@gmail.com', to: null, cc: null }, known),
    ).toMatchObject({ contactId: 'contact-privat', companyId: null });
  });

  it('falls back to the company when no contact is known', () => {
    expect(
      matchMessage({ from: 'neu@suedwind.de', to: null, cc: null }, known),
    ).toEqual({
      contactId: null,
      companyId: 'company-sued',
      matchedOn: 'neu@suedwind.de',
    });
  });

  it('prefers a known contact over a company domain', () => {
    expect(
      matchMessage(
        { from: 'unbekannt@suedwind.de', to: 'anna@nordwind.de', cc: null },
        known,
      ).contactId,
    ).toBe('contact-anna');
  });

  it('never matches a company by a free provider', () => {
    const withGmail: Matchable = {
      contactsByEmail: new Map(),
      companiesByDomain: new Map([['gmail.com', 'company-falsch']]),
    };

    expect(
      matchMessage(
        { from: 'irgendwer@gmail.com', to: null, cc: null },
        withGmail,
      ).companyId,
    ).toBeNull();
  });

  it('matches nothing when nothing is known', () => {
    expect(
      matchMessage({ from: 'fremd@fremd.de', to: null, cc: null }, known),
    ).toEqual({ contactId: null, companyId: null, matchedOn: null });
  });

  it('handles a message with no addresses at all', () => {
    expect(
      matchMessage({ from: null, to: null, cc: null }, known).contactId,
    ).toBeNull();
  });

  it('says which address decided it', () => {
    expect(
      matchMessage(
        { from: 'ich@wir.de', to: 'ANNA@NORDWIND.DE', cc: null },
        known,
      ).matchedOn,
    ).toBe('anna@nordwind.de');
  });
});
