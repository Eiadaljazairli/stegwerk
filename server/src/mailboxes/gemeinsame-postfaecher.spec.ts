import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { type DataSource } from 'typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import {
  Permission,
  ROLE_TEMPLATES,
  roleAllows,
} from '../workspaces/permissions';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import {
  type IncomingMessage,
  type MailboxCredentials,
  type MailReader,
  type ReadOptions,
  type ReadResult,
} from './imap-reader';
import { MailMessageEntity } from './mail-message.entity';
import { MailSperreEntity } from './mail-sperre.entity';
import { MailboxMitgliedEntity } from './mailbox-mitglied.entity';
import { MailboxEntity } from './mailbox.entity';
import { MailboxesService } from './mailboxes.service';
import { gemeinsamePostfaecherUebergeben } from './postfach-uebergabe';
import {
  type MailSender,
  type Versandauftrag,
  type Versandzugang,
} from './smtp-sender';

const SUITE = 'gemeinsame_postfaecher';

jest.setTimeout(60_000);

const KEY = randomBytes(32).toString('base64');

class FakeReader implements MailReader {
  public post: Record<string, IncomingMessage[]> = {};

  check(): Promise<void> {
    return Promise.resolve();
  }

  read(
    credentials: MailboxCredentials,
    options: ReadOptions,
  ): Promise<ReadResult> {
    return Promise.resolve({
      uidValidity: 1,
      messages: (this.post[credentials.username] ?? []).filter(
        (eintrag) => eintrag.uid > options.afterUid,
      ),
    });
  }
}

class FakeSender implements MailSender {
  auftraege: { zugang: Versandzugang; auftrag: Versandauftrag }[] = [];

  send(zugang: Versandzugang, auftrag: Versandauftrag): Promise<void> {
    this.auftraege.push({ zugang, auftrag });

    return Promise.resolve();
  }
}

let dataSource: DataSource;
let service: MailboxesService;
let reader: FakeReader;
let sender: FakeSender;
let workspaceId: string;
let fremderBereich: string;
let inhaberId: string;
let annaId: string;
let benId: string;
let fremdId: string;
let kundeId: string;

const nachricht = (
  overrides: Partial<IncomingMessage> & { uid: number; messageId: string },
): IncomingMessage => ({
  from: 'Kunde <kunde@nordwind.de>',
  to: 'info@wir.de',
  cc: null,
  subject: 'Anfrage',
  sentAt: new Date('2026-10-01T09:00:00Z'),
  inReplyTo: null,
  references: null,
  text: 'Guten Tag, bitte ein Angebot.',
  ...overrides,
});

const zugang = (username: string) => ({
  host: 'imap.wir.de',
  port: 993,
  secure: true,
  username,
  password: 'geheim123456',
  folder: 'INBOX',
  smtpHost: 'smtp.wir.de',
  smtpPort: 587,
  smtpSecure: false,
});

const infoAnlegen = () =>
  service.connect(workspaceId, inhaberId, zugang('info@wir.de'), {
    neu: 'gemeinsam',
    bezeichnung: 'Info',
    darfGemeinsameVerwalten: true,
  });

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  reader = new FakeReader();
  sender = new FakeSender();
  service = new MailboxesService(
    dataSource.getRepository(MailboxEntity),
    dataSource.getRepository(MailMessageEntity),
    dataSource.getRepository(ContactEntity),
    dataSource.getRepository(CompanyEntity),
    reader,
    sender,
    { get: () => KEY } as unknown as ConfigService,
    dataSource.getRepository(MailSperreEntity),
    dataSource,
  );
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE mailbox_mitglieder, mail_messages, mailboxes, memberships, contacts, companies, workspaces, users CASCADE',
  );
  reader.post = {};
  sender.auftraege = [];

  const workspaces = dataSource.getRepository(WorkspaceEntity);
  const users = dataSource.getRepository(UserEntity);
  const person = async (email: string, vorname: string): Promise<string> =>
    (
      await users.save(
        users.create({
          email,
          passwordHash: 'x',
          firstName: vorname,
          lastName: 'Test',
        }),
      )
    ).id;

  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Wir', slug: 'wir' }))
  ).id;
  fremderBereich = (
    await workspaces.save(workspaces.create({ name: 'Andere', slug: 'andere' }))
  ).id;
  inhaberId = await person('chef@wir.de', 'Chef');
  annaId = await person('anna@wir.de', 'Anna');
  benId = await person('ben@wir.de', 'Ben');
  fremdId = await person('x@andere.de', 'Fremd');

  await dataSource.getRepository(MembershipEntity).save([
    { userId: inhaberId, workspaceId, role: MembershipRole.OWNER },
    { userId: annaId, workspaceId, role: MembershipRole.MEMBER },
    { userId: benId, workspaceId, role: MembershipRole.MEMBER },
    {
      userId: fremdId,
      workspaceId: fremderBereich,
      role: MembershipRole.OWNER,
    },
  ]);

  kundeId = (
    await dataSource.getRepository(ContactEntity).save({
      workspaceId,
      firstName: 'Karl',
      lastName: 'Kunde',
      email: 'kunde@nordwind.de',
    })
  ).id;
});

