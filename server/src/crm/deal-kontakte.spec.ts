import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { AuditLogEntity } from '../audit/audit-log.entity';
import { aenderungenFuerLeser, AuditResolver } from '../audit/audit.resolver';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { runWithRequestContext } from '../observability/request-context';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { hoereAuf, type Meldung } from '../webhooks/ereignisse';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { RoleEntity } from '../workspaces/role.entity';
import { setzeSichtfeld } from '../workspaces/sichtbarkeit';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { AppointmentAttendeeEntity } from '../calendar/appointment-attendee.entity';
import { AppointmentEntity } from '../calendar/appointment.entity';
import { AppointmentsService } from '../calendar/appointments.service';
import { CompaniesResolver } from './companies.resolver';
import { ContactsService } from './contacts.service';
import { DealKontakteResolver } from './deal-kontakte.resolver';
import {
  DealKontakteService,
  MAX_DEAL_KONTAKTE,
} from './deal-kontakte.service';
import { DealsService } from './deals.service';
import { DublettenService } from './dubletten.service';
import { CompanyEntity } from './entities/company.entity';
import { ContactEntity } from './entities/contact.entity';
import { DealKontaktEntity } from './entities/deal-kontakt.entity';
import { DealEntity } from './entities/deal.entity';
import { NoteEntity } from './entities/note.entity';
import { TaskEntity } from './entities/task.entity';
import { NotesService } from './notes.service';
import { TasksService } from './tasks.service';

const SUITE = 'deal_kontakte';

jest.setTimeout(60_000);

let dataSource: DataSource;
let permissions: PermissionsService;
let kontakte: ContactsService;
let geschaefte: DealsService;
let beteiligte: DealKontakteService;
let notizen: NotesService;
let aufgaben: TasksService;
let termine: AppointmentsService;
let workspaceId: string;
let inhaberin: RequestUser;
let verkaeufer: RequestUser;
let buchhaltung: RequestUser;

const als = <T>(wer: RequestUser, tun: () => Promise<T>): Promise<T> =>
  runWithRequestContext({ requestId: 'test', userId: wer.userId }, () => {
    setzeSichtfeld(() => permissions.sichtfeldFuer(wer));

    return tun();
  });

const kontakt = (
  vorname: string,
  ownerId: string | null,
  extra: Partial<ContactEntity> = {},
) =>
  kontakte.create(workspaceId, {
    firstName: vorname,
    lastName: 'Test',
    ownerId,
    ...extra,
  });

const geschaeft = (name: string, ownerId: string | null, extra = {}) =>
  geschaefte.create(workspaceId, { name, ownerId, ...extra });

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  permissions = new PermissionsService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(RoleEntity),
  );

  const felder = new CustomFieldsService(
    dataSource.getRepository(CustomFieldDefinition),
  );

  kontakte = new ContactsService(
    dataSource.getRepository(ContactEntity),
    felder,
  );
  geschaefte = new DealsService(dataSource.getRepository(DealEntity), felder);
  beteiligte = new DealKontakteService(
    dataSource.getRepository(DealKontaktEntity),
    geschaefte,
    kontakte,
  );
  notizen = new NotesService(dataSource.getRepository(NoteEntity), felder);
  aufgaben = new TasksService(dataSource.getRepository(TaskEntity), felder);
  termine = new AppointmentsService(
    dataSource.getRepository(AppointmentEntity),
    dataSource.getRepository(AppointmentAttendeeEntity),
  );

  const m = dataSource.manager;

  workspaceId = (
    await m.save(m.create(WorkspaceEntity, { name: 'DK', slug: 'dk' }))
  ).id;

  const anna = await m.save(
    m.create(UserEntity, {
      email: 'anna@dk.test',
      passwordHash: 'x',
      firstName: 'Anna',
      lastName: 'Inhaberin',
    }),
  );
  const ben = await m.save(
    m.create(UserEntity, {
      email: 'ben@dk.test',
      passwordHash: 'x',
      firstName: 'Ben',
      lastName: 'Verkauf',
    }),
  );
  const eigene = await m.save(
    m.create(RoleEntity, {
      workspaceId,
      name: 'Außendienst',
      everything: false,
      permissions: [
        Permission.COMPANY_VIEW,
        Permission.CONTACT_VIEW,
        Permission.DEAL_VIEW,
        Permission.DEAL_WRITE,
        Permission.TASK_VIEW,
        Permission.APPOINTMENT_VIEW,
      ],
      sichtbarkeit: { company: 'alle', contact: 'eigene', deal: 'eigene' },
      isSystem: false,
    }),
  );

  const ohneKontakte = await m.save(
    m.create(RoleEntity, {
      workspaceId,
      name: 'Buchhaltung',
      everything: false,
      permissions: [
        Permission.COMPANY_VIEW,
        Permission.DEAL_VIEW,
        Permission.TASK_VIEW,
        Permission.APPOINTMENT_VIEW,
      ],
      sichtbarkeit: { company: 'alle', contact: 'alle', deal: 'alle' },
      isSystem: false,
    }),
  );
  const clara = await m.save(
    m.create(UserEntity, {
      email: 'clara@dk.test',
      passwordHash: 'x',
      firstName: 'Clara',
      lastName: 'Buchhaltung',
    }),
  );

  await m.save([
    m.create(MembershipEntity, {
      userId: clara.id,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: ohneKontakte.id,
    }),
    m.create(MembershipEntity, {
      userId: anna.id,
      workspaceId,
      role: MembershipRole.OWNER,
    }),
    m.create(MembershipEntity, {
      userId: ben.id,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: eigene.id,
    }),
  ]);

  inhaberin = { userId: anna.id, workspaceId, email: anna.email };
  verkaeufer = { userId: ben.id, workspaceId, email: ben.email };
  buchhaltung = { userId: clara.id, workspaceId, email: clara.email };
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

