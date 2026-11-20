import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { AppointmentEntity } from '../calendar/appointment.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity, DealStage } from '../crm/entities/deal.entity';
import { NoteEntity } from '../crm/entities/note.entity';
import { TaskEntity } from '../crm/entities/task.entity';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import {
  CustomFieldEntity as CustomFieldEntityArt,
  CustomFieldFilterOperator as Op,
  CustomFieldType,
} from '../custom-fields/custom-field.types';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { type Mail, type MailService } from '../mail/mail.service';
import { type MailboxesService } from '../mailboxes/mailboxes.service';
import { MailEntwurfEntity } from '../mailboxes/mail-entwurf.entity';
import { MailTemplateEntity } from '../mailboxes/mail-template.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { webhookSignatur } from '../webhooks/webhooks.service';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { type PermissionsService } from '../workspaces/permissions.service';
import { FreigabeEntity } from '../crm/freigaben/freigabe.entity';
import { runWithRequestContext } from '../observability/request-context';
import { type Sichtfeld, setzeSichtfeld } from '../workspaces/sichtbarkeit';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import {
  AusfuehrungStatus,
  AutomationAusfuehrungEntity,
} from './automation-ausfuehrung.entity';
import {
  AutomationAktion,
  AutomationAusloeser,
  AutomationEntity,
  AutomationMailAn,
  AutomationRhythmus,
} from './automation.entity';
import {
  AutomationenService,
  betragAus,
  MAX_LAEUFE_JE_MINUTE,
  TIEFE_KOPF,
} from './automationen.service';

const SUITE = 'jc_automationen_schritte';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: AutomationenService;
const gesendet: Mail[] = [];
let workspaceId: string;
let anna: string;
let ben: string;
let sichtfeld: Sichtfeld;
let darfSchreiben = true;

let server: Server;
let serverUrl: string;
let empfangen: {
  methode: string;
  koepfe: Record<string, unknown>;
  rumpf: string;
}[] = [];

const rechte = {
  sichtfeldFuer: ({ userId }: { userId: string }) =>
    Promise.resolve({ ...sichtfeld, ich: sichtfeld.ich ?? userId }),
  can: () => Promise.resolve(darfSchreiben),
} as unknown as PermissionsService;

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
  service = new AutomationenService(
    dataSource.getRepository(AutomationEntity),
    dataSource.getRepository(AutomationAusfuehrungEntity),
    new CustomFieldsService(dataSource.getRepository(CustomFieldDefinition)),
    {
      send: (post: Mail) => {
        gesendet.push(post);

        return Promise.resolve(true);
      },
    } as unknown as MailService,
    {
      senden: () => Promise.reject(new BadRequestException('Kein Postfach.')),
    } as unknown as MailboxesService,
    rechte,
    {
      get: (key: string) =>
        key === 'mailEncryptionKey'
          ? Buffer.alloc(32, 9).toString('base64')
          : key === 'webOrigin'
            ? 'https://crm.example.de'
            : undefined,
    } as never,
  );

  server = createServer((anfrage, antwort) => {
    let rumpf = '';

    anfrage.on('data', (teil: Buffer) => {
      rumpf += teil.toString();
    });
    anfrage.on('end', () => {
      empfangen.push({
        methode: anfrage.method ?? '',
        koepfe: anfrage.headers,
        rumpf,
      });

      if (anfrage.url === '/kaputt') {
        antwort.writeHead(500).end();

        return;
      }

      antwort
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ kunde: { nummer: 'K-4711' } }));
    });
  });
  await new Promise<void>((fertig) => server.listen(0, '127.0.0.1', fertig));
  serverUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

afterAll(async () => {
  service.onModuleDestroy();
  await new Promise((fertig) => server.close(fertig));
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query('TRUNCATE TABLE workspaces, users CASCADE');
  gesendet.length = 0;
  empfangen = [];
  darfSchreiben = true;
  sichtfeld = {
    ich: null,
    arten: { company: 'alle', contact: 'alle', deal: 'alle' },
    felder: {},
  };

  const workspaces = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Vertrieb', slug: 'v' }))
  ).id;
  anna = await nutzer('anna@example.de');
  ben = await nutzer('ben@example.de');

  for (const userId of [anna, ben]) {
    await dataSource.getRepository(MembershipEntity).save({
      userId,
      workspaceId,
      role: MembershipRole.MEMBER,
    });
  }
});

const kontakt = (
  email: string,
  ownerId: string | null = anna,
  lastName = 'Kunde',
) =>
  dataSource.getRepository(ContactEntity).save(
    dataSource.getRepository(ContactEntity).create({
      workspaceId,
      firstName: 'Karla',
      lastName,
      email,
      ownerId,
    }),
  );

const geschaeft = (name: string, ownerId: string | null = anna) =>
  dataSource.getRepository(DealEntity).save(
    dataSource.getRepository(DealEntity).create({
      workspaceId,
      name,
      stage: DealStage.LEAD,
      ownerId,
    }),
  );

