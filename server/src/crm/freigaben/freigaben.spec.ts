import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { ApiKeyEntity } from '../../api-keys/api-key.entity';
import {
  assertAnhangSchreibbar,
  zielMitAkte,
} from '../../attachments/attachment-rechte';
import { type RequestUser } from '../../auth/decorators/current-user.decorator';
import { CustomFieldDefinition } from '../../custom-fields/custom-field.entity';
import { CustomFieldsService } from '../../custom-fields/custom-fields.service';
import { ExportService } from '../../export/export.service';
import { runWithRequestContext } from '../../observability/request-context';
import { PapierkorbArt } from '../../papierkorb/papierkorb.dto';
import { PapierkorbService } from '../../papierkorb/papierkorb.service';
import {
  createTestDatabase,
  dropTestDatabase,
} from '../../testing/test-database';
import { UserEntity } from '../../users/user.entity';
import { zeileSichtbar } from '../../webhooks/webhook-sicht';
import {
  MembershipEntity,
  MembershipRole,
} from '../../workspaces/membership.entity';
import { Permission } from '../../workspaces/permissions';
import { PermissionsService } from '../../workspaces/permissions.service';
import { RoleEntity } from '../../workspaces/role.entity';
import { setzeSichtfeld } from '../../workspaces/sichtbarkeit';
import { WorkspaceEntity } from '../../workspaces/workspace.entity';
import { AnreicherungService } from '../anreicherung/anreicherung.service';
import { FirmenlogoEntity } from '../anreicherung/firmenlogo.entity';
import { AuswertungService } from '../auswertung.service';
import { CompaniesService } from '../companies.service';
import { ContactsService } from '../contacts.service';
import { DealsService } from '../deals.service';
import { CompanyEntity } from '../entities/company.entity';
import { ContactEntity } from '../entities/contact.entity';
import { DealEntity, DealStage } from '../entities/deal.entity';
import { NoteEntity } from '../entities/note.entity';
import { TaskEntity } from '../entities/task.entity';
import { NotesResolver } from '../notes.resolver';
import { NotesService } from '../notes.service';
import { SammelResolver } from '../sammel.resolver';
import { TasksService } from '../tasks.service';
import { FreigabeEntity } from './freigabe.entity';
import { FreigabenService, zugriff } from './freigaben.service';

const SUITE = 'u6_freigaben';

jest.setTimeout(60_000);

let dataSource: DataSource;
let permissions: PermissionsService;
let firmen: CompaniesService;
let kontakte: ContactsService;
let geschaefte: DealsService;
let notizen: NotesService;
let aufgaben: TasksService;
let freigaben: FreigabenService;
let felder: CustomFieldsService;
let workspaceId: string;
let fremderBereich: string;
let anna: RequestUser;
let ben: RequestUser;
let clara: RequestUser;
let erik: RequestUser;
let annasFirma: string;
let annasGeschaeft: string;
let bensFirma: string;
let fremdeFirma: string;

const als = <T>(wer: RequestUser, tun: () => Promise<T>): Promise<T> =>
  runWithRequestContext({ requestId: 'test' }, () => {
    setzeSichtfeld(() => permissions.sichtfeldFuer(wer));

    return tun();
  });

