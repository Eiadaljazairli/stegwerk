import { BadRequestException, NotFoundException } from '@nestjs/common';

import { linkToken } from './angebots-link';
import { type QuoteEntity } from './quote.entity';
import { QuoteLinksService } from './quote-links.service';
import { QuoteStatus } from './quote.types';

const GEHEIMNIS = 'test-geheimnis-0123456789-0123456789';
const ID = '6f1d2c3b-4a59-4e6f-8a7b-9c0d1e2f3a4b';

const angebot = (overrides: Partial<QuoteEntity> = {}): QuoteEntity =>
  ({
    id: ID,
    workspaceId: 'ws',
    number: 'AN-2026-0001',
    status: QuoteStatus.SENT,
    issuedOn: '2026-10-01',
    validUntil: '2999-12-31',
    recipientAddress: 'Kunde GmbH\nWeg 1\n12345 Ort',
    introText: null,
    closingText: null,
    smallBusiness: false,
    decidedAt: null,
    decidedByName: null,
    decidedOnline: false,
    publicLinkNonce: 'nonce',
    linkCreatedById: 'user-1',
    lines: [
      {
        position: 0,
        name: 'Beratung',
        description: null,
        quantity: 2,
        unit: 'Stunde',
        unitPriceCents: 10000,
        discountPercent: 0,
        taxRatePercent: 19,
      },
    ],
    ...overrides,
  }) as unknown as QuoteEntity;

const aufbau = (quote: QuoteEntity | null) => {
  const gespeichert: QuoteEntity[] = [];
  const mails: { to: string; subject: string }[] = [];

  const service = new QuoteLinksService(
    {
      findOne: () => Promise.resolve(quote),
      save: (q: QuoteEntity) => {
        gespeichert.push({ ...q });

        return Promise.resolve(q);
      },
      update: (_wo: unknown, werte: Partial<QuoteEntity>) => {
        gespeichert.push({ ...quote, ...werte } as QuoteEntity);

        return Promise.resolve({ affected: 1 });
      },
    } as never,
    {
      findOne: () =>
        Promise.resolve({ id: 'user-1', email: 'anna@firma.test' }),
    } as never,
    {} as never,
    {
      get: () =>
        Promise.resolve({
          companyName: 'Firma GmbH',
          street: null,
          postalCode: null,
          city: null,
          email: null,
          phone: null,
        }),
    } as never,
    {
      send: (mail: { to: string; subject: string }) => {
        mails.push(mail);

        return Promise.resolve(true);
      },
    } as never,
    {
      getOrThrow: () => GEHEIMNIS,
      get: () => 'https://stegwerk.test',
    } as never,
  );

  return { service, gespeichert, mails };
};

const token = linkToken(GEHEIMNIS, ID, 'nonce');

describe('QuoteLinksService', () => {
  it('nimmt an, merkt sich den Namen und sagt es dem, der den Link erzeugt hat', async () => {
    const { service, gespeichert, mails } = aufbau(angebot());

    const ansicht = await service.decide(token, true, '  Erika Muster ');

    expect(ansicht.status).toBe('angenommen');
    expect(ansicht.entschieden?.name).toBe('Erika Muster');
    expect(gespeichert[0]).toMatchObject({
      status: QuoteStatus.ACCEPTED,
      decidedByName: 'Erika Muster',
      decidedOnline: true,
    });
    expect(mails).toEqual([
      expect.objectContaining({
        to: 'anna@firma.test',
        subject: 'Angebot AN-2026-0001 angenommen',
      }),
    ]);
  });

  it('lehnt ab, auch wenn das Angebot schon abgelaufen ist', async () => {
    const { service } = aufbau(angebot({ validUntil: '2020-01-01' }));

    await expect(
      service.decide(token, false, 'Erika Muster'),
    ).resolves.toMatchObject({
      status: 'abgelehnt',
    });
  });

  it('nimmt ein abgelaufenes Angebot nicht mehr an', async () => {
    const { service, gespeichert } = aufbau(
      angebot({ validUntil: '2020-01-01' }),
    );

    await expect(
      service.decide(token, true, 'Erika Muster'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(gespeichert).toHaveLength(0);
  });

  it('entscheidet nicht zweimal', async () => {
    const { service } = aufbau(angebot({ status: QuoteStatus.ACCEPTED }));

    await expect(
      service.decide(token, false, 'Erika Muster'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('verlangt einen Namen', async () => {
    const { service } = aufbau(angebot());

    await expect(service.decide(token, true, ' ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('kennt einen zurückgezogenen Link nicht mehr', async () => {
    const { service } = aufbau(angebot({ publicLinkNonce: null }));

    await expect(service.findByToken(token)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('zeigt dem Kunden Summen und Positionen, aber keine internen IDs', async () => {
    const { service } = aufbau(angebot());
    const ansicht = await service.view(angebot());

    expect(ansicht.summen.grossCents).toBe(23800);
    expect(ansicht.positionen[0]).toMatchObject({
      name: 'Beratung',
      netCents: 20000,
    });
    expect(JSON.stringify(ansicht)).not.toContain(ID);
    expect(JSON.stringify(ansicht)).not.toContain('nonce');
  });
});