describe('das Recht workspace:postfaecher', () => {
  it('haben Inhaber und Administrator, ein Mitglied nicht', () => {
    const rolle = (key: string) => {
      const vorlage = ROLE_TEMPLATES.find((eintrag) => eintrag.key === key);

      if (vorlage === undefined) {
        throw new Error(key);
      }

      return { ...vorlage, permissions: [...vorlage.permissions] };
    };

    expect(roleAllows(rolle('owner'), Permission.MAILBOX_SHARED_MANAGE)).toBe(
      true,
    );
    expect(roleAllows(rolle('admin'), Permission.MAILBOX_SHARED_MANAGE)).toBe(
      true,
    );
    expect(roleAllows(rolle('member'), Permission.MAILBOX_SHARED_MANAGE)).toBe(
      false,
    );
    expect(
      roleAllows(rolle('readonly'), Permission.MAILBOX_SHARED_MANAGE),
    ).toBe(false);
  });
});

describe('bestehende Einzelpostfächer', () => {
  it('bleiben das Hauptpostfach und werden wie bisher ersetzt statt verdoppelt', async () => {
    const erstes = await service.connect(
      workspaceId,
      annaId,
      zugang('anna@wir.de'),
    );

    expect(erstes.art).toBe('persoenlich');
    expect(erstes.haupt).toBe(true);

    await service.connect(workspaceId, annaId, {
      ...zugang('anna@wir.de'),
      host: 'imap.anders.de',
    });

    expect(
      await dataSource.getRepository(MailboxEntity).countBy({ userId: annaId }),
    ).toBe(1);
    expect((await service.find(workspaceId, annaId))?.host).toBe(
      'imap.anders.de',
    );
  });
});

