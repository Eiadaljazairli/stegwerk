import { type BelegDaten, type BelegEmpfaenger } from '../beleg';

export type KontoProfil = {
  kontoName: string | null;
  kontoKennung: string | null;
};

export type Zugang = {
  schluessel: string;
  verbindungId: string;
  daten: Record<string, unknown>;
  merke: (daten: Record<string, unknown>) => Promise<void>;
};

export type AngelegterBeleg = {
  id: string;
  zuPruefen: boolean;
  dateiAngehaengt: boolean;
};

export type BelegDatei = { name: string; inhalt: Buffer };

export interface Buchhaltungsprogramm {
  readonly name: string;

  pruefen(
    zugang: Pick<Zugang, 'schluessel' | 'verbindungId'>,
  ): Promise<KontoProfil>;

  kontakt(
    zugang: Zugang,
    empfaenger: Exclude<BelegEmpfaenger, { art: 'sammel' }>,
  ): Promise<string>;

  belegFinden(zugang: Zugang, daten: BelegDaten): Promise<string | null>;

  belegAnlegen(
    zugang: Zugang,
    daten: BelegDaten,
    kontaktId: string | null,
    datei: BelegDatei,
  ): Promise<AngelegterBeleg>;

  dateiAnhaengen(
    zugang: Zugang,
    belegId: string,
    datei: BelegDatei,
  ): Promise<void>;

  bezahltAm(zugang: Zugang, belegId: string): Promise<string | null>;
}