describe('Knopf am Datensatz mit mehreren Schritten', () => {
  it('sucht, legt an und reicht Werte von Schritt zu Schritt weiter', async () => {
    const karla = await kontakt('karla@kunde.de');
    const regel = await service.create(workspaceId, anna, {
      name: 'Nachfassen',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal',
      aktion: AutomationAktion.DATENSAETZE_SUCHEN,
      suchArt: 'contact',
      suchFeld: 'std:email',
      suchVergleich: Op.EQUALS,
      suchWert: 'karla@kunde.de',
      weitereSchritte: [
        {
          aktion: AutomationAktion.AUFGABE_ANLEGEN,
          titel: 'Anrufen: {{schritt1.erster.name}} wegen {{ausloeser.name}}',
          zielSchritt: 1,
        },
        {
          aktion: AutomationAktion.TERMIN_ANLEGEN,
          titel: 'Termin mit {{schritt1.erster.name}}',
          terminInTagen: 2,
          terminUhrzeit: '10:00',
          terminDauer: 45,
        },
      ],
    });
    const deal = await geschaeft('Dachsanierung', ben);

    const lauf = await service.manuellStarten(workspaceId, regel.id, deal.id);

    expect(lauf.status).toBe(AusfuehrungStatus.OK);
    expect(lauf.schritte?.map((s) => s.status)).toEqual([
      AusfuehrungStatus.OK,
      AusfuehrungStatus.OK,
      AusfuehrungStatus.OK,
    ]);

    const [aufgabe] = await dataSource.getRepository(TaskEntity).find();

    expect(aufgabe).toMatchObject({
      title: 'Anrufen: Karla Kunde wegen Dachsanierung',
      contactId: karla.id,
      assigneeId: anna,
    });

    const [termin] = await dataSource.getRepository(AppointmentEntity).find();

    expect(termin).toMatchObject({
      title: 'Termin mit Karla Kunde',
      dealId: deal.id,
      ownerId: ben,
    });
    expect(termin.endsAt.getTime() - termin.startsAt.getTime()).toBe(
      45 * 60_000,
    );
  });

  it('bricht ab, wenn ein Schritt nichts findet, und sagt welcher', async () => {
    const regel = await service.create(workspaceId, anna, {
      name: 'Nachfassen',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal',
      aktion: AutomationAktion.DATENSAETZE_SUCHEN,
      suchArt: 'contact',
      suchFeld: 'std:email',
      suchWert: 'niemand@nirgends.de',
      weitereSchritte: [
        {
          aktion: AutomationAktion.NOTIZ_ANLEGEN,
          titel: 'Gefunden',
          zielSchritt: 1,
        },
      ],
    });
    const deal = await geschaeft('Auftrag');

    const lauf = await service.manuellStarten(workspaceId, regel.id, deal.id);

    expect(lauf.status).toBe(AusfuehrungStatus.UEBERSPRUNGEN);
    expect(lauf.grund).toBe(
      'Schritt 2: Schritt 1 hat keinen Datensatz ergeben.',
    );
    expect(await dataSource.getRepository(NoteEntity).count()).toBe(0);
  });

  it('nimmt Knöpfe nur für die gewählte Art und verlangt eine Art', async () => {
    await expect(
      service.create(workspaceId, anna, {
        name: 'Ohne Art',
        ausloeser: AutomationAusloeser.MANUELL,
        aktion: AutomationAktion.NOTIZ_ANLEGEN,
        titel: 'x',
      }),
    ).rejects.toThrow('an welcher Art Datensatz');

    await service.create(workspaceId, anna, {
      name: 'Für Geschäfte',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal',
      aktion: AutomationAktion.NOTIZ_ANLEGEN,
      titel: 'x',
    });

    expect(await service.manuelleFuer(workspaceId, 'deal')).toHaveLength(1);
    expect(await service.manuelleFuer(workspaceId, 'contact')).toHaveLength(0);
  });

  it('verlangt beim Ziel einen früheren Schritt, der einen Datensatz ergibt', async () => {
    await expect(
      service.create(workspaceId, anna, {
        name: 'Falsch',
        ausloeser: AutomationAusloeser.WEBHOOK_EINGANG,
        aktion: AutomationAktion.HTTP_ANFRAGE,
        httpUrl: 'https://example.org/haken',
        weitereSchritte: [
          {
            aktion: AutomationAktion.NOTIZ_ANLEGEN,
            titel: 'x',
            zielSchritt: 1,
          },
        ],
      }),
    ).rejects.toThrow('ergibt keinen Datensatz');
    await expect(
      service.create(workspaceId, anna, {
        name: 'Ohne Datensatz',
        ausloeser: AutomationAusloeser.WEBHOOK_EINGANG,
        aktion: AutomationAktion.NOTIZ_ANLEGEN,
        titel: 'x',
        zielSchritt: 1,
      }),
    ).rejects.toThrow('früheren Schritt');
  });
});

describe('Zeilen- und Feldrechte des Erstellers', () => {
  it('findet nur, was der Ersteller sehen darf', async () => {
    await kontakt('fremd@kunde.de', ben);
    sichtfeld = {
      ich: anna,
      arten: { company: 'alle', contact: 'eigene', deal: 'alle' },
      felder: {},
    };

    const regel = await service.create(workspaceId, anna, {
      name: 'Suche',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal',
      aktion: AutomationAktion.DATENSAETZE_SUCHEN,
      suchArt: 'contact',
      suchFeld: 'std:email',
      suchWert: 'fremd@kunde.de',
    });
    const deal = await geschaeft('Auftrag');

    const lauf = await service.manuellStarten(workspaceId, regel.id, deal.id);

    expect(
      JSON.parse(JSON.stringify(lauf.schritte?.[0].ausgabe)),
    ).toMatchObject({ anzahl: 0 });
  });

  it('gibt verborgene Felder des Auslösers nicht weiter', async () => {
    sichtfeld = {
      ich: null,
      arten: { company: 'alle', contact: 'alle', deal: 'alle' },
      felder: { 'deal.amount': 'verborgen' },
    };

    const regel = await service.create(workspaceId, anna, {
      name: 'Betrag',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal',
      aktion: AutomationAktion.NOTIZ_ANLEGEN,
      titel: 'Betrag: [{{ausloeser.amount}}] Name: {{ausloeser.name}}',
    });
    const deal = await geschaeft('Geheim');

    await dataSource
      .getRepository(DealEntity)
      .update({ id: deal.id }, { amount: 99_000 });
    await service.manuellStarten(workspaceId, regel.id, deal.id);

    const [notiz] = await dataSource.getRepository(NoteEntity).find();

    expect(notiz.body).toBe('Betrag: [] Name: Geheim');
  });

  it('legt nichts an, wenn der Ersteller die Art nicht schreiben darf', async () => {
    darfSchreiben = false;

    const regel = await service.create(workspaceId, anna, {
      name: 'Anlegen',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal',
      aktion: AutomationAktion.ANLEGEN_ODER_AKTUALISIEREN,
      upsertArt: 'contact',
      upsertWerte: [{ feld: 'email', wert: 'neu@kunde.de' }],
    });
    const deal = await geschaeft('Auftrag');

    const lauf = await service.manuellStarten(workspaceId, regel.id, deal.id);

    expect(lauf.status).toBe(AusfuehrungStatus.UEBERSPRUNGEN);
    expect(await dataSource.getRepository(ContactEntity).count()).toBe(0);
  });
});

