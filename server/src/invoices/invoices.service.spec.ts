import { BadRequestException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import { LetterheadEntity } from '../quotes/letterhead.entity';
import { QuoteLineEntity } from '../quotes/quote-line.entity';
import { QuoteEntity } from '../quotes/quote.entity';
import { QuoteStatus } from '../quotes/quote.types';
import { quoteTotals } from '../quotes/quote-totals';
import { Steuerbefreiung } from '../quotes/steuerbefreiung';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { InvoiceLineEntity } from './invoice-line.entity';
import { InvoiceEntity } from './invoice.entity';
import { InvoicesService } from './invoices.service';
import { InvoiceStatus } from './invoice.types';

const SUITE = 'invoices';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: InvoicesService;
let workspaceId: string;
let otherWorkspaceId: string;
let quoteId: string;

const LINES = [
  {
    name: 'Multifunktionsgerät A3 Farbe',
    articleNumber: 'MFP-A3-C',
    description: null,
    quantity: 3,
    unit: 'Stück',
    unitPriceCents: 289_000,
    discountPercent: 0,
    taxRatePercent: 19,
  },
  {
    name: 'Installation vor Ort',
    articleNumber: 'DL-INST',
    description: null,
    quantity: 12,
    unit: 'Stunde',
    unitPriceCents: 9500,
    discountPercent: 10,
    taxRatePercent: 19,
  },
];

const vollstaendigerBriefkopf = async (workspace = workspaceId) => {
  const letterheads = dataSource.getRepository(LetterheadEntity);

  await letterheads.save(
    letterheads.create({
      workspaceId: workspace,
      companyName: 'Vertrieb Demo GmbH',
      street: 'Werdauer Weg 35',
      postalCode: '10829',
      city: 'Berlin',
      taxNumber: '29/123/45678',
      vatId: 'DE123456789',
    }),
  );
};

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  service = new InvoicesService(
    dataSource.getRepository(InvoiceEntity),
    dataSource.getRepository(InvoiceLineEntity),
    dataSource.getRepository(QuoteEntity),
    dataSource.getRepository(LetterheadEntity),
    dataSource,
  );
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE invoice_lines, invoices, invoice_counters, quote_lines, quotes, workspace_letterheads, companies, workspaces CASCADE',
  );

  const workspaces = dataSource.getRepository(WorkspaceEntity);
  const companies = dataSource.getRepository(CompanyEntity);
  const quotes = dataSource.getRepository(QuoteEntity);
  const quoteLines = dataSource.getRepository(QuoteLineEntity);

  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Wir', slug: 'wir' }))
  ).id;
  otherWorkspaceId = (
    await workspaces.save(workspaces.create({ name: 'Andere', slug: 'andere' }))
  ).id;

  const companyId = (
    await companies.save(
      companies.create({ workspaceId, name: 'Nordwind Logistik GmbH' }),
    )
  ).id;

  const quote = await quotes.save(
    quotes.create({
      workspaceId,
      number: 'AN-2026-0001',
      status: QuoteStatus.ACCEPTED,
      companyId,
      recipientAddress: 'Nordwind Logistik GmbH\nKaiserkai 1\n20457 Hamburg',
      issuedOn: '2026-03-01',
      validUntil: '2026-03-31',
      introText: 'vielen Dank für das Gespräch.',
      closingText: 'Die Lieferzeit beträgt drei Wochen.',
    }),
  );

  quoteId = quote.id;

  await quoteLines.save(
    LINES.map((line, index) =>
      quoteLines.create({ ...line, quoteId: quote.id, position: index }),
    ),
  );
});

