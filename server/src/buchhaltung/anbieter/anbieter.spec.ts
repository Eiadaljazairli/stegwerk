import { Steuerbefreiung } from '../../quotes/steuerbefreiung';
import { type BelegDaten } from '../beleg';
import { type Zugang } from './anbieter';
import {
  AnbieterFehler,
  type HttpAnfrage,
  type HttpAntwort,
  kurzerGrund,
  multipart,
  pruefeAntwort,
  retryAfterAls,
  sichererBuchhaltungsTransport,
  Taktgeber,
} from './http';
import {
  LEXWARE_KATEGORIE,
  Lexware,
  lexwareBeleg,
  lexwareKategorie,
} from './lexware';
import {
  Sevdesk,
  sevdeskBeleg,
  sevdeskKonto,
  sevdeskSteuerregel,
  sevdeskTag,
} from './sevdesk';

const SCHLUESSEL = 'geheimer-lexware-schluessel';
const SEV_SCHLUESSEL = '0123456789abcdef0123456789abcdef';

type Antworten = Record<
  string,
  HttpAntwort | ((a: HttpAnfrage) => HttpAntwort)
>;

const ok = (json: unknown, status = 200): HttpAntwort => ({
  status,
  rumpf: JSON.stringify(json),
  retryAfter: null,
});

const attrappe = (antworten: Antworten) => {
  const anfragen: HttpAnfrage[] = [];
  const http = (anfrage: HttpAnfrage): Promise<HttpAntwort> => {
    anfragen.push(anfrage);

    const pfad = new URL(anfrage.url).pathname + new URL(anfrage.url).search;
    const schluessel = Object.keys(antworten)
      .filter((muster) => `${anfrage.methode} ${pfad}`.startsWith(muster))
      .sort((a, b) => b.length - a.length)[0];

    if (schluessel === undefined) {
      return Promise.reject(
        new Error(`unerwartet: ${anfrage.methode} ${pfad}`),
      );
    }

    const antwort = antworten[schluessel];

    return Promise.resolve(
      typeof antwort === 'function' ? antwort(anfrage) : antwort,
    );
  };

  return { http, anfragen };
};

const ohneWarten = () => new Taktgeber(0, () => Promise.resolve());

const zugang = (schluessel = SCHLUESSEL): Zugang => {
  const daten: Record<string, unknown> = {};

  return {
    schluessel,
    verbindungId: 'v1',
    daten,
    merke: (neu) => {
      Object.assign(daten, neu);

      return Promise.resolve();
    },
  };
};

const daten = (anders: Partial<BelegDaten> = {}): BelegDaten => ({
  invoiceId: 'i1',
  nummer: 'RE-2026-0007',
  datum: '2026-10-20',
  leistungsdatum: '2026-10-15',
  faellig: '2026-11-03',
  korrektur: false,
  korrigiert: null,
  smallBusiness: false,
  befreiung: null,
  gruppen: [
    { ratePercent: 7, netCents: 10_000, taxCents: 700 },
    { ratePercent: 19, netCents: 100_000, taxCents: 19_000 },
  ],
  bruttoCents: 129_700,
  steuerCents: 19_700,
  empfaenger: {
    art: 'company',
    datensatzId: 'c1',
    firma: 'Nordwind Logistik GmbH',
    vorname: null,
    nachname: null,
    email: 'buchhaltung@nordwind.example',
    strasse: 'Kaiserkai 1',
    plz: '20457',
    ort: 'Hamburg',
    land: 'DE',
    ustId: 'DE123456789',
  },
  ...anders,
});

const PDF = {
  name: 'Rechnung-RE-2026-0007.pdf',
  inhalt: Buffer.from('%PDF-1.7 x'),
};

