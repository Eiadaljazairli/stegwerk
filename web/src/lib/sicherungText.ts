export type Sicherung = {
  zustand: string;
  letzteSicherung: string | null;
  groesseBytes: number | null;
  anzahl: number | null;
  ausserHaus: string | null;
  kopien: number | null;
  letzterFehler: string | null;
  letzterFehlerAm: string | null;
  probeAm: string | null;
  probeOk: boolean | null;
  probeDauerSek: number | null;
  probeMeldung: string | null;
  warnungen: string[];
};

export const groesseText = (bytes: number | null): string => {
  if (bytes === null) {
    return '—';
  }

  const einheiten = ['Byte', 'KB', 'MB', 'GB', 'TB'];
  let wert = bytes;
  let stufe = 0;

  while (wert >= 1024 && stufe < einheiten.length - 1) {
    wert /= 1024;
    stufe += 1;
  }

  return `${wert.toLocaleString('de-DE', {
    maximumFractionDigits: stufe === 0 ? 0 : 1,
  })} ${einheiten[stufe]}`;
};

export const ausserHausText = (
  ausserHaus: string | null,
  kopien: number | null,
): string => {
  const anzahl = kopien === null ? '' : ` (${String(kopien)} vorhanden)`;

  switch (ausserHaus) {
    case 'abholen':
      return `verschlüsselt zum Abholen bereit${anzahl}`;
    case 'hochladen':
      return `verschlüsselt hochgeladen${anzahl}`;
    case 'aus':
      return 'nicht eingerichtet';
    default:
      return '—';
  }
};

export const sicherungKurz = (sicherung: Sicherung): string => {
  if (sicherung.zustand === 'aus') {
    return 'nicht eingerichtet';
  }

  return sicherung.warnungen.length === 0
    ? 'ok'
    : `${String(sicherung.warnungen.length)} Warnung${
        sicherung.warnungen.length === 1 ? '' : 'en'
      }`;
};

export const probeText = (sicherung: Sicherung): string => {
  if (sicherung.probeAm === null) {
    return 'noch nie';
  }

  if (sicherung.probeOk !== true) {
    return `gescheitert: ${sicherung.probeMeldung ?? 'ohne Angabe'}`;
  }

  return sicherung.probeDauerSek === null
    ? 'bestanden'
    : `bestanden, Einspielen dauerte ${String(sicherung.probeDauerSek)} s`;
};
