import { type DataSource } from 'typeorm';

import { AuditLogEntity } from '../audit/audit-log.entity';
import { AuditSubscriber } from '../audit/audit.subscriber';
import { CompaniesService } from '../crm/companies.service';
import { DealsService } from '../crm/deals.service';
import { CompanyEntity } from '../crm/entities/company.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { TaskEntity } from '../crm/entities/task.entity';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { hoereAuf, type Meldung } from '../webhooks/ereignisse';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { PapierkorbArt } from './papierkorb.dto';
import { PAPIERKORB_TAGE, PapierkorbService } from './papierkorb.service';

const SUITE = 'papierkorb';

jest.setTimeout(60_000);

let dataSource: DataSource;
let firmen: CompaniesService;
let geschaefte: DealsService;
let papierkorb: PapierkorbService;
let workspaceId: string;
let fremderBereich: string;
let anna: UserEntity;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  const felder = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
  );

  firmen = new CompaniesService(
    dataSource.getRepository(CompanyEntity),
    felder,
  );
  geschaefte = new DealsService(dataSource.getRepository(DealEntity), felder);
  papierkorb = new PapierkorbService(dataSource);
  new AuditSubscriber(dataSource);

  const m = dataSource.manager;

  workspaceId = (
    await m.save(m.create(WorkspaceEntity, { name: 'Korb', slug: 'korb' }))
  ).id;
  fremderBereich = (
    await m.save(m.create(WorkspaceEntity, { name: 'Fremd', slug: 'fremd' }))
  ).id;
  anna = await m.save(
    m.create(UserEntity, {
      email: 'anna@korb.test',
      passwordHash: 'x',
      firstName: 'Anna',
      lastName: 'Korb',
    }),
  );
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

const aufgabe = (dealId: string, title: string) =>
  dataSource.manager.save(
    dataSource.manager.create(TaskEntity, {
      workspaceId,
      title,
      dealId,
      assigneeId: anna.id,
      createdById: anna.id,
    }),
  );

