// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { SearchPalette } from '../components/SearchPalette';
import {
  axeVerstoesse,
  type Gerendert,
  rendere,
} from '../components/testumgebung';
import { STANDARD_BEZEICHNUNGEN, type ObjektArt } from '../lib/bezeichnung';
import { ObjektePage } from './ObjektePage';

const liste = (eigen: Partial<Record<ObjektArt, object>> = {}) =>
  (Object.keys(STANDARD_BEZEICHNUNGEN) as ObjektArt[]).map((art) => ({
    art,
    ...STANDARD_BEZEICHNUNGEN[art],
    istStandard: eigen[art] === undefined,
    standardEinzahl: STANDARD_BEZEICHNUNGEN[art].einzahl,
    standardMehrzahl: STANDARD_BEZEICHNUNGEN[art].mehrzahl,
    ...eigen[art],
  }));

const PATIENTEN = liste({
  KONTAKT: { einzahl: 'Patient', mehrzahl: 'Patienten', genus: 'MAENNLICH' },
});

const rechte = (everything: boolean, permissions: string[] = []) => ({
  myPermissions: { everything, permissions, feldrechte: [] },
});

let offen: Gerendert | null = null;

afterEach(async () => {
  await offen?.abbauen();
  offen = null;
});

describe('ObjektePage', () => {
  it('zeigt alle fünf Objekte und lässt den Inhaber ändern', async () => {
    offen = await rendere(<ObjektePage />, {
      daten: { ...rechte(true), objektBezeichnungen: PATIENTEN },
    });

    const einzahl = offen.container.querySelector<HTMLInputElement>(
      '#objekt-kontakt-einzahl',
    );

    expect(offen.container.querySelectorAll('.objekte__zeile')).toHaveLength(5);
    expect(einzahl?.value).toBe('Patient');
    expect(einzahl?.disabled).toBe(false);
    expect(offen.container.textContent).toContain('heißt hier Patienten');
    expect(offen.container.textContent).toContain('„Neuer Patient“');
    expect(offen.container.textContent).toContain(
      'Auf „Kontakte“ zurücksetzen',
    );
    expect(offen.container.textContent).toContain(
      'Alle auf Standard zurücksetzen',
    );
    expect(await axeVerstoesse(offen.container)).toEqual([]);
  });

  it('zeigt einer Rolle ohne workspace:fields nur, wie die Objekte heißen', async () => {
    offen = await rendere(<ObjektePage />, {
      daten: {
        ...rechte(false, ['contact:view']),
        objektBezeichnungen: PATIENTEN,
      },
    });

    const felder = offen.container.querySelectorAll<HTMLInputElement>(
      '.objekte__zeile input',
    );

    expect(felder.length).toBe(10);
    expect([...felder].every((feld) => feld.disabled)).toBe(true);
    expect(offen.container.querySelector('button[type="submit"]')).toBeNull();
    expect(offen.container.textContent).toContain(
      'Ändern darf, wer Felder und Objekte einrichtet.',
    );
  });
});

describe('Suche mit umbenannten Objekten', () => {
  it('nennt den Befehl „Neuer Patient“ statt „Neuer Kontakt“', async () => {
    offen = await rendere(<SearchPalette open onClose={() => undefined} />, {
      daten: { ...rechte(true), objektBezeichnungen: PATIENTEN },
    });

    const text = offen.container.textContent ?? '';

    expect(text).toContain('Neuer Patient');
    expect(text).not.toContain('Neuer Kontakt');
    expect(text).toContain('Neue Firma');
  });
});
