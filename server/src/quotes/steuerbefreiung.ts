import { BadRequestException } from '@nestjs/common';
import { registerEnumType } from '@nestjs/graphql';

export enum Steuerbefreiung {
  REVERSE_CHARGE = 'REVERSE_CHARGE',
  REVERSE_CHARGE_EU = 'REVERSE_CHARGE_EU',
  INNERGEMEINSCHAFTLICH = 'INNERGEMEINSCHAFTLICH',
  AUSFUHR = 'AUSFUHR',
  STEUERFREI = 'STEUERFREI',
  NULLSATZ = 'NULLSATZ',
}

registerEnumType(Steuerbefreiung, {
  name: 'TaxExemption',
  description: 'Grund, warum Positionen mit 0 % keine Umsatzsteuer tragen.',
});

export type Befreiungsangaben = {
  bezeichnung: string;
  kurz: string;
  hinweis: (freitext: string | null) => string;
  kategorie: 'AE' | 'K' | 'G' | 'E' | 'Z';
  vatex: string | null;
  empfaengerUstId: 'pflicht' | 'eu' | 'nein';
  eigeneUstId: boolean;
  skr03: number;
  skr04: number;
};

export const BEFREIUNGEN: Record<Steuerbefreiung, Befreiungsangaben> = {
  [Steuerbefreiung.REVERSE_CHARGE]: {
    bezeichnung: 'Reverse Charge im Inland (§ 13b UStG, z. B. Bauleistung)',
    kurz: 'Reverse Charge',
    hinweis: () =>
      'Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG).',
    kategorie: 'AE',
    vatex: 'VATEX-EU-AE',
    empfaengerUstId: 'pflicht',
    eigeneUstId: false,
    skr03: 8337,
    skr04: 4337,
  },
  [Steuerbefreiung.REVERSE_CHARGE_EU]: {
    bezeichnung: 'Reverse Charge, Leistung an Unternehmer im EU-Ausland',
    kurz: 'Reverse Charge',
    hinweis: () =>
      'Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge). Im Inland nicht steuerbare sonstige Leistung (§ 3a Abs. 2 UStG).',
    kategorie: 'AE',
    vatex: 'VATEX-EU-AE',
    empfaengerUstId: 'eu',
    eigeneUstId: true,
    skr03: 8338,
    skr04: 4338,
  },
  [Steuerbefreiung.INNERGEMEINSCHAFTLICH]: {
    bezeichnung: 'Innergemeinschaftliche Lieferung (§ 4 Nr. 1b, § 6a UStG)',
    kurz: 'ig. Lieferung',
    hinweis: () =>
      'Steuerfreie innergemeinschaftliche Lieferung (§ 4 Nr. 1 Buchst. b i. V. m. § 6a UStG).',
    kategorie: 'K',
    vatex: 'VATEX-EU-IC',
    empfaengerUstId: 'eu',
    eigeneUstId: true,
    skr03: 8125,
    skr04: 4125,
  },
  [Steuerbefreiung.AUSFUHR]: {
    bezeichnung: 'Ausfuhr ins Drittland (§ 4 Nr. 1a, § 6 UStG)',
    kurz: 'Ausfuhr',
    hinweis: () =>
      'Steuerfreie Ausfuhrlieferung (§ 4 Nr. 1 Buchst. a i. V. m. § 6 UStG).',
    kategorie: 'G',
    vatex: 'VATEX-EU-G',
    empfaengerUstId: 'nein',
    eigeneUstId: false,
    skr03: 8120,
    skr04: 4120,
  },
  [Steuerbefreiung.STEUERFREI]: {
    bezeichnung: 'Sonstiger steuerfreier Umsatz (Rechtsgrundlage angeben)',
    kurz: 'steuerfrei',
    hinweis: (freitext) => `Steuerfreier Umsatz: ${(freitext ?? '').trim()}.`,
    kategorie: 'E',
    vatex: null,
    empfaengerUstId: 'nein',
    eigeneUstId: false,
    skr03: 8100,
    skr04: 4100,
  },
  [Steuerbefreiung.NULLSATZ]: {
    bezeichnung: 'Nullsteuersatz (§ 12 Abs. 3 UStG, z. B. Photovoltaik)',
    kurz: 'Nullsteuersatz',
    hinweis: () => 'Nullsteuersatz nach § 12 Abs. 3 UStG.',
    kategorie: 'Z',
    vatex: null,
    empfaengerUstId: 'nein',
    eigeneUstId: false,
    skr03: 8200,
    skr04: 4200,
  },
};

export type Befreiungslage = {
  smallBusiness: boolean;
  taxExemption: Steuerbefreiung | null;
  taxExemptionNote: string | null;
  recipientVatId: string | null;
  raten: number[];
  eigeneUstId: string | null;
};

export type Befreiungsluecke = { field: string; label: string };

const leer = (wert: string | null): boolean => (wert ?? '').trim() === '';

export const ustIdNormal = (wert: string | null): string | null => {
  const normal = (wert ?? '').replace(/[\s.-]/gu, '').toUpperCase();

  return normal === '' ? null : normal;
};

