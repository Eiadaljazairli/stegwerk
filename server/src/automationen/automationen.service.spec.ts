import { BadRequestException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { DealsService } from '../crm/deals.service';
import { DealEntity, DealStage } from '../crm/entities/deal.entity';
import { NoteEntity } from '../crm/entities/note.entity';
import { TaskEntity } from '../crm/entities/task.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { hoereAuf, type Meldung } from '../webhooks/ereignisse';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import {
  AutomationAktion,
  AutomationAusloeser,
  AutomationEntity,
} from './automation.entity';
import { AutomationenService } from './automationen.service';
import {
  AusfuehrungStatus,
  AutomationAusfuehrungEntity,
} from './automation-ausfuehrung.entity';
import { AutomationMailAn } from './automation.entity';
import {
  CustomFieldEntity,
  CustomFieldFilterOperator as Op,
  CustomFieldType,
} from '../custom-fields/custom-field.types';
import { type Mail, MailService } from '../mail/mail.service';
import { MailboxesService } from '../mailboxes/mailboxes.service';
import { type Sichtfeld } from '../workspaces/sichtbarkeit';
import { type PermissionsService } from '../workspaces/permissions.service';

const SUITE = 'b10_automationen';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: AutomationenService;
let felder: CustomFieldsService;
const gesendet: Mail[] = [];
let deals: DealsService;
let workspaceId: string;
let anna: string;
let ben: string;
let fremd: string;

let sichtfeld: Sichtfeld;
const alles = (): Sichtfeld => ({
  ich: null,
  arten: { company: 'alle', contact: 'alle', deal: 'alle' },
  felder: {},
});
const rechte = {
  sichtfeldFuer: ({ userId }: { userId: string }) =>
    Promise.resolve({ ...sichtfeld, ich: sichtfeld.ich ?? userId }),
  can: () => Promise.resolve(true),
} as unknown as PermissionsService;
const einstellungen = {
  get: (key: string) =>
    key === 'mailEncryptionKey'
      ? Buffer.alloc(32, 7).toString('base64')
      : key === 'webOrigin'
        ? 'https://crm.example.de'
        : undefined,
} as never;

const nutzer = async (email: string) => {
  const users = dataSource.getRepository(UserEntity);

  return (
    await users.save(
      users.create({
        email,
        passwordHash: 'x',
        firstName: email.split('@')[0],
        lastName: 'Test',
      }),
    )
  ).id;
};

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  felder = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
  );
  service = new AutomationenService(
    dataSource.getRepository(AutomationEntity),
    dataSource.getRepository(AutomationAusfuehrungEntity),
    felder,
    {
      send: (post: Mail) => {
        gesendet.push(post);

        return Promise.resolve(true);
      },
    } as unknown as MailService,
    {
      senden: () =>
        Promise.reject(
          new BadRequestException('Für Sie ist kein Postfach verbunden.'),
        ),
    } as unknown as MailboxesService,
    rechte,
    einstellungen,
  );
  deals = new DealsService(dataSource.getRepository(DealEntity), felder);
});

afterAll(async () => {
  service.onModuleDestroy();
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query('TRUNCATE TABLE workspaces, users CASCADE');
  gesendet.length = 0;
  sichtfeld = alles();

  const workspaces = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Vertrieb', slug: 'v' }))
  ).id;
  anna = await nutzer('anna@example.de');
  ben = await nutzer('ben@example.de');
  fremd = await nutzer('fremd@example.de');

  const memberships = dataSource.getRepository(MembershipEntity);

  for (const userId of [anna, ben]) {
    await memberships.save(
      memberships.create({ userId, workspaceId, role: MembershipRole.MEMBER }),
    );
  }
});

const geschaeft = (name: string, ownerId: string | null = anna) =>
  dataSource.getRepository(DealEntity).save(
    dataSource.getRepository(DealEntity).create({
      workspaceId,
      name,
      stage: DealStage.LEAD,
      ownerId,
    }),
  );

const meldung = (
  event: Meldung['event'],
  data: Record<string, unknown>,
): Meldung => ({ workspaceId, event, data });