describe('Eingang von außen', () => {
  const eingangsRegel = async (mitSignatur = false) => {
    const regel = await service.create(workspaceId, anna, {
      name: 'Shop',
      ausloeser: AutomationAusloeser.WEBHOOK_EINGANG,
      aktion: AutomationAktion.ANLEGEN_ODER_AKTUALISIEREN,
      upsertArt: 'contact',
      upsertWerte: [
        { feld: 'email', wert: '{{ausloeser.kunde.email}}' },
        { feld: 'lastName', wert: '{{ausloeser.kunde.name}}' },
      ],
      weitereSchritte: [
        {
          aktion: AutomationAktion.AUFGABE_ANLEGEN,
          titel: 'Bestellung {{ausloeser.bestellung}} prüfen',
          zielSchritt: 1,
        },
      ],
    });
    const { url, geheimnis } = await service.eingangErneuern(
      workspaceId,
      regel.id,
      mitSignatur,
    );

    return { regel, token: url.split('/').pop() as string, geheimnis };
  };

  const json = (wert: unknown) => Buffer.from(JSON.stringify(wert));

  it('legt einen Kontakt an und beim zweiten Mal ergänzt er ihn', async () => {
    const { token } = await eingangsRegel();
    const rumpf = json({
      bestellung: 'B-17',
      kunde: { email: 'Neu@Kunde.de', name: 'Neumann' },
    });

    await (await service.eingang(token, rumpf, {})).lauf();
    await (
      await service.eingang(
        token,
        json({
          bestellung: 'B-18',
          kunde: { email: 'neu@kunde.de', name: 'Neumann-Schulz' },
        }),
        {},
      )
    ).lauf();

    const kontakte = await dataSource.getRepository(ContactEntity).find();

    expect(kontakte).toHaveLength(1);
    expect(kontakte[0]).toMatchObject({
      email: 'neu@kunde.de',
      lastName: 'Neumann-Schulz',
      herkunft: 'automation',
    });

    const aufgaben = await dataSource
      .getRepository(TaskEntity)
      .find({ order: { title: 'ASC' } });

    expect(aufgaben.map((a) => a.title)).toEqual([
      'Bestellung B-17 prüfen',
      'Bestellung B-18 prüfen',
    ]);
    expect(aufgaben.every((a) => a.contactId === kontakte[0].id)).toBe(true);
  });

  it('antwortet auf unbekannte Adressen wie auf abgeschaltete', async () => {
    const { regel, token } = await eingangsRegel();

    await expect(
      service.eingang('x'.repeat(43), undefined, {}),
    ).rejects.toThrow(NotFoundException);
    await service.setAktiv(workspaceId, regel.id, false);
    await expect(service.eingang(token, undefined, {})).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lehnt kein Objekt, zu Großes und zu tiefe Verschachtelung ab', async () => {
    const { token } = await eingangsRegel();

    await expect(service.eingang(token, json([1, 2]), {})).rejects.toThrow(
      'JSON-Objekt',
    );
    await expect(
      service.eingang(token, Buffer.alloc(70 * 1024, 32), {}),
    ).rejects.toThrow('zu groß');
    await expect(
      service.eingang(token, json({}), { [TIEFE_KOPF]: '3' }),
    ).rejects.toThrow('gegenseitig');
  });

  it('prüft die Signatur, wenn eine verlangt ist', async () => {
    const { token, geheimnis } = await eingangsRegel(true);
    const rumpf = json({ bestellung: 'B-1', kunde: { email: 'a@b.de' } });
    const jetzt = String(Math.floor(Date.now() / 1000));

    await expect(service.eingang(token, rumpf, {})).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      service.eingang(token, rumpf, {
        'x-stegwerk-zeitstempel': jetzt,
        'x-stegwerk-signatur': webhookSignatur(
          'falsch',
          jetzt,
          rumpf.toString(),
        ),
      }),
    ).rejects.toThrow(NotFoundException);

    const gut = await service.eingang(token, rumpf, {
      'x-stegwerk-zeitstempel': jetzt,
      'x-stegwerk-signatur': webhookSignatur(
        geheimnis as string,
        jetzt,
        rumpf.toString(),
      ),
    });

    expect(await gut.lauf()).not.toBeNull();
  });

  it('macht die alte Adresse ungültig, wenn eine neue erzeugt wird', async () => {
    const { regel, token } = await eingangsRegel();

    await service.eingangErneuern(workspaceId, regel.id, false);
    await expect(service.eingang(token, undefined, {})).rejects.toThrow(
      NotFoundException,
    );
  });

  it('bremst eine Regel, die sich zu oft aufrufen lässt', async () => {
    const { regel, token } = await eingangsRegel();

    await dataSource.query(
      `INSERT INTO "automation_ausfuehrungen" ("workspaceId", "automationId", "zielArt", "status", "faelligAm")
       SELECT $1, $2, 'keins', 'OK', now() FROM generate_series(1, $3)`,
      [workspaceId, regel.id, MAX_LAEUFE_JE_MINUTE],
    );

    expect(
      await (
        await service.eingang(token, json({ kunde: { email: 'x@y.de' } }), {})
      ).lauf(),
    ).toBeNull();
    expect(await dataSource.getRepository(ContactEntity).count()).toBe(0);
  });
});

describe('HTTP-Anfrage', () => {
  it('schickt die Anfrage mit Kopf, und die Antwort steht dem nächsten Schritt zur Verfügung', async () => {
    const regel = await service.create(workspaceId, anna, {
      name: 'ERP',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal',
      aktion: AutomationAktion.HTTP_ANFRAGE,
      httpMethode: 'POST',
      httpUrl: `${serverUrl}/kunden`,
      httpHeader: [{ name: 'Authorization', wert: 'Bearer geheim-123' }],
      httpRumpf: '{"name":"{{ausloeser.name}}"}',
      weitereSchritte: [
        {
          aktion: AutomationAktion.NOTIZ_ANLEGEN,
          titel: 'Im ERP: {{schritt1.json.kunde.nummer}}',
        },
      ],
    });
    const deal = await geschaeft('Dach');

    const lauf = await service.manuellStarten(workspaceId, regel.id, deal.id);

    expect(lauf.status).toBe(AusfuehrungStatus.OK);
    expect(empfangen).toHaveLength(1);
    expect(empfangen[0]).toMatchObject({
      methode: 'POST',
      rumpf: '{"name":"Dach"}',
    });
    expect(empfangen[0].koepfe.authorization).toBe('Bearer geheim-123');
    expect(empfangen[0].koepfe[TIEFE_KOPF]).toBe('1');

    const [notiz] = await dataSource.getRepository(NoteEntity).find();

    expect(notiz.body).toBe('Im ERP: K-4711');
    expect(JSON.stringify(lauf.schritte)).not.toContain('geheim-123');
    expect(
      JSON.stringify(
        await dataSource.query(`SELECT "aktionDaten" FROM "automationen"`),
      ),
    ).not.toContain('geheim-123');
  });

  it('behält beim Ändern den gespeicherten Kopf, wenn kein neuer Wert kommt', async () => {
    const eingabe = {
      name: 'ERP',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal' as const,
      aktion: AutomationAktion.HTTP_ANFRAGE,
      httpUrl: `${serverUrl}/kunden`,
      httpHeader: [{ name: 'Authorization', wert: 'Bearer alt' }],
    };
    const regel = await service.create(workspaceId, anna, eingabe);

    await service.update(
      workspaceId,
      regel.id,
      {
        ...eingabe,
        httpHeader: [{ name: 'Authorization', wert: '' }],
      },
      anna,
    );
    await service.manuellStarten(
      workspaceId,
      regel.id,
      (await geschaeft('X')).id,
    );

    expect(empfangen[0].koepfe.authorization).toBe('Bearer alt');
  });

  it('schickt einen gespeicherten Kopf nie an eine geänderte Gegenstelle', async () => {
    const eingabe = {
      name: 'ERP',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal' as const,
      aktion: AutomationAktion.HTTP_ANFRAGE,
      httpUrl: `${serverUrl}/kunden`,
      httpHeader: [{ name: 'Authorization', wert: 'Bearer alt' }],
    };
    const regel = await service.create(workspaceId, anna, eingabe);

    await expect(
      service.update(
        workspaceId,
        regel.id,
        {
          ...eingabe,
          httpUrl: `${serverUrl}/andere`,
          httpHeader: [{ name: 'Authorization', wert: '' }],
        },
        anna,
      ),
    ).resolves.toBeDefined();

    await expect(
      service.update(
        workspaceId,
        regel.id,
        {
          ...eingabe,
          httpUrl: 'https://fremd.example.com/sammeln',
          httpHeader: [{ name: 'Authorization', wert: '' }],
        },
        anna,
      ),
    ).rejects.toThrow('Die Adresse hat sich geändert');

    await expect(
      service.update(
        workspaceId,
        regel.id,
        {
          ...eingabe,
          httpHeader: [{ name: 'X-Neu', wert: '' }],
        },
        anna,
      ),
    ).rejects.toThrow('Bitte einen Wert für den Kopf „X-Neu“ angeben.');
  });

  it('läuft nach einer Änderung mit den Rechten dessen, der geändert hat', async () => {
    const regel = await service.create(workspaceId, anna, {
      name: 'Notiz',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal',
      aktion: AutomationAktion.NOTIZ_ANLEGEN,
      titel: 'Hallo',
    });

    await service.update(
      workspaceId,
      regel.id,
      {
        name: 'Notiz neu',
        ausloeser: AutomationAusloeser.MANUELL,
        art: 'deal',
        aktion: AutomationAktion.NOTIZ_ANLEGEN,
        titel: 'Hallo neu',
      },
      ben,
    );

    const gespeichert = await dataSource
      .getRepository(AutomationEntity)
      .findOneByOrFail({ id: regel.id });

    expect(gespeichert).toMatchObject({ name: 'Notiz neu', erstelltVon: ben });
  });

  it('meldet eine Fehlerantwort als Fehler des Schritts', async () => {
    const regel = await service.create(workspaceId, anna, {
      name: 'Kaputt',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal',
      aktion: AutomationAktion.HTTP_ANFRAGE,
      httpMethode: 'GET',
      httpUrl: `${serverUrl}/kaputt`,
    });

    const lauf = await service.manuellStarten(
      workspaceId,
      regel.id,
      (await geschaeft('X')).id,
    );

    expect(lauf.status).toBe(AusfuehrungStatus.FEHLER);
    expect(lauf.grund).toContain('500');
  });
});