const USTID = /^[A-Z]{2}[0-9A-Z+*]{2,12}$/u;

export const befreiungsLuecken = (lage: Befreiungslage): Befreiungsluecke[] => {
  if (lage.smallBusiness) {
    return [];
  }

  const nullProzent = lage.raten.some((rate) => rate === 0);
  const befreiung = lage.taxExemption;

  if (befreiung === null) {
    return nullProzent
      ? [
          {
            field: 'taxExemption',
            label:
              'Der Grund der Steuerbefreiung für Positionen mit 0 % (§ 14 Abs. 4 Nr. 8 UStG)',
          },
        ]
      : [];
  }

  const luecken: Befreiungsluecke[] = [];
  const angaben = BEFREIUNGEN[befreiung];

  if (!nullProzent) {
    luecken.push({
      field: 'taxExemption',
      label: `Eine Position mit 0 % für „${angaben.kurz}“ (oder die Steuerbefreiung entfernen)`,
    });
  }

  if (befreiung === Steuerbefreiung.STEUERFREI && leer(lage.taxExemptionNote)) {
    luecken.push({
      field: 'taxExemptionNote',
      label: 'Die Rechtsgrundlage der Steuerbefreiung (z. B. § 4 Nr. 14 UStG)',
    });
  }

  const empfaenger = ustIdNormal(lage.recipientVatId);

  if (angaben.empfaengerUstId !== 'nein') {
    if (empfaenger === null) {
      luecken.push({
        field: 'recipientVatId',
        label: 'Die USt-IdNr. des Empfängers',
      });
    } else if (!USTID.test(empfaenger)) {
      luecken.push({
        field: 'recipientVatId',
        label: 'Eine gültige USt-IdNr. des Empfängers (z. B. ATU12345678)',
      });
    } else if (
      angaben.empfaengerUstId === 'eu' &&
      empfaenger.startsWith('DE')
    ) {
      luecken.push({
        field: 'recipientVatId',
        label:
          'Die USt-IdNr. des Empfängers aus seinem EU-Staat, nicht aus Deutschland',
      });
    }
  }

  if (angaben.eigeneUstId && leer(lage.eigeneUstId)) {
    luecken.push({
      field: 'vatId',
      label:
        'Ihre USt-IdNr. im Briefkopf (Pflicht bei Leistungen ins EU-Ausland)',
    });
  }

  return luecken;
};

export type Befreiungsfelder = {
  taxExemption: Steuerbefreiung | null;
  taxExemptionNote: string | null;
  recipientVatId: string | null;
};

export const befreiungAus = (
  eingabe: {
    taxExemption?: Steuerbefreiung | null;
    taxExemptionNote?: string | null;
    recipientVatId?: string | null;
  },
  vorher: Befreiungsfelder = {
    taxExemption: null,
    taxExemptionNote: null,
    recipientVatId: null,
  },
): Befreiungsfelder => {
  const recipientVatId =
    eingabe.recipientVatId === undefined
      ? vorher.recipientVatId
      : ustIdNormal(eingabe.recipientVatId);

  if (recipientVatId !== null && recipientVatId.length > 20) {
    throw new BadRequestException('Diese USt-IdNr. ist zu lang.');
  }

  const notiz =
    eingabe.taxExemptionNote === undefined
      ? vorher.taxExemptionNote
      : (eingabe.taxExemptionNote ?? '').trim();

  return {
    taxExemption:
      eingabe.taxExemption === undefined
        ? vorher.taxExemption
        : eingabe.taxExemption,
    taxExemptionNote: notiz === null || notiz === '' ? null : notiz,
    recipientVatId,
  };
};

export const befreiungVon = (beleg: Befreiungsfelder): Befreiungsfelder => ({
  taxExemption: beleg.taxExemption,
  taxExemptionNote: beleg.taxExemptionNote,
  recipientVatId: beleg.recipientVatId,
});

export const befreiungsHinweise = (lage: {
  smallBusiness: boolean;
  taxExemption: Steuerbefreiung | null;
  taxExemptionNote: string | null;
  recipientVatId: string | null;
}): string[] => {
  if (lage.smallBusiness || lage.taxExemption == null) {
    return [];
  }

  const hinweise = [
    BEFREIUNGEN[lage.taxExemption].hinweis(lage.taxExemptionNote),
  ];
  const empfaenger = ustIdNormal(lage.recipientVatId);

  if (empfaenger !== null) {
    hinweise.push(`USt-IdNr. des Leistungsempfängers: ${empfaenger}`);
  }

  return hinweise;
};

export const pdfBefreiung = (
  beleg: Befreiungsfelder & { smallBusiness: boolean },
): { kurz: string; hinweise: string[] } | null =>
  beleg.smallBusiness || beleg.taxExemption == null
    ? null
    : {
        kurz: BEFREIUNGEN[beleg.taxExemption].kurz,
        hinweise: befreiungsHinweise(beleg),
      };