const firmenNamen = async (wer: RequestUser): Promise<string[]> =>
  als(wer, async () =>
    (await firmen.listAll(workspaceId)).map((firma) => firma.name).sort(),
  );

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  permissions = new PermissionsService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(RoleEntity),
  );
  felder = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
  );
  firmen = new CompaniesService(
    dataSource.getRepository(CompanyEntity),
    felder,
  );
  kontakte = new ContactsService(
    dataSource.getRepository(ContactEntity),
    felder,
  );
  geschaefte = new DealsService(dataSource.getRepository(DealEntity), felder);
  notizen = new NotesService(dataSource.getRepository(NoteEntity), felder);
  aufgaben = new TasksService(dataSource.getRepository(TaskEntity), felder);
  freigaben = new FreigabenService(
    dataSource,
    permissions,
    firmen,
    kontakte,
    geschaefte,
  );

  const bereiche = dataSource.getRepository(WorkspaceEntity);
  const users = dataSource.getRepository(UserEntity);
  const roles = dataSource.getRepository(RoleEntity);
  const memberships = dataSource.getRepository(MembershipEntity);

  workspaceId = (
    await bereiche.save(bereiche.create({ name: 'Vertrieb', slug: 'u6-a' }))
  ).id;
  fremderBereich = (
    await bereiche.save(bereiche.create({ name: 'Fremd', slug: 'u6-b' }))
  ).id;

  const person = (email: string, firstName: string) =>
    users.save(
      users.create({ email, passwordHash: 'x', firstName, lastName: 'Test' }),
    );
  const [a, b, c, e] = await Promise.all([
    person('anna@u6.test', 'Anna'),
    person('ben@u6.test', 'Ben'),
    person('clara@u6.test', 'Clara'),
    person('erik@u6.test', 'Erik'),
  ]);

  const inhaber = await roles.save(
    roles.create({
      workspaceId,
      name: 'Inhaber',
      templateKey: 'owner',
      everything: true,
      permissions: [],
      isSystem: true,
    }),
  );
  const eigene = await roles.save(
    roles.create({
      workspaceId,
      name: 'Außendienst',
      everything: false,
      permissions: [
        Permission.COMPANY_VIEW,
        Permission.COMPANY_WRITE,
        Permission.COMPANY_DELETE,
        Permission.CONTACT_VIEW,
        Permission.CONTACT_WRITE,
        Permission.DEAL_VIEW,
        Permission.DEAL_WRITE,
        Permission.TASK_VIEW,
        Permission.TASK_WRITE,
      ],
      sichtbarkeit: { company: 'eigene', contact: 'eigene', deal: 'eigene' },
      isSystem: false,
    }),
  );
  const fremdeInhaber = await roles.save(
    roles.create({
      workspaceId: fremderBereich,
      name: 'Inhaber',
      templateKey: 'owner',
      everything: true,
      permissions: [],
      isSystem: true,
    }),
  );

  await memberships.save([
    memberships.create({
      userId: a.id,
      workspaceId,
      role: MembershipRole.OWNER,
      roleId: inhaber.id,
    }),
    memberships.create({
      userId: b.id,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: eigene.id,
    }),
    memberships.create({
      userId: c.id,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: eigene.id,
    }),
    memberships.create({
      userId: e.id,
      workspaceId: fremderBereich,
      role: MembershipRole.OWNER,
      roleId: fremdeInhaber.id,
    }),
  ]);

  anna = { userId: a.id, workspaceId, email: a.email };
  ben = { userId: b.id, workspaceId, email: b.email };
  clara = { userId: c.id, workspaceId, email: c.email };
  erik = { userId: e.id, workspaceId: fremderBereich, email: e.email };

  annasFirma = (
    await firmen.create(workspaceId, { name: 'Annas Firma', ownerId: a.id })
  ).id;
  bensFirma = (
    await firmen.create(workspaceId, { name: 'Bens Firma', ownerId: b.id })
  ).id;
  annasGeschaeft = (
    await geschaefte.create(workspaceId, {
      name: 'Annas Geschäft',
      ownerId: a.id,
      companyId: annasFirma,
      stage: DealStage.LEAD,
      amount: 1000,
    })
  ).id;
  fremdeFirma = (
    await firmen.create(fremderBereich, { name: 'Fremde Firma', ownerId: e.id })
  ).id;
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

