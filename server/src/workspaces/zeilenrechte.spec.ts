import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { AuswertungService } from '../crm/auswertung.service';
import { CompaniesService } from '../crm/companies.service';
import { ContactsService } from '../crm/contacts.service';
import { DealsService } from '../crm/deals.service';
import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity, DealStage } from '../crm/entities/deal.entity';
import { NoteEntity } from '../crm/entities/note.entity';
import { ContactsResolver } from '../crm/contacts.resolver';
import { DealsResolver } from '../crm/deals.resolver';
import { DublettenService } from '../crm/dubletten.service';
import { NotesResolver } from '../crm/notes.resolver';
import { NotesService } from '../crm/notes.service';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { ExportService } from '../export/export.service';
import { runWithRequestContext } from '../observability/request-context';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { MembershipEntity, MembershipRole } from './membership.entity';
import { Permission, ROLE_TEMPLATES } from './permissions';
import { PermissionsService } from './permissions.service';
import { RoleEntity } from './role.entity';
import { setzeSichtfeld } from './sichtbarkeit';
import { WorkspaceEntity } from './workspace.entity';
import { sichtbareAkte } from './ziel-sichtbarkeit';
import { zielMitAkte } from '../attachments/attachment-rechte';
import { AuditLogEntity } from '../audit/audit-log.entity';
import { AuditResolver } from '../audit/audit.resolver';
import { AppointmentAttendeeEntity } from '../calendar/appointment-attendee.entity';
import { AppointmentEntity } from '../calendar/appointment.entity';
import { AppointmentsService } from '../calendar/appointments.service';
import { TaskEntity } from '../crm/entities/task.entity';
import { TasksService } from '../crm/tasks.service';
import { InvoiceLineEntity } from '../invoices/invoice-line.entity';
import { InvoiceEntity } from '../invoices/invoice.entity';
import { InvoicesService } from '../invoices/invoices.service';
import { MailMessageEntity } from '../mailboxes/mail-message.entity';
import { MailSperreEntity } from '../mailboxes/mail-sperre.entity';
import { MailboxEntity } from '../mailboxes/mailbox.entity';
import { MailboxesService } from '../mailboxes/mailboxes.service';
import { LetterheadEntity } from '../quotes/letterhead.entity';
import { LetterheadsService } from '../quotes/letterheads.service';
import { QuoteEntity } from '../quotes/quote.entity';
import { QuotesService } from '../quotes/quotes.service';

const SUITE = 'b9_zeilenrechte';

jest.setTimeout(60_000);

let dataSource: DataSource;
let permissions: PermissionsService;
let firmen: CompaniesService;
let kontakte: ContactsService;
let geschaefte: DealsService;
let auswertung: AuswertungService;
let workspaceId: string;
let inhaberin: RequestUser;
let verkaeufer: RequestUser;
let fremdeFirma: string;

const heute = new Date().toISOString().slice(0, 10);

