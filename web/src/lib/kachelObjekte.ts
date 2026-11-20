export type Objekt = 'deal' | 'company' | 'contact' | 'task' | 'invoice';

export const OBJEKTE: { wert: Objekt; label: string; plural: string }[] = [
  { wert: 'deal', label: 'Geschäfte', plural: 'Geschäfte' },
  { wert: 'company', label: 'Firmen', plural: 'Firmen' },
  { wert: 'contact', label: 'Kontakte', plural: 'Kontakte' },
  { wert: 'task', label: 'Aufgaben', plural: 'Aufgaben' },
  { wert: 'invoice', label: 'Rechnungen (Umsatz)', plural: 'Rechnungen' },
];

export const GRUPPEN: { wert: string; label: string; objekte?: Objekt[] }[] = [
  { wert: 'phase', label: 'Phase', objekte: ['deal'] },
  {
    wert: 'verantwortlich',
    label: 'Verantwortlich',
    objekte: ['deal', 'company', 'contact', 'task'],
  },
  {
    wert: 'branche',
    label: 'Branche',
    objekte: ['deal', 'company', 'contact', 'invoice'],
  },
  {
    wert: 'herkunft',
    label: 'Herkunft',
    objekte: ['deal', 'company', 'contact', 'invoice'],
  },
  { wert: 'kunde', label: 'Kunde', objekte: ['invoice'] },
  { wert: 'verlustgrund', label: 'Verlustgrund', objekte: ['deal'] },
  { wert: 'woche', label: 'Woche' },
  { wert: 'monat', label: 'Monat' },
  { wert: 'quartal', label: 'Quartal' },
  { wert: 'jahr', label: 'Jahr' },
];

export const gruppenFuer = (objekt: Objekt) =>
  GRUPPEN.filter(
    (eintrag) =>
      eintrag.objekte === undefined || eintrag.objekte.includes(objekt),
  );

export const ersteGruppe = (objekt: Objekt): string =>
  gruppenFuer(objekt)[0]?.wert ?? 'monat';

export const hatBetrag = (objekt: Objekt | null): boolean =>
  objekt === 'deal' || objekt === 'invoice';

export const hatEigeneFelder = (objekt: Objekt): boolean =>
  objekt !== 'invoice';

export const hatVerantwortlichen = (objekt: Objekt): boolean =>
  objekt !== 'invoice';

export const INVOICE_STATUS: { wert: string; label: string }[] = [
  { wert: 'alle', label: 'Gestellt (mit Stornos)' },
  { wert: 'offen', label: 'Offen' },
  { wert: 'bezahlt', label: 'Bezahlt' },
];