describe('Antworten einordnen', () => {
  it('401 heißt neu verbinden, 429 später mit Retry-After, 5xx später', () => {
    const jetzt = new Date('2026-10-27T10:00:00Z');
    const fehler = (antwort: HttpAntwort) => {
      try {
        pruefeAntwort('Lexware Office', antwort, jetzt);
      } catch (e) {
        return e as AnbieterFehler;
      }

      throw new Error('kein Fehler');
    };

    expect(fehler({ status: 401, rumpf: '', retryAfter: null }).art).toBe(
      'anmeldung',
    );

    const ohneRecht = fehler({ status: 403, rumpf: '', retryAfter: null });

    expect(ohneRecht.art).toBe('sonstig');
    expect(ohneRecht.message).toMatch(/fehlen Rechte/u);
    expect(ohneRecht.message).not.toMatch(/neu verbinden/u);

    const zuViele = fehler({ status: 429, rumpf: '', retryAfter: '30' });

    expect(zuViele.art).toBe('voruebergehend');
    expect(zuViele.wiederAb?.toISOString()).toBe('2026-10-27T10:00:30.000Z');
    expect(fehler({ status: 503, rumpf: '', retryAfter: null }).art).toBe(
      'voruebergehend',
    );

    const abgelehnt = fehler({
      status: 406,
      rumpf: JSON.stringify({
        IssueList: [{ i18nKey: 'missing_entity', source: 'company.name' }],
      }),
      retryAfter: null,
    });

    expect(abgelehnt.art).toBe('sonstig');
    expect(abgelehnt.message).toContain('company.name: missing_entity');
    expect(() =>
      pruefeAntwort('x', { status: 201, rumpf: '', retryAfter: null }),
    ).not.toThrow();
  });

  it('liest Retry-After als Sekunden oder Datum und deckelt auf einen Tag', () => {
    const jetzt = new Date('2026-10-27T10:00:00Z');

    expect(
      retryAfterAls('Wed, 28 Oct 2026 07:28:00 GMT', jetzt)?.toISOString(),
    ).toBe('2026-10-28T07:28:00.000Z');
    expect(retryAfterAls('999999', jetzt)?.getTime()).toBe(
      jetzt.getTime() + 86_400_000,
    );
    expect(retryAfterAls(null, jetzt)).toBeNull();
    expect(kurzerGrund('kein json')).toBeNull();
  });

  it('lässt nur die zwei Anbieter-Rechner zu', async () => {
    const http = sichererBuchhaltungsTransport();

    for (const url of [
      'https://example.com/v1/profile',
      'http://api.lexware.io/v1/profile',
      'https://api.lexware.io:8443/v1/profile',
      'https://api.lexware.io.boese.example/v1',
    ]) {
      await expect(http({ methode: 'GET', url, headers: {} })).rejects.toThrow(
        /keinem Buchhaltungsprogramm/u,
      );
    }
  });

  it('hält je Verbindung einen Abstand zwischen zwei Anfragen', async () => {
    let uhr = 1000;
    const geschlafen: number[] = [];
    const takt = new Taktgeber(
      600,
      (ms) => {
        geschlafen.push(ms);

        return Promise.resolve();
      },
      () => uhr,
    );

    await takt.warte('a');
    await takt.warte('a');
    await takt.warte('b');
    uhr += 2000;
    await takt.warte('a');

    expect(geschlafen).toEqual([600]);
  });

  it('baut multipart mit Datei und Feldern, ohne Anführungszeichen im Namen', () => {
    const { rumpf, typ } = multipart(
      {
        feld: 'file',
        name: 'a"b\r\n.pdf',
        typ: 'application/pdf',
        inhalt: Buffer.from('PDF'),
      },
      { type: 'voucher' },
    );
    const text = rumpf.toString('utf8');
    const grenze = typ.split('boundary=')[1];

    expect(text).toContain('name="type"\r\n\r\nvoucher');
    expect(text).toContain('filename="a_b__.pdf"');
    expect(text.endsWith(`--${grenze}--\r\n`)).toBe(true);
  });
});