const als = <T>(wer: RequestUser, tun: () => Promise<T>): Promise<T> =>
  runWithRequestContext({ requestId: 'test' }, () => {
    setzeSichtfeld(() => permissions.sichtfeldFuer(wer));

    return tun();
  });

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  permissions = new PermissionsService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(RoleEntity),
  );
  const felder = new CustomFieldsService(
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
  auswertung = new AuswertungService(
    dataSource.getRepository(DealEntity),
    dataSource.getRepository(UserEntity),
  );

  const bereiche = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (
    await bereiche.save(
      bereiche.create({ name: 'Vertrieb', slug: 'vertrieb-b9' }),
    )
  ).id;

  const users = dataSource.getRepository(UserEntity);
  const anna = await users.save(
    users.create({
      email: 'anna@b9.test',
      passwordHash: 'x',
      firstName: 'Anna',
      lastName: 'Inhaberin',
    }),
  );
  const ben = await users.save(
    users.create({
      email: 'ben@b9.test',
      passwordHash: 'x',
      firstName: 'Ben',
      lastName: 'Verkauf',
    }),
  );

  const roles = dataSource.getRepository(RoleEntity);
  const inhaberRolle = ROLE_TEMPLATES.find((t) => t.key === 'owner');
  const owner = await roles.save(
    roles.create({
      workspaceId,
      name: inhaberRolle?.name ?? 'Inhaber',
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
        Permission.CONTACT_VIEW,
        Permission.DEAL_VIEW,
        Permission.DEAL_WRITE,
      ],
      sichtbarkeit: { company: 'eigene', contact: 'eigene', deal: 'eigene' },
      isSystem: false,
    }),
  );

  const memberships = dataSource.getRepository(MembershipEntity);

  await memberships.save([
    memberships.create({
      userId: anna.id,
      workspaceId,
      role: MembershipRole.OWNER,
      roleId: owner.id,
    }),
    memberships.create({
      userId: ben.id,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: eigene.id,
    }),
  ]);

  inhaberin = { userId: anna.id, workspaceId, email: anna.email };
  verkaeufer = { userId: ben.id, workspaceId, email: ben.email };

  await firmen.create(workspaceId, { name: 'Bens Firma', ownerId: ben.id });
  fremdeFirma = (
    await firmen.create(workspaceId, { name: 'Annas Firma', ownerId: anna.id })
  ).id;
  await firmen.create(workspaceId, { name: 'Freie Firma', ownerId: null });

  await kontakte.create(workspaceId, {
    firstName: 'Bens',
    lastName: 'Kontakt',
    ownerId: ben.id,
    companyId: fremdeFirma,
  });
  await kontakte.create(workspaceId, {
    firstName: 'Annas',
    lastName: 'Kontakt',
    ownerId: anna.id,
    companyId: fremdeFirma,
  });

  for (const [name, ownerId, stage, amount] of [
    ['Bens Geschäft', ben.id, DealStage.LEAD, 100],
    ['Annas Geschäft', anna.id, DealStage.LEAD, 1000],
    ['Freies Geschäft', null, DealStage.LEAD, 10],
    ['Annas Gewinn', anna.id, DealStage.WON, 5000],
    ['Bens Gewinn', ben.id, DealStage.WON, 50],
  ] as const) {
    await geschaefte.create(workspaceId, {
      name,
      ownerId,
      stage,
      amount,
      companyId: fremdeFirma,
      closeDate: stage === DealStage.WON ? heute : null,
    });
  }
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

const namen = (zeilen: { name: string }[]) => zeilen.map((z) => z.name).sort();