describe('Probelauf, Wiederholen, Abbrechen', () => {
  it('schreibt und verschickt im Probelauf nichts', async () => {
    const regel = await service.create(workspaceId, anna, {
      name: 'Alles',
      ausloeser: AutomationAusloeser.GESCHAEFT_ANGELEGT,
      aktion: AutomationAktion.AUFGABE_ANLEGEN,
      titel: 'Aufgabe für {{ausloeser.name}}',
      weitereSchritte: [
        { aktion: AutomationAktion.MAIL_SENDEN, titel: 'Hallo' },
        {
          aktion: AutomationAktion.HTTP_ANFRAGE,
          httpUrl: `${serverUrl}/kunden`,
        },
        {
          aktion: AutomationAktion.ANLEGEN_ODER_AKTUALISIEREN,
          upsertArt: 'contact',
          upsertWerte: [{ feld: 'email', wert: 'probe@kunde.de' }],
        },
      ],
    });
    const deal = await geschaeft('Probe', ben);

    const lauf = await service.testen(workspaceId, regel.id, null, null, {
      userId: anna,
      workspaceId,
      email: '',
    });

    expect(lauf).toMatchObject({
      testlauf: true,
      status: AusfuehrungStatus.OK,
      zielId: deal.id,
    });
    expect(lauf.schritte?.[0].ausgabe).toMatchObject({
      simuliert: true,
      titel: 'Aufgabe für Probe',
    });
    expect(await dataSource.getRepository(TaskEntity).count()).toBe(0);
    expect(await dataSource.getRepository(ContactEntity).count()).toBe(0);
    expect(gesendet).toHaveLength(0);
    expect(empfangen).toHaveLength(0);
  });

  it('wiederholt einen übersprungenen Lauf und bricht einen geplanten ab', async () => {
    const regel = await service.create(workspaceId, anna, {
      name: 'Mail',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal',
      aktion: AutomationAktion.MAIL_SENDEN,
      titel: 'Bitte ansehen',
    });
    const deal = await geschaeft('Ohne', null);

    const erster = await service.manuellStarten(workspaceId, regel.id, deal.id);

    expect(erster.status).toBe(AusfuehrungStatus.UEBERSPRUNGEN);

    await dataSource
      .getRepository(DealEntity)
      .update({ id: deal.id }, { ownerId: ben });

    const zweiter = await service.wiederholen(workspaceId, erster.id);

    expect(zweiter.status).toBe(AusfuehrungStatus.OK);
    expect(gesendet).toHaveLength(1);
    await expect(service.wiederholen(workspaceId, zweiter.id)).rejects.toThrow(
      'nicht durchging',
    );

    const verzoegert = await service.create(workspaceId, anna, {
      name: 'Später',
      ausloeser: AutomationAusloeser.GESCHAEFT_ANGELEGT,
      verzoegerungTage: 3,
      aktion: AutomationAktion.NOTIZ_ANLEGEN,
      titel: 'Später',
    });
    const neu = await geschaeft('Neu');

    await service.verarbeite({
      workspaceId,
      event: 'deal.created',
      data: { id: neu.id },
    });

    const [geplant] = await dataSource
      .getRepository(AutomationAusfuehrungEntity)
      .find({ where: { automationId: verzoegert.id } });

    expect(geplant.status).toBe(AusfuehrungStatus.GEPLANT);
    await service.abbrechen(workspaceId, geplant.id);
    await expect(service.abbrechen(workspaceId, geplant.id)).rejects.toThrow(
      'noch wartet',
    );
    expect(
      await service.fuehreFaelligeAus(new Date(Date.now() + 10 * 86_400_000)),
    ).toBe(0);
    expect(await dataSource.getRepository(NoteEntity).count()).toBe(0);
  });
});

describe('Zeitplan', () => {
  it('läuft zur Zeit für alle passenden Datensätze, und nur einmal', async () => {
    const deals = dataSource.getRepository(DealEntity);

    for (const [name, amount] of [
      ['Offen A', 5000],
      ['Offen B', 8000],
      ['Klein', 10],
    ] as const) {
      await deals.update({ id: (await geschaeft(name)).id }, { amount });
    }

    const regel = await service.create(workspaceId, anna, {
      name: 'Montags',
      ausloeser: AutomationAusloeser.ZEITPLAN,
      art: 'deal',
      zeitplan: {
        rhythmus: AutomationRhythmus.TAEGLICH,
        uhrzeit: '08:00',
      },
      bedingungen: [
        { key: 'std:amount', operator: Op.GREATER_THAN, value: '1000' },
      ],
      aktion: AutomationAktion.NOTIZ_ANLEGEN,
      titel: 'Wochenblick: {{ausloeser.name}}',
    });

    expect(regel.naechsterLauf).not.toBeNull();

    const spaeter = new Date((regel.naechsterLauf as Date).getTime() + 60_000);

    expect(await service.pruefeZeitplaene(spaeter)).toBe(2);
    expect(await service.pruefeZeitplaene(spaeter)).toBe(0);

    const notizen = await dataSource
      .getRepository(NoteEntity)
      .find({ order: { body: 'ASC' } });

    expect(notizen.map((n) => n.body)).toEqual([
      'Wochenblick: Offen A',
      'Wochenblick: Offen B',
    ]);

    const neu = await dataSource
      .getRepository(AutomationEntity)
      .findOneByOrFail({ id: regel.id });

    expect((neu.naechsterLauf as Date).getTime()).toBeGreaterThan(
      spaeter.getTime(),
    );
  });

  it('lehnt einen Zeitplan ohne Uhrzeit ab', async () => {
    await expect(
      service.create(workspaceId, anna, {
        name: 'Kaputt',
        ausloeser: AutomationAusloeser.ZEITPLAN,
        zeitplan: {
          rhythmus: AutomationRhythmus.WOECHENTLICH,
          uhrzeit: '08:00',
        },
        aktion: AutomationAktion.HTTP_ANFRAGE,
        httpUrl: 'https://example.org/x',
      }),
    ).rejects.toThrow('Wochentag');
  });
});

