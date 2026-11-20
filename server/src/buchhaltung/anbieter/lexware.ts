import { Steuerbefreiung } from '../../quotes/steuerbefreiung';
import {
  bemerkung,
  type BelegDaten,
  type BelegEmpfaenger,
  euro,
} from '../beleg';
import {
  type AngelegterBeleg,
  type BelegDatei,
  type Buchhaltungsprogramm,
  type KontoProfil,
  type Zugang,
} from './anbieter';
import {
  AnbieterFehler,
  type HttpAntwort,
  type HttpTransport,
  multipart,
  netzFehler,
  pruefeAntwort,
  type Taktgeber,
} from './http';

const BASIS = 'https://api.lexware.io';

const NAME = 'Lexware Office';

export const LEXWARE_MAX_DATEI = 5 * 1024 * 1024;

export const LEXWARE_KATEGORIE = {
  einnahmen: '8f8664a1-fd86-11e1-a21f-0800200c9a66',
  kleinunternehmer: 'f5c7fee8-f184-4e7a-ab04-8f7e7ad6c207',
  innergemeinschaftlich: '9075a4e3-66de-4795-a016-3889feca0d20',
  paragraf13b: '380a20cb-d04c-426e-b49c-84c22adfa362',
  ausfuhr: '93d24c20-ea84-424e-a731-5e1b78d1e6a9',
} as const;

export const lexwareKategorie = (
  ratePercent: number,
  smallBusiness: boolean,
  befreiung: Steuerbefreiung | null,
): string | null => {
  if (smallBusiness) {
    return LEXWARE_KATEGORIE.kleinunternehmer;
  }

  if (ratePercent !== 0) {
    return LEXWARE_KATEGORIE.einnahmen;
  }

  switch (befreiung) {
    case Steuerbefreiung.INNERGEMEINSCHAFTLICH:
      return LEXWARE_KATEGORIE.innergemeinschaftlich;
    case Steuerbefreiung.REVERSE_CHARGE:
      return LEXWARE_KATEGORIE.paragraf13b;
    case Steuerbefreiung.AUSFUHR:
      return LEXWARE_KATEGORIE.ausfuhr;
    default:
      return null;
  }
};

export const lexwareBeleg = (
  daten: BelegDaten,
  kontaktId: string | null,
): { rumpf: Record<string, unknown>; zuPruefen: boolean } => {
  const vorzeichen = daten.korrektur ? -1 : 1;
  const positionen = daten.gruppen.map((gruppe) => ({
    amount: euro(vorzeichen * (gruppe.netCents + gruppe.taxCents)),
    taxAmount: euro(vorzeichen * gruppe.taxCents),
    taxRatePercent: gruppe.ratePercent,
    categoryId: lexwareKategorie(
      gruppe.ratePercent,
      daten.smallBusiness,
      daten.befreiung,
    ),
  }));
  const zuPruefen = positionen.some((position) => position.categoryId === null);
  const sammel = daten.empfaenger.art === 'sammel' || kontaktId === null;

  const rumpf: Record<string, unknown> = {
    type: daten.korrektur ? 'salescreditnote' : 'salesinvoice',
    voucherNumber: daten.nummer,
    voucherDate: daten.datum,
    totalGrossAmount: euro(vorzeichen * daten.bruttoCents),
    totalTaxAmount: euro(vorzeichen * daten.steuerCents),
    taxType: 'gross',
    useCollectiveContact: sammel,
    remark: bemerkung(daten),
  };

  if (zuPruefen) {
    rumpf.voucherStatus = 'unchecked';
  } else {
    rumpf.voucherItems = positionen;
  }

  if (daten.leistungsdatum !== null) {
    rumpf.shippingDate = daten.leistungsdatum;
  }

  if (daten.faellig !== null) {
    rumpf.dueDate = daten.faellig;
  }

  if (sammel) {
    rumpf.contactName =
      daten.empfaenger.art === 'sammel'
        ? daten.empfaenger.name
        : (daten.empfaenger.firma ??
          [daten.empfaenger.vorname, daten.empfaenger.nachname]
            .filter(Boolean)
            .join(' '));
  } else {
    rumpf.contactId = kontaktId;
  }

  return { rumpf, zuPruefen };
};