describe('Lexware Office', () => {
  it('ordnet Steuersätze und Befreiungen den Kategorien der Doku zu', () => {
    expect(lexwareKategorie(19, false, null)).toBe(LEXWARE_KATEGORIE.einnahmen);
    expect(lexwareKategorie(0, true, null)).toBe(
      LEXWARE_KATEGORIE.kleinunternehmer,
    );
    expect(
      lexwareKategorie(0, false, Steuerbefreiung.INNERGEMEINSCHAFTLICH),
    ).toBe(LEXWARE_KATEGORIE.innergemeinschaftlich);
    expect(lexwareKategorie(0, false, Steuerbefreiung.REVERSE_CHARGE)).toBe(
      LEXWARE_KATEGORIE.paragraf13b,
    );
    expect(lexwareKategorie(0, false, Steuerbefreiung.AUSFUHR)).toBe(
      LEXWARE_KATEGORIE.ausfuhr,
    );
    expect(
      lexwareKategorie(0, false, Steuerbefreiung.REVERSE_CHARGE_EU),
    ).toBeNull();
  });

  it('baut den Beleg brutto je Steuersatz, mit Summen auf den Cent', () => {
    const { rumpf, zuPruefen } = lexwareBeleg(daten(), 'kunde-1');

    expect(zuPruefen).toBe(false);
    expect(rumpf).toMatchObject({
      type: 'salesinvoice',
      voucherNumber: 'RE-2026-0007',
      voucherDate: '2026-10-20',
      shippingDate: '2026-10-15',
      dueDate: '2026-11-03',
      totalGrossAmount: 1297,
      totalTaxAmount: 197,
      taxType: 'gross',
      useCollectiveContact: false,
      contactId: 'kunde-1',
      voucherItems: [
        {
          amount: 107,
          taxAmount: 7,
          taxRatePercent: 7,
          categoryId: LEXWARE_KATEGORIE.einnahmen,
        },
        {
          amount: 1190,
          taxAmount: 190,
          taxRatePercent: 19,
          categoryId: LEXWARE_KATEGORIE.einnahmen,
        },
      ],
    });
    expect(rumpf).not.toHaveProperty('voucherStatus');
  });

  it('macht aus einem Storno eine salescreditnote mit positiven Beträgen', () => {
    const { rumpf } = lexwareBeleg(
      daten({
        korrektur: true,
        korrigiert: 'RE-2026-0006',
        gruppen: [{ ratePercent: 19, netCents: -100_000, taxCents: -19_000 }],
        bruttoCents: -119_000,
        steuerCents: -19_000,
      }),
      'kunde-1',
    );

    expect(rumpf).toMatchObject({
      type: 'salescreditnote',
      totalGrossAmount: 1190,
      totalTaxAmount: 190,
      voucherItems: [{ amount: 1190, taxAmount: 190 }],
    });
    expect(String(rumpf.remark)).toContain('zur Rechnung RE-2026-0006');
  });

  it('legt ohne passende Kategorie „zu prüfen“ an, und ohne Kunden den Sammelkunden', () => {
    const { rumpf, zuPruefen } = lexwareBeleg(
      daten({
        befreiung: Steuerbefreiung.REVERSE_CHARGE_EU,
        gruppen: [{ ratePercent: 0, netCents: 50_000, taxCents: 0 }],
        bruttoCents: 50_000,
        steuerCents: 0,
        empfaenger: { art: 'sammel', name: 'Herr Max Muster' },
      }),
      null,
    );

    expect(zuPruefen).toBe(true);
    expect(rumpf).toMatchObject({
      voucherStatus: 'unchecked',
      useCollectiveContact: true,
      contactName: 'Herr Max Muster',
    });
    expect(rumpf).not.toHaveProperty('voucherItems');
    expect(rumpf).not.toHaveProperty('contactId');
  });

  it('prüft den Schlüssel am Profil und schickt ihn nur als Bearer im Kopf', async () => {
    const { http, anfragen } = attrappe({
      'GET /v1/profile': ok({
        companyName: 'Testfirma GmbH',
        organizationId: 'org-1',
      }),
      'GET /v1/contacts': ok({ content: [] }),
      'GET /v1/voucherlist': ok({ content: [] }),
    });
    const lexware = new Lexware(http, ohneWarten());

    await expect(lexware.pruefen(zugang())).resolves.toEqual({
      kontoName: 'Testfirma GmbH',
      kontoKennung: 'org-1',
    });
    expect(anfragen[0].url).toBe('https://api.lexware.io/v1/profile');
    expect(anfragen[0].headers.Authorization).toBe(`Bearer ${SCHLUESSEL}`);
  });

  it('lehnt beim Verbinden einen Schlüssel ohne Rechte für Belege ab', async () => {
    const { http, anfragen } = attrappe({
      'GET /v1/profile': ok({ companyName: 'Testfirma GmbH' }),
      'GET /v1/contacts': ok({ content: [] }),
      'GET /v1/voucherlist': ok({ message: 'Forbidden' }, 403),
    });
    const lexware = new Lexware(http, ohneWarten());

    await expect(lexware.pruefen(zugang())).rejects.toMatchObject({
      art: 'sonstig',
      status: 403,
    });
    expect(anfragen.map((a) => new URL(a.url).pathname)).toEqual([
      '/v1/profile',
      '/v1/contacts',
      '/v1/voucherlist',
    ]);
  });

  it('blättert bei einem häufigen Namen weiter, bis der genaue Treffer kommt', async () => {
    const { http, anfragen } = attrappe({
      'GET /v1/contacts': (anfrage) =>
        new URL(anfrage.url).searchParams.get('page') === '0'
          ? ok({
              content: [{ id: 'aehnlich', company: { name: 'Nordwind AG' } }],
              last: false,
            })
          : ok({
              content: [
                { id: 'genau', company: { name: 'Nordwind Logistik GmbH' } },
              ],
              last: true,
            }),
    });
    const lexware = new Lexware(http, ohneWarten());
    const empfaenger = daten().empfaenger as Exclude<
      BelegDaten['empfaenger'],
      { art: 'sammel' }
    >;

    await expect(lexware.kontakt(zugang(), empfaenger)).resolves.toBe('genau');
    expect(anfragen).toHaveLength(2);
    expect(anfragen[0].url).toContain('size=250');
    expect(anfragen[1].url).toContain('page=1');
  });

  it('findet einen Kunden mit genau diesem Namen, statt ihn doppelt anzulegen', async () => {
    const { http, anfragen } = attrappe({
      'GET /v1/contacts': ok({
        content: [
          {
            id: 'falsch',
            company: { name: 'Nordwind Logistik GmbH & Co. KG' },
          },
          { id: 'richtig', company: { name: 'nordwind logistik gmbh' } },
        ],
      }),
    });
    const lexware = new Lexware(http, ohneWarten());
    const empfaenger = daten().empfaenger as Exclude<
      BelegDaten['empfaenger'],
      { art: 'sammel' }
    >;

    await expect(lexware.kontakt(zugang(), empfaenger)).resolves.toBe(
      'richtig',
    );
    expect(anfragen[0].url).toContain('name=Nordwind%20Logistik%20GmbH');
    expect(anfragen[0].url).toContain('customer=true');
    expect(anfragen).toHaveLength(1);
  });

  it('legt einen Kunden mit Rolle customer, Anschrift und Mail an', async () => {
    const { http, anfragen } = attrappe({
      'GET /v1/contacts': ok({ content: [] }),
      'POST /v1/contacts': ok({ id: 'neu-1', version: 1 }),
    });
    const lexware = new Lexware(http, ohneWarten());
    const empfaenger = daten().empfaenger as Exclude<
      BelegDaten['empfaenger'],
      { art: 'sammel' }
    >;

    await expect(lexware.kontakt(zugang(), empfaenger)).resolves.toBe('neu-1');
    expect(JSON.parse(String(anfragen[1].rumpf))).toEqual({
      version: 0,
      roles: { customer: {} },
      company: {
        name: 'Nordwind Logistik GmbH',
        vatRegistrationId: 'DE123456789',
      },
      addresses: {
        billing: [
          {
            street: 'Kaiserkai 1',
            zip: '20457',
            city: 'Hamburg',
            countryCode: 'DE',
          },
        ],
      },
      emailAddresses: { business: ['buchhaltung@nordwind.example'] },
    });
  });

  it('sucht vor dem Anlegen den Beleg über die Nummer in der voucherlist', async () => {
    const { http, anfragen } = attrappe({
      'GET /v1/voucherlist': ok({
        content: [
          {
            id: 'b-1',
            voucherNumber: 'RE-2026-0007',
            voucherType: 'salesinvoice',
          },
        ],
      }),
    });
    const lexware = new Lexware(http, ohneWarten());

    await expect(lexware.belegFinden(zugang(), daten())).resolves.toBe('b-1');
    expect(anfragen[0].url).toContain(
      'voucherType=salesinvoice,salescreditnote&voucherStatus=any&voucherNumber=RE-2026-0007',
    );
  });

  it('lädt das PDF als multipart an den Beleg und lehnt über 5 MB ab', async () => {
    const { http, anfragen } = attrappe({
      'POST /v1/vouchers/b-1/files': ok({ id: 'f-1' }, 202),
    });
    const lexware = new Lexware(http, ohneWarten());

    await lexware.dateiAnhaengen(zugang(), 'b-1', PDF);
    expect(anfragen[0].headers['Content-Type']).toMatch(
      /^multipart\/form-data; boundary=/u,
    );
    expect((anfragen[0].rumpf as Buffer).toString()).toContain('name="file"');

    await expect(
      lexware.dateiAnhaengen(zugang(), 'b-1', {
        name: 'gross.pdf',
        inhalt: Buffer.alloc(5 * 1024 * 1024 + 1),
      }),
    ).rejects.toMatchObject({ art: 'sonstig' });
  });

  it('meldet bezahlt nur bei paid/paidoff, nicht bei storniert', async () => {
    const antwort: { stand: Record<string, unknown> } = { stand: {} };
    const { http } = attrappe({ 'GET /v1/payments/': () => ok(antwort.stand) });
    const lexware = new Lexware(http, ohneWarten());

    antwort.stand = {
      paymentStatus: 'balanced',
      voucherStatus: 'paid',
      paidDate: '2026-11-01T13:42:02.123+01:00',
    };
    await expect(lexware.bezahltAm(zugang(), 'b-1')).resolves.toBe(
      '2026-11-01',
    );

    antwort.stand = { paymentStatus: 'balanced', voucherStatus: 'voided' };
    await expect(lexware.bezahltAm(zugang(), 'b-1')).resolves.toBeNull();

    antwort.stand = { paymentStatus: 'openRevenue', voucherStatus: 'open' };
    await expect(lexware.bezahltAm(zugang(), 'b-1')).resolves.toBeNull();
  });

  it('macht aus einem Netzfehler einen vorübergehenden Fehler', async () => {
    const lexware = new Lexware(
      () => Promise.reject(new Error('ECONNRESET')),
      ohneWarten(),
    );

    await expect(lexware.pruefen(zugang())).rejects.toMatchObject({
      art: 'voruebergehend',
    });
  });
});