describe('Rechte des Erstellers zur Laufzeit', () => {
  const zeitplanRegel = (
    titel: string,
    bedingungen: { key: string; operator: Op; value?: string }[] = [],
  ) =>
    service.create(workspaceId, anna, {
      name: 'Täglich',
      ausloeser: AutomationAusloeser.ZEITPLAN,
      art: 'deal',
      zeitplan: { rhythmus: AutomationRhythmus.TAEGLICH, uhrzeit: '08:00' },
      bedingungen,
      aktion: AutomationAktion.NOTIZ_ANLEGEN,
      titel,
    });

  const faellig = (regel: AutomationEntity) =>
    new Date((regel.naechsterLauf as Date).getTime() + 60_000);

  it('liest und schickt kein fremdes Geschäft, das der Ersteller nicht sieht', async () => {
    sichtfeld = {
      ich: anna,
      arten: { company: 'alle', contact: 'alle', deal: 'eigene' },
      felder: {},
    };

    await service.create(workspaceId, anna, {
      name: 'Hinaus',
      ausloeser: AutomationAusloeser.GESCHAEFT_ANGELEGT,
      aktion: AutomationAktion.HTTP_ANFRAGE,
      httpUrl: `${serverUrl}/haken`,
      httpRumpf: '{"name":"{{ausloeser.name}}"}',
    });

    const fremd = await geschaeft('Geheim von Ben', ben);

    await service.verarbeite({
      workspaceId,
      event: 'deal.created',
      data: { id: fremd.id },
    });

    expect(empfangen).toHaveLength(0);
    expect(
      JSON.stringify(
        await dataSource.getRepository(AutomationAusfuehrungEntity).find(),
      ),
    ).not.toContain('Geheim von Ben');

    const eigenes = await geschaeft('Annas', anna);

    await service.verarbeite({
      workspaceId,
      event: 'deal.created',
      data: { id: eigenes.id },
    });

    expect(empfangen.map((e) => e.rumpf)).toEqual(['{"name":"Annas"}']);
  });

  it('arbeitet per Knopf nicht an einem Geschäft, das der Ersteller nicht sieht', async () => {
    sichtfeld = {
      ich: anna,
      arten: { company: 'alle', contact: 'alle', deal: 'eigene' },
      felder: {},
    };

    const regel = await service.create(workspaceId, anna, {
      name: 'Notiz',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal',
      aktion: AutomationAktion.NOTIZ_ANLEGEN,
      titel: '{{ausloeser.name}}',
    });
    const fremd = await geschaeft('Bens', ben);

    const lauf = await service.manuellStarten(workspaceId, regel.id, fremd.id);

    expect(lauf.status).toBe(AusfuehrungStatus.UEBERSPRUNGEN);
    expect(lauf.grund).toContain('nicht sichtbar');
    expect(await dataSource.getRepository(NoteEntity).count()).toBe(0);
  });

  it('lässt die Regel eines Ausgeschiedenen nicht mehr laufen', async () => {
    const regel = await zeitplanRegel('Blick: {{ausloeser.name}}');
    const knopf = await service.create(workspaceId, anna, {
      name: 'Knopf',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal',
      aktion: AutomationAktion.NOTIZ_ANLEGEN,
      titel: '{{ausloeser.name}}',
    });
    const deal = await geschaeft('Irgendeins', ben);

    await dataSource
      .getRepository(MembershipEntity)
      .delete({ userId: anna, workspaceId });

    expect(await service.pruefeZeitplaene(faellig(regel))).toBe(0);

    const lauf = await service.manuellStarten(workspaceId, knopf.id, deal.id);

    expect(lauf.status).toBe(AusfuehrungStatus.UEBERSPRUNGEN);
    expect(lauf.grund).toContain('nicht mehr im Team');
    expect(await dataSource.getRepository(NoteEntity).count()).toBe(0);

    const protokoll = await service.protokoll(workspaceId, regel.id);

    expect(protokoll.map((p) => p.grund)).toEqual([
      expect.stringContaining('nicht mehr im Team'),
    ]);
  });

  it('lehnt eine Bedingung auf ein verborgenes Feld ab und prüft sie nicht', async () => {
    const knopf = await service.create(workspaceId, anna, {
      name: 'Groß',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal',
      bedingungen: [
        { key: 'std:amount', operator: Op.GREATER_THAN, value: '50000' },
      ],
      aktion: AutomationAktion.NOTIZ_ANLEGEN,
      titel: 'Groß',
    });
    const regel = await zeitplanRegel('Groß', [
      { key: 'std:amount', operator: Op.GREATER_THAN, value: '50000' },
    ]);
    const deal = await geschaeft('Riesig');

    await dataSource
      .getRepository(DealEntity)
      .update({ id: deal.id }, { amount: 99_000 });

    sichtfeld = {
      ich: null,
      arten: { company: 'alle', contact: 'alle', deal: 'alle' },
      felder: { 'deal.amount': 'verborgen' },
    };

    await expect(
      service.create(workspaceId, anna, {
        name: 'Orakel',
        ausloeser: AutomationAusloeser.MANUELL,
        art: 'deal',
        bedingungen: [
          { key: 'std:amount', operator: Op.GREATER_THAN, value: '50000' },
        ],
        aktion: AutomationAktion.NOTIZ_ANLEGEN,
        titel: 'x',
      }),
    ).rejects.toThrow('kann Ihre Rolle nicht filtern');

    const lauf = await service.manuellStarten(workspaceId, knopf.id, deal.id);

    expect(lauf.status).toBe(AusfuehrungStatus.UEBERSPRUNGEN);
    expect(lauf.grund).toContain('verborgen');
    expect(await service.pruefeZeitplaene(faellig(regel))).toBe(0);
    expect(await dataSource.getRepository(NoteEntity).count()).toBe(0);
  });

  it('setzt kein Feld, das der Ersteller nur lesen oder gar nicht ändern darf', async () => {
    const eingabe = {
      name: 'Wahrscheinlich',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal' as const,
      aktion: AutomationAktion.FELD_SETZEN,
      feldKey: 'std:probability',
      feldWert: '30',
    };
    const regel = await service.create(workspaceId, anna, eingabe);
    const deal = await geschaeft('Auftrag');

    sichtfeld = {
      ich: null,
      arten: { company: 'alle', contact: 'alle', deal: 'alle' },
      felder: { 'deal.probability': 'lesen' },
    };

    await expect(service.create(workspaceId, anna, eingabe)).rejects.toThrow(
      'Dieses Feld dürfen Sie nicht ändern',
    );

    const gelesen = await service.manuellStarten(
      workspaceId,
      regel.id,
      deal.id,
    );

    expect(gelesen.status).toBe(AusfuehrungStatus.UEBERSPRUNGEN);

    sichtfeld = { ...sichtfeld, felder: {} };
    darfSchreiben = false;

    const ohneRecht = await service.manuellStarten(
      workspaceId,
      regel.id,
      deal.id,
    );

    expect(ohneRecht.status).toBe(AusfuehrungStatus.UEBERSPRUNGEN);
    await expect(service.create(workspaceId, anna, eingabe)).rejects.toThrow(
      'Dieses Feld dürfen Sie nicht ändern',
    );
    expect(
      (
        await dataSource
          .getRepository(DealEntity)
          .findOneByOrFail({ id: deal.id })
      ).probability,
    ).toBeNull();
  });

  it('nimmt im Probelauf ohne Datensatz nur einen, den der Aufrufer sieht', async () => {
    const regel = await service.create(workspaceId, anna, {
      name: 'Geändert',
      ausloeser: AutomationAusloeser.GESCHAEFT_GEAENDERT,
      aktion: AutomationAktion.NOTIZ_ANLEGEN,
      titel: '{{ausloeser.name}}',
    });
    const bens = await geschaeft('Bens', ben);

    await geschaeft('Annas neuestes', anna);
    sichtfeld = {
      ich: null,
      arten: { company: 'alle', contact: 'alle', deal: 'eigene' },
      felder: {},
    };

    const lauf = await service.testen(workspaceId, regel.id, null, null, {
      userId: ben,
      workspaceId,
      email: '',
    });

    expect(lauf.zielId).toBe(bens.id);
    expect(JSON.stringify(lauf.schritte)).not.toContain('Annas');
  });
});