describe('mehrere Postfächer je Person', () => {
  it('legt ein weiteres an, ohne das Hauptpostfach zu berühren', async () => {
    const haupt = await service.connect(
      workspaceId,
      annaId,
      zugang('anna@wir.de'),
    );
    const zweites = await service.connect(
      workspaceId,
      annaId,
      zugang('anna.privat@wir.de'),
      { neu: 'persoenlich' },
    );

    expect(zweites.haupt).toBe(false);
    expect((await service.find(workspaceId, annaId))?.id).toBe(haupt.id);
    expect(
      (await service.postfaecher(workspaceId, annaId, false)).map(
        (p) => p.username,
      ),
    ).toEqual(['anna@wir.de', 'anna.privat@wir.de']);
  });

  it('verbindet dasselbe Konto nicht zweimal', async () => {
    await service.connect(workspaceId, annaId, zugang('anna@wir.de'));

    await expect(
      service.connect(workspaceId, annaId, zugang('ANNA@wir.de'), {
        neu: 'persoenlich',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('schreibt aus dem gewählten eigenen Postfach, nie aus einem fremden', async () => {
    await service.connect(workspaceId, annaId, zugang('anna@wir.de'));
    const zweites = await service.connect(
      workspaceId,
      annaId,
      zugang('vertrieb.anna@wir.de'),
      { neu: 'persoenlich' },
    );
    const vonBen = await service.connect(
      workspaceId,
      benId,
      zugang('ben@wir.de'),
    );

    await service.senden(workspaceId, annaId, {
      an: ['kunde@nordwind.de'],
      betreff: 'Angebot',
      rumpf: 'Anbei.',
      postfachId: zweites.id,
    });

    expect(sender.auftraege.at(-1)?.auftrag.von).toBe('vertrieb.anna@wir.de');

    await expect(
      service.senden(workspaceId, annaId, {
        an: ['kunde@nordwind.de'],
        betreff: 'x',
        rumpf: 'y',
        postfachId: vonBen.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('macht beim Trennen des Hauptpostfachs das nächste zum Hauptpostfach', async () => {
    await service.connect(workspaceId, annaId, zugang('anna@wir.de'));
    const zweites = await service.connect(
      workspaceId,
      annaId,
      zugang('anna2@wir.de'),
      { neu: 'persoenlich' },
    );

    await service.disconnect(workspaceId, annaId, false);

    expect((await service.find(workspaceId, annaId))?.id).toBe(zweites.id);
  });

  it('wählt ein anderes Hauptpostfach, nur unter den eigenen', async () => {
    await service.connect(workspaceId, annaId, zugang('anna@wir.de'));
    const zweites = await service.connect(
      workspaceId,
      annaId,
      zugang('anna2@wir.de'),
      { neu: 'persoenlich' },
    );

    await service.hauptSetzen(workspaceId, annaId, zweites.id);
    expect((await service.find(workspaceId, annaId))?.id).toBe(zweites.id);

    await expect(
      service.hauptSetzen(workspaceId, benId, zweites.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ein gemeinsames Postfach einrichten', () => {
  it('darf nur, wer das Recht hat (eingeschränkte Rolle: nein)', async () => {
    await expect(
      service.connect(workspaceId, annaId, zugang('info@wir.de'), {
        neu: 'gemeinsam',
        darfGemeinsameVerwalten: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('macht den Einrichter zum Mitglied und zeigt es zuerst nur den Mitgliedern', async () => {
    const info = await infoAnlegen();

    expect(info.art).toBe('gemeinsam');
    expect(info.haupt).toBe(false);
    expect(info.sichtbarkeit).toBe('privat');
    expect(info.bezeichnung).toBe('Info');
    expect(await service.mitglieder(info.id)).toEqual([inhaberId]);
    expect(await service.find(workspaceId, inhaberId)).toBeNull();
  });

  it('erscheint in der Liste der Mitglieder und bei Verwaltern, sonst nicht', async () => {
    const info = await infoAnlegen();

    expect(
      (await service.postfaecher(workspaceId, annaId, false)).map((p) => p.id),
    ).toEqual([]);

    await service.mitgliederSetzen(
      workspaceId,
      inhaberId,
      info.id,
      [inhaberId, annaId],
      true,
    );

    expect(
      (await service.postfaecher(workspaceId, annaId, false)).map((p) => p.id),
    ).toEqual([info.id]);
    expect(
      (await service.postfaecher(workspaceId, benId, true)).map((p) => p.id),
    ).toEqual([info.id]);
  });

  it('nimmt als Mitglieder nur Leute aus dem Team', async () => {
    const info = await infoAnlegen();

    await expect(
      service.mitgliederSetzen(
        workspaceId,
        inhaberId,
        info.id,
        [fremdId],
        true,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lässt Mitglieder nur festlegen, wer es verwalten darf', async () => {
    const info = await infoAnlegen();

    await service.mitgliederSetzen(
      workspaceId,
      inhaberId,
      info.id,
      [inhaberId, annaId],
      true,
    );

    await expect(
      service.mitgliederSetzen(workspaceId, annaId, info.id, [annaId], false),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.disconnect(workspaceId, annaId, false, info.id, false),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('gibt es in einem fremden Bereich nicht', async () => {
    const info = await infoAnlegen();

    await expect(
      service.postfachFuer(fremderBereich, fremdId, info.id, 'nutzen', true),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.gespraeche(fremderBereich, fremdId, info.id, 'alle'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('der Posteingang des gemeinsamen Postfachs', () => {
  const mitAnna = async (): Promise<MailboxEntity> => {
    const info = await infoAnlegen();

    await service.mitgliederSetzen(
      workspaceId,
      inhaberId,
      info.id,
      [inhaberId, annaId],
      true,
    );

    return info;
  };

  it('ist nur für Mitglieder; ein Verwalter ohne Mitgliedschaft erfährt, was fehlt', async () => {
    const info = await mitAnna();

    await expect(
      service.gespraeche(workspaceId, benId, info.id, 'offen'),
    ).rejects.toBeInstanceOf(NotFoundException);

    await service.mitgliederSetzen(
      workspaceId,
      inhaberId,
      info.id,
      [annaId],
      true,
    );

    await expect(
      service.postfachFuer(workspaceId, inhaberId, info.id, 'nutzen', true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.postfachFuer(workspaceId, inhaberId, info.id, 'abrufen', true),
    ).resolves.toMatchObject({ id: info.id });
  });

  it('zeigt Gespräche, weist zu, erledigt und öffnet bei neuer Kundenpost wieder', async () => {
    const info = await mitAnna();

    reader.post['info@wir.de'] = [nachricht({ uid: 1, messageId: '<a@k>' })];
    await service.sync(workspaceId, annaId, info.id);

    const [gespraech] = await service.gespraeche(
      workspaceId,
      annaId,
      info.id,
      'offen',
    );

    expect(gespraech).toMatchObject({
      offen: true,
      zugewiesenAnId: null,
      contactId: kundeId,
      anzahl: 1,
    });

    await expect(
      service.zuweisen(
        workspaceId,
        annaId,
        info.id,
        gespraech.threadKey,
        benId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.zuweisen(
      workspaceId,
      annaId,
      info.id,
      gespraech.threadKey,
      annaId,
    );
    expect(
      await service.gespraeche(workspaceId, annaId, info.id, 'mir'),
    ).toHaveLength(1);
    expect(
      await service.gespraeche(workspaceId, inhaberId, info.id, 'mir'),
    ).toHaveLength(0);

    await service.erledigen(
      workspaceId,
      annaId,
      info.id,
      gespraech.threadKey,
      true,
    );
    expect(
      await service.gespraeche(workspaceId, annaId, info.id, 'offen'),
    ).toHaveLength(0);
    expect(
      await service.gespraeche(workspaceId, annaId, info.id, 'erledigt'),
    ).toHaveLength(1);

    reader.post['info@wir.de'].push(
      nachricht({
        uid: 2,
        messageId: '<b@k>',
        inReplyTo: '<a@k>',
        references: '<a@k>',
        subject: 'Re: Anfrage',
      }),
    );
    await service.sync(workspaceId, annaId, info.id);

    const [wieder] = await service.gespraeche(
      workspaceId,
      annaId,
      info.id,
      'mir',
    );

    expect(wieder).toMatchObject({ offen: true, anzahl: 2 });
    expect(wieder.zugewiesenAnId).toBe(annaId);
  });

  it('antwortet aus info@ und übernimmt ein Gespräch, um das sich niemand kümmert', async () => {
    const info = await mitAnna();

    reader.post['info@wir.de'] = [nachricht({ uid: 1, messageId: '<a@k>' })];
    await service.sync(workspaceId, annaId, info.id);

    const [gespraech] = await service.gespraeche(
      workspaceId,
      annaId,
      info.id,
      'offen',
    );

    await service.senden(workspaceId, annaId, {
      an: ['kunde@nordwind.de'],
      betreff: 'Re: Anfrage',
      rumpf: 'Gern.',
      antwortAuf: gespraech.nachrichtId,
      postfachId: info.id,
    });

    expect(sender.auftraege.at(-1)?.auftrag.von).toBe('info@wir.de');

    const [danach] = await service.gespraeche(
      workspaceId,
      annaId,
      info.id,
      'alle',
    );

    expect(danach).toMatchObject({ anzahl: 2, zugewiesenAnId: annaId });
    expect(danach.offen).toBe(true);

    await expect(
      service.senden(workspaceId, benId, {
        an: ['kunde@nordwind.de'],
        betreff: 'x',
        rumpf: 'y',
        postfachId: info.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('zeigt die Post in der Akte nur den Mitgliedern, solange es privat ist', async () => {
    const info = await mitAnna();

    reader.post['info@wir.de'] = [nachricht({ uid: 1, messageId: '<a@k>' })];
    await service.sync(workspaceId, annaId, info.id);

    expect(await service.forContact(workspaceId, kundeId, annaId)).toHaveLength(
      1,
    );
    expect(await service.forContact(workspaceId, kundeId, benId)).toEqual([]);

    await service.sichtbarkeitSetzen(
      workspaceId,
      inhaberId,
      'kopf',
      info.id,
      true,
    );

    const [fuerBen] = await service.forContact(workspaceId, kundeId, benId);
    const [fuerAnna] = await service.forContact(workspaceId, kundeId, annaId);

    expect(fuerBen.inhaltVerborgen).toBe(true);
    expect(fuerBen.snippet).toBeNull();
    expect(fuerAnna.inhaltVerborgen).toBe(false);
  });

  it('nimmt beim Entfernen eines Mitglieds dessen Zuweisungen zurück', async () => {
    const info = await mitAnna();

    reader.post['info@wir.de'] = [nachricht({ uid: 1, messageId: '<a@k>' })];
    await service.sync(workspaceId, annaId, info.id);

    const [gespraech] = await service.gespraeche(
      workspaceId,
      annaId,
      info.id,
      'offen',
    );

    await service.zuweisen(
      workspaceId,
      annaId,
      info.id,
      gespraech.threadKey,
      annaId,
    );
    await service.mitgliederSetzen(
      workspaceId,
      inhaberId,
      info.id,
      [inhaberId],
      true,
    );

    const [danach] = await service.gespraeche(
      workspaceId,
      inhaberId,
      info.id,
      'offen',
    );

    expect(danach.zugewiesenAnId).toBeNull();
  });
});

describe('Übergabe beim Weggang', () => {
  it('gibt gemeinsame Postfächer, Mitgliedschaft und Gespräche an die Nachfolgerin', async () => {
    const info = await infoAnlegen();

    await service.mitgliederSetzen(
      workspaceId,
      inhaberId,
      info.id,
      [inhaberId, annaId],
      true,
    );
    reader.post['info@wir.de'] = [nachricht({ uid: 1, messageId: '<a@k>' })];
    await service.sync(workspaceId, annaId, info.id);

    const [gespraech] = await service.gespraeche(
      workspaceId,
      annaId,
      info.id,
      'offen',
    );

    await service.zuweisen(
      workspaceId,
      annaId,
      info.id,
      gespraech.threadKey,
      inhaberId,
    );

    await dataSource.transaction((manager) =>
      gemeinsamePostfaecherUebergeben(manager, workspaceId, inhaberId, benId),
    );

    const danach = await dataSource
      .getRepository(MailboxEntity)
      .findOneByOrFail({ id: info.id });

    expect(danach.userId).toBe(benId);
    expect(danach.getrenntAm).toBeNull();
    expect((await service.mitglieder(info.id)).sort()).toEqual(
      [annaId, benId].sort(),
    );
    expect(
      await dataSource
        .getRepository(MailboxMitgliedEntity)
        .countBy({ userId: inhaberId }),
    ).toBe(0);

    const [uebernommen] = await service.gespraeche(
      workspaceId,
      benId,
      info.id,
      'mir',
    );

    expect(uebernommen.threadKey).toBe(gespraech.threadKey);
  });

  it('zieht den Google-Zugang um, auch wenn ihn jemand anderes als der Einrichter verbunden hat', async () => {
    const info = await infoAnlegen();
    const [zeile] = (await dataSource.query(
      `INSERT INTO oauth_zugaenge ("workspaceId", "userId", anbieter, zweck, konto, "erneuerungVersiegelt")
       VALUES ($1, $2, 'google', 'postfach', 'info@wir.de', 'x') RETURNING id`,
      [workspaceId, annaId],
    )) as { id: string }[];

    await dataSource
      .getRepository(MailboxEntity)
      .update(info.id, { oauthZugangId: zeile.id, oauthAnbieter: 'google' });

    await dataSource.transaction((manager) =>
      gemeinsamePostfaecherUebergeben(manager, workspaceId, annaId, benId),
    );

    const [danach] = (await dataSource.query(
      `SELECT "userId" FROM oauth_zugaenge WHERE id = $1`,
      [zeile.id],
    )) as { userId: string }[];

    expect(danach.userId).toBe(benId);
    expect(
      (
        await dataSource
          .getRepository(MailboxEntity)
          .findOneByOrFail({ id: info.id })
      ).userId,
    ).toBe(inhaberId);
  });
});