describe('eine Rolle mit „nur eigene“', () => {
  it('sieht in der Liste nur eigene und freie', async () => {
    const seite = await als(verkaeufer, () => firmen.list(workspaceId));

    expect(namen(seite.items)).toEqual(['Bens Firma', 'Freie Firma']);
    expect(seite.totalCount).toBe(2);
  });

  it('findet Fremdes auch über die Suche nicht', async () => {
    const seite = await als(verkaeufer, () =>
      firmen.list(workspaceId, { search: 'Annas' }),
    );

    expect(seite.items).toEqual([]);
  });

  it('bekommt eine fremde Akte als „nicht gefunden“', async () => {
    await expect(
      als(verkaeufer, () => firmen.findOne(workspaceId, fremdeFirma)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('exportiert nur, was sichtbar ist', async () => {
    const zeilen = await als(verkaeufer, () => geschaefte.listAll(workspaceId));

    expect(namen(zeilen)).toEqual([
      'Bens Geschäft',
      'Bens Gewinn',
      'Freies Geschäft',
    ]);
  });

  it('zählt nur, was sichtbar ist', async () => {
    const [anzahl, offen, wert, pipeline] = await als(verkaeufer, () =>
      Promise.all([
        firmen.count(workspaceId),
        geschaefte.countOpen(workspaceId),
        geschaefte.openPipelineValue(workspaceId),
        geschaefte.pipelineByStage(workspaceId),
      ]),
    );

    expect(anzahl).toBe(2);
    expect(offen).toBe(2);
    expect(wert).toBe(110);
    expect(pipeline.find((p) => p.stage === DealStage.WON)?.totalAmount).toBe(
      50,
    );

    await new Promise((fertig) => setTimeout(fertig, 20));
    const ruhend = await als(verkaeufer, () =>
      geschaefte.anzahlRuhend(workspaceId, 0),
    );

    expect(ruhend).toBe(2);
  });

  it('sieht in den Listen einer Akte nur Sichtbares', async () => {
    const [deals, leute] = await als(verkaeufer, () =>
      Promise.all([
        geschaefte.findByCompany(workspaceId, fremdeFirma),
        kontakte.findByCompany(workspaceId, fremdeFirma),
      ]),
    );

    expect(namen(deals)).toEqual([
      'Bens Geschäft',
      'Bens Gewinn',
      'Freies Geschäft',
    ]);
    expect(leute.map((k) => k.firstName)).toEqual(['Bens']);
  });

  it('wertet nur Sichtbares aus', async () => {
    const daten = await als(verkaeufer, () =>
      auswertung.berechne(workspaceId, heute, heute, null),
    );

    expect(daten.gewonnenSumme).toBe(50);
  });

  it('kann ein Geschäft abgeben, ohne danach einen Fehler zu bekommen', async () => {
    const neu = await geschaefte.create(workspaceId, {
      name: 'Zum Abgeben',
      ownerId: verkaeufer.userId,
    });

    const gespeichert = await als(verkaeufer, () =>
      geschaefte.update(workspaceId, neu.id, { ownerId: inhaberin.userId }),
    );

    expect(gespeichert.ownerId).toBe(inhaberin.userId);
    await expect(
      als(verkaeufer, () => geschaefte.findOne(workspaceId, neu.id)),
    ).rejects.toBeInstanceOf(NotFoundException);
    await geschaefte.remove(workspaceId, neu.id);
  });

  it('kommt an Notizen fremder Geschäfte nicht heran', async () => {
    const notizen = new NotesService(
      dataSource.getRepository(NoteEntity),
      new CustomFieldsService(dataSource.getRepository(CustomFieldDefinition)),
    );
    const resolver = new NotesResolver(
      notizen,
      permissions,
      dataSource.getRepository(UserEntity),
      { nachDemSpeichern: () => Promise.resolve([]) } as never,
    );
    const annas = (await geschaefte.listAll(workspaceId)).find(
      (d) => d.name === 'Annas Geschäft',
    );
    const notiz = await notizen.createForTarget(
      workspaceId,
      inhaberin.userId,
      'Vertraulicher Rabatt',
      { dealId: annas?.id },
    );

    await expect(
      als(verkaeufer, () =>
        resolver.updateNote(verkaeufer, { id: notiz.id, body: 'weg' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      als(verkaeufer, () => resolver.deleteNote(verkaeufer, notiz.id)),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      als(verkaeufer, () =>
        resolver.createNote(verkaeufer, { body: 'x', dealId: annas?.id }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect((await notizen.findOne(workspaceId, notiz.id)).body).toBe(
      'Vertraulicher Rabatt',
    );
    expect(
      await als(verkaeufer, () =>
        resolver.notizSuche(verkaeufer, 'Vertraulicher'),
      ),
    ).toEqual([]);
  });

  it('darf einer Rolle nicht mehr Zeilen öffnen, als sie selbst sieht', async () => {
    await expect(
      permissions.assertSichtbarkeitVergebbar(verkaeufer, { deal: 'alle' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      permissions.assertSichtbarkeitVergebbar(inhaberin, { deal: 'alle' }),
    ).resolves.toBeUndefined();
  });
});

describe('verknüpfte Akten eines sichtbaren Datensatzes', () => {
  it('zeigt am eigenen Geschäft und Kontakt keine fremde Firma', async () => {
    const [deal] = (
      await als(verkaeufer, () =>
        geschaefte.list(workspaceId, { search: 'Bens Geschäft' }),
      )
    ).items;
    const [kontakt] = (
      await als(verkaeufer, () =>
        kontakte.list(workspaceId, { search: 'Bens' }),
      )
    ).items;

    expect(deal.company?.name).toBe('Annas Firma');
    expect(
      await als(verkaeufer, () =>
        DealsResolver.prototype.company.call(null, deal),
      ),
    ).toBeNull();
    expect(
      await als(verkaeufer, () =>
        ContactsResolver.prototype.company.call(null, kontakt),
      ),
    ).toBeNull();
    expect(deal.companyId).toBe(fremdeFirma);

    expect(
      (
        await als(inhaberin, () =>
          DealsResolver.prototype.company.call(null, deal),
        )
      )?.name,
    ).toBe('Annas Firma');
  });

  it('nennt die fremde Firma auch nicht im Export', async () => {
    const felder = new CustomFieldsService(
      dataSource.getRepository(CustomFieldDefinition),
    );
    const csv = await als(verkaeufer, () =>
      new ExportService(firmen, kontakte, geschaefte, felder).csv(
        workspaceId,
        'DEAL',
      ),
    );

    expect(csv).toContain('Bens Geschäft');
    expect(csv).not.toContain('Annas Firma');

    const alles = await als(inhaberin, () =>
      new ExportService(firmen, kontakte, geschaefte, felder).csv(
        workspaceId,
        'DEAL',
      ),
    );

    expect(alles).toContain('Annas Firma');
  });

  it('nennt sie nicht im Dubletten-Hinweis', async () => {
    const treffer = await als(verkaeufer, () =>
      new DublettenService(dataSource).kontakte(workspaceId, 'Bens', 'Kontakt'),
    );

    expect(treffer).toHaveLength(1);
    expect(treffer[0].detail ?? '').not.toContain('Annas Firma');
  });
});

describe('ohne Einschränkung', () => {
  it('sieht die Inhaberin alles', async () => {
    const seite = await als(inhaberin, () => firmen.list(workspaceId));

    expect(seite.totalCount).toBe(3);
  });

  it('sieht ein Hintergrundjob ohne Anfrage alles', async () => {
    const seite = await firmen.list(workspaceId);
    const offen = await geschaefte.countOpen(workspaceId);

    expect(seite.totalCount).toBe(3);
    expect(offen).toBe(3);
  });
});

describe('was an einer fremden Akte hängt', () => {
  let aufgaben: TasksService;
  let termine: AppointmentsService;
  let angebote: QuotesService;
  let rechnungen: InvoicesService;
  let post: MailboxesService;
  let annas: string;
  let annasKontakt: string;

  beforeAll(async () => {
    const felder = new CustomFieldsService(
      dataSource.getRepository(CustomFieldDefinition),
    );

    aufgaben = new TasksService(dataSource.getRepository(TaskEntity), felder);
    termine = new AppointmentsService(
      dataSource.getRepository(AppointmentEntity),
      dataSource.getRepository(AppointmentAttendeeEntity),
    );
    angebote = new QuotesService(
      dataSource.getRepository(QuoteEntity),
      dataSource,
      new LetterheadsService(dataSource.getRepository(LetterheadEntity)),
    );
    rechnungen = new InvoicesService(
      dataSource.getRepository(InvoiceEntity),
      dataSource.getRepository(InvoiceLineEntity),
      dataSource.getRepository(QuoteEntity),
      dataSource.getRepository(LetterheadEntity),
      dataSource,
    );
    post = new MailboxesService(
      dataSource.getRepository(MailboxEntity),
      dataSource.getRepository(MailMessageEntity),
      dataSource.getRepository(ContactEntity),
      dataSource.getRepository(CompanyEntity),
      {} as never,
      { send: () => Promise.resolve() } as never,
      { get: () => undefined } as never,
      dataSource.getRepository(MailSperreEntity),
      dataSource,
    );

    annas =
      (await geschaefte.listAll(workspaceId)).find(
        (d) => d.name === 'Annas Geschäft',
      )?.id ?? '';
    annasKontakt =
      (await kontakte.listAll(workspaceId)).find((k) => k.firstName === 'Annas')
        ?.id ?? '';
  });

  it('Aufgaben: fremde nicht, die eigene an fremder Akte schon', async () => {
    const fremd = await aufgaben.createForTarget(
      workspaceId,
      inhaberin.userId,
      { title: 'Annas Aufgabe', assigneeId: inhaberin.userId },
      { dealId: annas },
    );
    const fuerBen = await aufgaben.createForTarget(
      workspaceId,
      inhaberin.userId,
      { title: 'Aufgabe für Ben', assigneeId: verkaeufer.userId },
      { dealId: annas },
    );

    const titel = (
      await als(verkaeufer, () =>
        aufgaben.list(workspaceId, { search: 'Aufgabe' }),
      )
    ).items.map((t) => t.title);

    expect(titel).toEqual(['Aufgabe für Ben']);

    for (const versuch of <(() => Promise<unknown>)[]>[
      () => aufgaben.findOne(workspaceId, fremd.id),
      () => aufgaben.update(workspaceId, fremd.id, { title: 'weg' }),
      () => aufgaben.setStatus(workspaceId, fremd.id, 'erledigt'),
      () => aufgaben.remove(workspaceId, fremd.id, verkaeufer.userId),
      () =>
        aufgaben.createForTarget(
          workspaceId,
          verkaeufer.userId,
          { title: 'Untergeschoben' },
          { dealId: annas },
        ),
    ]) {
      await expect(als(verkaeufer, versuch)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    }

    const eigene = await als(verkaeufer, () =>
      aufgaben.update(workspaceId, fuerBen.id, { title: 'Erledigt bald' }),
    );

    expect(eigene.title).toBe('Erledigt bald');
    expect(
      await als(verkaeufer, async () =>
        sichtbareAkte(
          'deal',
          (await aufgaben.findOne(workspaceId, fuerBen.id)).deal,
        ),
      ),
    ).toBeNull();
  });

  it('Termine: fremde nicht im Kalender, nicht einzeln, nicht neu', async () => {
    const zeit = {
      startDate: heute,
      startTime: '10:00',
      endDate: heute,
      endTime: '11:00',
    };
    const fremd = await termine.create(workspaceId, inhaberin.userId, {
      title: 'Annas Termin',
      dealId: annas,
      ...zeit,
    });

    await termine.create(workspaceId, inhaberin.userId, {
      title: 'Bens Termin',
      ownerId: verkaeufer.userId,
      dealId: annas,
      ...zeit,
    });
    await termine.create(workspaceId, inhaberin.userId, {
      title: 'Teamrunde',
      ...zeit,
    });

    const kalender = await als(verkaeufer, () =>
      termine.range(workspaceId, heute, heute),
    );

    expect(kalender.map((t) => t.title).sort()).toEqual([
      'Bens Termin',
      'Teamrunde',
    ]);
    await expect(
      als(verkaeufer, () => termine.byId(workspaceId, fremd.id)),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      als(verkaeufer, () =>
        termine.create(workspaceId, verkaeufer.userId, {
          title: 'Untergeschoben',
          dealId: annas,
          ...zeit,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('Angebote und Rechnungen: nur an sichtbaren Akten', async () => {
    const angebot = await angebote.create(
      workspaceId,
      { dealId: annas },
      inhaberin.userId,
    );
    const rechnung = await rechnungen.create(workspaceId, { dealId: annas });

    expect(
      (await als(verkaeufer, () => angebote.list(workspaceId))).map(
        (a) => a.id,
      ),
    ).not.toContain(angebot.id);
    expect(
      (await als(verkaeufer, () => rechnungen.list(workspaceId))).map(
        (r) => r.id,
      ),
    ).not.toContain(rechnung.id);
    await expect(
      als(verkaeufer, () => angebote.findOne(workspaceId, angebot.id)),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      als(verkaeufer, () => rechnungen.findOne(workspaceId, rechnung.id)),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      als(verkaeufer, () =>
        rechnungen.createFromQuote(workspaceId, angebot.id),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      als(verkaeufer, () => angebote.create(workspaceId, { dealId: annas })),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      als(verkaeufer, () =>
        rechnungen.issuedBetween(workspaceId, heute, heute),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      als(inhaberin, () => rechnungen.issuedBetween(workspaceId, heute, heute)),
    ).resolves.toBeDefined();
  });

  it('Dateien: weder an der Akte noch an ihrer Notiz', async () => {
    const notiz = await dataSource.getRepository(NoteEntity).save(
      dataSource.getRepository(NoteEntity).create({
        workspaceId,
        authorId: inhaberin.userId,
        body: 'Mit Anhang',
        dealId: annas,
      }),
    );
    const manager = dataSource.manager;

    for (const ziel of [{ dealId: annas }, { noteId: notiz.id }]) {
      await expect(
        als(verkaeufer, () => zielMitAkte(manager, workspaceId, ziel)),
      ).rejects.toBeInstanceOf(NotFoundException);
    }

    await expect(
      als(inhaberin, () =>
        zielMitAkte(manager, workspaceId, { dealId: annas }),
      ),
    ).resolves.toBeDefined();
  });

  it('Post: aus fremden Postfächern nur zu sichtbaren Kontakten', async () => {
    const postfach = async (userId: string) =>
      (
        (await dataSource.query(
          `INSERT INTO "mailboxes" ("workspaceId", "userId", host, username, "passwordSealed", sichtbarkeit)
           VALUES ($1, $2, 'imap.test', $3, 'x', 'alles') RETURNING id`,
          [workspaceId, userId, `postfach-${userId}`],
        )) as { id: string }[]
      )[0]?.id;
    const nachricht = (mailboxId: string | undefined, betreff: string) =>
      dataSource.query(
        `INSERT INTO "mail_messages" ("workspaceId", "mailboxId", "messageId", "fromAddress", "toAddresses", "sentAt", subject, "contactId")
         VALUES ($1, $2, $3, 'kunde@annas.test', 'x@test', now(), $3, $4)`,
        [workspaceId, mailboxId, betreff, annasKontakt],
      );

    await nachricht(await postfach(inhaberin.userId), 'Angebot Annas Kunde');
    await nachricht(await postfach(verkaeufer.userId), 'Angebot an Ben');

    const betreffe = (liste: MailMessageEntity[]) =>
      liste.map((m) => m.subject);

    expect(
      betreffe(
        await als(verkaeufer, () =>
          post.suche(workspaceId, verkaeufer.userId, 'Angebot'),
        ),
      ),
    ).toEqual(['Angebot an Ben']);
    expect(
      betreffe(
        await als(verkaeufer, () =>
          post.forContact(workspaceId, annasKontakt, verkaeufer.userId),
        ),
      ),
    ).toEqual(['Angebot an Ben']);
    await expect(
      als(verkaeufer, () =>
        post.forDeal(workspaceId, annas, verkaeufer.userId),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      (
        await als(inhaberin, () =>
          post.suche(workspaceId, inhaberin.userId, 'Angebot'),
        )
      ).length,
    ).toBe(2);
  });

  it('Verlauf: nur Einträge zu sichtbaren Datensätzen', async () => {
    const bens = (await geschaefte.listAll(workspaceId)).find(
      (d) => d.name === 'Bens Geschäft',
    );

    await dataSource.query(
      `INSERT INTO "audit_log" ("workspaceId", "actorId", action, "entityType", "entityId", summary)
       VALUES ($1, $2, 'created', 'Deal', $3, 'Annas Geschäft'),
              ($1, $2, 'created', 'Deal', $4, 'Bens Geschäft')`,
      [workspaceId, inhaberin.userId, annas, bens?.id],
    );

    const verlauf = new AuditResolver(
      dataSource.getRepository(AuditLogEntity),
      dataSource.getRepository(UserEntity),
      permissions,
    );

    const summen = (
      await als(verkaeufer, () => verlauf.auditLog(verkaeufer))
    ).map((e) => e.summary);

    expect(summen).toContain('Bens Geschäft');
    expect(summen).not.toContain('Annas Geschäft');
    expect(
      (await als(verkaeufer, () => verlauf.herkunft(verkaeufer, 'Deal', annas)))
        .erstelltVon,
    ).toBeNull();
  });
});