export const lexwareKontakt = (
  empfaenger: Exclude<BelegEmpfaenger, { art: 'sammel' }>,
): Record<string, unknown> => {
  const rumpf: Record<string, unknown> = {
    version: 0,
    roles: { customer: {} },
  };

  if (empfaenger.firma !== null) {
    const firma: Record<string, unknown> = { name: empfaenger.firma };

    if (empfaenger.ustId !== null && empfaenger.ustId.startsWith('DE')) {
      firma.vatRegistrationId = empfaenger.ustId;
    }

    rumpf.company = firma;
  } else {
    rumpf.person = {
      ...(empfaenger.vorname === null ? {} : { firstName: empfaenger.vorname }),
      lastName: empfaenger.nachname ?? '',
    };
  }

  if (empfaenger.ort !== null || empfaenger.strasse !== null) {
    rumpf.addresses = {
      billing: [
        {
          ...(empfaenger.strasse === null
            ? {}
            : { street: empfaenger.strasse }),
          ...(empfaenger.plz === null ? {} : { zip: empfaenger.plz }),
          ...(empfaenger.ort === null ? {} : { city: empfaenger.ort }),
          countryCode: empfaenger.land,
        },
      ],
    };
  }

  if (empfaenger.email !== null) {
    rumpf.emailAddresses = { business: [empfaenger.email] };
  }

  return rumpf;
};

const KONTAKT_SEITEN = 4;

const gleich = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

type LexwareKontakt = {
  id: string;
  archived?: boolean;
  company?: { name?: string };
  person?: { firstName?: string; lastName?: string };
};

export class Lexware implements Buchhaltungsprogramm {
  readonly name = NAME;

  constructor(
    private readonly http: HttpTransport,
    private readonly takt: Taktgeber,
  ) {}