describe('weitere Kontakte an einem Geschäft', () => {
  it('nimmt Kontakte mit Rolle auf, schreibt es in den Verlauf und meldet es', async () => {
    const meldungen: Meldung[] = [];
    const aus = hoereAuf((meldung) => meldungen.push(meldung));
    const deal = await geschaeft('Ausschreibung', null);
    const eva = await kontakt('Eva', null);

    const zeile = await als(inhaberin, () =>
      beteiligte.hinzufuegen(workspaceId, deal.id, eva.id, '  Entscheider '),
    );

    aus();

    expect(zeile.rolle).toBe('Entscheider');
    expect(
      (await beteiligte.fuerGeschaeft(workspaceId, deal.id)).map((z) => [
        z.contact?.firstName,
        z.rolle,
      ]),
    ).toEqual([['Eva', 'Entscheider']]);

    const verlauf = await dataSource.manager.find(AuditLogEntity, {
      where: { entityId: deal.id, entityType: 'Deal' },
    });

    expect(verlauf.map((eintrag) => eintrag.changes)).toContainEqual({
      beteiligte: [null, 'Eva Test (Entscheider)'],
      beteiligteKontaktId: [eva.id, eva.id],
    });
    expect(verlauf.at(-1)?.actorId).toBe(inhaberin.userId);
    expect(meldungen).toContainEqual({
      workspaceId,
      event: 'deal.contact_added',
      data: { dealId: deal.id, contactId: eva.id, rolle: 'Entscheider' },
    });
  });

  it('lehnt den Hauptkontakt, Doppelte, zu lange Rollen und zu viele ab', async () => {
    const haupt = await kontakt('Haupt', null);
    const deal = await geschaeft('Doppelt', null, {
      primaryContactId: haupt.id,
    });
    const tom = await kontakt('Tom', null);

    await expect(
      beteiligte.hinzufuegen(workspaceId, deal.id, haupt.id, null),
    ).rejects.toThrow(BadRequestException);
    await beteiligte.hinzufuegen(workspaceId, deal.id, tom.id, null);
    await expect(
      beteiligte.hinzufuegen(workspaceId, deal.id, tom.id, 'Einkauf'),
    ).rejects.toThrow(ConflictException);
    await expect(
      beteiligte.hinzufuegen(
        workspaceId,
        deal.id,
        (await kontakt('Lang', null)).id,
        'x'.repeat(61),
      ),
    ).rejects.toThrow(BadRequestException);

    const voll = await geschaeft('Voll', null);

    for (let i = 0; i < MAX_DEAL_KONTAKTE; i += 1) {
      await dataSource.manager.save(
        dataSource.manager.create(DealKontaktEntity, {
          workspaceId,
          dealId: voll.id,
          contactId: (await kontakt(`K${String(i)}`, null)).id,
        }),
      );
    }

    await expect(
      beteiligte.hinzufuegen(
        workspaceId,
        voll.id,
        (await kontakt('Zuviel', null)).id,
        null,
      ),
    ).rejects.toThrow(/höchstens 50/);
  });

  it('ändert die Rolle, entfernt und macht zum Hauptkontakt', async () => {
    const alt = await kontakt('Alt', null);
    const neu = await kontakt('Neu', null);
    const deal = await geschaeft('Tausch', null, { primaryContactId: alt.id });
    const zeile = await beteiligte.hinzufuegen(
      workspaceId,
      deal.id,
      neu.id,
      'Technik',
    );

    expect(
      (await beteiligte.rolleAendern(workspaceId, zeile.id, '')).rolle,
    ).toBeNull();

    const getauscht = await beteiligte.zumHauptkontakt(workspaceId, zeile.id);

    expect(getauscht.primaryContactId).toBe(neu.id);
    expect(
      (await beteiligte.fuerGeschaeft(workspaceId, deal.id)).map(
        (z) => z.contactId,
      ),
    ).toEqual([alt.id]);

    const [rest] = await beteiligte.fuerGeschaeft(workspaceId, deal.id);

    await beteiligte.entfernen(workspaceId, rest.id);
    expect(await beteiligte.fuerGeschaeft(workspaceId, deal.id)).toEqual([]);
  });

  it('zeigt das Geschäft auch beim beteiligten Kontakt', async () => {
    const lea = await kontakt('Lea', null);
    const deal = await geschaeft('Bei Lea', null);

    await beteiligte.hinzufuegen(workspaceId, deal.id, lea.id, 'Einkauf');

    expect(
      (await geschaefte.findByContact(workspaceId, lea.id)).map((d) => d.id),
    ).toEqual([deal.id]);
    expect(
      (await beteiligte.fuerKontakt(workspaceId, lea.id)).map((z) => z.rolle),
    ).toEqual(['Einkauf']);
  });

  it('lässt einen Kontakt im Papierkorb aus der Liste fallen', async () => {
    const weg = await kontakt('Weg', null);
    const deal = await geschaeft('Papierkorb', null);

    await beteiligte.hinzufuegen(workspaceId, deal.id, weg.id, null);
    await dataSource.getRepository(ContactEntity).softRemove(weg);

    expect(await beteiligte.fuerGeschaeft(workspaceId, deal.id)).toEqual([]);
    expect(await geschaefte.beteiligteAlsText(workspaceId, [deal.id])).toEqual(
      new Map(),
    );
  });
});