describe('Anlegen oder aktualisieren: Beträge', () => {
  it.each([
    ['1234.56', 1234.56],
    ['1.234,56', 1234.56],
    ['1234,56', 1234.56],
    ['1.234.567', 1234567],
    ['12', 12],
    ['1.500', 1500],
    ['12.500', 12500],
    ['1.5', 1.5],
    ['12.50', 12.5],
    ['0.125', 0.125],
    ['1234.567', 1234.567],
    ['1,5', 1.5],
    ['1,234.56', 1234.56],
    ['1,234,567', 1234567],
    ['1.234.567,89', 1234567.89],
  ])('liest „%s“ als %d', (roh, zahl) => {
    expect(betragAus(roh)).toBe(zahl);
  });

  it('übernimmt eine JSON-Zahl mit Dezimalpunkt unverfälscht', async () => {
    const regel = await service.create(workspaceId, anna, {
      name: 'Shop',
      ausloeser: AutomationAusloeser.WEBHOOK_EINGANG,
      aktion: AutomationAktion.ANLEGEN_ODER_AKTUALISIEREN,
      upsertArt: 'deal',
      upsertWerte: [
        { feld: 'name', wert: '{{ausloeser.name}}' },
        { feld: 'amount', wert: '{{ausloeser.summe}}' },
      ],
    });
    const { url } = await service.eingangErneuern(workspaceId, regel.id, false);

    await (
      await service.eingang(
        url.split('/').pop() as string,
        Buffer.from(JSON.stringify({ name: 'Bestellung', summe: 1234.56 })),
        {},
      )
    ).lauf();

    const [deal] = await dataSource.getRepository(DealEntity).find();

    expect(Number(deal.amount)).toBe(1234.56);
  });
});

describe('Anlegen oder aktualisieren: Standardwerte eigener Felder', () => {
  it('setzt sie beim Anlegen, nicht beim Aktualisieren', async () => {
    const felder = new CustomFieldsService(
      dataSource.getRepository(CustomFieldDefinition),
    );

    await felder.create(workspaceId, {
      entity: CustomFieldEntityArt.CONTACT,
      label: 'Quelle',
      type: CustomFieldType.TEXT,
      standardwert: 'Automation',
    });

    const regel = await service.create(workspaceId, anna, {
      name: 'Kontakt',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal',
      aktion: AutomationAktion.ANLEGEN_ODER_AKTUALISIEREN,
      upsertArt: 'contact',
      upsertWerte: [{ feld: 'email', wert: 'neu@kunde.de' }],
    });
    const deal = await geschaeft('Auftrag');
    const alt = await kontakt('alt@kunde.de');

    await service.manuellStarten(workspaceId, regel.id, deal.id);

    const neu = await dataSource
      .getRepository(ContactEntity)
      .findOneByOrFail({ email: 'neu@kunde.de' });

    expect(neu.customFields).toEqual({ quelle: 'Automation' });

    const zweite = await service.create(workspaceId, anna, {
      name: 'Kontakt vorhanden',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal',
      aktion: AutomationAktion.ANLEGEN_ODER_AKTUALISIEREN,
      upsertArt: 'contact',
      upsertWerte: [
        { feld: 'email', wert: 'alt@kunde.de' },
        { feld: 'lastName', wert: 'Neu' },
      ],
    });

    await service.manuellStarten(workspaceId, zweite.id, deal.id);

    const danach = await dataSource
      .getRepository(ContactEntity)
      .findOneByOrFail({ id: alt.id });

    expect(danach.lastName).toBe('Neu');
    expect(danach.customFields).toEqual({});
  });
});

describe('HTTP-Anfrage: feste Gegenstelle', () => {
  it('lehnt eine Variable im Rechner beim Speichern ab', async () => {
    await expect(
      service.create(workspaceId, anna, {
        name: 'Shop',
        ausloeser: AutomationAusloeser.MANUELL,
        art: 'deal',
        aktion: AutomationAktion.HTTP_ANFRAGE,
        httpUrl:
          'https://shop-{{ausloeser.felder.shop}}.myshopify.com/admin/orders.json',
      }),
    ).rejects.toThrow('muss feststehen');
    await expect(
      service.create(workspaceId, anna, {
        name: 'Pfad',
        ausloeser: AutomationAusloeser.MANUELL,
        art: 'deal',
        aktion: AutomationAktion.HTTP_ANFRAGE,
        httpUrl: `${serverUrl}/kunden/{{ausloeser.name}}`,
      }),
    ).resolves.toBeDefined();
    await expect(
      service.create(workspaceId, anna, {
        name: 'Nur Abfrage',
        ausloeser: AutomationAusloeser.MANUELL,
        art: 'deal',
        aktion: AutomationAktion.HTTP_ANFRAGE,
        httpUrl: `${serverUrl}?token={{ausloeser.id}}`,
      }),
    ).resolves.toBeDefined();
    await expect(
      service.create(workspaceId, anna, {
        name: 'Nach Rechner',
        ausloeser: AutomationAusloeser.MANUELL,
        art: 'deal',
        aktion: AutomationAktion.HTTP_ANFRAGE,
        httpUrl: 'https://hooks.example.com{{ausloeser.felder.rest}}',
      }),
    ).rejects.toThrow('muss feststehen');
  });

  it('schickt nichts, wenn eingesetzte Werte den Rechner wechseln', async () => {
    const regel = await service.create(workspaceId, anna, {
      name: 'Alt',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal',
      aktion: AutomationAktion.HTTP_ANFRAGE,
      httpUrl: `${serverUrl}/kunden`,
      httpHeader: [{ name: 'X-Token', wert: 'geheim' }],
    });

    await dataSource.query(
      `UPDATE "automationen" SET "aktionDaten" = jsonb_set("aktionDaten", '{httpUrl}', to_jsonb($1::text)) WHERE "id" = $2`,
      ['http://{{ausloeser.name}}/x', regel.id],
    );

    const deal = await geschaeft(new URL(serverUrl).host);
    const lauf = await service.manuellStarten(workspaceId, regel.id, deal.id);

    expect(lauf.status).toBe(AusfuehrungStatus.UEBERSPRUNGEN);
    expect(lauf.grund).toContain('Gegenstelle');
    expect(empfangen).toHaveLength(0);
  });
});

