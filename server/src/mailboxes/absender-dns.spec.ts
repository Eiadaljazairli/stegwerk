import {
  bewerte,
  dmarcRichtlinie,
  type DnsLeser,
  domainVon,
  imNetz,
  pruefeAbsender,
  pruefeAbsenderGemerkt,
  spfEintrag,
} from './absender-dns';

type Zonen = {
  txt?: Record<string, string[][]>;
  a?: Record<string, string[]>;
  aaaa?: Record<string, string[]>;
  mx?: Record<string, { exchange: string; priority: number }[]>;
};

const nxdomain = () =>
  Promise.reject(
    Object.assign(new Error('queryTxt ENOTFOUND'), { code: 'ENOTFOUND' }),
  );

const dnsAus = (zonen: Zonen): DnsLeser & { fragen: string[] } => {
  const fragen: string[] = [];

  return {
    fragen,
    resolveTxt: (name) => {
      fragen.push(`TXT ${name}`);

      return zonen.txt?.[name] === undefined
        ? nxdomain()
        : Promise.resolve(zonen.txt[name]);
    },
    resolve4: (name) => {
      fragen.push(`A ${name}`);

      return Promise.resolve(zonen.a?.[name] ?? []);
    },
    resolve6: (name) => Promise.resolve(zonen.aaaa?.[name] ?? []),
    resolveMx: (name) => Promise.resolve(zonen.mx?.[name] ?? []),
  };
};

describe('Bausteine', () => {
  it('liest die Domain aus einer Adresse und weist Unsinn ab', () => {
    expect(domainVon('Ich@Firma.DE')).toBe('firma.de');
    expect(domainVon('ohne-at')).toBeNull();
    expect(domainVon('x@localhost')).toBeNull();
  });

  it('prüft IPv4- und IPv6-Netze', () => {
    expect(imNetz('192.0.2.17', '192.0.2.0/24')).toBe(true);
    expect(imNetz('192.0.3.17', '192.0.2.0/24')).toBe(false);
    expect(imNetz('2001:db8::1', '2001:db8::/32')).toBe(true);
    expect(imNetz('2001:db9::1', '2001:db8::/32')).toBe(false);
    expect(imNetz('192.0.2.17', '2001:db8::/32')).toBe(false);
    expect(imNetz('192.0.2.17', '192.0.2.17')).toBe(true);
  });

  it('findet SPF auch über mehrere Teile und die DMARC-Richtlinie', () => {
    expect(
      spfEintrag([['google-site-verification=x'], ['v=spf1 ', 'mx -all']]),
    ).toBe('v=spf1 mx -all');
    expect(spfEintrag([['v=spf10 nicht']])).toBeNull();
    expect(
      dmarcRichtlinie([['v=DMARC1; p=quarantine; rua=mailto:x@y.de']]),
    ).toBe('quarantine');
    expect(dmarcRichtlinie([['v=DMARC1; rua=mailto:x@y.de']])).toBe('none');
    expect(dmarcRichtlinie([['etwas anderes']])).toBeNull();
  });

  it('gibt eine Ampel mit Sätzen', () => {
    expect(bewerte('ok', 'reject').ampel).toBe('gut');
    expect(bewerte('ok', 'none').ampel).toBe('hinweis');
    expect(bewerte('ohneServer', 'quarantine').ampel).toBe('hinweis');
    expect(bewerte('fehlt', 'reject')).toMatchObject({
      ampel: 'problem',
      hinweise: [expect.stringMatching(/SPF/u)],
    });
    expect(bewerte('ok', 'fehlt').hinweise[0]).toMatch(/DMARC/u);
  });
});

