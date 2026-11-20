import { BadRequestException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { AuditAction, AuditLogEntity } from '../audit/audit-log.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { AuswertungService } from './auswertung.service';
import { DealEntity, DealStage } from './entities/deal.entity';

const SUITE = 'b5_auswertung';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: AuswertungService;
let workspaceId: string;
let fremdId: string;
let annaId: string;
let bertId: string;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  service = new AuswertungService(
    dataSource.getRepository(DealEntity),
    dataSource.getRepository(UserEntity),
  );

  const workspaces = dataSource.getRepository(WorkspaceEntity);
  const users = dataSource.getRepository(UserEntity);

  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Unsere', slug: 'unsere' }))
  ).id;
  fremdId = (
    await workspaces.save(workspaces.create({ name: 'Fremde', slug: 'fremde' }))
  ).id;
  annaId = (
    await users.save(
      users.create({
        email: 'anna@example.de',
        passwordHash: 'x',
        firstName: 'Anna',
        lastName: 'Albers',
      }),
    )
  ).id;
  bertId = (
    await users.save(
      users.create({
        email: 'bert@example.de',
        passwordHash: 'x',
        firstName: 'Bert',
        lastName: 'Brandt',
      }),
    )
  ).id;
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query('TRUNCATE TABLE deals, audit_log CASCADE');
});

const geschaeft = (felder: Partial<DealEntity>) =>
  dataSource.getRepository(DealEntity).save(
    dataSource.getRepository(DealEntity).create({
      workspaceId,
      name: 'Geschäft',
      stage: DealStage.LEAD,
      ...felder,
    }),
  );

describe('gewonnen und verloren im Zeitraum', () => {
  it('zählt nach Abschlussdatum, mit Summen, Quote und Monaten', async () => {
    await geschaeft({
      stage: DealStage.WON,
      amount: 1000,
      closeDate: '2026-03-10',
      ownerId: annaId,
    });
    await geschaeft({
      stage: DealStage.WON,
      amount: 3000,
      closeDate: '2026-04-02',
      ownerId: bertId,
    });
    await geschaeft({
      stage: DealStage.LOST,
      amount: 500,
      closeDate: '2026-04-20',
      lostReason: 'Preis zu hoch',
      ownerId: annaId,
    });
    await geschaeft({
      stage: DealStage.WON,
      amount: 9999,
      closeDate: '2025-12-31',
    });

    const a = await service.berechne(
      workspaceId,
      '2026-03-01',
      '2026-04-30',
      null,
    );

    expect(a.gewonnenAnzahl).toBe(2);
    expect(a.gewonnenSumme).toBe(4000);
    expect(a.verlorenAnzahl).toBe(1);
    expect(a.verlorenSumme).toBe(500);
    expect(a.abschlussquote).toBeCloseTo(2 / 3);
    expect(a.durchschnittWert).toBe(2000);
    expect(a.monate).toEqual([
      {
        monat: '2026-03',
        gewonnenAnzahl: 1,
        gewonnenSumme: 1000,
        verlorenAnzahl: 0,
        verlorenSumme: 0,
      },
      {
        monat: '2026-04',
        gewonnenAnzahl: 1,
        gewonnenSumme: 3000,
        verlorenAnzahl: 1,
        verlorenSumme: 500,
      },
    ]);
    expect(a.verlustgruende).toEqual([
      { grund: 'Preis zu hoch', anzahl: 1, summe: 500 },
    ]);
  });

  it('lässt Gelöschtes und fremde Bereiche weg', async () => {
    const weg = await geschaeft({
      stage: DealStage.WON,
      amount: 100,
      closeDate: '2026-03-10',
    });

    await dataSource.getRepository(DealEntity).softDelete(weg.id);
    await geschaeft({
      workspaceId: fremdId,
      stage: DealStage.WON,
      amount: 100,
      closeDate: '2026-03-10',
    });

    const a = await service.berechne(
      workspaceId,
      '2026-01-01',
      '2026-12-31',
      null,
    );

    expect(a.gewonnenAnzahl).toBe(0);
    expect(a.abschlussquote).toBeNull();
    expect(a.durchschnittWert).toBeNull();
  });

  it('nimmt ohne Abschlussdatum den Phasenwechsel aus dem Protokoll', async () => {
    const g = await geschaeft({ stage: DealStage.WON, amount: 700 });

    await dataSource.getRepository(AuditLogEntity).save({
      workspaceId,
      action: AuditAction.UPDATED,
      entityType: 'Deal',
      entityId: g.id,
      changes: { stage: ['negotiation', 'won'] },
      createdAt: new Date('2026-02-14T10:00:00Z'),
    });

    const februar = await service.berechne(
      workspaceId,
      '2026-02-01',
      '2026-02-28',
      null,
    );
    const heute = new Date().toISOString().slice(0, 10);
    const jetzt = await service.berechne(workspaceId, heute, heute, null);

    expect(februar.gewonnenAnzahl).toBe(1);
    expect(jetzt.gewonnenAnzahl).toBe(0);
  });
});

