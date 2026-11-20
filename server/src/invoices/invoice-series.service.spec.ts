import { BadRequestException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { LetterheadEntity } from '../quotes/letterhead.entity';
import { QuoteEntity } from '../quotes/quote.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { InvoiceLineEntity } from './invoice-line.entity';
import { InvoiceSeriesEntity } from './invoice-series.entity';
import { InvoiceSeriesService } from './invoice-series.service';
import { InvoiceEntity } from './invoice.entity';
import { InvoicesService } from './invoices.service';
import { InvoiceStatus } from './invoice.types';

const SUITE = 'invoice_series';

jest.setTimeout(60_000);

let dataSource: DataSource;
let invoices: InvoicesService;
let series: InvoiceSeriesService;
let workspaceId: string;
let mails: { to: string; subject: string }[];

const abo = {
  abgelaufen: new Set<string>(),
  assertCanWrite(workspaceId: string): Promise<void> {
    return this.abgelaufen.has(workspaceId)
      ? Promise.reject(new Error('Abo abgelaufen'))
      : Promise.resolve();
  },
};

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  invoices = new InvoicesService(
    dataSource.getRepository(InvoiceEntity),
    dataSource.getRepository(InvoiceLineEntity),
    dataSource.getRepository(QuoteEntity),
    dataSource.getRepository(LetterheadEntity),
    dataSource,
  );
  mails = [];
  series = new InvoiceSeriesService(
    dataSource.getRepository(InvoiceSeriesEntity),
    dataSource.getRepository(UserEntity),
    invoices,
    {
      send: (mail: { to: string; subject: string }) => {
        mails.push(mail);

        return Promise.resolve(true);
      },
    } as never,
    { get: () => 'https://stegwerk.test' } as never,
    abo as never,
  );

  const m = dataSource.manager;

  workspaceId = (
    await m.save(m.create(WorkspaceEntity, { name: 'Serien', slug: 'serien' }))
  ).id;
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

const vorlage = async (): Promise<InvoiceEntity> => {
  const invoice = await invoices.create(workspaceId, {
    recipientAddress: 'Kunde GmbH\nWeg 1\n12345 Ort',
    introText: 'Wartung laut Vertrag.',
  });

  return invoices.setLines(workspaceId, invoice.id, [
    {
      name: 'Wartungsvertrag',
      quantity: 1,
      unit: 'Monat',
      unitPriceCents: 25_000,
      taxRatePercent: 19,
    },
  ]);
};

const user = async (): Promise<UserEntity> => {
  const users = dataSource.getRepository(UserEntity);

  return users.save(
    users.create({
      email: `serie-${String(Math.random()).slice(2)}@firma.test`,
      passwordHash: 'x',
      firstName: 'Anna',
      lastName: 'Serie',
    }),
  );
};

const entwuerfeAus = (serieId: string) =>
  dataSource
    .getRepository(InvoiceEntity)
    .find({ where: { seriesId: serieId }, relations: { lines: true } });

describe('InvoiceSeriesService', () => {
  it('holt verpasste Termine nach, je einer ein Entwurf, und benachrichtigt', async () => {
    const quelle = await vorlage();
    const anna = await user();
    const serie = await series.create(workspaceId, anna.id, {
      invoiceId: quelle.id,
      interval: 'monthly',
      startOn: '2999-01-31',
    });

    await dataSource
      .getRepository(InvoiceSeriesEntity)
      .update(serie.id, { nextRunOn: '2026-01-31' });

    mails.length = 0;

    const lauf = await series.runDue('2026-03-31');

    expect(lauf).toEqual({ erstellt: 3, fehlgeschlagen: 0 });

    const entwuerfe = await entwuerfeAus(serie.id);

    expect(entwuerfe.map((e) => e.serviceDate).sort()).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
    expect(entwuerfe.every((e) => e.status === InvoiceStatus.DRAFT)).toBe(true);
    expect(entwuerfe[0].lines[0]).toMatchObject({
      name: 'Wartungsvertrag',
      unitPriceCents: 25_000,
    });
    expect(entwuerfe[0].introText).toBe('Wartung laut Vertrag.');
    expect(mails).toHaveLength(3);
    expect(mails[0].to).toBe(anna.email);

    const danach = await dataSource
      .getRepository(InvoiceSeriesEntity)
      .findOneByOrFail({ id: serie.id });

    expect(danach.nextRunOn).toBe('2026-04-30');
  });

  it('legt beim zweiten Lauf am selben Tag nichts doppelt an', async () => {
    const quelle = await vorlage();
    const serie = await series.create(workspaceId, (await user()).id, {
      invoiceId: quelle.id,
      interval: 'quarterly',
      startOn: '2999-01-01',
    });

    await dataSource
      .getRepository(InvoiceSeriesEntity)
      .update(serie.id, { nextRunOn: '2026-06-01' });

    await Promise.all([
      series.runDue('2026-06-01'),
      series.runDue('2026-06-01'),
    ]);

    expect(await entwuerfeAus(serie.id)).toHaveLength(1);
  });

  it('hört am Enddatum auf', async () => {
    const quelle = await vorlage();
    const serie = await series.create(workspaceId, (await user()).id, {
      invoiceId: quelle.id,
      interval: 'monthly',
      startOn: '2999-01-15',
      endOn: '2999-02-20',
    });

    await dataSource
      .getRepository(InvoiceSeriesEntity)
      .update(serie.id, { nextRunOn: '2026-01-15', endOn: '2026-02-20' });

    await series.runDue('2026-12-31');

    expect(await entwuerfeAus(serie.id)).toHaveLength(2);

    const danach = await dataSource
      .getRepository(InvoiceSeriesEntity)
      .findOneByOrFail({ id: serie.id });

    expect(danach.active).toBe(false);
  });

  it('nimmt keine Korrektur, keine leere Vorlage und keine zweite Serie', async () => {
    const leer = await invoices.create(workspaceId, {});
    const anna = await user();

    await expect(
      series.create(workspaceId, anna.id, {
        invoiceId: leer.id,
        interval: 'monthly',
        startOn: '2999-01-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const quelle = await vorlage();

    await series.create(workspaceId, anna.id, {
      invoiceId: quelle.id,
      interval: 'yearly',
      startOn: '2999-01-01',
    });

    await expect(
      series.create(workspaceId, anna.id, {
        invoiceId: quelle.id,
        interval: 'monthly',
        startOn: '2999-01-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('pausiert ohne Abo und holt danach nach', async () => {
    const quelle = await vorlage();
    const serie = await series.create(workspaceId, (await user()).id, {
      invoiceId: quelle.id,
      interval: 'monthly',
      startOn: '2999-03-01',
    });

    await dataSource
      .getRepository(InvoiceSeriesEntity)
      .update(serie.id, { nextRunOn: '2026-03-01' });

    abo.abgelaufen.add(workspaceId);
    await series.runDue('2026-03-01');
    expect(await entwuerfeAus(serie.id)).toHaveLength(0);

    abo.abgelaufen.delete(workspaceId);
    await series.runDue('2026-03-01');
    expect(await entwuerfeAus(serie.id)).toHaveLength(1);
  });

  it('beendet eine Serie', async () => {
    const quelle = await vorlage();
    const serie = await series.create(workspaceId, (await user()).id, {
      invoiceId: quelle.id,
      interval: 'monthly',
      startOn: '2999-05-01',
    });

    const gelistet = (await series.list(workspaceId)).find(
      (eintrag) => eintrag.id === serie.id,
    );

    expect(gelistet?.sourceInvoice.lines).toHaveLength(1);

    await series.end(workspaceId, serie.id);

    expect(await series.forInvoice(workspaceId, quelle.id)).toBeNull();
  });
});