describe('unter Zeilenrechten', () => {
  it('ändert nur sichtbare Geschäfte mit sichtbaren Kontakten', async () => {
    const bensDeal = await geschaeft('Bens Geschäft', verkaeufer.userId);
    const annasDeal = await geschaeft('Annas Geschäft', inhaberin.userId);
    const bensKontakt = await kontakt('Bens', verkaeufer.userId);
    const annasKontakt = await kontakt('Annas', inhaberin.userId);

    await expect(
      als(verkaeufer, () =>
        beteiligte.hinzufuegen(workspaceId, annasDeal.id, bensKontakt.id, null),
      ),
    ).rejects.toThrow(NotFoundException);
    await expect(
      als(verkaeufer, () =>
        beteiligte.hinzufuegen(workspaceId, bensDeal.id, annasKontakt.id, null),
      ),
    ).rejects.toThrow(NotFoundException);

    await als(inhaberin, () =>
      beteiligte.hinzufuegen(workspaceId, bensDeal.id, annasKontakt.id, 'Chef'),
    );

    const resolver = new DealKontakteResolver(permissions, beteiligte);
    const zeilen = await beteiligte.fuerGeschaeft(workspaceId, bensDeal.id);

    expect(await als(verkaeufer, () => resolver.contact(zeilen[0]))).toBeNull();
    expect(zeilen[0].contactId).toBe(annasKontakt.id);
    expect(
      await als(verkaeufer, () =>
        geschaefte.beteiligteAlsText(workspaceId, [bensDeal.id]),
      ),
    ).toEqual(new Map());
    expect(
      await als(inhaberin, () =>
        geschaefte.beteiligteAlsText(workspaceId, [bensDeal.id]),
      ),
    ).toEqual(new Map([[bensDeal.id, 'Annas Test (Chef)']]));

    await als(inhaberin, () =>
      beteiligte.hinzufuegen(workspaceId, annasDeal.id, bensKontakt.id, null),
    );
    expect(
      (
        await als(verkaeufer, () =>
          beteiligte.fuerKontakt(workspaceId, bensKontakt.id),
        )
      ).map((z) => z.dealId),
    ).toEqual([]);
  });
});