describe('Verweildauer je Phase', () => {
  it('misst vom Anlegen oder letzten Wechsel bis zum nächsten', async () => {
    const g = await geschaeft({ stage: DealStage.PROPOSAL });

    await dataSource.query(
      `UPDATE deals SET "createdAt" = '2026-03-01T00:00:00Z' WHERE id = $1`,
      [g.id],
    );

    const audit = dataSource.getRepository(AuditLogEntity);
    const wechsel = (von: string, nach: string, zeit: string) =>
      audit.save({
        workspaceId,
        action: AuditAction.UPDATED,
        entityType: 'Deal',
        entityId: g.id,
        changes: { stage: [von, nach] },
        createdAt: new Date(zeit),
      });

    await wechsel('lead', 'qualified', '2026-03-05T00:00:00Z');
    await wechsel('qualified', 'proposal', '2026-03-15T00:00:00Z');

    const a = await service.berechne(
      workspaceId,
      '2026-03-01',
      '2026-03-31',
      null,
    );
    const je = Object.fromEntries(a.verweildauer.map((v) => [v.phase, v]));

    expect(je.lead?.tage).toBeCloseTo(4);
    expect(je.qualified?.tage).toBeCloseTo(10);
    expect(je.proposal).toBeUndefined();
  });
});

describe('je Verkäufer und nur meine', () => {
  it('trennt nach Verantwortlichem, mit offener Pipeline und Namen', async () => {
    await geschaeft({
      stage: DealStage.WON,
      amount: 1000,
      closeDate: '2026-03-10',
      ownerId: annaId,
    });
    await geschaeft({
      stage: DealStage.LOST,
      amount: 200,
      closeDate: '2026-03-11',
      ownerId: annaId,
    });
    await geschaeft({
      stage: DealStage.PROPOSAL,
      amount: 5000,
      ownerId: bertId,
    });

    const alle = await service.berechne(
      workspaceId,
      '2026-03-01',
      '2026-03-31',
      null,
    );
    const anna = alle.verkaeufer.find((v) => v.ownerId === annaId);
    const bert = alle.verkaeufer.find((v) => v.ownerId === bertId);

    expect(anna).toMatchObject({
      name: 'Anna Albers',
      gewonnenAnzahl: 1,
      verlorenAnzahl: 1,
      quote: 0.5,
    });
    expect(bert).toMatchObject({
      name: 'Bert Brandt',
      offenAnzahl: 1,
      offenSumme: 5000,
      quote: null,
    });

    const nurBert = await service.berechne(
      workspaceId,
      '2026-03-01',
      '2026-03-31',
      bertId,
    );

    expect(nurBert.gewonnenAnzahl).toBe(0);
    expect(nurBert.verkaeufer.map((v) => v.ownerId)).toEqual([bertId]);
  });

  it('zählt neue Geschäfte nach Anlagedatum', async () => {
    await geschaeft({ ownerId: annaId });
    await geschaeft({ ownerId: bertId });

    const heute = new Date().toISOString().slice(0, 10);

    expect(
      (await service.berechne(workspaceId, heute, heute, null)).neueGeschaefte,
    ).toBe(2);
    expect(
      (await service.berechne(workspaceId, heute, heute, annaId))
        .neueGeschaefte,
    ).toBe(1);
  });
});

describe('der Zeitraum', () => {
  it('verweigert ein falsches oder umgedrehtes Datum und mehr als fünf Jahre', async () => {
    await expect(
      service.berechne(workspaceId, '2026-13', '2026-01-01', null),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.berechne(workspaceId, '2026-05-01', '2026-04-01', null),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.berechne(workspaceId, '2010-01-01', '2026-01-01', null),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
