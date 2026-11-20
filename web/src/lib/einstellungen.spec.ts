import { describe, expect, it } from 'vitest';

import {
  EINSTELLUNGEN,
  einstellungenFuer,
  passtZu,
  sichtbareEinstellungen,
  suchform,
} from './einstellungen';

describe('suchform', () => {
  it('macht Umlaute, Akzente und ß gleich wie der Server', () => {
    expect(suchform('Müller')).toBe('muller');
    expect(suchform('Mueller')).toBe('muller');
    expect(suchform('Café Élodie')).toBe('cafe elodie');
    expect(suchform('Straße')).toBe('strasse');
  });

  it('verlangt jedes Wort, egal in welcher Reihenfolge', () => {
    expect(passtZu('Zwei-Faktor-Anmeldung Sicherheit', 'faktor zwei')).toBe(
      true,
    );
    expect(passtZu('Zwei-Faktor-Anmeldung', 'faktor webhook')).toBe(false);
  });
});

describe('die Einstellungen', () => {
  const alle = () => true;
  const keine = () => false;

  it('zeigt einer Rolle ohne Rechte nichts, was ein Recht verlangt', () => {
    const titel = sichtbareEinstellungen(keine, false)
      .flatMap((gruppe) => gruppe.eintraege)
      .map((eintrag) => eintrag.titel);

    expect(titel).not.toContain('Webhooks');
    expect(titel).not.toContain('Automationen');
    expect(titel).toContain('Profil und Signatur');
  });

  it('zeigt die Abrechnung nur, wo abgerechnet wird', () => {
    const titel = (mit: boolean) =>
      sichtbareEinstellungen(alle, mit)
        .flatMap((gruppe) => gruppe.eintraege)
        .map((eintrag) => eintrag.titel);

    expect(titel(false)).not.toContain('Abrechnung');
    expect(titel(true)).toContain('Abrechnung');
  });

  it('findet Einstellungen über Stichworte und mit Tippart ohne Umlaut', () => {
    const gruppen = sichtbareEinstellungen(alle, true);

    expect(einstellungenFuer(gruppen, 'zapier').map((e) => e.titel)).toEqual([
      'Webhooks',
    ]);
    expect(
      einstellungenFuer(gruppen, 'loeschen konto').map((e) => e.titel),
    ).toEqual(['Konto löschen']);
    expect(einstellungenFuer(gruppen, 'xyz')).toEqual([]);
  });

  it('hängt die Zwei-Faktor-Pflicht am selben Recht wie der Server', () => {
    const nur = (recht: string) => (frage: string) => frage === recht;
    const titel = (recht: string) =>
      sichtbareEinstellungen(nur(recht), false)
        .flatMap((gruppe) => gruppe.eintraege)
        .map((eintrag) => eintrag.titel);

    expect(titel('workspace:fields')).toContain('Zwei-Faktor-Pflicht');
    expect(
      einstellungenFuer(
        sichtbareEinstellungen(nur('workspace:fields'), false),
        '2fa pflicht',
      ).map((e) => e.titel),
    ).toContain('Zwei-Faktor-Pflicht');
    expect(titel('workspace:members')).not.toContain('Zwei-Faktor-Pflicht');
  });

  it('hat für jede Sprungmarke eine eindeutige Kombination aus Ziel und Titel', () => {
    const schluessel = EINSTELLUNGEN.flatMap((gruppe) =>
      gruppe.eintraege.map((eintrag) => `${eintrag.to}-${eintrag.titel}`),
    );

    expect(new Set(schluessel).size).toBe(schluessel.length);
  });
});
