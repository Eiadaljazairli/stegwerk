import { ENTWICKLER_TEILE, entwicklerPfad } from './entwickler';
import {
  FEHLERBEHEBUNG_BESCHREIBUNG,
  FEHLERBEHEBUNG_TITEL,
} from './fehlerbehebung';
import {
  FUNKTIONEN_BESCHREIBUNG,
  FUNKTIONEN_TITEL,
  PRODUKTSEITEN,
} from './produktseiten';

export type OeffentlicheSeite = {
  pfad: string;
  titel: string;
  beschreibung: string;
  vorrendern: boolean;
};

export const FEHLERBEHEBUNG_PFAD = '/hilfe/fehlerbehebung';

export const OEFFENTLICHE_SEITEN: OeffentlicheSeite[] = [
  { pfad: '/', titel: '', beschreibung: '', vorrendern: true },
  {
    pfad: '/funktionen',
    titel: FUNKTIONEN_TITEL,
    beschreibung: FUNKTIONEN_BESCHREIBUNG,
    vorrendern: true,
  },
  ...PRODUKTSEITEN.map((seite) => ({
    pfad: `/funktionen/${seite.slug}`,
    titel: seite.seitentitel,
    beschreibung: seite.beschreibung,
    vorrendern: true,
  })),
  ...ENTWICKLER_TEILE.map((teil) => ({
    pfad: entwicklerPfad(teil.slug),
    titel: teil.titel,
    beschreibung: teil.beschreibung,
    vorrendern: true,
  })),
  {
    pfad: FEHLERBEHEBUNG_PFAD,
    titel: FEHLERBEHEBUNG_TITEL,
    beschreibung: FEHLERBEHEBUNG_BESCHREIBUNG,
    vorrendern: true,
  },
  ...[
    '/sicherheit',
    '/neuigkeiten',
    '/kontakt',
    '/impressum',
    '/datenschutz',
    '/auftragsverarbeitung',
    '/unterauftragsverarbeiter',
  ].map((pfad) => ({ pfad, titel: '', beschreibung: '', vorrendern: false })),
];

export const vorgerenderteDatei = (pfad: string): string =>
  pfad === '/' ? 'start.html' : `${pfad.replace(/^\/+/u, '')}/index.html`;
