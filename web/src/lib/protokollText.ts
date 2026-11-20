import { describeChanges, parseChanges } from './activity';

const LISTEN: Record<string, string> = {
  COMPANY: 'Firmen',
  CONTACT: 'Kontakte',
  DEAL: 'Geschäfte',
};

const lesen = (roh: string | null): Record<string, unknown> | null => {
  if (roh === null) {
    return null;
  }

  try {
    const wert: unknown = JSON.parse(roh);

    return typeof wert === 'object' && wert !== null && !Array.isArray(wert)
      ? (wert as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

export const sicherheitsZusatz = (details: string | null): string => {
  const d = lesen(details);

  if (d === null) {
    return '';
  }

  const teile: string[] = [];

  if (typeof d.rolle === 'string') teile.push(`Rolle ${d.rolle}`);
  if (typeof d.an === 'string') teile.push(d.an);
  if (typeof d.name === 'string') teile.push(`„${d.name}“`);
  if (typeof d.liste === 'string')
    teile.push(LISTEN[d.liste] ?? d.liste.toLowerCase());
  if (typeof d.auswahl === 'number') teile.push(`${d.auswahl} ausgewählt`);
  if (typeof d.anzahl === 'number') teile.push(`${d.anzahl} Geräte`);
  if (typeof d.vorher === 'number' && typeof d.tage === 'number')
    teile.push(`${d.vorher} → ${d.tage} Tage`);
  if (typeof d.schluessel === 'string')
    teile.push(`Schlüssel „${d.schluessel}“`);
  if (typeof d.programm === 'string') teile.push(`über ${d.programm}`);
  if (typeof d.werkzeug === 'string') teile.push(`Werkzeug ${d.werkzeug}`);
  if (d.modus === 'vorschlag') teile.push('nur vorschlagen');
  if (d.modus === 'direkt') teile.push('ändert direkt');
  if (d.weg === 'google') teile.push('mit Google');
  if (d.weg === 'microsoft') teile.push('mit Microsoft');
  if (d.anbieter === 'google') teile.push('Google');
  if (d.anbieter === 'microsoft') teile.push('Microsoft');
  if (typeof d.objekt === 'string' && typeof d.nachher === 'string')
    teile.push(
      typeof d.vorher === 'string'
        ? `${d.vorher} → ${d.nachher}`
        : `alle Objekte → ${d.nachher}`,
    );

  return teile.join(' · ');
};

export const einzelheitenText = (
  quelle: string,
  einzelheiten: string | null,
): string => {
  if (quelle === 'aenderung') {
    return describeChanges(parseChanges(einzelheiten))
      .map((c) => `${c.label}: ${c.from} → ${c.to}`)
      .join('; ');
  }

  return sicherheitsZusatz(einzelheiten);
};