describe('Eingang: Signatur', () => {
  it('antwortet auf eine Signatur mit Zeichen außerhalb von ASCII mit „nicht gefunden“', async () => {
    const regel = await service.create(workspaceId, anna, {
      name: 'Signiert',
      ausloeser: AutomationAusloeser.WEBHOOK_EINGANG,
      aktion: AutomationAktion.HTTP_ANFRAGE,
      httpUrl: `${serverUrl}/haken`,
    });
    const { url } = await service.eingangErneuern(workspaceId, regel.id, true);

    await expect(
      service.eingang(url.split('/').pop() as string, Buffer.from('{}'), {
        'x-stegwerk-zeitstempel': String(Math.floor(Date.now() / 1000)),
        'x-stegwerk-signatur': `sha256=${'a'.repeat(63)}é`,
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('Mail an den Kontakt als Entwurf zur Freigabe', () => {
  const vorlage = () =>
    dataSource.getRepository(MailTemplateEntity).save(
      dataSource.getRepository(MailTemplateEntity).create({
        workspaceId,
        name: 'Nachfassen',
        subject: 'Ihr Angebot, {{vorname}}',
        body: 'Guten Tag {{vorname}} {{nachname}},\n\nwie gefällt es Ihnen?',
      }),
    );

  it('legt einen Entwurf für den Verantwortlichen an, schickt nichts und meldet ihn der Glocke', async () => {
    const karla = await kontakt('karla@kunde.de', ben);
    const muster = await vorlage();
    const regel = await service.create(workspaceId, anna, {
      name: 'Nachfassen',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'contact',
      aktion: AutomationAktion.MAIL_SENDEN,
      mailAn: AutomationMailAn.HAUPTKONTAKT,
      vorlageId: muster.id,
      mailAlsEntwurf: true,
    });

    const lauf = await service.manuellStarten(workspaceId, regel.id, karla.id);

    expect(lauf.status).toBe(AusfuehrungStatus.OK);

    const entwuerfe = await dataSource.getRepository(MailEntwurfEntity).find();

    expect(entwuerfe).toHaveLength(1);
    expect(entwuerfe[0]).toMatchObject({
      ownerId: ben,
      an: ['karla@kunde.de'],
      betreff: 'Ihr Angebot, Karla',
      quelle: 'automation',
      automationId: regel.id,
      contactId: karla.id,
      status: 'entwurf',
    });
    expect(entwuerfe[0].rumpf).toContain('Guten Tag Karla Kunde');
    expect(lauf.schritte?.[0].ausgabe).toMatchObject({
      entwurfId: entwuerfe[0].id,
    });

    const glocke = (await dataSource.query(
      `SELECT "empfaengerId", "art", "mailEntwurfId" FROM "benachrichtigungen"`,
    )) as Record<string, unknown>[];

    expect(glocke).toEqual([
      {
        empfaengerId: ben,
        art: 'mail_entwurf',
        mailEntwurfId: entwuerfe[0].id,
      },
    ]);
    expect(gesendet).toHaveLength(0);
  });

  it('merkt sich den Schalter und zeigt ihn im Probelauf an, ohne etwas anzulegen', async () => {
    const karla = await kontakt('karla@kunde.de', ben);
    const muster = await vorlage();
    const regel = await service.create(workspaceId, anna, {
      name: 'Nachfassen',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'contact',
      aktion: AutomationAktion.MAIL_SENDEN,
      mailAn: AutomationMailAn.HAUPTKONTAKT,
      vorlageId: muster.id,
      mailAlsEntwurf: true,
    });

    expect(regel.aktionDaten.mailAlsEntwurf).toBe(true);

    const lauf = await service.testen(workspaceId, regel.id, karla.id, null, {
      userId: anna,
      workspaceId,
      email: '',
    });

    expect(lauf.schritte?.[0].ausgabe).toMatchObject({
      simuliert: true,
      entwurf: true,
    });
    expect(await dataSource.getRepository(MailEntwurfEntity).count()).toBe(0);
  });
});

describe('Nachricht an Slack oder Teams', () => {
  it('schickt Slack Text mit Link zur Akte, die Adresse nur verschlüsselt gespeichert', async () => {
    const regel = await service.create(workspaceId, anna, {
      name: 'Vertriebskanal',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal',
      aktion: AutomationAktion.KANAL_NACHRICHT,
      kanalDienst: 'slack',
      kanalUrl: `${serverUrl}/services/T000/B000/geheim-42`,
      kanalText: 'Neues Geschäft: {{ausloeser.name}} <wichtig> & dringend',
      kanalLink: true,
    });
    const deal = await geschaeft('Dach & Fach');

    const lauf = await service.manuellStarten(workspaceId, regel.id, deal.id);

    expect(lauf.status).toBe(AusfuehrungStatus.OK);
    expect(empfangen).toHaveLength(1);

    const rumpf = JSON.parse(empfangen[0].rumpf) as { text: string };

    expect(rumpf.text).toBe(
      `Neues Geschäft: Dach &amp; Fach &lt;wichtig&gt; &amp; dringend\n<https://crm.example.de/geschaefte/${deal.id}|Dach &amp; Fach>`,
    );
    expect(empfangen[0].koepfe['content-type']).toBe('application/json');
    expect(
      JSON.stringify(
        await dataSource.query(`SELECT "aktionDaten" FROM "automationen"`),
      ),
    ).not.toContain('geheim-42');
    expect(JSON.stringify(lauf.schritte)).not.toContain('geheim-42');
    expect(regel.aktionDaten.kanalUrlAnzeige).toBe(
      `http://${new URL(serverUrl).host}/…`,
    );
  });

  it('schickt Teams eine Adaptive Card und behält beim Ändern die Adresse', async () => {
    const eingabe = {
      name: 'Teams',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal' as const,
      aktion: AutomationAktion.KANAL_NACHRICHT,
      kanalDienst: 'teams' as const,
      kanalUrl: `${serverUrl}/workflows/abc`,
      kanalText: 'Gewonnen: {{ausloeser.name}}',
    };
    const regel = await service.create(workspaceId, anna, eingabe);

    await service.update(
      workspaceId,
      regel.id,
      { ...eingabe, kanalUrl: '', kanalText: 'Neu: {{ausloeser.name}}' },
      anna,
    );
    await service.manuellStarten(
      workspaceId,
      regel.id,
      (await geschaeft('Wartung')).id,
    );

    expect(empfangen).toHaveLength(1);

    const karte = JSON.parse(empfangen[0].rumpf) as {
      type: string;
      attachments: {
        contentType: string;
        content: { body: { text: string }[]; actions?: unknown };
      }[];
    };

    expect(karte.type).toBe('message');
    expect(karte.attachments[0].contentType).toBe(
      'application/vnd.microsoft.card.adaptive',
    );
    expect(karte.attachments[0].content.body[0].text).toBe('Neu: Wartung');
    expect(karte.attachments[0].content.actions).toBeUndefined();
  });

  it('lehnt Adressen ab, die nicht zum Dienst gehören, und verlangt beim Wechsel eine neue', async () => {
    await expect(
      service.create(workspaceId, anna, {
        name: 'Falsch',
        ausloeser: AutomationAusloeser.MANUELL,
        art: 'deal',
        aktion: AutomationAktion.KANAL_NACHRICHT,
        kanalDienst: 'slack',
        kanalUrl: 'https://boese.example/services/x',
        kanalText: 'Hallo',
      }),
    ).rejects.toThrow('hooks.slack.com');

    const eingabe = {
      name: 'Wechsel',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal' as const,
      aktion: AutomationAktion.KANAL_NACHRICHT,
      kanalDienst: 'slack' as const,
      kanalUrl: `${serverUrl}/services/a`,
      kanalText: 'Hallo',
    };
    const regel = await service.create(workspaceId, anna, eingabe);

    await expect(
      service.update(
        workspaceId,
        regel.id,
        { ...eingabe, kanalDienst: 'teams', kanalUrl: '' },
        anna,
      ),
    ).rejects.toThrow('Webhook-Adresse');
  });

  it('schickt im Probelauf nichts und zeigt den Rumpf', async () => {
    const regel = await service.create(workspaceId, anna, {
      name: 'Probe',
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal',
      aktion: AutomationAktion.KANAL_NACHRICHT,
      kanalDienst: 'slack',
      kanalUrl: `${serverUrl}/services/probe`,
      kanalText: 'Probe {{ausloeser.name}}',
    });
    const deal = await geschaeft('Garage');

    const lauf = await service.testen(workspaceId, regel.id, deal.id, null, {
      userId: anna,
      workspaceId,
      email: '',
    });

    expect(lauf.schritte?.[0].ausgabe).toMatchObject({
      simuliert: true,
      dienst: 'slack',
      rumpf: { text: 'Probe Garage' },
    });
    expect(empfangen).toHaveLength(0);
  });
});

describe('Freigaben: „lesen“ macht sichtbar, nicht schreibbar (sichtbarkeit.ts, Regel 5 und 9)', () => {
  const freigeben = async (
    art: 'deal' | 'contact',
    datensatzId: string,
    stufe: 'lesen' | 'bearbeiten',
  ) => {
    await dataSource.getRepository(FreigabeEntity).save({
      workspaceId,
      art,
      datensatzId,
      userId: anna,
      stufe,
    });
    sichtfeld = {
      ich: anna,
      arten: { company: 'alle', contact: 'eigene', deal: 'eigene' },
      felder: {},
      freigaben: { [art]: new Map([[datensatzId, stufe]]) },
    };
  };

  const knopf = (
    aktion: AutomationAktion,
    weiteres: Record<string, unknown> = {},
  ) =>
    service.create(workspaceId, anna, {
      name: aktion,
      ausloeser: AutomationAusloeser.MANUELL,
      art: 'deal',
      aktion,
      titel: 'Von der Regel',
      ...weiteres,
    });

  it('legt nichts an einem nur lesbaren Geschäft an und ändert kein Feld', async () => {
    const deal = await geschaeft('Bens Auftrag', ben);

    await freigeben('deal', deal.id, 'lesen');

    const regeln = [
      await knopf(AutomationAktion.NOTIZ_ANLEGEN),
      await knopf(AutomationAktion.AUFGABE_ANLEGEN),
      await knopf(AutomationAktion.TERMIN_ANLEGEN),
      await knopf(AutomationAktion.FELD_SETZEN, {
        feldKey: 'std:probability',
        feldWert: '30',
      }),
      await knopf(AutomationAktion.VERANTWORTLICH_REIHUM, {
        reihumUserIds: [anna],
      }),
    ];

    for (const regel of regeln) {
      const lauf = await service.manuellStarten(workspaceId, regel.id, deal.id);

      expect([lauf.status, lauf.grund]).toEqual([
        AusfuehrungStatus.UEBERSPRUNGEN,
        expect.stringContaining('nur zum Lesen freigegeben'),
      ]);
    }

    expect(await dataSource.getRepository(NoteEntity).count()).toBe(0);
    expect(await dataSource.getRepository(TaskEntity).count()).toBe(0);
    expect(await dataSource.getRepository(AppointmentEntity).count()).toBe(0);

    const danach = await dataSource
      .getRepository(DealEntity)
      .findOneByOrFail({ id: deal.id });

    expect([danach.probability, danach.ownerId]).toEqual([null, ben]);

    const probe = await service.testen(
      workspaceId,
      regeln[0].id,
      deal.id,
      null,
      {
        userId: anna,
        workspaceId,
        email: '',
      },
    );

    expect(probe.grund).toContain('nur zum Lesen freigegeben');
  });

  it('ergänzt keinen nur lesbaren Kontakt über „Anlegen oder aktualisieren“', async () => {
    const eigenes = await geschaeft('Annas Auftrag', anna);
    const karla = await kontakt('karla@kunde.de', ben);

    await freigeben('contact', karla.id, 'lesen');

    const regel = await knopf(AutomationAktion.ANLEGEN_ODER_AKTUALISIEREN, {
      upsertArt: 'contact',
      upsertWerte: [
        { feld: 'email', wert: 'karla@kunde.de' },
        { feld: 'lastName', wert: 'Überschrieben' },
      ],
    });

    const lauf = await service.manuellStarten(
      workspaceId,
      regel.id,
      eigenes.id,
    );

    expect(lauf.grund).toContain('nur zum Lesen freigegeben');
    expect(
      (
        await dataSource
          .getRepository(ContactEntity)
          .findOneByOrFail({ id: karla.id })
      ).lastName,
    ).toBe('Kunde');
  });

  it('mit „bearbeiten“: Notiz und Feld ja, den Verantwortlichen nicht', async () => {
    const deal = await geschaeft('Bens Auftrag', ben);

    await freigeben('deal', deal.id, 'bearbeiten');

    const notiz = await service.manuellStarten(
      workspaceId,
      (await knopf(AutomationAktion.NOTIZ_ANLEGEN)).id,
      deal.id,
    );

    expect(notiz.status).toBe(AusfuehrungStatus.OK);
    expect(await dataSource.getRepository(NoteEntity).count()).toBe(1);

    for (const regel of [
      await knopf(AutomationAktion.FELD_SETZEN, {
        feldKey: 'std:ownerId',
        feldWert: anna,
      }),
      await knopf(AutomationAktion.VERANTWORTLICH_REIHUM, {
        reihumUserIds: [anna],
      }),
    ]) {
      const lauf = await service.manuellStarten(workspaceId, regel.id, deal.id);

      expect([lauf.status, lauf.grund]).toEqual([
        AusfuehrungStatus.UEBERSPRUNGEN,
        expect.stringContaining('Den Verantwortlichen ändert eine Regel nur'),
      ]);
    }

    expect(
      (
        await dataSource
          .getRepository(DealEntity)
          .findOneByOrFail({ id: deal.id })
      ).ownerId,
    ).toBe(ben);
  });

  it('der Knopf fragt, ob der Anrufer schreiben darf', async () => {
    const lesbar = await geschaeft('Nur lesbar', ben);
    const eigenes = await geschaeft('Eigenes', anna);

    await freigeben('deal', lesbar.id, 'lesen');

    const fuerAnna = (id: string) =>
      runWithRequestContext({ requestId: 'test', userId: anna }, () => {
        setzeSichtfeld(() => Promise.resolve(sichtfeld));

        return service.schreibbarFuerAnrufer(workspaceId, 'deal', id);
      });

    expect(await fuerAnna(lesbar.id)).toBe(false);
    expect(await fuerAnna(eigenes.id)).toBe(true);
  });
});