describe('Papierkorb', () => {
  it('legt ab, blendet aus und holt samt Aufgaben zurück', async () => {
    const deal = await geschaefte.create(workspaceId, { name: 'Großauftrag' });
    await aufgabe(deal.id, 'Nachfassen');

    await geschaefte.remove(workspaceId, deal.id, anna.id);

    expect((await geschaefte.list(workspaceId)).totalCount).toBe(0);
    expect(
      await dataSource.getRepository(TaskEntity).countBy({ workspaceId }),
    ).toBe(0);

    const liste = await papierkorb.liste(workspaceId, [
      PapierkorbArt.GESCHAEFT,
    ]);

    expect(liste).toEqual([
      expect.objectContaining({
        name: 'Großauftrag',
        geloeschtVon: 'Anna Korb',
      }),
    ]);

    await papierkorb.wiederherstellen(
      workspaceId,
      PapierkorbArt.GESCHAEFT,
      deal.id,
    );

    expect((await geschaefte.findOne(workspaceId, deal.id)).name).toBe(
      'Großauftrag',
    );
    expect(
      await dataSource.getRepository(TaskEntity).countBy({ workspaceId }),
    ).toBe(1);
    expect(
      await dataSource
        .getRepository(AuditLogEntity)
        .countBy({ entityId: deal.id, action: 'restored' as never }),
    ).toBe(1);
  });

  it('holt keine Aufgabe zurück, die vorher einzeln gelöscht war', async () => {
    const deal = await geschaefte.create(workspaceId, { name: 'Zweiter' });
    const vorher = await aufgabe(deal.id, 'Schon weg');

    await dataSource.getRepository(TaskEntity).softDelete(vorher.id);
    await new Promise((r) => setTimeout(r, 5));
    await geschaefte.remove(workspaceId, deal.id, anna.id);
    await papierkorb.wiederherstellen(
      workspaceId,
      PapierkorbArt.GESCHAEFT,
      deal.id,
    );

    expect(
      await dataSource
        .getRepository(TaskEntity)
        .countBy({ workspaceId, dealId: deal.id }),
    ).toBe(0);
  });

  it('gibt aus fremden Bereichen nichts heraus', async () => {
    const firma = await firmen.create(workspaceId, { name: 'Diskret GmbH' });

    await firmen.remove(workspaceId, firma.id, anna.id);

    expect(
      await papierkorb.liste(fremderBereich, [PapierkorbArt.FIRMA]),
    ).toEqual([]);
    await expect(
      papierkorb.wiederherstellen(
        fremderBereich,
        PapierkorbArt.FIRMA,
        firma.id,
      ),
    ).rejects.toThrow('nicht im Papierkorb');
  });

  it('löscht nach der Frist endgültig, vorher nicht', async () => {
    const firma = await firmen.create(workspaceId, { name: 'Alt GmbH' });

    await firmen.remove(workspaceId, firma.id, anna.id);

    expect(await papierkorb.aufraeumen()).toBe(0);

    const spaeter = new Date(Date.now() + (PAPIERKORB_TAGE + 1) * 86_400_000);

    expect(await papierkorb.aufraeumen(spaeter)).toBeGreaterThan(0);
    expect(
      await dataSource
        .getRepository(CompanyEntity)
        .count({ where: { id: firma.id }, withDeleted: true }),
    ).toBe(0);
  });

  it('hält sich an die Frist des Bereichs, nicht an die der anderen', async () => {
    const m = dataSource.manager;

    await m.update(WorkspaceEntity, { id: workspaceId }, { papierkorbTage: 3 });

    const kurz = await firmen.create(workspaceId, { name: 'Kurz GmbH' });
    const lang = await firmen.create(fremderBereich, { name: 'Lang GmbH' });

    await firmen.remove(workspaceId, kurz.id, anna.id);
    await firmen.remove(fremderBereich, lang.id, null);

    const [eintrag] = (
      await papierkorb.liste(workspaceId, [PapierkorbArt.FIRMA])
    ).filter((e) => e.id === kurz.id);

    expect(eintrag.endgueltigAm.getTime() - eintrag.geloeschtAm.getTime()).toBe(
      3 * 86_400_000,
    );

    await papierkorb.aufraeumen(new Date(Date.now() + 4 * 86_400_000));

    const noch = async (id: string) =>
      dataSource
        .getRepository(CompanyEntity)
        .count({ where: { id }, withDeleted: true });

    expect(await noch(kurz.id)).toBe(0);
    expect(await noch(lang.id)).toBe(1);
    expect(await papierkorb.frist(fremderBereich)).toBe(PAPIERKORB_TAGE);

    await m.update(
      WorkspaceEntity,
      { id: workspaceId },
      { papierkorbTage: 30 },
    );
  });

  it('lässt keine Frist außerhalb von 1 bis 365 Tagen zu', async () => {
    await expect(
      dataSource.manager.update(
        WorkspaceEntity,
        { id: workspaceId },
        { papierkorbTage: 0 },
      ),
    ).rejects.toThrow();
  });
});

describe('Webhook-Meldungen', () => {
  it('meldet Änderung mit Feldern, Löschen und Wiederherstellen', async () => {
    const meldungen: Meldung[] = [];
    const aus = hoereAuf((meldung) => meldungen.push(meldung));
    const firma = await firmen.create(workspaceId, {
      name: 'Haken GmbH',
      city: 'Köln',
    });

    await firmen.update(workspaceId, firma.id, { city: 'Bonn' });
    await firmen.remove(workspaceId, firma.id, anna.id);
    await papierkorb.wiederherstellen(
      workspaceId,
      PapierkorbArt.FIRMA,
      firma.id,
    );
    aus();

    const fuer = (event: string) =>
      meldungen.find(
        (meldung) => meldung.event === event && meldung.data.id === firma.id,
      );

    expect(fuer('company.created')?.data.name).toBe('Haken GmbH');
    expect(fuer('company.updated')?.changes).toEqual({
      city: { before: 'Köln', after: 'Bonn' },
    });
    expect(fuer('company.deleted')?.data.city).toBe('Bonn');
    expect(fuer('company.restored')?.data.deletedAt).toBeNull();
  });
});
