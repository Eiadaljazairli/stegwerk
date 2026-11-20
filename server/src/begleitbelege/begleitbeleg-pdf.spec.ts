import { inflateSync } from 'node:zlib';

import { type PdfLine } from '../documents/document-pdf';
import {
  type BegleitbelegPdfInput,
  renderBegleitbelegPdf,
} from './begleitbeleg-pdf';
import { BegleitbelegArt } from './begleitbeleg.types';

const WIN_ANSI_HIGH: Record<number, string> = {
  0x80: '€',
  0x84: '„',
  0x93: '“',
  0x96: '–',
};

const textOf = (pdf: Buffer): string => {
  const out: string[] = [];
  const streams = /stream\r?\n([\s\S]*?)endstream/gu;
  let match = streams.exec(pdf.toString('latin1'));

  while (match !== null) {
    const raw = Buffer.from(match[1], 'latin1');
    let content: string;

    try {
      content = inflateSync(raw).toString('latin1');
    } catch {
      content = raw.toString('latin1');
    }

    for (const block of content.matchAll(/BT([\s\S]*?)ET/gu)) {
      const hex = [...block[1].matchAll(/<([0-9a-fA-F]*)>/gu)]
        .map((piece) => piece[1])
        .join('');

      if (hex !== '') {
        out.push(
          [...Buffer.from(hex, 'hex')]
            .map((byte) => WIN_ANSI_HIGH[byte] ?? String.fromCharCode(byte))
            .join(''),
        );
      }
    }

    match = streams.exec(pdf.toString('latin1'));
  }

  return out.join('\n');
};

const seiten = (pdf: Buffer): number =>
  Math.max(
    ...(pdf.toString('latin1').match(/\/Count\s+\d+/gu) ?? ['/Count 0']).map(
      (entry) => Number(entry.replace(/\D/gu, '')),
    ),
  );

const zeile = (over: Partial<PdfLine> = {}): PdfLine => ({
  position: 0,
  name: 'Palette Schrauben',
  articleNumber: 'SCH-100',
  description: null,
  quantity: 10,
  unit: 'Stück',
  unitPriceCents: 1250,
  discountPercent: 0,
  taxRatePercent: 19,
  ...over,
});

const basis = (
  over: Partial<BegleitbelegPdfInput> = {},
): BegleitbelegPdfInput => ({
  art: BegleitbelegArt.AUFTRAGSBESTAETIGUNG,
  number: 'AB-2026-0001',
  issuedOn: '2026-10-22',
  angebot: { number: 'AN-2026-0007', issuedOn: '2026-10-01' },
  recipientAddress: 'Nordwind GmbH\nHafenstraße 12\n20457 Hamburg',
  lieferadresse: null,
  liefertermin: null,
  introText: null,
  closingText: null,
  smallBusiness: false,
  contactName: null,
  lines: [zeile()],
  letterhead: {
    companyName: 'Stegwerk Test GmbH',
    street: 'Teststraße 1',
    postalCode: '10115',
    city: 'Berlin',
    country: null,
    phone: null,
    email: 'info@example.test',
    website: null,
    representative: null,
    registerEntry: null,
    taxNumber: null,
    vatId: 'DE123456789',
    bankName: null,
    iban: null,
    bic: null,
  },
  ...over,
});

describe('die Auftragsbestätigung als PDF', () => {
  it('nennt das Angebot, den Liefertermin und die Summe', async () => {
    const text = textOf(
      await renderBegleitbelegPdf(basis({ liefertermin: '2026-12-01' })),
    );

    expect(text).toContain('Auftragsbestätigung AB-2026-0001');
    expect(text).toContain(
      'Wir bestätigen Ihren Auftrag zu unserem Angebot AN-2026-0007 vom',
    );
    expect(text).toContain('Als Liefertermin bestätigen wir den 01.12.2026.');
    expect(text).toContain('148,75 €');
  });
});

describe('der Lieferschein als PDF', () => {
  it('druckt keine Preise, aber Menge, Einheit und ein Feld zum Unterschreiben', async () => {
    const text = textOf(
      await renderBegleitbelegPdf(
        basis({
          art: BegleitbelegArt.LIEFERSCHEIN,
          number: 'LS-2026-0001',
          lines: [zeile({ quantity: 4 })],
        }),
      ),
    );

    expect(text).toContain('Lieferschein LS-2026-0001');
    expect(text).not.toContain('€');
    expect(text).not.toContain('Einzelpreis');
    expect(text).not.toContain('Gesamtbetrag');
    expect(text).toContain('Menge');
    expect(text).toContain(
      'Ware vollständig und in einwandfreiem Zustand erhalten:',
    );
    expect(text).toContain('Unterschrift und Name in Druckbuchstaben');
    expect(text).not.toContain('Noch offen');
  });

  it('zeigt bei einer Teillieferung, was offen bleibt, und die Lieferanschrift im Fenster', async () => {
    const text = textOf(
      await renderBegleitbelegPdf(
        basis({
          art: BegleitbelegArt.LIEFERSCHEIN,
          number: 'LS-2026-0002',
          lieferadresse: 'Baustelle Nord\nKai 4\n20457 Hamburg',
          lines: [zeile({ quantity: 4, offen: 6 })],
        }),
      ),
    );

    expect(text).toContain('Noch offen');
    expect(text).toContain('Dies ist eine Teillieferung.');
    expect(text).toContain('Baustelle Nord');
    expect(text).toContain(
      'Rechnungsanschrift: Nordwind GmbH, Hafenstraße 12, 20457 Hamburg',
    );
  });

  it('bricht viele Positionen mit Kopf und Fuß auf jeder Seite um', async () => {
    const pdf = await renderBegleitbelegPdf(
      basis({
        art: BegleitbelegArt.LIEFERSCHEIN,
        number: 'LS-2026-0003',
        lines: Array.from({ length: 70 }, (_, index) =>
          zeile({
            position: index,
            name: `Position ${String(index + 1)}`,
            description: 'mit einer Beschreibung, die etwas Platz braucht',
          }),
        ),
      }),
    );
    const text = textOf(pdf);
    const anzahl = seiten(pdf);

    expect(anzahl).toBeGreaterThan(2);
    expect(text.split('Bezeichnung').length - 1).toBe(anzahl);
    expect(text).toContain(`Seite ${String(anzahl)} von ${String(anzahl)}`);
    expect(text.split('Stegwerk Test GmbH').length - 1).toBeGreaterThanOrEqual(
      anzahl,
    );
  });
});

describe('der Storno als PDF', () => {
  it('sagt, was er zurücknimmt, und hat kein Unterschriftsfeld', async () => {
    const text = textOf(
      await renderBegleitbelegPdf(
        basis({
          art: BegleitbelegArt.LIEFERSCHEIN,
          number: 'LS-2026-0004',
          storno: {
            number: 'LS-2026-0001',
            issuedOn: '2026-10-20',
            grund: 'Falsche Lieferanschrift',
          },
          introText:
            'Hiermit stornieren wir den Lieferschein LS-2026-0001 vom 20.10.2026. Er ist damit gegenstandslos.',
        }),
      ),
    );

    expect(text).toContain('Stornierung Lieferschein LS-2026-0004');
    expect(text).toContain(
      'Hiermit stornieren wir den Lieferschein LS-2026-0001',
    );
    expect(text).toContain('Grund: Falsche Lieferanschrift');
    expect(text).not.toContain('Unterschrift');
  });
});
