import { erloeskonto } from '../../invoices/datev';
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

const BASIS = 'https://my.sevdesk.de/api/v1';

const NAME = 'sevDesk';

const USER_AGENT = 'Stegwerk CRM (Belegübertragung)';

export const SEVDESK_SCHLUESSEL = /^[0-9a-f]{32}$/iu;

export const sevdeskSteuerregel = (
  smallBusiness: boolean,
  befreiung: Steuerbefreiung | null,
): number | null => {
  if (smallBusiness) {
    return 11;
  }

  switch (befreiung) {
    case Steuerbefreiung.AUSFUHR:
      return 2;
    case Steuerbefreiung.INNERGEMEINSCHAFTLICH:
      return 3;
    case Steuerbefreiung.STEUERFREI:
      return 4;
    case Steuerbefreiung.REVERSE_CHARGE:
      return 5;
    case Steuerbefreiung.REVERSE_CHARGE_EU:
      return null;
    default:
      return 1;
  }
};

const ERLAUBTE_SAETZE: Record<number, number[]> = {
  1: [0, 7, 19],
  2: [0],
  3: [0, 7, 19],
  4: [0],
  5: [0],
  11: [0],
};

export type Kontofuehrung = {
  accountDatevId: number;
  accountNumber: string;
  accountName: string;
  allowedTaxRules: { id: number }[];
};

export const sevdeskKonto = (
  fuehrung: Kontofuehrung[],
  regel: number,
  ratePercent: number,
  smallBusiness: boolean,
  befreiung: Steuerbefreiung | null,
): number | null => {
  const zulaessig = fuehrung.filter((konto) =>
    konto.allowedTaxRules.some((erlaubt) => Number(erlaubt.id) === regel),
  );
  const nummern = [
    erloeskonto('SKR03', ratePercent, smallBusiness, befreiung),
    erloeskonto('SKR04', ratePercent, smallBusiness, befreiung),
  ].map(String);
  const passend =
    zulaessig.find((konto) => nummern.includes(String(konto.accountNumber))) ??
    zulaessig.find((konto) => /erl[öo]s/iu.test(konto.accountName));

  return passend === undefined ? null : Number(passend.accountDatevId);
};

