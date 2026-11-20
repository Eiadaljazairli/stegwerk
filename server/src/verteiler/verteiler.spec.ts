import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { type DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { type BillingService } from '../billing/billing.service';
import { ContactsService } from '../crm/contacts.service';
import { ContactEntity } from '../crm/entities/contact.entity';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { MailSperreEntity } from '../mailboxes/mail-sperre.entity';
import { MailboxEntity } from '../mailboxes/mailbox.entity';
import { type MailSender } from '../mailboxes/smtp-sender';
import { runWithRequestContext } from '../observability/request-context';
import { SavedViewEntity } from '../saved-views/saved-view.entity';
import {
  AbmeldungEntity,
  KampagneEntity,
  KampagnenEmpfaengerEntity,
} from '../serienmails/serienmail.entities';
import { SerienmailsService } from '../serienmails/serienmails.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { RoleEntity } from '../workspaces/role.entity';
import { setzeSichtfeld } from '../workspaces/sichtbarkeit';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { VerteilerEntity, VerteilerMitgliedEntity } from './verteiler.entity';
import { VerteilerResolver } from './verteiler.resolver';
import { MAX_MITGLIEDER, VerteilerService } from './verteiler.service';

const SUITE = 'verteiler';

jest.setTimeout(60_000);

let dataSource: DataSource;
let permissions: PermissionsService;
let service: VerteilerService;
let resolver: VerteilerResolver;
let serienmails: SerienmailsService;
let workspaceId: string;
let inhaberin: RequestUser;
let aussendienst: RequestUser;
let leser: RequestUser;
let fremd: RequestUser;
let evaId: string;
let fritzId: string;
let olafId: string;

const als = <T>(wer: RequestUser, tun: () => Promise<T>): Promise<T> =>
  runWithRequestContext({ requestId: 'test', userId: wer.userId }, () => {
    setzeSichtfeld(() => permissions.sichtfeldFuer(wer));

    return tun();
  });

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  permissions = new PermissionsService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(RoleEntity),
  );

  const kontakte = new ContactsService(
    dataSource.getRepository(ContactEntity),
    new CustomFieldsService(dataSource.getRepository(CustomFieldDefinition)),
  );

  service = new VerteilerService(
    dataSource.getRepository(VerteilerEntity),
    dataSource.getRepository(VerteilerMitgliedEntity),
  );
  resolver = new VerteilerResolver(service, permissions);
  serienmails = new SerienmailsService(
    dataSource.getRepository(KampagneEntity),
    dataSource.getRepository(KampagnenEmpfaengerEntity),
    dataSource.getRepository(AbmeldungEntity),
    dataSource.getRepository(MailboxEntity),
    dataSource.getRepository(MailSperreEntity),
    dataSource.getRepository(SavedViewEntity),
    kontakte,
    { assertCanWrite: async () => {} } as unknown as BillingService,
    { send: () => Promise.resolve() } as unknown as MailSender,
    { get: () => 'https://app.test' } as unknown as ConfigService,
    dataSource,
  );

  const m = dataSource.manager;

  workspaceId = (
    await m.save(m.create(WorkspaceEntity, { name: 'V', slug: 'v' }))
  ).id;

  const andererBereich = (
    await m.save(m.create(WorkspaceEntity, { name: 'X', slug: 'x' }))
  ).id;
  const person = (email: string) =>
    m.save(
      m.create(UserEntity, {
        email,
        passwordHash: 'x',
        firstName: email.split('@')[0],
        lastName: 'Test',
      }),
    );
  const [a, b, c, d] = await Promise.all([
    person('anna@v.test'),
    person('ben@v.test'),
    person('clara@v.test'),
    person('dora@x.test'),
  ]);
  const rolle = (name: string, rechte: Permission[]) =>
    m.save(
      m.create(RoleEntity, {
        workspaceId,
        name,
        everything: false,
        permissions: rechte,
        sichtbarkeit: { company: 'alle', contact: 'eigene', deal: 'alle' },
        isSystem: false,
      }),
    );
  const schreibt = await rolle('Außendienst', [
    Permission.CONTACT_VIEW,
    Permission.CONTACT_WRITE,
  ]);
  const liest = await rolle('Nur lesen', [Permission.CONTACT_VIEW]);

  await m.save([
    m.create(MembershipEntity, {
      userId: a.id,
      workspaceId,
      role: MembershipRole.OWNER,
    }),
    m.create(MembershipEntity, {
      userId: b.id,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: schreibt.id,
    }),
    m.create(MembershipEntity, {
      userId: c.id,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: liest.id,
    }),
    m.create(MembershipEntity, {
      userId: d.id,
      workspaceId: andererBereich,
      role: MembershipRole.OWNER,
    }),
  ]);

  inhaberin = { userId: a.id, workspaceId, email: a.email };
  aussendienst = { userId: b.id, workspaceId, email: b.email };
  leser = { userId: c.id, workspaceId, email: c.email };
  fremd = { userId: d.id, workspaceId: andererBereich, email: d.email };

  const kontakt = async (vorname: string, ownerId: string | null) =>
    (
      await m.save(
        m.create(ContactEntity, {
          workspaceId,
          firstName: vorname,
          lastName: 'Kunde',
          email: `${vorname.toLowerCase()}@kunde.de`,
          ownerId,
        }),
      )
    ).id;

  evaId = await kontakt('Eva', b.id);
  fritzId = await kontakt('Fritz', a.id);
  olafId = await kontakt('Olaf', null);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE verteiler_mitglieder, verteiler, abmeldungen, kampagnen_empfaenger, kampagnen CASCADE',
  );
});

