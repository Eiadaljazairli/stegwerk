import {
  befreiungAus,
  befreiungsHinweise,
  befreiungsLuecken,
  type Befreiungslage,
  Steuerbefreiung,
} from './steuerbefreiung';

const lage = (over: Partial<Befreiungslage> = {}): Befreiungslage => ({
  smallBusiness: false,
  taxExemption: null,
  taxExemptionNote: null,
  recipientVatId: null,
  raten: [19],
  eigeneUstId: 'DE123456789',
  ...over,
});

const felder = (luecken: { field: string }[]) =>
  luecken.map((luecke) => luecke.field);

describe('befreiungsLuecken', () => {
  it('verlangt nichts, solange jede Position Steuer trägt', () => {
    expect(befreiungsLuecken(lage())).toEqual([]);
  });

  it('verlangt einen Grund für eine Position mit 0 %', () => {
    const luecken = befreiungsLuecken(lage({ raten: [19, 0] }));

    expect(felder(luecken)).toEqual(['taxExemption']);
    expect(luecken[0].label).toMatch(/§ 14 Abs\. 4 Nr\. 8 UStG/u);
  });

  it('lässt den Kleinunternehmer in Ruhe, dort gilt § 19', () => {
    expect(
      befreiungsLuecken(lage({ smallBusiness: true, raten: [0] })),
    ).toEqual([]);
  });

  it('verlangt die USt-IdNr. des Empfängers bei Reverse Charge', () => {
    expect(
      felder(
        befreiungsLuecken(
          lage({ raten: [0], taxExemption: Steuerbefreiung.REVERSE_CHARGE }),
        ),
      ),
    ).toEqual(['recipientVatId']);
  });

  it('nimmt bei Leistungen ins EU-Ausland keine deutsche USt-IdNr.', () => {
    const luecken = befreiungsLuecken(
      lage({
        raten: [0],
        taxExemption: Steuerbefreiung.INNERGEMEINSCHAFTLICH,
        recipientVatId: 'DE999999999',
      }),
    );

    expect(luecken[0].label).toMatch(/EU-Staat/u);
  });

  it('weist eine USt-IdNr. ab, die keine sein kann', () => {
    expect(
      befreiungsLuecken(
        lage({
          raten: [0],
          taxExemption: Steuerbefreiung.REVERSE_CHARGE_EU,
          recipientVatId: '12345',
        }),
      )[0].label,
    ).toMatch(/gültige/u);
  });

  it('verlangt die eigene USt-IdNr. für die innergemeinschaftliche Lieferung', () => {
    expect(
      felder(
        befreiungsLuecken(
          lage({
            raten: [0],
            taxExemption: Steuerbefreiung.INNERGEMEINSCHAFTLICH,
            recipientVatId: 'ATU12345678',
            eigeneUstId: null,
          }),
        ),
      ),
    ).toEqual(['vatId']);
  });

  it('verlangt die Rechtsgrundlage bei einem sonstigen steuerfreien Umsatz', () => {
    expect(
      felder(
        befreiungsLuecken(
          lage({
            raten: [0],
            taxExemption: Steuerbefreiung.STEUERFREI,
            taxExemptionNote: '  ',
          }),
        ),
      ),
    ).toEqual(['taxExemptionNote']);
  });

  it('braucht für die Ausfuhr keine USt-IdNr. des Kunden', () => {
    expect(
      befreiungsLuecken(
        lage({ raten: [0], taxExemption: Steuerbefreiung.AUSFUHR }),
      ),
    ).toEqual([]);
  });

  it('meldet eine Befreiung ohne Position mit 0 %', () => {
    expect(
      felder(
        befreiungsLuecken(
          lage({ raten: [19], taxExemption: Steuerbefreiung.AUSFUHR }),
        ),
      ),
    ).toEqual(['taxExemption']);
  });
});

describe('befreiungsHinweise', () => {
  it('schreibt den Pflichtsatz und die USt-IdNr. des Empfängers', () => {
    expect(
      befreiungsHinweise({
        smallBusiness: false,
        taxExemption: Steuerbefreiung.REVERSE_CHARGE_EU,
        taxExemptionNote: null,
        recipientVatId: 'atu 1234 5678',
      }),
    ).toEqual([
      expect.stringContaining('Steuerschuldnerschaft des Leistungsempfängers'),
      'USt-IdNr. des Leistungsempfängers: ATU12345678',
    ]);
  });

  it('nennt die Rechtsgrundlage eines sonstigen steuerfreien Umsatzes', () => {
    expect(
      befreiungsHinweise({
        smallBusiness: false,
        taxExemption: Steuerbefreiung.STEUERFREI,
        taxExemptionNote: '§ 4 Nr. 14 UStG',
        recipientVatId: null,
      }),
    ).toEqual(['Steuerfreier Umsatz: § 4 Nr. 14 UStG.']);
  });

  it('sagt nichts ohne Befreiung oder beim Kleinunternehmer', () => {
    const ohne = {
      smallBusiness: false,
      taxExemption: null,
      taxExemptionNote: null,
      recipientVatId: 'ATU12345678',
    };

    expect(befreiungsHinweise(ohne)).toEqual([]);
    expect(
      befreiungsHinweise({
        ...ohne,
        smallBusiness: true,
        taxExemption: Steuerbefreiung.AUSFUHR,
      }),
    ).toEqual([]);
  });
});

describe('befreiungAus', () => {
  const vorher = {
    taxExemption: Steuerbefreiung.STEUERFREI,
    taxExemptionNote: '§ 4 Nr. 14 UStG',
    recipientVatId: 'ATU12345678',
  };

  it('lässt, was nicht mitkommt, und löscht, was leer kommt', () => {
    expect(befreiungAus({ taxExemptionNote: ' ' }, vorher)).toEqual({
      ...vorher,
      taxExemptionNote: null,
    });
    expect(befreiungAus({ taxExemption: null }, vorher).taxExemption).toBe(
      null,
    );
  });

  it('schreibt die USt-IdNr. ohne Leerzeichen und groß', () => {
    expect(
      befreiungAus({ recipientVatId: 'de 123.456-789' }).recipientVatId,
    ).toBe('DE123456789');
  });

  it('weist eine zu lange USt-IdNr. ab, bevor die Datenbank es tut', () => {
    expect(() =>
      befreiungAus({ recipientVatId: 'DE1234567890123456789' }),
    ).toThrow(/zu lang/u);
  });
});