describe('Beteiligte im Verlauf', () => {
  it('zeigt den Namen nur, wer den Kontakt sieht, und ändert nur sichtbare', async () => {
    const deal = await geschaeft('Verlauf bei Ben', verkaeufer.userId);
    const fremd = await kontakt('Erika', inhaberin.userId);
    const eigen = await kontakt('Bernd', verkaeufer.userId);

    const zeile = await als(inhaberin, () =>
      beteiligte.hinzufuegen(workspaceId, deal.id, fremd.id, 'Entscheider'),
    );

    await als(verkaeufer, () =>
      beteiligte.hinzufuegen(workspaceId, deal.id, eigen.id, 'Technik'),
    );

    const protokoll = new AuditResolver(
      dataSource.getRepository(AuditLogEntity),
      dataSource.getRepository(UserEntity),
      permissions,
    );
    const verlauf = (wer: RequestUser, entityId?: string) =>
      als(wer, async () => {
        const eintraege = await protokoll.auditLog(wer, entityId, 200);

        return Promise.all(
          eintraege
            .filter((e) => e.entityId === deal.id)
            .map((e) => protokoll.changes(wer, e)),
        );
      });

    const fuerBen = JSON.stringify(await verlauf(verkaeufer, deal.id));

    expect(fuerBen).not.toContain('Erika');
    expect(fuerBen).not.toContain(fremd.id);
    expect(fuerBen).toContain('Nicht sichtbar');
    expect(fuerBen).toContain('Bernd Test (Technik)');
    expect(JSON.stringify(await verlauf(verkaeufer))).not.toContain('Erika');

    const fuerClara = JSON.stringify(await verlauf(buchhaltung, deal.id));

    expect(fuerClara).not.toContain('Erika');
    expect(fuerClara).not.toContain('Bernd');

    expect(JSON.stringify(await verlauf(inhaberin, deal.id))).toContain(
      'Erika Test (Entscheider)',
    );

    const [eintrag] = await dataSource.manager.find(AuditLogEntity, {
      where: { entityId: deal.id, entityType: 'Deal' },
      order: { createdAt: 'ASC' },
    });

    expect(
      await als(verkaeufer, () => aenderungenFuerLeser(eintrag)),
    ).not.toContain('Erika');
    expect(await als(inhaberin, () => aenderungenFuerLeser(eintrag))).toBe(
      JSON.stringify({ beteiligte: [null, 'Erika Test (Entscheider)'] }),
    );

    await expect(
      als(verkaeufer, () =>
        beteiligte.rolleAendern(workspaceId, zeile.id, 'X'),
      ),
    ).rejects.toThrow(NotFoundException);
    await expect(
      als(verkaeufer, () => beteiligte.entfernen(workspaceId, zeile.id)),
    ).rejects.toThrow(NotFoundException);
    await expect(
      als(verkaeufer, () => beteiligte.zumHauptkontakt(workspaceId, zeile.id)),
    ).rejects.toThrow(NotFoundException);
    expect(
      (await beteiligte.fuerGeschaeft(workspaceId, deal.id)).find(
        (z) => z.id === zeile.id,
      )?.rolle,
    ).toBe('Entscheider');
  });
});

describe('Zusammenführen von Kontakten', () => {
  it('lässt je Geschäft eine Beteiligung und keine neben dem Hauptkontakt', async () => {
    const behalten = await kontakt('Behalten', null);
    const doppelt = await kontakt('Doppelt', null);
    const deal = await geschaeft('Beide dran', null);
    const hauptDeal = await geschaeft('Haupt dran', null, {
      primaryContactId: behalten.id,
    });

    await beteiligte.hinzufuegen(workspaceId, deal.id, behalten.id, 'Technik');
    await beteiligte.hinzufuegen(workspaceId, deal.id, doppelt.id, 'Einkauf');
    await beteiligte.hinzufuegen(workspaceId, hauptDeal.id, doppelt.id, null);

    await new DublettenService(dataSource).zusammenfuehrenMehrere(
      workspaceId,
      'kontakt',
      behalten.id,
      [doppelt.id],
      null,
    );

    expect(
      (await beteiligte.fuerGeschaeft(workspaceId, deal.id)).map((z) => [
        z.contactId,
        z.rolle,
      ]),
    ).toEqual([[behalten.id, 'Technik']]);
    expect(await beteiligte.fuerGeschaeft(workspaceId, hauptDeal.id)).toEqual(
      [],
    );
  });
});