describe('aus einem Angebot', () => {
  it('übernimmt Positionen, Anschrift und Texte', async () => {
    const invoice = await service.createFromQuote(workspaceId, quoteId);

    expect(invoice.lines).toHaveLength(2);
    expect(invoice.lines[0].name).toBe('Multifunktionsgerät A3 Farbe');
    expect(invoice.lines[1].discountPercent).toBe(10);
    expect(invoice.recipientAddress).toBe(
      'Nordwind Logistik GmbH\nKaiserkai 1\n20457 Hamburg',
    );
    expect(invoice.quoteId).toBe(quoteId);
  });

  it('kommt als Entwurf und ohne Nummer auf die Welt', async () => {
    const invoice = await service.createFromQuote(workspaceId, quoteId);

    expect(invoice.status).toBe(InvoiceStatus.DRAFT);
    expect(invoice.number).toBeNull();
  });

  it('übernimmt die Texte des Angebots nicht', async () => {
    const invoice = await service.createFromQuote(workspaceId, quoteId);

    expect(invoice.introText).not.toMatch(/Angebot/u);
    expect(invoice.introText).toMatch(/in Rechnung/u);
    expect(invoice.closingText).toBeNull();
  });

  it('rechnet dieselben Summen wie das Angebot', async () => {
    const invoice = await service.createFromQuote(workspaceId, quoteId);

    expect(quoteTotals(invoice.lines, false).grossCents).toBe(
      quoteTotals(LINES, false).grossCents,
    );
  });

  it('bleibt stehen, wenn das Angebot später verschwindet', async () => {
    const invoice = await service.createFromQuote(workspaceId, quoteId);

    await dataSource.getRepository(QuoteEntity).delete(quoteId);

    const wieder = await service.findOne(workspaceId, invoice.id);

    expect(wieder.quoteId).toBeNull();
    expect(wieder.lines).toHaveLength(2);
  });

  it('findet ein Angebot aus einem anderen Bereich nicht', async () => {
    await expect(
      service.createFromQuote(otherWorkspaceId, quoteId),
    ).rejects.toThrow(/nicht gefunden/u);
  });
});