describe('Aufgabe bei gewonnenem Geschäft', () => {
  it('legt die Aufgabe beim Verantwortlichen an, nur bei der richtigen Phase', async () => {
    await service.create(workspaceId, anna, {
      name: 'Rechnung stellen',
      ausloeser: AutomationAusloeser.PHASE_GEAENDERT,
      phase: DealStage.WON,
      aktion: AutomationAktion.AUFGABE_ANLEGEN,
      titel: 'Rechnung schreiben',
      faelligInTagen: 2,
    });
    const deal = await geschaeft('Großauftrag', ben);

    await service.verarbeite(
      meldung('deal.stage_changed', { id: deal.id, stage: DealStage.PROPOSAL }),
    );
    expect(await dataSource.getRepository(TaskEntity).count()).toBe(0);

    await service.verarbeite(
      meldung('deal.stage_changed', { id: deal.id, stage: DealStage.WON }),
    );

    const aufgaben = await dataSource.getRepository(TaskEntity).find();

    expect(aufgaben).toHaveLength(1);
    expect(aufgaben[0]).toMatchObject({
      title: 'Rechnung schreiben',
      assigneeId: ben,
      createdById: anna,
      dealId: deal.id,
      workspaceId,
    });
  });

  it('greift auch über den echten Weg: Geschäft auf gewonnen setzen', async () => {
    service.onModuleInit();

    try {
      await service.create(workspaceId, anna, {
        name: 'Danke sagen',
        ausloeser: AutomationAusloeser.PHASE_GEAENDERT,
        phase: DealStage.WON,
        aktion: AutomationAktion.NOTIZ_ANLEGEN,
        titel: 'Gewonnen — Dankeschön schicken',
      });
      const deal = await geschaeft('Auftrag');

      await deals.update(workspaceId, deal.id, { stage: DealStage.WON });

      let notizen: NoteEntity[] = [];

      for (let i = 0; i < 50 && notizen.length === 0; i += 1) {
        await new Promise((fertig) => setTimeout(fertig, 20));
        notizen = await dataSource.getRepository(NoteEntity).find();
      }

      expect(notizen).toHaveLength(1);
      expect(notizen[0]).toMatchObject({ dealId: deal.id, authorId: anna });
    } finally {
      service.onModuleDestroy();
    }
  });

  it('übergeht abgeschaltete Automationen', async () => {
    const automation = await service.create(workspaceId, anna, {
      name: 'Aus',
      ausloeser: AutomationAusloeser.GESCHAEFT_ANGELEGT,
      aktion: AutomationAktion.AUFGABE_ANLEGEN,
      titel: 'Anrufen',
    });

    await service.setAktiv(workspaceId, automation.id, false);
    const deal = await geschaeft('Neu');

    await service.verarbeite(meldung('deal.created', { id: deal.id }));

    expect(await dataSource.getRepository(TaskEntity).count()).toBe(0);
  });
});