  private async anfrage(
    zugang: Pick<Zugang, 'schluessel' | 'verbindungId'>,
    methode: 'GET' | 'POST',
    pfad: string,
    rumpf?: { json: unknown } | { roh: Buffer; typ: string },
  ): Promise<HttpAntwort> {
    await this.takt.warte(zugang.verbindungId);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${zugang.schluessel}`,
      Accept: 'application/json',
    };
    let inhalt: string | Buffer | null = null;

    if (rumpf !== undefined && 'json' in rumpf) {
      headers['Content-Type'] = 'application/json';
      inhalt = JSON.stringify(rumpf.json);
    } else if (rumpf !== undefined) {
      headers['Content-Type'] = rumpf.typ;
      inhalt = rumpf.roh;
    }

    let antwort: HttpAntwort;

    try {
      antwort = await this.http({
        methode,
        url: `${BASIS}${pfad}`,
        headers,
        rumpf: inhalt,
      });
    } catch {
      throw netzFehler(NAME);
    }

    pruefeAntwort(NAME, antwort);

    return antwort;
  }

  private json<T>(antwort: HttpAntwort): T {
    try {
      return JSON.parse(antwort.rumpf) as T;
    } catch {
      throw new AnbieterFehler(
        `${NAME} hat unerwartet geantwortet. Stegwerk versucht es später erneut.`,
        'voruebergehend',
        antwort.status,
      );
    }
  }

  async pruefen(
    zugang: Pick<Zugang, 'schluessel' | 'verbindungId'>,
  ): Promise<KontoProfil> {
    const profil = this.json<{ companyName?: string; organizationId?: string }>(
      await this.anfrage(zugang, 'GET', '/v1/profile'),
    );

    await this.anfrage(zugang, 'GET', '/v1/contacts?page=0&size=1');
    await this.anfrage(
      zugang,
      'GET',
      '/v1/voucherlist?voucherType=salesinvoice&voucherStatus=any&page=0&size=1',
    );

    return {
      kontoName: profil.companyName?.slice(0, 300) ?? null,
      kontoKennung: profil.organizationId ?? null,
    };
  }

  async kontakt(
    zugang: Zugang,
    empfaenger: Exclude<BelegEmpfaenger, { art: 'sammel' }>,
  ): Promise<string> {
    const name =
      empfaenger.firma ??
      [empfaenger.vorname, empfaenger.nachname].filter(Boolean).join(' ');
    const suche =
      empfaenger.firma === null && empfaenger.email !== null
        ? `email=${encodeURIComponent(empfaenger.email)}`
        : name.trim().length >= 3
          ? `name=${encodeURIComponent(name.trim())}`
          : null;

    for (
      let nummer = 0;
      suche !== null && nummer < KONTAKT_SEITEN;
      nummer += 1
    ) {
      const seite = this.json<{ content?: LexwareKontakt[]; last?: boolean }>(
        await this.anfrage(
          zugang,
          'GET',
          `/v1/contacts?${suche}&customer=true&page=${String(nummer)}&size=250`,
        ),
      );
      const treffer = (seite.content ?? []).find(
        (kontakt) =>
          kontakt.archived !== true &&
          (empfaenger.firma !== null
            ? gleich(kontakt.company?.name, empfaenger.firma)
            : gleich(kontakt.person?.lastName, empfaenger.nachname) &&
              gleich(kontakt.person?.firstName, empfaenger.vorname)),
      );

      if (treffer !== undefined) {
        return treffer.id;
      }

      if (seite.last !== false || (seite.content ?? []).length === 0) {
        break;
      }
    }

    const angelegt = this.json<{ id?: string }>(
      await this.anfrage(zugang, 'POST', '/v1/contacts', {
        json: lexwareKontakt(empfaenger),
      }),
    );

    if (typeof angelegt.id !== 'string') {
      throw new AnbieterFehler(
        `${NAME} hat den Kunden nicht angelegt. Stegwerk versucht es später erneut.`,
        'voruebergehend',
      );
    }

    return angelegt.id;
  }

  async belegFinden(zugang: Zugang, daten: BelegDaten): Promise<string | null> {
    const seite = this.json<{
      content?: { id: string; voucherNumber?: string; voucherType?: string }[];
    }>(
      await this.anfrage(
        zugang,
        'GET',
        `/v1/voucherlist?voucherType=salesinvoice,salescreditnote&voucherStatus=any&voucherNumber=${encodeURIComponent(daten.nummer)}`,
      ),
    );
    const typ = daten.korrektur ? 'salescreditnote' : 'salesinvoice';

    return (
      (seite.content ?? []).find(
        (beleg) =>
          beleg.voucherNumber === daten.nummer && beleg.voucherType === typ,
      )?.id ?? null
    );
  }

  async belegAnlegen(
    zugang: Zugang,
    daten: BelegDaten,
    kontaktId: string | null,
  ): Promise<AngelegterBeleg> {
    const { rumpf, zuPruefen } = lexwareBeleg(daten, kontaktId);
    const angelegt = this.json<{ id?: string }>(
      await this.anfrage(zugang, 'POST', '/v1/vouchers', { json: rumpf }),
    );

    if (typeof angelegt.id !== 'string') {
      throw new AnbieterFehler(
        `${NAME} hat den Beleg nicht angelegt. Stegwerk versucht es später erneut.`,
        'voruebergehend',
      );
    }

    return { id: angelegt.id, zuPruefen, dateiAngehaengt: false };
  }

  async dateiAnhaengen(
    zugang: Zugang,
    belegId: string,
    datei: BelegDatei,
  ): Promise<void> {
    if (datei.inhalt.length > LEXWARE_MAX_DATEI) {
      throw new AnbieterFehler(
        `Das PDF ist größer als 5 MB und passt nicht zu ${NAME}. Der Beleg ist dort angelegt; bitte das PDF von Hand anhängen.`,
        'sonstig',
      );
    }

    const { rumpf, typ } = multipart({
      feld: 'file',
      name: datei.name,
      typ: 'application/pdf',
      inhalt: datei.inhalt,
    });

    await this.anfrage(
      zugang,
      'POST',
      `/v1/vouchers/${encodeURIComponent(belegId)}/files`,
      { roh: rumpf, typ },
    );
  }

  async bezahltAm(zugang: Zugang, belegId: string): Promise<string | null> {
    const zahlung = this.json<{ voucherStatus?: string; paidDate?: string }>(
      await this.anfrage(
        zugang,
        'GET',
        `/v1/payments/${encodeURIComponent(belegId)}`,
      ),
    );

    if (
      (zahlung.voucherStatus === 'paid' ||
        zahlung.voucherStatus === 'paidoff') &&
      typeof zahlung.paidDate === 'string'
    ) {
      return zahlung.paidDate.slice(0, 10);
    }

    return null;
  }
}