describe('Verteiler', () => {
  it('legt an, füllt einmal je Kontakt und zählt', async () => {
    const v = await als(inhaberin, () =>
      resolver.verteilerAnlegen(inhaberin, { name: ' Weihnachtskarte 2026 ' }),
    );

    expect(v.name).toBe('Weihnachtskarte 2026');

    const gefuellt = await als(inhaberin, () =>
      resolver.verteilerMitgliederHinzufuegen(inhaberin, v.id, [
        evaId,
        fritzId,
        evaId,
      ]),
    );

    expect(gefuellt.anzahl).toBe(2);

    expect(
      (
        await als(inhaberin, () =>
          resolver.verteilerMitgliederHinzufuegen(inhaberin, v.id, [evaId]),
        )
      ).anzahl,
    ).toBe(2);

    await expect(
      als(inhaberin, () =>
        resolver.verteilerAnlegen(inhaberin, { name: 'weihnachtskarte 2026' }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('zeigt einer Rolle mit „nur eigene“ nur ihre Kontakte und lässt fremde unberührt', async () => {
    const v = await als(inhaberin, () =>
      resolver.verteilerAnlegen(inhaberin, { name: 'Messe' }),
    );

    await als(inhaberin, () =>
      resolver.verteilerMitgliederHinzufuegen(inhaberin, v.id, [
        evaId,
        fritzId,
        olafId,
      ]),
    );

    const sicht = await als(aussendienst, () =>
      resolver.verteilerMitglieder(aussendienst, v.id),
    );

    expect(sicht.map((z) => z.contact.firstName).sort()).toEqual([
      'Eva',
      'Olaf',
    ]);
    expect(
      (await als(aussendienst, () => resolver.verteilerListe(aussendienst)))[0]
        .anzahl,
    ).toBe(2);

    await als(aussendienst, () =>
      resolver.verteilerMitgliederEntfernen(aussendienst, v.id, [
        fritzId,
        evaId,
      ]),
    );
    expect(
      (
        await als(inhaberin, () =>
          resolver.verteilerMitglieder(inhaberin, v.id),
        )
      ).map((z) => z.contact.firstName),
    ).toEqual(['Fritz', 'Olaf']);
  });

  it('lässt ohne Schreibrecht nichts anlegen oder füllen', async () => {
    const v = await als(inhaberin, () =>
      resolver.verteilerAnlegen(inhaberin, { name: 'Nur für Anna' }),
    );

    await expect(
      als(leser, () => resolver.verteilerAnlegen(leser, { name: 'Neu' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      als(leser, () =>
        resolver.verteilerMitgliederHinzufuegen(leser, v.id, [olafId]),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      als(leser, () => resolver.verteilerLoeschen(leser, v.id)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      (await als(leser, () => resolver.verteilerListe(leser))).map(
        (x) => x.name,
      ),
    ).toEqual(['Nur für Anna']);
  });

  it('findet aus einem anderen Bereich nichts', async () => {
    const v = await als(inhaberin, () =>
      resolver.verteilerAnlegen(inhaberin, { name: 'Intern' }),
    );

    expect(await als(fremd, () => resolver.verteilerListe(fremd))).toEqual([]);
    await expect(
      als(fremd, () => resolver.verteilerMitglieder(fremd, v.id)),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      als(fremd, () =>
        resolver.verteilerMitgliederHinzufuegen(fremd, v.id, []),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('steht an der Kontaktakte und geht mit dem Kontakt', async () => {
    const v = await als(inhaberin, () =>
      resolver.verteilerAnlegen(inhaberin, { name: 'Akte' }),
    );

    await als(inhaberin, () =>
      resolver.verteilerMitgliederHinzufuegen(inhaberin, v.id, [olafId]),
    );

    expect(
      (await service.fuerKontakt(workspaceId, olafId)).map((x) => x.name),
    ).toEqual(['Akte']);
  });
});

describe('Obergrenze', () => {
  it('zählt Kontakte, die schon drin sind, nicht doppelt', async () => {
    const zeilen = (await dataSource.query(
      `INSERT INTO contacts ("workspaceId", "firstName", "lastName")
       SELECT $1, 'Gast', 'Nr ' || n FROM generate_series(1, $2::int) AS n
       RETURNING id`,
      [fremd.workspaceId, MAX_MITGLIEDER + 20],
    )) as { id: string }[];
    const ids = zeilen.map((zeile) => zeile.id);
    const v = await als(fremd, () =>
      resolver.verteilerAnlegen(fremd, { name: 'Groß' }),
    );

    await als(fremd, () =>
      resolver.verteilerMitgliederHinzufuegen(fremd, v.id, ids.slice(0, 4000)),
    );

    expect(
      (
        await als(fremd, () =>
          service.hinzufuegen(fremd, v.id, [
            ...ids.slice(2500, 4100),
            'keine-kennung',
          ]),
        )
      ).anzahl,
    ).toBe(4100);

    await expect(
      als(fremd, () =>
        resolver.verteilerMitgliederHinzufuegen(fremd, v.id, ids.slice(4100)),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      (
        await als(fremd, () =>
          resolver.verteilerMitgliederEntfernen(
            fremd,
            v.id,
            ids.slice(0, 4000),
          ),
        )
      ).anzahl,
    ).toBe(100);

    await dataSource.query('DELETE FROM contacts WHERE "workspaceId" = $1', [
      fremd.workspaceId,
    ]);
  });
});

describe('Verteiler als Empfängerkreis', () => {
  it('nimmt die Mitglieder, überspringt Abgemeldete und hält Zeilenrechte', async () => {
    const v = await als(inhaberin, () =>
      resolver.verteilerAnlegen(inhaberin, { name: 'Newsletter' }),
    );

    await als(inhaberin, () =>
      resolver.verteilerMitgliederHinzufuegen(inhaberin, v.id, [
        evaId,
        fritzId,
        olafId,
      ]),
    );
    await dataSource.getRepository(AbmeldungEntity).save({
      workspaceId,
      email: 'olaf@kunde.de',
      thema: 'alle',
    });

    expect(
      (
        await als(inhaberin, () =>
          resolver.verteilerMitglieder(inhaberin, v.id),
        )
      ).find((z) => z.contact.firstName === 'Olaf')?.abgemeldet,
    ).toBe(true);

    const kampagne = await serienmails.anlegen(inhaberin, {
      name: 'Herbst',
      betreff: 'Hallo {{vorname}}',
      text: 'Text',
    });

    await als(inhaberin, () =>
      serienmails.empfaengerFestlegen(inhaberin, kampagne.id, {
        verteilerId: v.id,
      }),
    );

    const zeilen = await serienmails.empfaengerListe(
      workspaceId,
      kampagne.id,
      null,
    );

    expect(zeilen.map((z) => [z.vorname, z.status, z.grund]).sort()).toEqual([
      ['Eva', 'geplant', null],
      ['Fritz', 'geplant', null],
      ['Olaf', 'uebersprungen', 'Hat sich abgemeldet'],
    ]);

    const zweite = await serienmails.anlegen(aussendienst, {
      name: 'Außendienst',
      betreff: 'Hallo',
      text: 'Text',
    });

    await als(aussendienst, () =>
      serienmails.empfaengerFestlegen(aussendienst, zweite.id, {
        verteilerId: v.id,
      }),
    );
    expect(
      (await serienmails.empfaengerListe(workspaceId, zweite.id, null))
        .map((z) => z.vorname)
        .sort(),
    ).toEqual(['Eva', 'Olaf']);

    await expect(
      als(fremd, () =>
        serienmails.empfaengerFestlegen({ ...fremd, workspaceId }, zweite.id, {
          verteilerId: '00000000-0000-4000-8000-000000000000',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
