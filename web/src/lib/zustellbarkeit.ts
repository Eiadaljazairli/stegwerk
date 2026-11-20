export type AbsenderPruefung = {
  domain: string;
  spf: string;
  dmarc: string;
  ampel: string;
  hinweise: string[];
  geprueftAm: string;
};

const UHRZEIT = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Berlin',
});

export const geprueftText = (geprueftAm: string): string =>
  `Im DNS nachgesehen um ${UHRZEIT.format(new Date(geprueftAm))} Uhr. Gerade nachgetragene Einträge sind oft erst nach einigen Minuten überall sichtbar.`;

export const AMPEL_TEXT: Record<string, string> = {
  gut: 'Eingerichtet',
  hinweis: 'Mit Hinweisen',
  problem: 'Lückenhaft',
};

export const spfText = (spf: string): string =>
  ({
    ok: 'vorhanden, nennt Ihren Postausgang',
    ohneServer: 'vorhanden, nennt Ihren Postausgang nicht erkennbar',
    fehlt: 'fehlt',
    unbekannt: 'keine Antwort vom DNS',
  })[spf] ?? spf;

export const dmarcText = (dmarc: string): string =>
  ({
    reject: 'vorhanden, weist Fälschungen ab (reject)',
    quarantine: 'vorhanden, schiebt Fälschungen in den Spam (quarantine)',
    none: 'vorhanden, nur zur Beobachtung (none)',
    fehlt: 'fehlt',
    unbekannt: 'keine Antwort vom DNS',
  })[dmarc] ?? dmarc;

export const serienmailWarnung = (
  pruefung: AbsenderPruefung | null | undefined,
): string | null => {
  if (pruefung === null || pruefung === undefined) {
    return null;
  }

  if (pruefung.ampel !== 'problem') {
    return null;
  }

  const fehlt = [
    pruefung.spf === 'fehlt' ? 'SPF' : null,
    pruefung.dmarc === 'fehlt' ? 'DMARC' : null,
  ].filter((name): name is string => name !== null);

  return `Für ${pruefung.domain} fehlt ${fehlt.join(' und ')}. Viele Empfänger sortieren Serienmails dann in den Spam. Unter „Postfach“ steht, was ins DNS gehört.`;
};

export const empfaengerAuswahl = (
  quelle: string,
  markiert: string[],
): { kontaktIds?: string[]; verteilerId?: string; ansichtId?: string } =>
  quelle === 'auswahl'
    ? { kontaktIds: markiert }
    : quelle === 'alle'
      ? {}
      : quelle.startsWith('verteiler:')
        ? { verteilerId: quelle.slice('verteiler:'.length) }
        : { ansichtId: quelle };
