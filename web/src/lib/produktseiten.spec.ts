import { describe, expect, it } from 'vitest';

import { PRODUKTSEITEN, produktseite } from './produktseiten';

const text = (seite: (typeof PRODUKTSEITEN)[number]): string =>
  [
    seite.titel,
    seite.seitentitel,
    seite.beschreibung,
    seite.einleitung,
    ...seite.abschnitte.flatMap((abschnitt) => [
      abschnitt.ueberschrift,
      ...abschnitt.absaetze,
    ]),
  ].join(' ');

describe('die Seiten zu den Funktionen', () => {
  it('sind acht, mit eindeutigen Adressen', () => {
    const slugs = PRODUKTSEITEN.map((seite) => seite.slug);

    expect(slugs).toHaveLength(8);
    expect(new Set(slugs).size).toBe(slugs.length);

    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9-]+$/u);
    }
  });

  it('nennen keine Preise und keinen Tarif', () => {
    for (const seite of PRODUKTSEITEN) {
      expect(text(seite)).not.toMatch(
        /€|\bEUR\b|\bEuro\b|kostenlos|gratis|\bPreis|\bTarif|pro Monat|im Monat/iu,
      );
    }
  });

  it('vergleichen nicht mit anderen Anbietern und zitieren keine Kunden', () => {
    for (const seite of PRODUKTSEITEN) {
      expect(text(seite)).not.toMatch(
        /HubSpot|Pipedrive|Salesforce|Zoho|Twenty|lexoffice|sevDesk|Kunden sagen|„[^“]*“ — /u,
      );
    }
  });

  it('haben eine Beschreibung in Suchmaschinen-Länge und Abschnitte', () => {
    for (const seite of PRODUKTSEITEN) {
      expect(seite.beschreibung.length).toBeLessThanOrEqual(170);
      expect(seite.abschnitte.length).toBeGreaterThan(0);
    }
  });

  it('zeigen nur Bilder, die es in public/ gibt', () => {
    for (const seite of PRODUKTSEITEN) {
      if (seite.bild !== undefined) {
        expect(seite.bild.src).toMatch(
          /^\/startseite\/(board|kalender|uebersicht)\.webp$/u,
        );
        expect(seite.bild.alt.length).toBeGreaterThan(10);
      }
    }
  });

  it('findet eine Seite über ihre Adresse', () => {
    expect(produktseite('datev-export')?.titel).toContain('DATEV');
    expect(produktseite('gibtesnicht')).toBeNull();
    expect(produktseite(undefined)).toBeNull();
  });
});