describe('stellen', () => {
  it('vergibt die erste Nummer des Jahres', async () => {
    await vollstaendigerBriefkopf();
    const entwurf = await service.createFromQuote(workspaceId, quoteId);
    const gestellt = await service.issue(workspaceId, entwurf.id);

    const jahr = new Date().getFullYear();

    expect(gestellt.number).toBe(`RE-${String(jahr)}-0001`);
    expect(gestellt.status).toBe(InvoiceStatus.ISSUED);
    expect(gestellt.issuedAt).not.toBeNull();
  });

  it('stellt in deutscher Zeit: Neujahr um halb eins ist schon das neue Jahr', async () => {
    await vollstaendigerBriefkopf();
    const entwurf = await service.createFromQuote(workspaceId, quoteId);

    jest.useFakeTimers({
      now: new Date('2030-12-31T23:30:00Z'),
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'queueMicrotask',
      ],
    });

    try {
      const gestellt = await service.issue(workspaceId, entwurf.id);

      expect(gestellt.issuedOn).toBe('2031-01-01');
      expect(gestellt.number).toBe('RE-2031-0001');
    } finally {
      jest.useRealTimers();
    }
  });

  it('zählt weiter, statt eine Nummer zu wiederholen', async () => {
    await vollstaendigerBriefkopf();

    const erste = await service.issue(
      workspaceId,
      (await service.createFromQuote(workspaceId, quoteId)).id,
    );
    const zweite = await service.issue(
      workspaceId,
      (await service.createFromQuote(workspaceId, quoteId)).id,
    );

    expect(zweite.number).not.toBe(erste.number);
    expect(zweite.number?.endsWith('0002')).toBe(true);
  });

  it('vergibt auch bei gleichzeitigem Stellen jede Nummer nur einmal', async () => {
    await vollstaendigerBriefkopf();

    const entwuerfe = await Promise.all(
      [0, 1, 2, 3, 4].map(() => service.createFromQuote(workspaceId, quoteId)),
    );

    const gestellt = await Promise.all(
      entwuerfe.map((entwurf) => service.issue(workspaceId, entwurf.id)),
    );

    const nummern = gestellt.map((invoice) => invoice.number);

    expect(new Set(nummern).size).toBe(5);
  });

  it('stellt dieselbe Rechnung bei zwei gleichzeitigen Klicks nur einmal', async () => {
    await vollstaendigerBriefkopf();

    const entwurf = await service.createFromQuote(workspaceId, quoteId);
    const vorher = (await service.issuedNumbers(workspaceId)).length;

    const ergebnisse = await Promise.allSettled([
      service.issue(workspaceId, entwurf.id),
      service.issue(workspaceId, entwurf.id),
    ]);

    expect(ergebnisse.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await service.issuedNumbers(workspaceId)).length).toBe(vorher + 1);

    const { missingNumbers } = await import('./invoice-numbers');

    expect(missingNumbers(await service.issuedNumbers(workspaceId))).toEqual(
      [],
    );
  });

  it('löscht keine Rechnung, die gerade gestellt wird', async () => {
    await vollstaendigerBriefkopf();

    const entwurf = await service.createFromQuote(workspaceId, quoteId);

    await Promise.allSettled([
      service.issue(workspaceId, entwurf.id),
      service.remove(workspaceId, entwurf.id),
    ]);

    const noch = await service
      .findOne(workspaceId, entwurf.id)
      .catch(() => null);

    if (noch === null) {
      expect(
        (await service.issuedNumbers(workspaceId)).every((n) => n !== null),
      ).toBe(true);
    } else {
      expect(noch.status).not.toBe(InvoiceStatus.DRAFT);
    }
  });

  it('storniert bei zwei gleichzeitigen Klicks nur einmal', async () => {
    await vollstaendigerBriefkopf();

    const gestellt = await service.issue(
      workspaceId,
      (await service.createFromQuote(workspaceId, quoteId)).id,
    );

    const ergebnisse = await Promise.allSettled([
      service.cancel(workspaceId, gestellt.id),
      service.cancel(workspaceId, gestellt.id),
    ]);

    expect(ergebnisse.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('lässt keine Lücke, wenn nichts dazwischenkommt', async () => {
    await vollstaendigerBriefkopf();

    for (const _ of [0, 1, 2]) {
      await service.issue(
        workspaceId,
        (await service.createFromQuote(workspaceId, quoteId)).id,
      );
    }

    const { missingNumbers } = await import('./invoice-numbers');

    expect(missingNumbers(await service.issuedNumbers(workspaceId))).toEqual(
      [],
    );
  });

  it('verweigert das Stellen, solange eine Pflichtangabe fehlt', async () => {
    const entwurf = await service.createFromQuote(workspaceId, quoteId);

    await expect(service.issue(workspaceId, entwurf.id)).rejects.toThrow(
      BadRequestException,
    );

    expect((await service.findOne(workspaceId, entwurf.id)).number).toBeNull();
  });

  it('verbrennt keine Nummer, wenn das Stellen scheitert', async () => {
    const entwurf = await service.createFromQuote(workspaceId, quoteId);

    await expect(service.issue(workspaceId, entwurf.id)).rejects.toThrow();

    await vollstaendigerBriefkopf();
    const gestellt = await service.issue(
      workspaceId,
      (await service.createFromQuote(workspaceId, quoteId)).id,
    );

    expect(gestellt.number?.endsWith('0001')).toBe(true);
  });

  it('nennt, was fehlt, statt nur nein zu sagen', async () => {
    const entwurf = await service.createFromQuote(workspaceId, quoteId);

    await expect(service.issue(workspaceId, entwurf.id)).rejects.toThrow(
      /Steuernummer/u,
    );
  });

  it('nimmt eine Position ohne Bezeichnung nicht an und schneidet Ränder ab', async () => {
    const entwurf = await service.createFromQuote(workspaceId, quoteId);
    const zeile = {
      quantity: 1,
      unit: 'Pauschal',
      unitPriceCents: 1000,
      taxRatePercent: 19,
    };

    await expect(
      service.setLines(workspaceId, entwurf.id, [{ ...zeile, name: '   ' }]),
    ).rejects.toThrow(/Bezeichnung/u);

    const gesetzt = await service.setLines(workspaceId, entwurf.id, [
      { ...zeile, name: '  Wartung  ' },
    ]);

    expect(gesetzt.lines.map((line) => line.name)).toEqual(['Wartung']);
  });

  it('lässt eine Rechnung über null Euro gar nicht erst offen stehen', async () => {
    await vollstaendigerBriefkopf();
    const entwurf = await service.createFromQuote(workspaceId, quoteId);

    await service.setLines(workspaceId, entwurf.id, [
      {
        name: 'Kulanz',
        quantity: 1,
        unit: 'Pauschal',
        unitPriceCents: 0,
        taxRatePercent: 19,
      },
    ]);

    expect((await service.issue(workspaceId, entwurf.id)).status).toBe(
      InvoiceStatus.PAID,
    );
  });
});

describe('der Absender bleibt, wie er beim Stellen war', () => {
  it('friert den Briefkopf ein, ein Entwurf folgt dem heutigen', async () => {
    await vollstaendigerBriefkopf();
    await dataSource
      .getRepository(LetterheadEntity)
      .update({ workspaceId }, { iban: 'DE02120300000000202051' });

    const gestellt = await service.issue(
      workspaceId,
      (await service.createFromQuote(workspaceId, quoteId)).id,
    );

    await dataSource
      .getRepository(LetterheadEntity)
      .update(
        { workspaceId },
        { iban: 'DE89370400440532013000', street: 'Neue Straße 1' },
      );

    const { briefkopfFuer } = await import('./absender');
    const heute = await dataSource
      .getRepository(LetterheadEntity)
      .findOneByOrFail({ workspaceId });
    const wieder = await service.findOne(workspaceId, gestellt.id);
    const aufDemPapier = briefkopfFuer(heute, wieder.issuerSnapshot);

    expect(aufDemPapier.iban).toBe('DE02120300000000202051');
    expect(aufDemPapier.street).toBe('Werdauer Weg 35');

    const entwurf = await service.createFromQuote(workspaceId, quoteId);

    expect(briefkopfFuer(heute, entwurf.issuerSnapshot).iban).toBe(
      'DE89370400440532013000',
    );
  });
});

describe('was danach nicht mehr geht', () => {
  const gestellteRechnung = async () => {
    await vollstaendigerBriefkopf();

    return service.issue(
      workspaceId,
      (await service.createFromQuote(workspaceId, quoteId)).id,
    );
  };

  it('lässt eine gestellte Rechnung nicht ändern', async () => {
    const rechnung = await gestellteRechnung();

    await expect(
      service.update(workspaceId, {
        id: rechnung.id,
        introText: 'nachträglich',
      }),
    ).rejects.toThrow(/nicht mehr ändern/u);
  });

  it('lässt die Positionen nicht mehr austauschen', async () => {
    const rechnung = await gestellteRechnung();

    await expect(
      service.setLines(workspaceId, rechnung.id, [
        {
          name: 'etwas anderes',
          quantity: 1,
          unit: 'Stück',
          unitPriceCents: 100,
          taxRatePercent: 19,
        },
      ]),
    ).rejects.toThrow(/nicht mehr ändern/u);
  });

  it('lässt sie nicht löschen, sondern verweist auf das Stornieren', async () => {
    const rechnung = await gestellteRechnung();

    await expect(service.remove(workspaceId, rechnung.id)).rejects.toThrow(
      /storniert/u,
    );
  });

  it('lässt sie kein zweites Mal stellen', async () => {
    const rechnung = await gestellteRechnung();

    await expect(service.issue(workspaceId, rechnung.id)).rejects.toThrow(
      /Entwurf/u,
    );
  });

  it('lässt einen Entwurf sehr wohl löschen', async () => {
    const entwurf = await service.createFromQuote(workspaceId, quoteId);

    expect(await service.remove(workspaceId, entwurf.id)).toBe(true);
  });
});

describe('stornieren', () => {
  const gestellteRechnung = async () => {
    await vollstaendigerBriefkopf();

    return service.issue(
      workspaceId,
      (await service.createFromQuote(workspaceId, quoteId)).id,
    );
  };

  it('macht ein zweites Papier mit eigener Nummer', async () => {
    const original = await gestellteRechnung();
    const korrektur = await service.cancel(workspaceId, original.id);

    expect(korrektur.number).not.toBe(original.number);
    expect(korrektur.correctsInvoiceId).toBe(original.id);
    expect(korrektur.status).toBe(InvoiceStatus.ISSUED);
  });

  it('lässt das Original stehen und kennzeichnet es', async () => {
    const original = await gestellteRechnung();

    await service.cancel(workspaceId, original.id);

    const danach = await service.findOne(workspaceId, original.id);

    expect(danach.status).toBe(InvoiceStatus.CANCELLED);
    expect(danach.number).toBe(original.number);
    expect(danach.cancelledAt).not.toBeNull();
  });

  it('nimmt den Betrag auf den Cent genau zurück', async () => {
    const original = await gestellteRechnung();
    const korrektur = await service.cancel(workspaceId, original.id);

    const vorher = quoteTotals(original.lines, original.smallBusiness);
    const zurueck = quoteTotals(korrektur.lines, korrektur.smallBusiness);

    expect(vorher.netCents + zurueck.netCents).toBe(0);
    expect(vorher.taxCents + zurueck.taxCents).toBe(0);
    expect(vorher.grossCents + zurueck.grossCents).toBe(0);
  });

  it('dreht die Menge um und nicht den Preis', async () => {
    const original = await gestellteRechnung();
    const korrektur = await service.cancel(workspaceId, original.id);

    expect(korrektur.lines[0].quantity).toBe(-original.lines[0].quantity);
    expect(korrektur.lines[0].unitPriceCents).toBe(
      original.lines[0].unitPriceCents,
    );
  });

  it('storniert auch eine bereits bezahlte Rechnung', async () => {
    const original = await gestellteRechnung();

    await service.markPaid(workspaceId, original.id);

    await expect(
      service.cancel(workspaceId, original.id),
    ).resolves.toBeTruthy();
  });

  it('storniert eine Korrektur nicht noch einmal', async () => {
    const original = await gestellteRechnung();
    const korrektur = await service.cancel(workspaceId, original.id);

    await expect(service.cancel(workspaceId, korrektur.id)).rejects.toThrow(
      /Rechnungskorrektur/u,
    );
  });

  it('storniert keinen Entwurf', async () => {
    const entwurf = await service.createFromQuote(workspaceId, quoteId);

    await expect(service.cancel(workspaceId, entwurf.id)).rejects.toThrow(
      /gestellte/u,
    );
  });
});

describe('bezahlen', () => {
  const gestellteRechnung = async () => {
    await vollstaendigerBriefkopf();

    return service.issue(
      workspaceId,
      (await service.createFromQuote(workspaceId, quoteId)).id,
    );
  };

  it('bucht die Zahlung', async () => {
    const rechnung = await gestellteRechnung();
    const bezahlt = await service.markPaid(workspaceId, rechnung.id);

    expect(bezahlt.status).toBe(InvoiceStatus.PAID);
    expect(bezahlt.paidAt).not.toBeNull();
  });

  it('nimmt ein Datum entgegen, wenn das Geld früher kam', async () => {
    const rechnung = await gestellteRechnung();
    const bezahlt = await service.markPaid(
      workspaceId,
      rechnung.id,
      '2026-03-05',
    );

    expect(bezahlt.paidAt?.toISOString().slice(0, 10)).toBe('2026-03-05');
  });

  it('bucht nichts auf einen Entwurf', async () => {
    const entwurf = await service.createFromQuote(workspaceId, quoteId);

    await expect(service.markPaid(workspaceId, entwurf.id)).rejects.toThrow(
      /gestellte/u,
    );
  });

  it('bucht nicht zweimal', async () => {
    const rechnung = await gestellteRechnung();

    await service.markPaid(workspaceId, rechnung.id);

    await expect(service.markPaid(workspaceId, rechnung.id)).rejects.toThrow();
  });
});

describe('Grenzen des Arbeitsbereichs', () => {
  it('zeigt eine Rechnung nicht über die Bereichsgrenze', async () => {
    const rechnung = await service.createFromQuote(workspaceId, quoteId);

    await expect(
      service.findOne(otherWorkspaceId, rechnung.id),
    ).rejects.toThrow(/nicht gefunden/u);
  });

  it('zählt für jeden Bereich eine eigene Reihe', async () => {
    await vollstaendigerBriefkopf();
    await vollstaendigerBriefkopf(otherWorkspaceId);

    const unsere = await service.issue(
      workspaceId,
      (await service.createFromQuote(workspaceId, quoteId)).id,
    );

    const fremde = await service.create(otherWorkspaceId, {
      recipientAddress: 'Jemand anderes\nHauptstraße 5\n10115 Berlin',
      serviceDate: '2026-03-12',
    });

    await service.setLines(otherWorkspaceId, fremde.id, [
      {
        name: 'Beratung',
        quantity: 1,
        unit: 'Stunde',
        unitPriceCents: 12_000,
        taxRatePercent: 19,
      },
    ]);

    const fremdeGestellt = await service.issue(otherWorkspaceId, fremde.id);

    expect(fremdeGestellt.number).toBe(unsere.number);
  });
});

describe('Steuerbefreiung', () => {
  const nullZeile = {
    name: 'Software-Wartung',
    quantity: 1,
    unit: 'Pauschal',
    unitPriceCents: 120_000,
    taxRatePercent: 0,
  };

  const entwurfMitNull = async () => {
    await vollstaendigerBriefkopf();
    const entwurf = await service.createFromQuote(workspaceId, quoteId);

    await service.setLines(workspaceId, entwurf.id, [nullZeile]);

    return entwurf;
  };

  it('stellt keine 0-%-Position ohne Grund', async () => {
    const entwurf = await entwurfMitNull();

    await expect(service.issue(workspaceId, entwurf.id)).rejects.toThrow(
      /Grund der Steuerbefreiung/u,
    );
    expect((await service.findOne(workspaceId, entwurf.id)).number).toBeNull();
  });

  it('verlangt bei Reverse Charge die USt-IdNr. des Empfängers', async () => {
    const entwurf = await entwurfMitNull();

    await service.update(workspaceId, {
      id: entwurf.id,
      taxExemption: Steuerbefreiung.REVERSE_CHARGE_EU,
    });

    await expect(service.issue(workspaceId, entwurf.id)).rejects.toThrow(
      /USt-IdNr\. des Empfängers/u,
    );
  });

  it('stellt mit Grund, friert ihn ein und gibt ihn an die Korrektur weiter', async () => {
    const entwurf = await entwurfMitNull();

    await service.update(workspaceId, {
      id: entwurf.id,
      taxExemption: Steuerbefreiung.REVERSE_CHARGE_EU,
      recipientVatId: 'atu 1234 5678',
    });

    const gestellt = await service.issue(workspaceId, entwurf.id);

    expect(gestellt.number).not.toBeNull();
    expect(gestellt.taxExemption).toBe(Steuerbefreiung.REVERSE_CHARGE_EU);
    expect(gestellt.recipientVatId).toBe('ATU12345678');

    await expect(
      service.update(workspaceId, { id: gestellt.id, taxExemption: null }),
    ).rejects.toThrow(BadRequestException);

    const korrektur = await service.cancel(workspaceId, gestellt.id);

    expect(korrektur.taxExemption).toBe(Steuerbefreiung.REVERSE_CHARGE_EU);
    expect(korrektur.recipientVatId).toBe('ATU12345678');
  });

  it('übernimmt Grund und USt-IdNr. aus dem Angebot', async () => {
    await dataSource.getRepository(QuoteEntity).update(quoteId, {
      taxExemption: Steuerbefreiung.STEUERFREI,
      taxExemptionNote: '§ 4 Nr. 21 UStG',
      recipientVatId: 'DE999999999',
    });

    const entwurf = await service.createFromQuote(workspaceId, quoteId);

    expect(entwurf.taxExemption).toBe(Steuerbefreiung.STEUERFREI);
    expect(entwurf.taxExemptionNote).toBe('§ 4 Nr. 21 UStG');
    expect(entwurf.recipientVatId).toBe('DE999999999');
  });
});
