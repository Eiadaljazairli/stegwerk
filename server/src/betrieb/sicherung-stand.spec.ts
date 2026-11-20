import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bewerteSicherung, sicherungLesen } from './sicherung-stand';

const JETZT = new Date('2026-10-20T10:00:00Z');
const STUNDE = 60 * 60 * 1000;
const vor = (stunden: number) =>
  new Date(JETZT.getTime() - stunden * STUNDE).toISOString();

const stand = (teil: Record<string, unknown> = {}) => ({
  am: vor(7),
  datei: 'stegwerk-20261020-032000.dump',
  groesseBytes: 2_000_000,
  geprueft: true,
  anzahl: 14,
  ausserHaus: 'abholen',
  kopien: 30,
  ...teil,
});

const probe = (teil: Record<string, unknown> = {}) => ({
  am: vor(30),
  ok: true,
  meldung: 'Zurückgespielt und verglichen.',
  datei: 'stegwerk-20261019-032000.dump',
  dauerSek: 12,
  tabellen: [],
  ...teil,
});

describe('bewerteSicherung', () => {
  it('ist „aus“, wenn nichts bekannt ist, ohne Warnliste', () => {
    expect(bewerteSicherung(null, null, null, JETZT)).toMatchObject({
      zustand: 'aus',
      warnungen: [],
    });
  });

  it('ist ok mit frischer Sicherung, Kopie außer Haus und bestandener Probe', () => {
    const ergebnis = bewerteSicherung(stand(), null, probe(), JETZT);

    expect(ergebnis).toMatchObject({
      zustand: 'ok',
      groesseBytes: 2_000_000,
      anzahl: 14,
      ausserHaus: 'abholen',
      kopien: 30,
      probeOk: true,
      probeDauerSek: 12,
      warnungen: [],
    });
  });

  it('warnt bei einer Sicherung älter als 26 Stunden', () => {
    expect(
      bewerteSicherung(stand({ am: vor(27) }), null, probe(), JETZT).warnungen,
    ).toEqual(['Die letzte Sicherung ist älter als 26 Stunden.']);
  });

  it('warnt, wenn der letzte Lauf nach der letzten Sicherung scheiterte', () => {
    const ergebnis = bewerteSicherung(
      stand(),
      { am: vor(1), meldung: 'Die Sicherung war leer.' },
      probe(),
      JETZT,
    );

    expect(ergebnis.zustand).toBe('warnung');
    expect(ergebnis.letzterFehler).toBe('Die Sicherung war leer.');
    expect(ergebnis.warnungen).toContain(
      'Der letzte Sicherungslauf ist gescheitert.',
    );
    expect(
      bewerteSicherung(stand(), { am: vor(30), meldung: 'x' }, probe(), JETZT)
        .warnungen,
    ).toEqual([]);
  });

  it('warnt, wenn keine Kopie den Server verlässt', () => {
    expect(
      bewerteSicherung(stand({ ausserHaus: 'aus' }), null, probe(), JETZT)
        .warnungen,
    ).toEqual([
      'Keine Kopie verlässt den Server (scripts/sicherung-einrichten.sh).',
    ]);
  });

  it('warnt ohne, mit gescheiterter und mit zu alter Probe', () => {
    expect(bewerteSicherung(stand(), null, null, JETZT).warnungen).toEqual([
      'Die Sicherung wurde noch nie probeweise zurückgespielt.',
    ]);
    expect(
      bewerteSicherung(stand(), null, probe({ ok: false }), JETZT).warnungen,
    ).toEqual(['Der letzte Wiederherstellungstest ist gescheitert.']);
    expect(
      bewerteSicherung(stand(), null, probe({ am: vor(9 * 24) }), JETZT)
        .warnungen,
    ).toEqual(['Der letzte Wiederherstellungstest ist älter als 8 Tage.']);
  });

  it('verträgt kaputte Werte', () => {
    const ergebnis = bewerteSicherung(
      { am: 'gestern', groesseBytes: '2 MB' },
      null,
      null,
      JETZT,
    );

    expect(ergebnis.letzteSicherung).toBeNull();
    expect(ergebnis.groesseBytes).toBeNull();
    expect(ergebnis.warnungen).toContain(
      'Es ist keine erfolgreiche Sicherung bekannt.',
    );
  });
});

describe('sicherungLesen', () => {
  let ordner: string;

  beforeEach(async () => {
    ordner = await mkdtemp(join(tmpdir(), 'stand-'));
  });

  afterEach(async () => {
    await rm(ordner, { recursive: true, force: true });
  });

  it('liest die Dateien der Skripte', async () => {
    await writeFile(
      join(ordner, 'sicherung-stand.json'),
      `${JSON.stringify(stand())}\n`,
    );
    await writeFile(
      join(ordner, 'sicherung-probe.json'),
      JSON.stringify(probe()),
    );

    expect((await sicherungLesen(ordner, JETZT)).zustand).toBe('ok');
  });

  it('nimmt eine halbe Datei als fehlend', async () => {
    await writeFile(join(ordner, 'sicherung-stand.json'), '{"am":"2026-');

    expect((await sicherungLesen(ordner, JETZT)).zustand).toBe('aus');
  });

  it('ist ohne Verzeichnis nicht eingerichtet', async () => {
    expect((await sicherungLesen('', JETZT)).zustand).toBe('aus');
  });
});