describe('die Firma zeigt, was an ihren Kontakten hängt', () => {
  it('Notizen, Aufgaben und Termine ihrer sichtbaren Kontakte', async () => {
    const eigeneFirma = await dataSource.manager.save(
      dataSource.manager.create(CompanyEntity, {
        workspaceId,
        name: 'Zeitleiste AG',
      }),
    );
    const sichtbar = await kontakt('Sichtbar', verkaeufer.userId, {
      companyId: eigeneFirma.id,
    });
    const verborgen = await kontakt('Verborgen', inhaberin.userId, {
      companyId: eigeneFirma.id,
    });
    const woanders = await kontakt('Woanders', null);
    const m = dataSource.manager;

    for (const k of [sichtbar, verborgen, woanders]) {
      await m.save(
        m.create(NoteEntity, {
          workspaceId,
          body: `Notiz ${k.firstName}`,
          contactId: k.id,
          authorId: inhaberin.userId,
        }),
      );
      await m.save(
        m.create(TaskEntity, {
          workspaceId,
          title: `Aufgabe ${k.firstName}`,
          contactId: k.id,
          assigneeId: inhaberin.userId,
          createdById: inhaberin.userId,
        }),
      );
      await m.save(
        m.create(AppointmentEntity, {
          workspaceId,
          title: `Termin ${k.firstName}`,
          startsAt: new Date('2030-01-01T09:00:00Z'),
          endsAt: new Date('2030-01-01T10:00:00Z'),
          contactId: k.id,
          ownerId: inhaberin.userId,
          createdById: inhaberin.userId,
        }),
      );
    }

    const fuer = async (wer: RequestUser) =>
      als(wer, async () => ({
        notizen: (
          await notizen.fuerKontakteDerFirma(workspaceId, eigeneFirma.id)
        ).map((n) => n.body),
        aufgaben: (
          await aufgaben.fuerKontakteDerFirma(workspaceId, eigeneFirma.id)
        ).map((a) => a.title),
        termine: (
          await termine.fuerKontakteDerFirma(workspaceId, eigeneFirma.id)
        ).map((t) => t.title),
      }));

    expect(await fuer(inhaberin)).toEqual({
      notizen: expect.arrayContaining(['Notiz Sichtbar', 'Notiz Verborgen']),
      aufgaben: expect.arrayContaining([
        'Aufgabe Sichtbar',
        'Aufgabe Verborgen',
      ]),
      termine: expect.arrayContaining(['Termin Sichtbar', 'Termin Verborgen']),
    });

    const ben = await fuer(verkaeufer);

    expect(ben).toEqual({
      notizen: ['Notiz Sichtbar'],
      aufgaben: ['Aufgabe Sichtbar'],
      termine: ['Termin Sichtbar'],
    });
    expect(JSON.stringify(await fuer(inhaberin))).not.toContain('Woanders');

    const akte = new CompaniesResolver(
      permissions,
      {} as never,
      {} as never,
      {} as never,
      notizen,
      aufgaben,
      termine,
    );

    expect(
      await als(buchhaltung, async () => ({
        notizen: await akte.kontaktNotizen(buchhaltung, eigeneFirma),
        aufgaben: await akte.kontaktAufgaben(buchhaltung, eigeneFirma),
        termine: await akte.kontaktTermine(buchhaltung, eigeneFirma),
      })),
    ).toEqual({ notizen: [], aufgaben: [], termine: [] });
    expect(
      (await als(inhaberin, () => akte.kontaktNotizen(inhaberin, eigeneFirma)))
        .length,
    ).toBeGreaterThan(0);
  });

  it('zeigt bei vielen Terminen die kommenden und die letzten', async () => {
    const m = dataSource.manager;
    const grosskunde = await m.save(
      m.create(CompanyEntity, { workspaceId, name: 'Großkunde AG' }),
    );
    const person = await kontakt('Viel', null, { companyId: grosskunde.id });
    const jetzt = new Date('2030-06-01T12:00:00Z');
    const tag = 24 * 60 * 60 * 1000;
    const zeilen = Array.from({ length: 250 }, (_, i) => {
      const start = new Date(jetzt.getTime() + (i - 247) * tag);

      return m.create(AppointmentEntity, {
        workspaceId,
        title: `Termin ${String(i)}`,
        startsAt: start,
        endsAt: new Date(start.getTime() + 60 * 60 * 1000),
        contactId: person.id,
        ownerId: inhaberin.userId,
        createdById: inhaberin.userId,
      });
    });

    await m.save(zeilen, { chunk: 50 });

    const liste = await termine.fuerKontakteDerFirma(
      workspaceId,
      grosskunde.id,
      jetzt,
    );
    const titel = liste.map((t) => t.title);

    expect(titel.slice(0, 4)).toEqual([
      'Termin 247',
      'Termin 248',
      'Termin 249',
      'Termin 246',
    ]);
    expect(titel).toContain('Termin 200');
  });
});