describe('sevDesk', () => {
  const FUEHRUNG = [
    {
      accountDatevId: 11,
      accountNumber: '8400',
      accountName: 'Erlöse 19 % USt',
      allowedTaxRules: [{ id: 1 }],
    },
    {
      accountDatevId: 12,
      accountNumber: '8300',
      accountName: 'Erlöse 7 % USt',
      allowedTaxRules: [{ id: 1 }],
    },
    {
      accountDatevId: 13,
      accountNumber: '4125',
      accountName: 'Steuerfreie innergemeinschaftliche Lieferungen',
      allowedTaxRules: [{ id: 3 }],
    },
    {
      accountDatevId: 14,
      accountNumber: '8195',
      accountName: 'Erlöse als Kleinunternehmer',
      allowedTaxRules: [{ id: 11 }],
    },
  ];

  it('wählt Steuerregel und Erlöskonto wie der DATEV-Export', () => {
    expect(sevdeskSteuerregel(true, null)).toBe(11);
    expect(sevdeskSteuerregel(false, Steuerbefreiung.REVERSE_CHARGE)).toBe(5);
    expect(
      sevdeskSteuerregel(false, Steuerbefreiung.REVERSE_CHARGE_EU),
    ).toBeNull();
    expect(sevdeskKonto(FUEHRUNG, 1, 19, false, null)).toBe(11);
    expect(sevdeskKonto(FUEHRUNG, 1, 7, false, null)).toBe(12);
    expect(
      sevdeskKonto(
        FUEHRUNG,
        3,
        0,
        false,
        Steuerbefreiung.INNERGEMEINSCHAFTLICH,
      ),
    ).toBe(13);
    expect(sevdeskKonto(FUEHRUNG, 11, 0, true, null)).toBe(14);
    expect(
      sevdeskKonto(FUEHRUNG, 5, 0, false, Steuerbefreiung.REVERSE_CHARGE),
    ).toBeNull();
  });

  it('baut den Beleg als Erlös (D) mit Datei, ein Storno mit negativen Beträgen', () => {
    const konten = new Map([
      [7, 12],
      [19, 11],
    ]);
    const rumpf = sevdeskBeleg(daten(), '77', konten, 'abc.pdf') as {
      voucher: Record<string, unknown>;
      voucherPosSave: Record<string, unknown>[];
      filename: string;
    };

    expect(rumpf.voucher).toMatchObject({
      objectName: 'Voucher',
      mapAll: true,
      voucherDate: '20.10.2026',
      deliveryDate: '15.10.2026',
      paymentDeadline: '03.11.2026',
      description: 'RE-2026-0007',
      status: 100,
      creditDebit: 'D',
      voucherType: 'VOU',
      taxRule: { id: '1', objectName: 'TaxRule' },
      supplier: { id: 77, objectName: 'Contact' },
    });
    expect(rumpf.filename).toBe('abc.pdf');
    expect(rumpf.voucherPosSave[1]).toMatchObject({
      accountDatev: { id: 11, objectName: 'AccountDatev' },
      taxRate: 19,
      net: false,
      sumGross: 1190,
    });

    const storno = sevdeskBeleg(
      daten({
        korrektur: true,
        gruppen: [{ ratePercent: 19, netCents: -100_000, taxCents: -19_000 }],
      }),
      '77',
      konten,
      'abc.pdf',
    ) as { voucherPosSave: Record<string, unknown>[] };

    expect(storno.voucherPosSave[0]).toMatchObject({
      sumGross: -1190,
      sumNet: -1000,
    });
  });

  it('verlangt ein Token aus 32 Hex-Zeichen und sevdesk-Update 2.0', async () => {
    const stand = { version: '2.0' };
    const { http, anfragen } = attrappe({
      'GET /api/v1/Tools/bookkeepingSystemVersion': () =>
        ok({ objects: stand }),
    });
    const sevdesk = new Sevdesk(http, ohneWarten());

    await expect(sevdesk.pruefen(zugang('kurz'))).rejects.toMatchObject({
      art: 'sonstig',
    });
    expect(anfragen).toHaveLength(0);

    await expect(sevdesk.pruefen(zugang(SEV_SCHLUESSEL))).resolves.toEqual({
      kontoName: null,
      kontoKennung: null,
    });
    expect(anfragen[0].headers.Authorization).toBe(SEV_SCHLUESSEL);
    expect(anfragen[0].headers['User-Agent']).toContain('Stegwerk');

    stand.version = '1.0';
    await expect(sevdesk.pruefen(zugang(SEV_SCHLUESSEL))).rejects.toThrow(
      /Version 1\.0/u,
    );
  });

  it('lädt erst das PDF hoch und legt dann den Beleg mit dem Dateinamen an', async () => {
    const { http, anfragen } = attrappe({
      'GET /api/v1/ReceiptGuidance/forRevenue': ok({ objects: FUEHRUNG }),
      'POST /api/v1/Voucher/Factory/uploadTempFile': ok(
        { objects: { filename: 'f019bec36c65f5a0e7d2c63cc33f0681.pdf' } },
        201,
      ),
      'POST /api/v1/Voucher/Factory/saveVoucher': ok(
        { objects: { voucher: { id: '4711' } } },
        201,
      ),
    });
    const sevdesk = new Sevdesk(http, ohneWarten());
    const z = zugang(SEV_SCHLUESSEL);

    await expect(sevdesk.belegAnlegen(z, daten(), '77', PDF)).resolves.toEqual({
      id: '4711',
      zuPruefen: false,
      dateiAngehaengt: true,
    });
    expect(anfragen.map((a) => new URL(a.url).pathname)).toEqual([
      '/api/v1/ReceiptGuidance/forRevenue',
      '/api/v1/Voucher/Factory/uploadTempFile',
      '/api/v1/Voucher/Factory/saveVoucher',
    ]);
    expect(JSON.parse(String(anfragen[2].rumpf)).filename).toBe(
      'f019bec36c65f5a0e7d2c63cc33f0681.pdf',
    );

    await sevdesk.belegAnlegen(z, daten(), '77', PDF);
    expect(
      anfragen.filter((a) => a.url.includes('ReceiptGuidance')),
    ).toHaveLength(1);
  });

  it('lehnt Sätze ab, die die Steuerregel nicht zulässt, ohne etwas anzulegen', async () => {
    const { http, anfragen } = attrappe({});
    const sevdesk = new Sevdesk(http, ohneWarten());

    await expect(
      sevdesk.belegAnlegen(
        zugang(SEV_SCHLUESSEL),
        daten({ befreiung: Steuerbefreiung.REVERSE_CHARGE }),
        null,
        PDF,
      ),
    ).rejects.toMatchObject({ art: 'sonstig' });
    expect(anfragen).toHaveLength(0);
  });

  it('überträgt Reverse Charge ins EU-Ausland nicht, sondern bittet um Erfassung von Hand', async () => {
    const { http, anfragen } = attrappe({});
    const sevdesk = new Sevdesk(http, ohneWarten());

    await expect(
      sevdesk.belegAnlegen(
        zugang(SEV_SCHLUESSEL),
        daten({
          befreiung: Steuerbefreiung.REVERSE_CHARGE_EU,
          gruppen: [{ ratePercent: 0, netCents: 100_000, taxCents: 0 }],
          bruttoCents: 100_000,
          steuerCents: 0,
        }),
        null,
        PDF,
      ),
    ).rejects.toMatchObject({
      art: 'sonstig',
      message: expect.stringMatching(/§ 18b UStG.*von Hand/u) as unknown,
    });
    expect(anfragen).toHaveLength(0);
  });

  it('prüft bei einem wiedergefundenen Beleg, ob das PDF daran hängt', async () => {
    const beleg: { document: unknown } = { document: null };
    const { http } = attrappe({
      'GET /api/v1/Voucher/4711': () => ok({ objects: [beleg] }),
    });
    const sevdesk = new Sevdesk(http, ohneWarten());

    await expect(
      sevdesk.dateiAnhaengen(zugang(SEV_SCHLUESSEL), '4711'),
    ).rejects.toMatchObject({
      art: 'sonstig',
      message: expect.stringMatching(/ohne PDF/u) as unknown,
    });

    beleg.document = { id: '9', objectName: 'Document' };
    await expect(
      sevdesk.dateiAnhaengen(zugang(SEV_SCHLUESSEL), '4711'),
    ).resolves.toBeUndefined();
  });

  it('liest payDate als Zeitstempel oder TT.MM.JJJJ', () => {
    expect(sevdeskTag('01.01.2020')).toBe('2020-01-01');
    expect(sevdeskTag('2026-11-02T00:00:00+01:00')).toBe('2026-11-02');
    expect(sevdeskTag(1_793_577_600)).toBe('2026-11-02');
    expect(sevdeskTag('1793577600')).toBe('2026-11-02');
    expect(sevdeskTag('irgendwann')).toBeNull();
    expect(sevdeskTag(null)).toBeNull();
  });

  it('meldet bezahlt erst bei Status 1000', async () => {
    const antwort = { status: '750', payDate: null as string | null };
    const { http } = attrappe({
      'GET /api/v1/Voucher/4711': () => ok({ objects: [antwort] }),
    });
    const sevdesk = new Sevdesk(http, ohneWarten());

    await expect(
      sevdesk.bezahltAm(zugang(SEV_SCHLUESSEL), '4711'),
    ).resolves.toBeNull();

    antwort.status = '1000';
    antwort.payDate = '2026-11-02T00:00:00+01:00';
    await expect(
      sevdesk.bezahltAm(zugang(SEV_SCHLUESSEL), '4711'),
    ).resolves.toBe('2026-11-02');

    antwort.payDate = '30.10.2026';
    await expect(
      sevdesk.bezahltAm(zugang(SEV_SCHLUESSEL), '4711'),
    ).resolves.toBe('2026-10-30');
  });
});
