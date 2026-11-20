export type VorschlagZeile = {
  feld: string;
  label: string;
  vorher: string | null;
  nachher: string;
  geaendert: boolean;
};

export const WERKZEUG_NAMEN: Record<string, string> = {
  create_note: 'Notiz anlegen',
  create_task: 'Aufgabe anlegen',
  create_deal: 'Geschäft anlegen',
  update_deal: 'Geschäft ändern',
  create_mail_draft: 'Mail-Entwurf anlegen',
  update_quote_texts: 'Angebotstexte ändern',
};

export const ZIEL_NAMEN: Record<string, string> = {
  company: 'Firma',
  contact: 'Kontakt',
  deal: 'Geschäft',
  quote: 'Angebot',
};

const FELD_NAMEN: Record<string, string> = {
  name: 'Bezeichnung',
  amount: 'Betrag',
  currency: 'Währung',
  stage: 'Phase',
  probability: 'Wahrscheinlichkeit',
  closeDate: 'Erwarteter Abschluss',
  companyId: 'Firma',
  primaryContactId: 'Hauptkontakt',
  lostReason: 'Verlustgrund',
  text: 'Text',
  title: 'Titel',
  description: 'Beschreibung',
  dueDate: 'Fällig am',
  dueTime: 'Uhrzeit',
  assigneeId: 'Zuständig',
  an: 'An',
  cc: 'Kopie',
  betreff: 'Betreff',
  introText: 'Einleitung',
  closingText: 'Schlusstext',
};

export const leseStand = (
  roh: string | null | undefined,
): Record<string, unknown> | null => {
  if (roh === null || roh === undefined || roh === '') {
    return null;
  }

  try {
    const wert = JSON.parse(roh) as unknown;

    return wert !== null && typeof wert === 'object' && !Array.isArray(wert)
      ? (wert as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const DATUM = /^\d{4}-\d{2}-\d{2}$/u;

export const wertText = (
  feld: string,
  wert: unknown,
  hilfen: {
    phase?: (stage: string) => string;
    name?: (feld: string, id: string) => string | null;
  } = {},
): string => {
  if (wert === null || wert === undefined || wert === '') {
    return '—';
  }

  if (Array.isArray(wert)) {
    return wert.length === 0 ? '—' : wert.map(String).join(', ');
  }

  if (feld === 'stage' && typeof wert === 'string') {
    return hilfen.phase?.(wert) ?? wert;
  }

  if (feld === 'amount' && typeof wert === 'number') {
    return wert.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  }

  if (typeof wert === 'string' && DATUM.test(wert)) {
    const [jahr, monat, tag] = wert.split('-');

    return `${tag}.${monat}.${jahr}`;
  }

  if (typeof wert === 'string' && /Id$/u.test(feld)) {
    return hilfen.name?.(feld, wert) ?? wert;
  }

  return typeof wert === 'object' ? JSON.stringify(wert) : String(wert);
};

export const vorschlagZeilen = (
  vorher: Record<string, unknown> | null,
  nachher: Record<string, unknown>,
  hilfen: Parameters<typeof wertText>[2] = {},
): VorschlagZeile[] => {
  let position = 0;

  return Object.entries(nachher).map(([feld, wert]) => {
    const istPosition = feld.startsWith('position:');

    if (istPosition) {
      position += 1;
    }

    const label = istPosition
      ? `Beschreibung, ${String(position)}. geänderte Position`
      : (FELD_NAMEN[feld] ?? feld);
    const davor =
      vorher === null ? null : wertText(feld, vorher[feld] ?? null, hilfen);
    const danach = wertText(feld, wert, hilfen);

    return {
      feld,
      label,
      vorher: davor,
      nachher: danach,
      geaendert: davor === null || davor !== danach,
    };
  });
};

export const geaenderteFelder = (
  damals: Record<string, unknown> | null,
  jetzt: Record<string, unknown> | null,
): string[] => {
  if (damals === null || jetzt === null) {
    return [];
  }

  return Object.keys(jetzt).filter(
    (feld) =>
      JSON.stringify(damals[feld] ?? null) !==
      JSON.stringify(jetzt[feld] ?? null),
  );
};