describe('pruefeAbsender', () => {
  it('erkennt den Postausgang über include und ip4', async () => {
    const dns = dnsAus({
      txt: {
        'firma.de': [['v=spf1 include:_spf.anbieter.de ~all']],
        '_spf.anbieter.de': [['v=spf1 ip4:203.0.113.0/24 -all']],
        '_dmarc.firma.de': [['v=DMARC1; p=reject']],
      },
      a: { 'smtp.anbieter.de': ['203.0.113.25'] },
    });

    expect(
      await pruefeAbsender('ich@firma.de', 'smtp.anbieter.de', dns),
    ).toEqual({
      domain: 'firma.de',
      spf: 'ok',
      dmarc: 'reject',
      ampel: 'gut',
      hinweise: [],
    });
  });

  it('erkennt den Postausgang über mx und a', async () => {
    const dns = dnsAus({
      txt: { 'firma.de': [['v=spf1 mx a:relay.firma.de -all']] },
      mx: { 'firma.de': [{ exchange: 'mx.firma.de', priority: 10 }] },
      a: { 'mx.firma.de': ['198.51.100.1'], 'mail.firma.de': ['198.51.100.1'] },
    });

    expect(
      (await pruefeAbsender('ich@firma.de', 'mail.firma.de', dns))?.spf,
    ).toBe('ok');
  });

  it('meldet SPF ohne den Server und fehlendes DMARC', async () => {
    const dns = dnsAus({
      txt: { 'firma.de': [['v=spf1 ip4:192.0.2.1 -all']] },
      a: { 'smtp.anderswo.de': ['203.0.113.9'] },
    });

    expect(
      await pruefeAbsender('ich@firma.de', 'smtp.anderswo.de', dns),
    ).toMatchObject({
      spf: 'ohneServer',
      dmarc: 'fehlt',
      ampel: 'problem',
    });
  });

  it('meldet eine Domain ganz ohne SPF', async () => {
    expect(
      (await pruefeAbsender('ich@leer.de', 'smtp.leer.de', dnsAus({})))?.spf,
    ).toBe('fehlt');
  });

  it('gibt nach dem Zeitlimit „unbekannt“ statt zu warten', async () => {
    const haengt: DnsLeser = {
      resolveTxt: () => new Promise(() => undefined),
      resolve4: () => Promise.resolve([]),
      resolve6: () => Promise.resolve([]),
      resolveMx: () => Promise.resolve([]),
    };

    expect(
      await pruefeAbsender('ich@firma.de', null, haengt, 20),
    ).toMatchObject({ spf: 'unbekannt', dmarc: 'unbekannt', ampel: 'hinweis' });
  });

  it('folgt keiner Schleife und hört nach zehn Abfragen auf', async () => {
    const dns = dnsAus({
      txt: {
        'firma.de': [['v=spf1 include:a.firma.de -all']],
        'a.firma.de': [['v=spf1 include:firma.de -all']],
      },
      a: { 'smtp.firma.de': ['192.0.2.1'] },
    });

    expect(
      (await pruefeAbsender('ich@firma.de', 'smtp.firma.de', dns))?.spf,
    ).toBe('ohneServer');
    expect(dns.fragen.length).toBeLessThan(20);
  });

  it('merkt sich das Ergebnis zehn Minuten', async () => {
    const dns = dnsAus({ txt: { 'merk.de': [['v=spf1 -all']] } });

    await pruefeAbsenderGemerkt('a@merk.de', null, 1_000, dns);
    const nachErster = dns.fragen.length;

    await pruefeAbsenderGemerkt('b@merk.de', null, 2_000, dns);
    expect(dns.fragen.length).toBe(nachErster);
    await pruefeAbsenderGemerkt('b@merk.de', null, 11 * 60_000, dns);
    expect(dns.fragen.length).toBeGreaterThan(nachErster);
  });

  it('prüft auf ausdrücklichen Wunsch neu, aber nicht öfter als alle 30 Sekunden', async () => {
    const zonen: Zonen = { txt: { 'neu.de': [['v=spf1 -all']] } };
    const dns = dnsAus(zonen);

    const erste = await pruefeAbsenderGemerkt('a@neu.de', null, 1_000, dns);

    expect(erste?.dmarc).toBe('fehlt');
    expect(erste?.geprueftAm.getTime()).toBe(1_000);

    zonen.txt = {
      ...zonen.txt,
      '_dmarc.neu.de': [['v=DMARC1; p=reject']],
    };

    expect(
      (await pruefeAbsenderGemerkt('a@neu.de', null, 20_000, dns, true))?.dmarc,
    ).toBe('fehlt');

    const gemerkt = await pruefeAbsenderGemerkt('a@neu.de', null, 60_000, dns);

    expect(gemerkt?.dmarc).toBe('fehlt');
    expect(gemerkt?.geprueftAm.getTime()).toBe(1_000);

    const frisch = await pruefeAbsenderGemerkt(
      'a@neu.de',
      null,
      60_000,
      dns,
      true,
    );

    expect(frisch?.dmarc).toBe('reject');
    expect(frisch?.geprueftAm.getTime()).toBe(60_000);
  });
});