describe('Verteilung reihum', () => {
  it('verteilt drei Geschäfte auf zwei Leute als A, B, A', async () => {
    await service.create(workspaceId, anna, {
      name: 'Neue Geschäfte verteilen',
      ausloeser: AutomationAusloeser.GESCHAEFT_ANGELEGT,
      aktion: AutomationAktion.VERANTWORTLICH_REIHUM,
      reihumUserIds: [anna, ben],
    });

    const ids: string[] = [];

    for (const name of ['Eins', 'Zwei', 'Drei']) {
      const deal = await geschaeft(name, null);

      ids.push(deal.id);
      await service.verarbeite(meldung('deal.created', { id: deal.id }));
    }

    const besitzer = await Promise.all(
      ids.map(
        async (id) =>
          (await dataSource.getRepository(DealEntity).findOneByOrFail({ id }))
            .ownerId,
      ),
    );

    expect(besitzer).toEqual([anna, ben, anna]);
  });

  it('gibt bei gleichzeitigen Eingängen keinem zwei auf einmal', async () => {
    await service.create(workspaceId, anna, {
      name: 'Verteilen',
      ausloeser: AutomationAusloeser.GESCHAEFT_ANGELEGT,
      aktion: AutomationAktion.VERANTWORTLICH_REIHUM,
      reihumUserIds: [anna, ben],
    });
    const neue = await Promise.all(
      ['A', 'B', 'C', 'D'].map((name) => geschaeft(name, null)),
    );

    await Promise.all(
      neue.map((deal) =>
        service.verarbeite(meldung('deal.created', { id: deal.id })),
      ),
    );

    const alle = await dataSource.getRepository(DealEntity).find();

    expect(alle.filter((deal) => deal.ownerId === anna)).toHaveLength(2);
    expect(alle.filter((deal) => deal.ownerId === ben)).toHaveLength(2);
  });

  it('lässt nur Mitglieder des Bereichs in die Reihe', async () => {
    await expect(
      service.create(workspaceId, anna, {
        name: 'Mit Fremdem',
        ausloeser: AutomationAusloeser.GESCHAEFT_ANGELEGT,
        aktion: AutomationAktion.VERANTWORTLICH_REIHUM,
        reihumUserIds: [anna, fremd],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('verteilt vor dem Anlegen der Aufgabe, damit sie beim Neuen landet', async () => {
    await service.create(workspaceId, anna, {
      name: 'Erst die Aufgabe',
      ausloeser: AutomationAusloeser.GESCHAEFT_ANGELEGT,
      aktion: AutomationAktion.AUFGABE_ANLEGEN,
      titel: 'Erstkontakt',
    });
    await service.create(workspaceId, anna, {
      name: 'Dann verteilen',
      ausloeser: AutomationAusloeser.GESCHAEFT_ANGELEGT,
      aktion: AutomationAktion.VERANTWORTLICH_REIHUM,
      reihumUserIds: [ben],
    });
    const deal = await geschaeft('Neu', anna);

    await service.verarbeite(meldung('deal.created', { id: deal.id }));

    const [aufgabe] = await dataSource.getRepository(TaskEntity).find();

    expect(aufgabe?.assigneeId).toBe(ben);
  });
});

describe('keine Schleife', () => {
  it('meldet nichts, während Automationen laufen', async () => {
    await service.create(workspaceId, anna, {
      name: 'Aufgabe',
      ausloeser: AutomationAusloeser.GESCHAEFT_ANGELEGT,
      aktion: AutomationAktion.AUFGABE_ANLEGEN,
      titel: 'Nachfassen',
    });
    await service.create(workspaceId, anna, {
      name: 'Verteilen',
      ausloeser: AutomationAusloeser.GESCHAEFT_ANGELEGT,
      aktion: AutomationAktion.VERANTWORTLICH_REIHUM,
      reihumUserIds: [anna, ben],
    });
    const gehoert: Meldung[] = [];
    const ab = hoereAuf((m) => gehoert.push(m));
    const deal = await geschaeft('Neu', null);

    try {
      await service.verarbeite(meldung('deal.created', { id: deal.id }));
    } finally {
      ab();
    }

    expect(gehoert).toEqual([]);
    expect(await dataSource.getRepository(TaskEntity).count()).toBe(1);
  });

  it('ein Fehler in einer Automation hält die anderen nicht auf', async () => {
    const kaputt = await service.create(workspaceId, anna, {
      name: 'Kaputt',
      ausloeser: AutomationAusloeser.GESCHAEFT_ANGELEGT,
      aktion: AutomationAktion.AUFGABE_ANLEGEN,
      titel: 'x',
    });

    await dataSource
      .getRepository(AutomationEntity)
      .update(
        { id: kaputt.id },
        { erstelltVon: '00000000-0000-4000-8000-000000000000' },
      );
    await service.create(workspaceId, anna, {
      name: 'Heil',
      ausloeser: AutomationAusloeser.GESCHAEFT_ANGELEGT,
      aktion: AutomationAktion.NOTIZ_ANLEGEN,
      titel: 'Neu hereingekommen',
    });
    const deal = await geschaeft('Neu');

    await expect(
      service.verarbeite(meldung('deal.created', { id: deal.id })),
    ).resolves.toBeUndefined();
    expect(await dataSource.getRepository(NoteEntity).count()).toBe(1);
  });
});

const TAG = 86_400_000;

const protokoll = () =>
  dataSource
    .getRepository(AutomationAusfuehrungEntity)
    .find({ order: { createdAt: 'ASC' } });

describe('Bedingungen', () => {
  it('prüft Standardfelder und eigene Felder am Eintrag', async () => {
    await felder.create(workspaceId, {
      entity: CustomFieldEntity.DEAL,
      label: 'Region',
      type: CustomFieldType.TEXT,
    });
    await service.create(workspaceId, anna, {
      name: 'Große im Norden',
      ausloeser: AutomationAusloeser.GESCHAEFT_ANGELEGT,
      bedingungen: [
        { key: 'std:amount', operator: Op.GREATER_THAN, value: '10000' },
        { key: 'region', operator: Op.EQUALS, value: 'Nord' },
      ],
      aktion: AutomationAktion.AUFGABE_ANLEGEN,
      titel: 'Chef informieren',
    });
    const repo = dataSource.getRepository(DealEntity);
    const passt = await repo.save(
      repo.create({
        workspaceId,
        name: 'Groß Nord',
        stage: DealStage.LEAD,
        amount: 50_000,
        customFields: { region: 'Nord' },
      }),
    );
    const klein = await repo.save(
      repo.create({
        workspaceId,
        name: 'Klein Nord',
        stage: DealStage.LEAD,
        amount: 500,
        customFields: { region: 'Nord' },
      }),
    );
    const sued = await repo.save(
      repo.create({
        workspaceId,
        name: 'Groß Süd',
        stage: DealStage.LEAD,
        amount: 50_000,
        customFields: { region: 'Süd' },
      }),
    );

    for (const deal of [passt, klein, sued]) {
      await service.verarbeite(meldung('deal.created', { id: deal.id }));
    }

    const aufgaben = await dataSource.getRepository(TaskEntity).find();

    expect(aufgaben.map((a) => a.dealId)).toEqual([passt.id]);
    expect(await protokoll()).toHaveLength(1);
  });

  it('lehnt unbekannte Felder und unpassende Vergleiche ab', async () => {
    const basis = {
      name: 'x',
      ausloeser: AutomationAusloeser.GESCHAEFT_ANGELEGT,
      aktion: AutomationAktion.NOTIZ_ANLEGEN,
      titel: 'x',
    };

    await expect(
      service.create(workspaceId, anna, {
        ...basis,
        bedingungen: [
          { key: 'std:passwordHash', operator: Op.EQUALS, value: 'a' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(workspaceId, anna, {
        ...basis,
        bedingungen: [{ key: 'std:amount', operator: Op.CONTAINS, value: '1' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(workspaceId, anna, {
        ...basis,
        ausloeser: AutomationAusloeser.WEBFORMULAR_EINGANG,
        bedingungen: [{ key: 'std:name', operator: Op.IS_EMPTY }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Feld setzen', () => {
  it('setzt Phase und eigenes Feld, ohne etwas zu melden', async () => {
    await felder.create(workspaceId, {
      entity: CustomFieldEntity.DEAL,
      label: 'Quelle',
      type: CustomFieldType.TEXT,
    });
    await service.create(workspaceId, anna, {
      name: 'Qualifizieren',
      ausloeser: AutomationAusloeser.GESCHAEFT_ANGELEGT,
      aktion: AutomationAktion.FELD_SETZEN,
      feldKey: 'std:stage',
      feldWert: DealStage.QUALIFIED,
    });
    await service.create(workspaceId, anna, {
      name: 'Quelle merken',
      ausloeser: AutomationAusloeser.GESCHAEFT_ANGELEGT,
      aktion: AutomationAktion.FELD_SETZEN,
      feldKey: 'quelle',
      feldWert: 'Automation',
    });
    const deal = await geschaeft('Neu');
    const gehoert: Meldung[] = [];
    const ab = hoereAuf((m) => gehoert.push(m));

    try {
      await service.verarbeite(meldung('deal.created', { id: deal.id }));
    } finally {
      ab();
    }

    const danach = await dataSource
      .getRepository(DealEntity)
      .findOneByOrFail({ id: deal.id });

    expect(danach.stage).toBe(DealStage.QUALIFIED);
    expect(danach.customFields).toEqual({ quelle: 'Automation' });
    expect(gehoert).toEqual([]);
  });

  it('hält sich an ausgeblendete Phasen und Pflicht ab Phase', async () => {
    await dataSource.query(
      `INSERT INTO "deal_stage_settings" ("workspaceId", "pipelineId", stage, ausgeblendet)
       VALUES ($1, NULL, 'qualified', true)`,
      [workspaceId],
    );
    await felder.create(workspaceId, {
      entity: CustomFieldEntity.DEAL,
      label: 'Budget',
      type: CustomFieldType.TEXT,
      pflichtAbPhase: DealStage.NEGOTIATION,
    });
    await service.create(workspaceId, anna, {
      name: 'Qualifizieren',
      ausloeser: AutomationAusloeser.GESCHAEFT_ANGELEGT,
      aktion: AutomationAktion.FELD_SETZEN,
      feldKey: 'std:stage',
      feldWert: DealStage.QUALIFIED,
    });
    await service.create(workspaceId, anna, {
      name: 'Verhandeln',
      ausloeser: AutomationAusloeser.GESCHAEFT_ANGELEGT,
      aktion: AutomationAktion.FELD_SETZEN,
      feldKey: 'std:stage',
      feldWert: DealStage.NEGOTIATION,
    });
    const deal = await geschaeft('Neu');

    await service.verarbeite(meldung('deal.created', { id: deal.id }));

    const danach = await dataSource
      .getRepository(DealEntity)
      .findOneByOrFail({ id: deal.id });

    expect(danach.stage).toBe(DealStage.LEAD);

    const gruende = (await protokoll()).map((e) => [e.status, e.grund]);

    expect(gruende).toEqual(
      expect.arrayContaining([
        [
          AusfuehrungStatus.UEBERSPRUNGEN,
          expect.stringContaining('ausgeblendet'),
        ],
        [AusfuehrungStatus.UEBERSPRUNGEN, expect.stringContaining('„Budget“')],
      ]),
    );
  });

  it('erlaubt nur wenige Standardfelder und prüft den Wert', async () => {
    const basis = {
      name: 'x',
      ausloeser: AutomationAusloeser.GESCHAEFT_ANGELEGT,
      aktion: AutomationAktion.FELD_SETZEN,
    };

    await expect(
      service.create(workspaceId, anna, {
        ...basis,
        feldKey: 'std:name',
        feldWert: 'x',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(workspaceId, anna, {
        ...basis,
        feldKey: 'std:probability',
        feldWert: '140',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(workspaceId, anna, {
        ...basis,
        feldKey: 'std:ownerId',
        feldWert: fremd,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('feuert über den echten Weg genau einmal, ohne sich selbst auszulösen', async () => {
    service.onModuleInit();

    try {
      await service.create(workspaceId, anna, {
        name: 'Wahrscheinlichkeit',
        ausloeser: AutomationAusloeser.GESCHAEFT_GEAENDERT,
        aktion: AutomationAktion.FELD_SETZEN,
        feldKey: 'std:probability',
        feldWert: '50',
      });
      await service.create(workspaceId, anna, {
        name: 'Notiz',
        ausloeser: AutomationAusloeser.GESCHAEFT_GEAENDERT,
        aktion: AutomationAktion.NOTIZ_ANLEGEN,
        titel: 'Geändert',
      });
      const deal = await geschaeft('Auftrag');

      await deals.update(workspaceId, deal.id, { name: 'Auftrag 2' });

      let eintraege: AutomationAusfuehrungEntity[] = [];

      for (let i = 0; i < 50 && eintraege.length < 2; i += 1) {
        await new Promise((fertig) => setTimeout(fertig, 20));
        eintraege = await protokoll();
      }

      await new Promise((fertig) => setTimeout(fertig, 200));

      expect(await protokoll()).toHaveLength(2);
      expect(await dataSource.getRepository(NoteEntity).count()).toBe(1);
      expect(
        (
          await dataSource
            .getRepository(DealEntity)
            .findOneByOrFail({ id: deal.id })
        ).probability,
      ).toBe(50);
    } finally {
      service.onModuleDestroy();
    }
  });
});

describe('Verzögerung', () => {
  it('merkt vor und führt erst aus, wenn die Zeit gekommen ist', async () => {
    await service.create(workspaceId, anna, {
      name: 'Nachfassen',
      ausloeser: AutomationAusloeser.GESCHAEFT_ANGELEGT,
      verzoegerungTage: 3,
      aktion: AutomationAktion.AUFGABE_ANLEGEN,
      titel: 'Nachfassen',
    });
    const bleibt = await geschaeft('Bleibt');
    const weg = await geschaeft('Weg');

    await service.verarbeite(meldung('deal.created', { id: bleibt.id }));
    await service.verarbeite(meldung('deal.created', { id: weg.id }));

    expect(await dataSource.getRepository(TaskEntity).count()).toBe(0);
    expect((await protokoll()).map((e) => e.status)).toEqual([
      AusfuehrungStatus.GEPLANT,
      AusfuehrungStatus.GEPLANT,
    ]);

    await dataSource
      .getRepository(DealEntity)
      .update({ id: weg.id }, { deletedAt: new Date() });

    expect(await service.fuehreFaelligeAus(new Date(Date.now() + TAG))).toBe(0);
    expect(
      await service.fuehreFaelligeAus(new Date(Date.now() + 4 * TAG)),
    ).toBe(2);

    const aufgaben = await dataSource.getRepository(TaskEntity).find();

    expect(aufgaben.map((a) => a.dealId)).toEqual([bleibt.id]);

    const ergebnis = new Map((await protokoll()).map((e) => [e.zielId, e]));

    expect(ergebnis.get(bleibt.id)?.status).toBe(AusfuehrungStatus.OK);
    expect(ergebnis.get(weg.id)).toMatchObject({
      status: AusfuehrungStatus.UEBERSPRUNGEN,
      grund: expect.stringContaining('Papierkorb') as unknown as string,
    });

    expect(
      await service.fuehreFaelligeAus(new Date(Date.now() + 5 * TAG)),
    ).toBe(0);
  });
});

describe('Ruhende Geschäfte', () => {
  it('meldet ein ruhendes Geschäft einmal je Ruhephase', async () => {
    await service.create(workspaceId, anna, {
      name: 'Ruhend',
      ausloeser: AutomationAusloeser.GESCHAEFT_RUHEND,
      ruhendTage: 14,
      aktion: AutomationAktion.MAIL_SENDEN,
      mailAn: AutomationMailAn.VERANTWORTLICH,
      titel: 'Bitte nachfassen',
      mailText: 'Hier tut sich nichts.',
    });
    const alt = await geschaeft('Alt', ben);
    const frisch = await geschaeft('Frisch', ben);

    await dataSource.query(
      `UPDATE "deals" SET "updatedAt" = now() - interval '30 days' WHERE "id" = $1`,
      [alt.id],
    );

    expect(await service.pruefeRuhende()).toBe(1);
    expect(await service.pruefeRuhende()).toBe(0);
    expect(await service.pruefeRuhende(new Date(Date.now() + 100 * TAG))).toBe(
      1,
    );
    expect(gesendet.map((m) => m.to)).toEqual([
      'ben@example.de',
      'ben@example.de',
    ]);
    expect(gesendet[0]?.text).toContain('Alt');

    expect(await service.pruefeRuhende(new Date(Date.now() + 101 * TAG))).toBe(
      0,
    );

    await dataSource.getRepository(NoteEntity).save(
      dataSource.getRepository(NoteEntity).create({
        workspaceId,
        body: 'Angerufen',
        authorId: anna,
        dealId: alt.id,
      }),
    );

    expect(await service.pruefeRuhende(new Date(Date.now() + 20 * TAG))).toBe(
      1,
    );
    expect(frisch.id).not.toBe(alt.id);
  });
});

describe('Mail an den Kontakt', () => {
  it('überspringt mit Grund, wenn das Postfach fehlt', async () => {
    const vorlage = await dataSource.query(
      `INSERT INTO "mail_templates" ("workspaceId", "name", "subject", "body") VALUES ($1, 'Danke', 'Danke, {{vorname}}', 'Hallo {{vorname}}') RETURNING "id"`,
      [workspaceId],
    );
    const kontakt = await dataSource.query(
      `INSERT INTO "contacts" ("workspaceId", "firstName", "lastName", "email", "ownerId") VALUES ($1, 'Erika', 'Muster', 'erika@example.de', $2) RETURNING "id"`,
      [workspaceId, anna],
    );

    await service.create(workspaceId, anna, {
      name: 'Begrüßen',
      ausloeser: AutomationAusloeser.KONTAKT_ANGELEGT,
      aktion: AutomationAktion.MAIL_SENDEN,
      mailAn: AutomationMailAn.HAUPTKONTAKT,
      vorlageId: (vorlage as { id: string }[])[0]?.id,
    });

    await service.verarbeite(
      meldung('contact.created', {
        id: (kontakt as { id: string }[])[0]?.id,
      }),
    );

    const [eintrag] = await protokoll();

    expect(eintrag).toMatchObject({
      status: AusfuehrungStatus.UEBERSPRUNGEN,
      grund: 'Für Sie ist kein Postfach verbunden.',
    });
    expect(
      (await service.protokoll(workspaceId, eintrag?.automationId ?? ''))
        .length,
    ).toBe(1);
  });
});
