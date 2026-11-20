import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const SICHERUNG_ALT_STUNDEN = 26;

export const PROBE_ALT_TAGE = 8;

export type SicherungsStand = {
  am: string;
  datei: string;
  groesseBytes: number;
  geprueft: boolean;
  anzahl: number;
  ausserHaus: 'aus' | 'abholen' | 'hochladen';
  kopien: number;
};

export type SicherungsFehler = { am: string; meldung: string };

export type ProbeErgebnis = {
  am: string;
  ok: boolean;
  meldung: string;
  datei: string;
  dauerSek: number;
  tabellen: { name: string; sicherung: number; betrieb: number }[];
};

export type SicherungsBewertung = {
  zustand: 'aus' | 'ok' | 'warnung';
  letzteSicherung: Date | null;
  groesseBytes: number | null;
  anzahl: number | null;
  ausserHaus: string | null;
  kopien: number | null;
  letzterFehler: string | null;
  letzterFehlerAm: Date | null;
  probeAm: Date | null;
  probeOk: boolean | null;
  probeDauerSek: number | null;
  probeMeldung: string | null;
  warnungen: string[];
};

const STUNDE_MS = 60 * 60 * 1000;

const datum = (roh: unknown): Date | null => {
  if (typeof roh !== 'string') {
    return null;
  }

  const wert = new Date(roh);

  return Number.isNaN(wert.getTime()) ? null : wert;
};

const zahl = (roh: unknown): number | null =>
  typeof roh === 'number' && Number.isFinite(roh) ? roh : null;

const lies = async (
  verzeichnis: string,
  name: string,
): Promise<Record<string, unknown> | null> => {
  try {
    const wert = JSON.parse(
      await readFile(join(verzeichnis, name), 'utf8'),
    ) as unknown;

    return typeof wert === 'object' && wert !== null && !Array.isArray(wert)
      ? (wert as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

export const bewerteSicherung = (
  stand: Record<string, unknown> | null,
  fehler: Record<string, unknown> | null,
  probe: Record<string, unknown> | null,
  jetzt = new Date(),
): SicherungsBewertung => {
  const letzte = datum(stand?.am);
  const fehlerAm = datum(fehler?.am);
  const probeAm = datum(probe?.am);
  const ausserHaus =
    stand?.ausserHaus === 'abholen' || stand?.ausserHaus === 'hochladen'
      ? stand.ausserHaus
      : stand === null
        ? null
        : 'aus';
  const warnungen: string[] = [];

  if (letzte === null) {
    warnungen.push('Es ist keine erfolgreiche Sicherung bekannt.');
  } else if (
    jetzt.getTime() - letzte.getTime() >
    SICHERUNG_ALT_STUNDEN * STUNDE_MS
  ) {
    warnungen.push(
      `Die letzte Sicherung ist älter als ${String(SICHERUNG_ALT_STUNDEN)} Stunden.`,
    );
  }

  if (fehlerAm !== null && (letzte === null || fehlerAm > letzte)) {
    warnungen.push('Der letzte Sicherungslauf ist gescheitert.');
  }

  if (letzte !== null && ausserHaus === 'aus') {
    warnungen.push(
      'Keine Kopie verlässt den Server (scripts/sicherung-einrichten.sh).',
    );
  }

  if (probeAm === null) {
    warnungen.push('Die Sicherung wurde noch nie probeweise zurückgespielt.');
  } else if (probe?.ok !== true) {
    warnungen.push('Der letzte Wiederherstellungstest ist gescheitert.');
  } else if (
    jetzt.getTime() - probeAm.getTime() >
    PROBE_ALT_TAGE * 24 * STUNDE_MS
  ) {
    warnungen.push(
      `Der letzte Wiederherstellungstest ist älter als ${String(PROBE_ALT_TAGE)} Tage.`,
    );
  }

  const nichtsBekannt = stand === null && fehler === null && probe === null;

  return {
    zustand: nichtsBekannt ? 'aus' : warnungen.length > 0 ? 'warnung' : 'ok',
    letzteSicherung: letzte,
    groesseBytes: zahl(stand?.groesseBytes),
    anzahl: zahl(stand?.anzahl),
    ausserHaus,
    kopien: zahl(stand?.kopien),
    letzterFehler:
      typeof fehler?.meldung === 'string' ? fehler.meldung.slice(0, 300) : null,
    letzterFehlerAm: fehlerAm,
    probeAm,
    probeOk: probe === null ? null : probe.ok === true,
    probeDauerSek: zahl(probe?.dauerSek),
    probeMeldung:
      typeof probe?.meldung === 'string' ? probe.meldung.slice(0, 300) : null,
    warnungen: nichtsBekannt ? [] : warnungen,
  };
};

export const sicherungLesen = async (
  verzeichnis: string,
  jetzt = new Date(),
): Promise<SicherungsBewertung> => {
  if (verzeichnis === '') {
    return bewerteSicherung(null, null, null, jetzt);
  }

  const [stand, fehler, probe] = await Promise.all([
    lies(verzeichnis, 'sicherung-stand.json'),
    lies(verzeichnis, 'sicherung-fehler.json'),
    lies(verzeichnis, 'sicherung-probe.json'),
  ]);

  return bewerteSicherung(stand, fehler, probe, jetzt);
};
