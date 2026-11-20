import { type DataSource } from 'typeorm';

import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { LOGO_MAX_BYTES, logoArt, logoDataUrl, logoFehler } from './firmenlogo';
import { LetterheadEntity } from './letterhead.entity';
import { LetterheadsService } from './letterheads.service';
import { renderQuotePdf, type QuotePdfInput } from './quote-pdf';
import { quoteTotals } from './quote-totals';

const SUITE = 'b8_firmenlogo';

jest.setTimeout(60_000);

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const angebot = (logo: Buffer | null): QuotePdfInput => {
  const lines = [
    {
      position: 0,
      name: 'Beratung',
      articleNumber: null,
      description: null,
      quantity: 1,
      unit: 'Stunde',
      unitPriceCents: 9000,
      discountPercent: 0,
      taxRatePercent: 19,
    },
  ];

  return {
    number: 'AN-2026-0001',
    issuedOn: '2026-09-03',
    validUntil: '2026-10-03',
    recipientAddress: 'Südwind KG\nSeestraße 4\n80331 München',
    introText: null,
    closingText: null,
    smallBusiness: false,
    contactName: null,
    lines,
    totals: quoteTotals(lines, false),
    letterhead: {
      companyName: 'Nordwind GmbH',
      street: null,
      postalCode: null,
      city: null,
      country: null,
      phone: null,
      email: null,
      website: null,
      representative: null,
      registerEntry: null,
      taxNumber: null,
      vatId: null,
      bankName: null,
      iban: null,
      bic: null,
      logo,
    },
  };
};

describe('was als Logo angenommen wird', () => {
  it('erkennt PNG und JPEG am Inhalt', () => {
    expect(logoArt(PNG)).toBe('image/png');
    expect(logoArt(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe(
      'image/jpeg',
    );
  });

  it('nimmt keine andere Datei, auch nicht mit passendem Namen', () => {
    expect(
      logoArt(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBe(null);
    expect(logoFehler(Buffer.from('GIF89a'))).toBe(
      'Bitte ein Logo als PNG oder JPEG hochladen.',
    );
  });

  it('lehnt Leeres und mehr als ein Megabyte ab', () => {
    expect(logoFehler(Buffer.alloc(0))).toBe('Die Datei ist leer.');

    const gross = Buffer.alloc(LOGO_MAX_BYTES + 1);
    PNG.copy(gross);

    expect(logoFehler(gross)).toBe('Das Logo ist größer als 1 MB.');
    expect(logoFehler(PNG)).toBeNull();
  });

  it('wird für den Bildschirm zur data:-Adresse', () => {
    expect(logoDataUrl(PNG, 'image/png')).toBe(
      `data:image/png;base64,${PNG.toString('base64')}`,
    );
    expect(logoDataUrl(null, null)).toBeNull();
  });
});

describe('das Logo auf dem Beleg', () => {
  it('steht als Bild im PDF', async () => {
    const mit = (await renderQuotePdf(angebot(PNG))).toString('latin1');
    const ohne = (await renderQuotePdf(angebot(null))).toString('latin1');

    expect(mit).toContain('/Subtype /Image');
    expect(ohne).not.toContain('/Subtype /Image');
  });

  it('lässt den Beleg nicht scheitern, wenn die Datei kaputt ist', async () => {
    const kaputt = Buffer.concat([PNG.subarray(0, 12), Buffer.alloc(20)]);
    const pdf = await renderQuotePdf(angebot(kaputt));

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('das Logo im Briefkopf', () => {
  let dataSource: DataSource;
  let briefkopf: LetterheadsService;
  let workspaceId: string;

  beforeAll(async () => {
    dataSource = await createTestDatabase(SUITE);
    briefkopf = new LetterheadsService(
      dataSource.getRepository(LetterheadEntity),
    );

    const m = dataSource.manager;

    workspaceId = (
      await m.save(m.create(WorkspaceEntity, { name: 'Logo', slug: 'logo' }))
    ).id;
  });

  afterAll(async () => {
    await dropTestDatabase(dataSource, SUITE);
  });

  it('wird gespeichert, gelesen und wieder entfernt', async () => {
    await briefkopf.setLogo(workspaceId, PNG);

    const gelesen = await briefkopf.get(workspaceId);

    expect(gelesen.logoMime).toBe('image/png');
    expect(Buffer.compare(gelesen.logo ?? Buffer.alloc(0), PNG)).toBe(0);

    await briefkopf.removeLogo(workspaceId);

    const danach = await briefkopf.get(workspaceId);

    expect(danach.logo).toBeNull();
    expect(danach.logoMime).toBeNull();
  });

  it('lässt eine falsche Datei nicht hinein und behält das alte Logo', async () => {
    await briefkopf.setLogo(workspaceId, PNG);

    await expect(
      briefkopf.setLogo(workspaceId, Buffer.from('kein Bild')),
    ).rejects.toThrow('Bitte ein Logo als PNG oder JPEG hochladen.');

    expect((await briefkopf.get(workspaceId)).logoMime).toBe('image/png');
  });
});