const datum = (iso: string): string =>
  `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export const sevdeskBeleg = (
  daten: BelegDaten,
  kontaktId: string | null,
  kontoJeSatz: Map<number, number>,
  dateiname: string,
): Record<string, unknown> => {
  const regel = sevdeskSteuerregel(daten.smallBusiness, daten.befreiung);

  if (regel === null) {
    throw new AnbieterFehler(REVERSE_CHARGE_EU_SATZ, 'sonstig');
  }

  const voucher: Record<string, unknown> = {
    objectName: 'Voucher',
    mapAll: true,
    voucherDate: datum(daten.datum),
    description: daten.nummer,
    status: 100,
    taxRule: { id: String(regel), objectName: 'TaxRule' },
    creditDebit: 'D',
    voucherType: 'VOU',
    currency: 'EUR',
  };

  if (kontaktId !== null && daten.empfaenger.art !== 'sammel') {
    voucher.supplier = { id: Number(kontaktId), objectName: 'Contact' };
  } else {
    voucher.supplier = null;
    voucher.supplierName =
      daten.empfaenger.art === 'sammel'
        ? daten.empfaenger.name
        : (daten.empfaenger.firma ??
          [daten.empfaenger.vorname, daten.empfaenger.nachname]
            .filter(Boolean)
            .join(' '));
  }

  if (daten.leistungsdatum !== null) {
    voucher.deliveryDate = datum(daten.leistungsdatum);
  }

  if (daten.faellig !== null) {
    voucher.paymentDeadline = datum(daten.faellig);
  }

  return {
    voucher,
    voucherPosSave: daten.gruppen.map((gruppe) => ({
      objectName: 'VoucherPos',
      mapAll: true,
      accountDatev: {
        id: kontoJeSatz.get(gruppe.ratePercent),
        objectName: 'AccountDatev',
      },
      taxRate: gruppe.ratePercent,
      net: false,
      sumNet: euro(gruppe.netCents),
      sumGross: euro(gruppe.netCents + gruppe.taxCents),
      comment: bemerkung(daten),
    })),
    voucherPosDelete: null,
    filename: dateiname,
  };
};

const REVERSE_CHARGE_EU_SATZ = `${NAME} nimmt Belege mit Reverse Charge nach § 18b UStG (sonstige Leistung an ein Unternehmen im EU-Ausland) über die Schnittstelle nicht an. Bitte diese Rechnung dort von Hand erfassen, damit sie in der Umsatzsteuer-Voranmeldung und der Zusammenfassenden Meldung richtig steht.`;

export const sevdeskTag = (wert: unknown): string | null => {
  if (typeof wert === 'number' && Number.isFinite(wert)) {
    const ms = wert < 1e11 ? wert * 1000 : wert;

    return new Date(ms).toISOString().slice(0, 10);
  }

  if (typeof wert !== 'string') {
    return null;
  }

  const text = wert.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/u.exec(text);

  if (iso !== null) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const deutsch = /^(\d{2})\.(\d{2})\.(\d{4})/u.exec(text);

  if (deutsch !== null) {
    return `${deutsch[3]}-${deutsch[2]}-${deutsch[1]}`;
  }

  if (/^\d+$/u.test(text)) {
    return sevdeskTag(Number(text));
  }

  return null;
};

const inhalt = <T>(json: unknown): T => {
  if (
    typeof json === 'object' &&
    json !== null &&
    'objects' in json &&
    (json as { objects: unknown }).objects !== undefined
  ) {
    return (json as { objects: T }).objects;
  }

  return json as T;
};

const gleich = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

type SevdeskKontakt = {
  id: string | number;
  name?: string | null;
  surename?: string | null;
  familyname?: string | null;
};

const KONTEN_MERKEN_MS = 24 * 60 * 60 * 1000;

export class Sevdesk implements Buchhaltungsprogramm {
  readonly name = NAME;

  constructor(
    private readonly http: HttpTransport,
    private readonly takt: Taktgeber,
    private readonly uhr: () => Date = () => new Date(),
  ) {}

  private async anfrage(
    zugang: Pick<Zugang, 'schluessel' | 'verbindungId'>,
    methode: 'GET' | 'POST',
    pfad: string,
    rumpf?: { json: unknown } | { roh: Buffer; typ: string },
  ): Promise<unknown> {
    await this.takt.warte(zugang.verbindungId);

    const headers: Record<string, string> = {
      Authorization: zugang.schluessel,
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    };
    let koerper: string | Buffer | null = null;

    if (rumpf !== undefined && 'json' in rumpf) {
      headers['Content-Type'] = 'application/json';
      koerper = JSON.stringify(rumpf.json);
    } else if (rumpf !== undefined) {
      headers['Content-Type'] = rumpf.typ;
      koerper = rumpf.roh;
    }

    let antwort: HttpAntwort;

    try {
      antwort = await this.http({
        methode,
        url: `${BASIS}${pfad}`,
        headers,
        rumpf: koerper,
      });
    } catch {
      throw netzFehler(NAME);
    }

    pruefeAntwort(NAME, antwort, this.uhr());

    try {
      return JSON.parse(antwort.rumpf) as unknown;
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
    if (!SEVDESK_SCHLUESSEL.test(zugang.schluessel)) {
      throw new AnbieterFehler(
        'Ein API-Token von sevDesk besteht aus 32 Zeichen (0–9 und a–f). Bitte den Token vollständig kopieren.',
        'sonstig',
      );
    }

    const stand = inhalt<{ version?: string }>(
      await this.anfrage(zugang, 'GET', '/Tools/bookkeepingSystemVersion'),
    );

    if (stand.version !== '2.0') {
      throw new AnbieterFehler(
        'Dieses sevDesk-Konto nutzt noch die Buchhaltung in Version 1.0. Stegwerk überträgt nur an Konten mit sevdesk-Update 2.0.',
        'sonstig',
      );
    }

    return { kontoName: null, kontoKennung: null };
  }

  async kontakt(
    zugang: Zugang,
    empfaenger: Exclude<BelegEmpfaenger, { art: 'sammel' }>,
  ): Promise<string> {
    const suchname = empfaenger.firma ?? empfaenger.nachname ?? '';
    const gefunden = inhalt<SevdeskKontakt[]>(
      await this.anfrage(
        zugang,
        'GET',
        `/Contact?depth=1&name=${encodeURIComponent(suchname.trim())}`,
      ),
    );
    const treffer = (Array.isArray(gefunden) ? gefunden : []).find((kontakt) =>
      empfaenger.firma !== null
        ? gleich(kontakt.name, empfaenger.firma)
        : gleich(kontakt.familyname, empfaenger.nachname) &&
          gleich(kontakt.surename, empfaenger.vorname),
    );

    if (treffer !== undefined) {
      return String(treffer.id);
    }

    const rumpf: Record<string, unknown> = {
      category: { id: 3, objectName: 'Category' },
    };

    if (empfaenger.firma !== null) {
      rumpf.name = empfaenger.firma;
    } else {
      rumpf.surename = empfaenger.vorname ?? '';
      rumpf.familyname = empfaenger.nachname ?? '';
    }

    if (empfaenger.ustId !== null) {
      rumpf.vatNumber = empfaenger.ustId;
    }

    const angelegt = inhalt<{ id?: string | number }>(
      await this.anfrage(zugang, 'POST', '/Contact', { json: rumpf }),
    );

    if (angelegt.id === undefined || angelegt.id === null) {
      throw new AnbieterFehler(
        `${NAME} hat den Kunden nicht angelegt. Stegwerk versucht es später erneut.`,
        'voruebergehend',
      );
    }

    return String(angelegt.id);
  }

  async belegFinden(zugang: Zugang, daten: BelegDaten): Promise<string | null> {
    const belege = inhalt<{ id: string | number; description?: string }[]>(
      await this.anfrage(
        zugang,
        'GET',
        `/Voucher?creditDebit=D&descriptionLike=${encodeURIComponent(daten.nummer)}`,
      ),
    );
    const treffer = (Array.isArray(belege) ? belege : []).find(
      (beleg) => beleg.description === daten.nummer,
    );

    return treffer === undefined ? null : String(treffer.id);
  }

  private async fuehrung(zugang: Zugang): Promise<Kontofuehrung[]> {
    const gemerkt = zugang.daten.erloeskonten as
      | { am: string; konten: Kontofuehrung[] }
      | undefined;

    if (
      gemerkt !== undefined &&
      this.uhr().getTime() - Date.parse(gemerkt.am) < KONTEN_MERKEN_MS
    ) {
      return gemerkt.konten;
    }

    const konten = inhalt<Kontofuehrung[]>(
      await this.anfrage(zugang, 'GET', '/ReceiptGuidance/forRevenue'),
    );
    const liste = (Array.isArray(konten) ? konten : []).map((konto) => ({
      accountDatevId: Number(konto.accountDatevId),
      accountNumber: String(konto.accountNumber),
      accountName: String(konto.accountName ?? ''),
      allowedTaxRules: (konto.allowedTaxRules ?? []).map((regel) => ({
        id: Number(regel.id),
      })),
    }));

    await zugang.merke({
      ...zugang.daten,
      erloeskonten: { am: this.uhr().toISOString(), konten: liste },
    });

    return liste;
  }

  async belegAnlegen(
    zugang: Zugang,
    daten: BelegDaten,
    kontaktId: string | null,
    datei: BelegDatei,
  ): Promise<AngelegterBeleg> {
    const regel = sevdeskSteuerregel(daten.smallBusiness, daten.befreiung);

    if (regel === null) {
      throw new AnbieterFehler(REVERSE_CHARGE_EU_SATZ, 'sonstig');
    }

    const erlaubt = ERLAUBTE_SAETZE[regel] ?? [];
    const unpassend = daten.gruppen.find(
      (gruppe) => !erlaubt.includes(gruppe.ratePercent),
    );

    if (unpassend !== undefined) {
      throw new AnbieterFehler(
        `${NAME} führt einen Beleg mit ${String(unpassend.ratePercent)} % und dieser Steuerbefreiung nicht als einen Beleg. Bitte dort von Hand erfassen.`,
        'sonstig',
      );
    }

    const fuehrung = await this.fuehrung(zugang);
    const kontoJeSatz = new Map<number, number>();

    for (const gruppe of daten.gruppen) {
      const konto = sevdeskKonto(
        fuehrung,
        regel,
        gruppe.ratePercent,
        daten.smallBusiness,
        daten.befreiung,
      );

      if (konto === null) {
        throw new AnbieterFehler(
          `In ${NAME} gibt es kein Erlöskonto für ${String(gruppe.ratePercent)} % mit dieser Steuerregel. Bitte dort ein Erlöskonto anlegen und erneut versuchen.`,
          'sonstig',
        );
      }

      kontoJeSatz.set(gruppe.ratePercent, konto);
    }

    const { rumpf, typ } = multipart({
      feld: 'file',
      name: datei.name,
      typ: 'application/pdf',
      inhalt: datei.inhalt,
    });
    const hochgeladen = inhalt<{ filename?: string }>(
      await this.anfrage(zugang, 'POST', '/Voucher/Factory/uploadTempFile', {
        roh: rumpf,
        typ,
      }),
    );

    if (typeof hochgeladen.filename !== 'string') {
      throw new AnbieterFehler(
        `${NAME} hat das PDF nicht angenommen. Stegwerk versucht es später erneut.`,
        'voruebergehend',
      );
    }

    const gespeichert = inhalt<{ voucher?: { id?: string | number } }>(
      await this.anfrage(zugang, 'POST', '/Voucher/Factory/saveVoucher', {
        json: sevdeskBeleg(daten, kontaktId, kontoJeSatz, hochgeladen.filename),
      }),
    );
    const id = gespeichert.voucher?.id;

    if (id === undefined || id === null) {
      throw new AnbieterFehler(
        `${NAME} hat den Beleg nicht angelegt. Stegwerk versucht es später erneut.`,
        'voruebergehend',
      );
    }

    return { id: String(id), zuPruefen: false, dateiAngehaengt: true };
  }

  async dateiAnhaengen(zugang: Zugang, belegId: string): Promise<void> {
    const beleg = await this.belegLesen(zugang, belegId);

    if (beleg === undefined) {
      throw new AnbieterFehler(
        `In ${NAME} ist der Beleg zu dieser Nummer nicht mehr zu finden. Stegwerk versucht es später erneut.`,
        'voruebergehend',
      );
    }

    if (beleg.document === null || beleg.document === undefined) {
      throw new AnbieterFehler(
        `In ${NAME} gibt es schon einen Beleg mit dieser Nummer, aber ohne PDF. Bitte das PDF dort von Hand an den Beleg hängen und hier „Erneut versuchen“ wählen.`,
        'sonstig',
      );
    }
  }

  private async belegLesen(
    zugang: Zugang,
    belegId: string,
  ): Promise<
    | { status?: string | number; payDate?: unknown; document?: unknown }
    | undefined
  > {
    const belege = inhalt<
      { status?: string | number; payDate?: unknown; document?: unknown }[]
    >(
      await this.anfrage(
        zugang,
        'GET',
        `/Voucher/${encodeURIComponent(belegId)}`,
      ),
    );

    return Array.isArray(belege) ? belege[0] : undefined;
  }

  async bezahltAm(zugang: Zugang, belegId: string): Promise<string | null> {
    const beleg = await this.belegLesen(zugang, belegId);

    if (beleg === undefined || Number(beleg.status) !== 1000) {
      return null;
    }

    return sevdeskTag(beleg.payDate) ?? this.uhr().toISOString().slice(0, 10);
  }
}