describe('Freigaben', () => {
  it('ohne Freigabe sieht Ben nur seine Firma', async () => {
    expect(await firmenNamen(ben)).toEqual(['Bens Firma']);
    await expect(
      als(ben, () => firmen.findOne(workspaceId, annasFirma)),
    ).rejects.toThrow(NotFoundException);
  });

  it('zum Lesen: in Liste, Akte, Suche und Export, aber nicht änderbar', async () => {
    await als(anna, () =>
      freigaben.freigeben(anna, 'company', annasFirma, ben.userId, 'lesen'),
    );

    expect(await firmenNamen(ben)).toEqual(['Annas Firma', 'Bens Firma']);
    expect(
      (await als(ben, () => firmen.findOne(workspaceId, annasFirma))).name,
    ).toBe('Annas Firma');

    const suche = await als(ben, () =>
      firmen.list(workspaceId, { search: 'Annas' }),
    );

    expect(suche.items.map((f) => f.name)).toEqual(['Annas Firma']);

    const csv = await als(ben, () =>
      new ExportService(firmen, kontakte, geschaefte, felder).csv(
        workspaceId,
        'COMPANY',
      ),
    );

    expect(csv).toContain('Annas Firma');

    await expect(
      als(ben, () =>
        firmen.update(workspaceId, annasFirma, { name: 'Umbenannt' }),
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      als(ben, () => firmen.remove(workspaceId, annasFirma, ben.userId)),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      als(ben, async () =>
        assertAnhangSchreibbar(
          dataSource.manager,
          await zielMitAkte(dataSource.manager, workspaceId, {
            companyId: annasFirma,
          }),
        ),
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(await firmenNamen(clara)).toEqual([]);
  });

  it('zum Bearbeiten: Ben darf ändern, aber nicht weitergeben', async () => {
    await als(anna, () =>
      freigaben.freigeben(
        anna,
        'company',
        annasFirma,
        ben.userId,
        'bearbeiten',
      ),
    );

    const geaendert = await als(ben, () =>
      firmen.update(workspaceId, annasFirma, { industry: 'Handel' }),
    );

    expect(geaendert.industry).toBe('Handel');

    await expect(
      als(ben, () =>
        freigaben.freigeben(ben, 'company', annasFirma, clara.userId, 'lesen'),
      ),
    ).rejects.toThrow(ForbiddenException);

    const stand = await als(ben, () =>
      freigaben.stand(ben, 'company', annasFirma),
    );

    expect(stand.darfVerwalten).toBe(false);
    expect(stand.freigaben).toEqual([
      expect.objectContaining({ userId: ben.userId, stufe: 'bearbeiten' }),
    ]);
  });

  it('die eigene Firma gibt Ben an Clara frei', async () => {
    const stand = await als(ben, () =>
      freigaben.freigeben(ben, 'company', bensFirma, clara.userId, 'lesen'),
    );

    expect(stand.darfVerwalten).toBe(true);
    expect(await firmenNamen(clara)).toEqual(['Bens Firma']);
  });

  it('weist sich selbst, den Verantwortlichen und Fremde ab', async () => {
    await expect(
      als(anna, () =>
        freigaben.freigeben(anna, 'company', annasFirma, anna.userId, 'lesen'),
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      als(anna, () =>
        freigaben.freigeben(anna, 'company', bensFirma, ben.userId, 'lesen'),
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      als(anna, () =>
        freigaben.freigeben(anna, 'company', annasFirma, erik.userId, 'lesen'),
      ),
    ).rejects.toThrow(NotFoundException);
    await expect(
      als(anna, () =>
        freigaben.freigeben(anna, 'company', fremdeFirma, ben.userId, 'lesen'),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('wirkt nie über den Bereich hinaus', async () => {
    await dataSource.getRepository(FreigabeEntity).save({
      workspaceId: fremderBereich,
      art: 'deal',
      datensatzId: annasGeschaeft,
      userId: clara.userId,
      stufe: 'bearbeiten',
    });

    const sichtbar = await als(clara, async () =>
      (await geschaefte.listAll(workspaceId)).map((g) => g.name),
    );

    expect(sichtbar).toEqual([]);

    const feld = await permissions.sichtfeldFuer(clara);

    expect(feld.freigaben?.deal?.has(annasGeschaeft) ?? false).toBe(false);
  });

  it('wirkt in Webhook, Auswertung und Zählung', async () => {
    await als(anna, () =>
      freigaben.freigeben(anna, 'deal', annasGeschaeft, ben.userId, 'lesen'),
    );

    const meldung = {
      event: 'deal.updated' as const,
      data: { id: annasGeschaeft, ownerId: anna.userId },
    };

    expect(
      await zeileSichtbar(
        dataSource.manager,
        workspaceId,
        meldung,
        await permissions.sichtfeldFuer(ben),
      ),
    ).toBe(true);
    expect(
      await zeileSichtbar(
        dataSource.manager,
        workspaceId,
        meldung,
        await permissions.sichtfeldFuer(clara),
      ),
    ).toBe(false);

    expect(await als(ben, () => geschaefte.count(workspaceId))).toBe(1);

    const auswertung = new AuswertungService(
      dataSource.getRepository(DealEntity),
      dataSource.getRepository(UserEntity),
    );
    const heute = new Date().toISOString().slice(0, 10);
    const daten = await als(ben, () =>
      auswertung.berechne(workspaceId, heute, heute, null),
    );

    expect(daten.neueGeschaefte).toBe(1);
  });

  it('entzogen wirkt sofort', async () => {
    const stand = await als(anna, () =>
      freigaben.stand(anna, 'deal', annasGeschaeft),
    );
    const bens = stand.freigaben.find((f) => f.userId === ben.userId);

    await als(anna, () => freigaben.entziehen(anna, bens?.id ?? ''));

    expect(await als(ben, () => geschaefte.count(workspaceId))).toBe(0);
  });

  it('wer eine Freigabe bekam, darf sie zurückgeben', async () => {
    const stand = await als(clara, () =>
      freigaben.stand(clara, 'company', bensFirma),
    );
    const claras = stand.freigaben.find((f) => f.userId === clara.userId);

    expect(stand.darfVerwalten).toBe(false);
    await als(clara, () => freigaben.entziehen(clara, claras?.id ?? ''));
    expect(await firmenNamen(clara)).toEqual([]);
  });
});

describe('Wer sieht das?', () => {
  it('nennt je Person, ob und warum', async () => {
    const zeilen = await als(anna, () =>
      freigaben.werSiehtDas(anna, 'company', annasFirma),
    );
    const nach = new Map(zeilen.map((z) => [z.name, z]));

    expect(nach.get('Anna Test')).toMatchObject({
      sieht: true,
      bearbeitet: true,
      grund: 'Inhaber: sieht alles.',
    });
    expect(nach.get('Ben Test')).toMatchObject({
      sieht: true,
      bearbeitet: true,
      grund: 'Freigegeben zum Bearbeiten.',
    });
    expect(nach.get('Clara Test')).toMatchObject({
      sieht: false,
      bearbeitet: false,
    });
    expect(nach.has('Erik Test')).toBe(false);
  });

  it('nur für die Verwaltung', async () => {
    await expect(
      als(ben, () => freigaben.werSiehtDas(ben, 'company', bensFirma)),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rechnet die Regel ohne Datenbank', () => {
    const rolle = {
      everything: false,
      permissions: [Permission.DEAL_VIEW],
    };

    expect(
      zugriff('deal', { ownerId: 'x' }, 'y', rolle, 'eigene', 'bearbeiten'),
    ).toEqual({
      sieht: true,
      bearbeitet: false,
      grund: 'Freigegeben zum Bearbeiten. Die Rolle erlaubt kein Ändern.',
    });
    expect(
      zugriff(
        'deal',
        { ownerId: 'x' },
        'y',
        { everything: false, permissions: [] },
        'alle',
        'lesen',
      ).sieht,
    ).toBe(false);
  });
});

describe('Notiz und Aufgabe an mehreren Akten', () => {
  let notizId: string;

  it('eine Notiz an Geschäft und Firma steht in beiden Akten', async () => {
    const notiz = await als(anna, () =>
      notizen.createForTarget(workspaceId, anna.userId, 'Gespräch', {
        dealId: annasGeschaeft,
        companyId: bensFirma,
      }),
    );

    notizId = notiz.id;

    expect(
      (await notizen.findForDeal(workspaceId, annasGeschaeft)).map((n) => n.id),
    ).toContain(notizId);
    expect(
      (await notizen.findForCompany(workspaceId, bensFirma)).map((n) => n.id),
    ).toContain(notizId);
  });

  it('sichtbar, wenn mindestens eine Akte sichtbar ist', async () => {
    const bens = await als(ben, () => notizen.list(workspaceId, {}));

    expect(bens.items.map((n) => n.id)).toContain(notizId);

    const claras = await als(clara, () => notizen.list(workspaceId, {}));

    expect(claras.items.map((n) => n.id)).not.toContain(notizId);
    await expect(
      als(clara, () => notizen.findOne(workspaceId, notizId)),
    ).rejects.toThrow(NotFoundException);
  });

  it('nennt das unsichtbare Geschäft nicht', async () => {
    const resolver = new NotesResolver(
      notizen,
      permissions,
      dataSource.getRepository(UserEntity),
      { nachDemSpeichernVon: () => Promise.resolve() } as never,
    );
    const notiz = await als(ben, () => notizen.findOne(workspaceId, notizId));

    expect(await als(ben, () => resolver.deal(notiz))).toBeNull();
    expect((await als(ben, () => resolver.company(notiz)))?.id).toBe(bensFirma);
  });

  it('ändern nur mit Schreibrecht an allen sichtbaren Akten', async () => {
    await als(ben, () =>
      notizen.bearbeiten(workspaceId, notizId, 'Gespräch, ergänzt', ben.userId),
    );

    await als(anna, () =>
      freigaben.freigeben(anna, 'deal', annasGeschaeft, ben.userId, 'lesen'),
    );
    await expect(
      als(ben, () =>
        notizen.bearbeiten(workspaceId, notizId, 'nochmal', ben.userId),
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      als(ben, () => notizen.remove(workspaceId, notizId)),
    ).rejects.toThrow(ForbiddenException);

    await als(anna, () =>
      freigaben.freigeben(
        anna,
        'deal',
        annasGeschaeft,
        ben.userId,
        'bearbeiten',
      ),
    );

    const neu = await als(ben, () =>
      notizen.bearbeiten(workspaceId, notizId, 'nochmal', ben.userId),
    );

    expect(neu.body).toBe('nochmal');
  });

  it('eine Verknüpfung zu einer unsichtbaren Akte bleibt', async () => {
    const stand = await als(anna, () =>
      freigaben.stand(anna, 'deal', annasGeschaeft),
    );

    for (const freigabe of stand.freigaben) {
      await als(anna, () => freigaben.entziehen(anna, freigabe.id));
    }

    await expect(
      als(ben, () =>
        notizen.zieleSetzen(workspaceId, notizId, { dealId: null }),
      ),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      als(ben, () =>
        notizen.createForTarget(workspaceId, ben.userId, 'x', {
          companyId: bensFirma,
          dealId: annasGeschaeft,
        }),
      ),
    ).rejects.toThrow(NotFoundException);

    await expect(
      als(anna, () =>
        notizen.zieleSetzen(workspaceId, notizId, {
          dealId: null,
          companyId: null,
        }),
      ),
    ).rejects.toThrow(BadRequestException);

    const geloest = await als(anna, () =>
      notizen.zieleSetzen(workspaceId, notizId, { dealId: null }),
    );

    expect(geloest.dealId).toBeNull();
    expect(geloest.companyId).toBe(bensFirma);
  });

  it('eine Aufgabe an Firma und Geschäft bleibt beim Löschen der Firma', async () => {
    const aufgabe = await als(anna, () =>
      aufgaben.createForTarget(
        workspaceId,
        anna.userId,
        { title: 'Angebot nachfassen' },
        { companyId: annasFirma, dealId: annasGeschaeft },
      ),
    );

    expect(
      (await aufgaben.findForRecord(workspaceId, 'dealId', annasGeschaeft)).map(
        (t) => t.id,
      ),
    ).toContain(aufgabe.id);

    await als(anna, () => firmen.remove(workspaceId, annasFirma, anna.userId));

    expect(
      (await aufgaben.findForRecord(workspaceId, 'dealId', annasGeschaeft)).map(
        (t) => t.id,
      ),
    ).toContain(aufgabe.id);

    await als(anna, () =>
      new PapierkorbService(dataSource).endgueltig(
        workspaceId,
        PapierkorbArt.FIRMA,
        annasFirma,
      ),
    );

    const danach = await dataSource
      .getRepository(TaskEntity)
      .findOneOrFail({ where: { id: aufgabe.id } });

    expect(danach.companyId).toBeNull();
    expect(danach.dealId).toBe(annasGeschaeft);
  });

  it('die eigene Aufgabe darf man trotz fremder Akte abhaken', async () => {
    const aufgabe = await als(anna, () =>
      aufgaben.createForTarget(
        workspaceId,
        anna.userId,
        { title: 'Für Ben', assigneeId: ben.userId },
        { dealId: annasGeschaeft },
      ),
    );

    const erledigt = await als(ben, () =>
      aufgaben.setCompleted(workspaceId, aufgabe.id, true),
    );

    expect(erledigt.completedAt).not.toBeNull();

    await expect(
      als(clara, () => aufgaben.setCompleted(workspaceId, aufgabe.id, false)),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('„Lesen“ sperrt auch Papierkorb, Logo und Sammelaktionen', () => {
  let leseFirma: string;

  const papierkorb = () => new PapierkorbService(dataSource);

  beforeAll(async () => {
    leseFirma = (
      await firmen.create(workspaceId, {
        name: 'Nur zum Lesen',
        ownerId: anna.userId,
      })
    ).id;
    await als(anna, () =>
      freigaben.freigeben(anna, 'company', leseFirma, ben.userId, 'lesen'),
    );
  });

  it('kein Logo laden oder entfernen', async () => {
    const anreicherung = new AnreicherungService(
      firmen,
      dataSource.getRepository(FirmenlogoEntity),
    );

    await expect(
      als(ben, () => anreicherung.logoLaden(workspaceId, leseFirma)),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      als(ben, () => anreicherung.logoEntfernen(workspaceId, leseFirma)),
    ).rejects.toThrow(ForbiddenException);
  });

  it('Sammelaktion: was geht, geht; der Rest wird mit Zahl abgewiesen', async () => {
    const eigene = await firmen.create(workspaceId, {
      name: 'Bens zweite Firma',
      ownerId: ben.userId,
    });
    const sammel = new SammelResolver(
      permissions,
      firmen,
      kontakte,
      geschaefte,
      aufgaben,
    );

    await expect(
      als(ben, () =>
        sammel.sammelLoeschen(ben, PapierkorbArt.FIRMA, [leseFirma, eigene.id]),
      ),
    ).rejects.toThrow('1 gelöscht, 1 nicht: Dieser Datensatz ist für Sie nur');

    await expect(firmen.findOne(workspaceId, eigene.id)).rejects.toThrow(
      NotFoundException,
    );
    expect((await firmen.findOne(workspaceId, leseFirma)).name).toBe(
      'Nur zum Lesen',
    );
  });

  it('im Papierkorb weder sichtbar noch wiederherstellbar oder endgültig zu löschen', async () => {
    await als(anna, () => firmen.remove(workspaceId, leseFirma, anna.userId));

    const liste = await als(ben, () =>
      papierkorb().liste(workspaceId, [PapierkorbArt.FIRMA]),
    );

    expect(liste.map((e) => e.id)).not.toContain(leseFirma);
    await expect(
      als(ben, () =>
        papierkorb().wiederherstellen(
          workspaceId,
          PapierkorbArt.FIRMA,
          leseFirma,
        ),
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      als(ben, () =>
        papierkorb().endgueltig(workspaceId, PapierkorbArt.FIRMA, leseFirma),
      ),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      als(clara, () =>
        papierkorb().endgueltig(workspaceId, PapierkorbArt.FIRMA, leseFirma),
      ),
    ).rejects.toThrow(NotFoundException);

    await als(anna, () =>
      papierkorb().wiederherstellen(
        workspaceId,
        PapierkorbArt.FIRMA,
        leseFirma,
      ),
    );
    await als(anna, () =>
      freigaben.freigeben(anna, 'company', leseFirma, ben.userId, 'bearbeiten'),
    );
    await als(anna, () => firmen.remove(workspaceId, leseFirma, anna.userId));
    expect(
      (
        await als(ben, () =>
          papierkorb().liste(workspaceId, [PapierkorbArt.FIRMA]),
        )
      ).map((e) => e.id),
    ).toContain(leseFirma);
    await als(ben, () =>
      papierkorb().wiederherstellen(
        workspaceId,
        PapierkorbArt.FIRMA,
        leseFirma,
      ),
    );
    expect((await firmen.findOne(workspaceId, leseFirma)).deletedAt).toBeNull();
  });

  it('Regel 9: mit „bearbeiten“ keinen anderen Verantwortlichen setzen', async () => {
    await expect(
      als(ben, () =>
        firmen.update(workspaceId, leseFirma, { ownerId: ben.userId }),
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      als(ben, () =>
        firmen.update(workspaceId, leseFirma, { ownerId: clara.userId }),
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      als(ben, () => firmen.update(workspaceId, leseFirma, { ownerId: null })),
    ).rejects.toThrow(ForbiddenException);

    const geaendert = await als(ben, () =>
      firmen.update(workspaceId, leseFirma, {
        industry: 'Bau',
        ownerId: anna.userId,
      }),
    );

    expect(geaendert.industry).toBe('Bau');
    expect(geaendert.ownerId).toBe(anna.userId);

    const sammel = new SammelResolver(
      permissions,
      firmen,
      kontakte,
      geschaefte,
      aufgaben,
    );

    await expect(
      als(ben, () =>
        sammel.sammelVerantwortlich(
          ben,
          PapierkorbArt.FIRMA,
          [leseFirma],
          ben.userId,
        ),
      ),
    ).rejects.toThrow('0 zugewiesen, 1 nicht: Den Verantwortlichen ändert');

    const uebergeben = await als(anna, () =>
      firmen.update(workspaceId, leseFirma, { ownerId: ben.userId }),
    );

    expect(uebergeben.ownerId).toBe(ben.userId);
  });
});

describe('Regel 8: Schlüssel (API und MCP)', () => {
  let schluesselFirma: string;

  const schluessel = async (
    createdById: string | null,
  ): Promise<RequestUser> => {
    const keys = dataSource.getRepository(ApiKeyEntity);
    const key = await keys.save(
      keys.create({
        workspaceId,
        name: 'MCP',
        kennung: `k${String(Math.random()).slice(2, 14)}`,
        hash: 'x',
        permissions: [Permission.COMPANY_VIEW],
        createdById,
      }),
    );

    return {
      userId: key.id,
      workspaceId,
      email: '',
      apiKey: { id: key.id, name: key.name, permissions: key.permissions },
    };
  };

  beforeAll(async () => {
    schluesselFirma = (
      await firmen.create(workspaceId, {
        name: 'Für Claras Schlüssel',
        ownerId: anna.userId,
      })
    ).id;
    await als(anna, () =>
      freigaben.freigeben(
        anna,
        'company',
        schluesselFirma,
        clara.userId,
        'lesen',
      ),
    );
  });

  it('der Schlüssel sieht die Freigaben seiner Anlegerin', async () => {
    const mcp = await schluessel(clara.userId);

    expect(await firmenNamen(mcp)).toEqual(['Für Claras Schlüssel']);
    expect(
      (await als(mcp, () => firmen.findOne(workspaceId, schluesselFirma))).name,
    ).toBe('Für Claras Schlüssel');
    await expect(
      als(mcp, () =>
        firmen.update(workspaceId, schluesselFirma, { name: 'Anders' }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('ein verwaister Schlüssel sieht keine Freigaben', async () => {
    const verwaist = await schluessel(null);

    expect(await firmenNamen(verwaist)).toEqual([]);
    await expect(
      als(verwaist, () => firmen.findOne(workspaceId, schluesselFirma)),
    ).rejects.toThrow(NotFoundException);
  });

  it('entzogen sieht auch der Schlüssel nichts mehr', async () => {
    const mcp = await schluessel(clara.userId);
    const stand = await als(anna, () =>
      freigaben.stand(anna, 'company', schluesselFirma),
    );
    const claras = stand.freigaben.find((f) => f.userId === clara.userId);

    await als(anna, () => freigaben.entziehen(anna, claras?.id ?? ''));

    expect(await firmenNamen(mcp)).toEqual([]);
  });
});
