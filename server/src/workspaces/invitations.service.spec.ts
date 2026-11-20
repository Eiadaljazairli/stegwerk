import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { type DataSource } from 'typeorm';

import { AttachmentEntity } from '../attachments/attachment.entity';
import { AttachmentsService } from '../attachments/attachments.service';
import { BegleitbelegEntity } from '../begleitbelege/begleitbeleg.entity';
import { BegleitbelegeService } from '../begleitbelege/begleitbelege.service';
import { BillingService } from '../billing/billing.service';
import { SubscriptionEntity } from '../billing/subscription.entity';
import { CompanyEntity } from '../crm/entities/company.entity';
import { TaskEntity } from '../crm/entities/task.entity';
import { type MailService } from '../mail/mail.service';
import { runWithRequestContext } from '../observability/request-context';
import { LetterheadEntity } from '../quotes/letterhead.entity';
import { LetterheadsService } from '../quotes/letterheads.service';
import { QuoteEntity } from '../quotes/quote.entity';
import { QuotesService } from '../quotes/quotes.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { InvitationEntity } from './invitation.entity';
import {
  EMAIL_NOT_VERIFIED,
  INVITATION_FOR_OTHER_ADDRESS,
  InvitationsService,
} from './invitations.service';
import { MembershipEntity, MembershipRole } from './membership.entity';
import { Permission } from './permissions';
import { PermissionsService } from './permissions.service';
import { RoleEntity } from './role.entity';
import { setzeSichtfeld } from './sichtbarkeit';
import { WorkspaceEntity } from './workspace.entity';

const SUITE = 'invitations';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: InvitationsService;
let mail: { send: jest.Mock };
let workspaceId: string;
let ownerId: string;
let adminId: string;
let memberId: string;

const config = {
  getOrThrow: () => 'https://app.example.de',
} as unknown as ConfigService;

const mitKasse = {
  get: (schluessel: string) =>
    schluessel === 'stripeSecretKey' ? 'sk_test_probe' : undefined,
} as unknown as ConfigService;

const addUser = async (email: string, bestaetigt = true) => {
  const users = dataSource.getRepository(UserEntity);

  return users.save(
    users.create({
      email,
      passwordHash: 'x',
      firstName: 'Test',
      lastName: 'Person',
      emailVerifiedAt: bestaetigt ? new Date() : null,
    }),
  );
};

const addMember = async (userId: string, role: MembershipRole) => {
  const memberships = dataSource.getRepository(MembershipEntity);

  await memberships.save(memberships.create({ userId, workspaceId, role }));
};

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE workspaces, users, tasks, invitations, memberships, subscriptions, mailboxes, appointments, quotes CASCADE',
  );

  mail = { send: jest.fn().mockResolvedValue(true) };

  const billing = new BillingService(
    dataSource.getRepository(SubscriptionEntity),
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(InvitationEntity),
    mitKasse,
  );

  service = new InvitationsService(
    dataSource.getRepository(InvitationEntity),
    dataSource.getRepository(MembershipEntity),
    dataSource,
    billing,
    mail as unknown as MailService,
    config,
  );

  const workspace = await dataSource
    .getRepository(WorkspaceEntity)
    .save(
      dataSource
        .getRepository(WorkspaceEntity)
        .create({ name: 'Mein Vertrieb', slug: 'mein-vertrieb' }),
    );

  workspaceId = workspace.id;
  ownerId = (await addUser('inhaberin@example.de')).id;
  adminId = (await addUser('admin@example.de')).id;
  memberId = (await addUser('mitglied@example.de')).id;

  await addMember(ownerId, MembershipRole.OWNER);
  await addMember(adminId, MembershipRole.ADMIN);
});

const invite = (email: string, by = ownerId) =>
  service.invite(by, workspaceId, email, MembershipRole.MEMBER);

describe('inviting', () => {
  it('lets an owner', async () => {
    await expect(invite('eine@example.de')).resolves.toBeDefined();
  });

  it('lets an admin', async () => {
    await expect(invite('zwei@example.de', adminId)).resolves.toBeDefined();
  });

  it('refuses a plain member', async () => {
    await addMember(memberId, MembershipRole.MEMBER);

    await expect(invite('drei@example.de', memberId)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuses somebody whose own address is not confirmed', async () => {
    const unbestaetigt = await addUser('wegwerf@example.de', false);

    await addMember(unbestaetigt.id, MembershipRole.ADMIN);

    await expect(invite('opfer@example.de', unbestaetigt.id)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('sends the invitation and reports whether it went', async () => {
    const created = await invite('neue@example.de');

    expect(created.delivered).toBe(true);
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0].text).toContain(created.token);
  });

  it('stores the token hashed, never the token', async () => {
    const created = await invite('neue@example.de');

    const stored = await dataSource.getRepository(InvitationEntity).find();

    expect(JSON.stringify(stored)).not.toContain(created.token);
    expect(stored[0].tokenHash).toBe(
      createHash('sha256').update(created.token).digest('hex'),
    );
  });

  it('refuses somebody who is already in the workspace', async () => {
    await addMember(memberId, MembershipRole.MEMBER);

    await expect(invite('mitglied@example.de')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('replaces an earlier invitation to the same address', async () => {
    const first = await invite('neue@example.de');

    await invite('neue@example.de');

    const stored = await dataSource
      .getRepository(InvitationEntity)
      .findBy({ email: 'neue@example.de' });

    expect(stored).toHaveLength(1);
    expect(stored[0].tokenHash).not.toBe(
      createHash('sha256').update(first.token).digest('hex'),
    );
  });
});

describe('seats', () => {
  it('counts a pending invitation as one', async () => {
    await invite('dritte@example.de');

    await expect(invite('vierte@example.de')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuses once the members alone fill the seats', async () => {
    await addMember(memberId, MembershipRole.MEMBER);

    await expect(invite('vierte@example.de')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('frees the seat when the invitation is revoked', async () => {
    await addMember(memberId, MembershipRole.MEMBER);

    await dataSource
      .getRepository(MembershipEntity)
      .delete({ userId: memberId, workspaceId });

    const created = await invite('neue@example.de');

    await expect(invite('andere@example.de')).rejects.toThrow(
      ForbiddenException,
    );

    await service.revoke(ownerId, workspaceId, created.invitation.id);

    await expect(invite('andere@example.de')).resolves.toBeDefined();
  });
});

describe('accepting', () => {
  it('adds the person to the workspace', async () => {
    const created = await invite('neue@example.de');
    const newcomer = await addUser('neue@example.de');

    const membership = await service.accept(created.token, newcomer.id);

    expect(membership.workspaceId).toBe(workspaceId);
    expect(membership.role).toBe(MembershipRole.MEMBER);
  });

  it('refuses the same link twice', async () => {
    const created = await invite('neue@example.de');
    const newcomer = await addUser('neue@example.de');

    await service.accept(created.token, newcomer.id);

    await expect(service.accept(created.token, newcomer.id)).rejects.toThrow();
  });

  it('refuses one that has expired', async () => {
    const created = await invite('neue@example.de');
    const newcomer = await addUser('neue@example.de');

    await dataSource
      .getRepository(InvitationEntity)
      .update(created.invitation.id, {
        expiresAt: new Date(Date.now() - 1000),
      });

    await expect(service.accept(created.token, newcomer.id)).rejects.toThrow();
  });

  it('refuses a token nobody issued', async () => {
    const newcomer = await addUser('neue@example.de');

    await expect(
      service.accept('frei-erfunden', newcomer.id),
    ).rejects.toThrow();
  });

  it('refuses somebody signed in with a different address', async () => {
    const created = await invite('neue@example.de');
    const fremder = await addUser('jemand@example.de');
    const richtig = await addUser('neue@example.de');

    const abgelehnt: unknown = await service
      .accept(created.token, fremder.id)
      .catch((fehler: unknown) => fehler);

    expect(abgelehnt).toBeInstanceOf(ForbiddenException);
    expect((abgelehnt as ForbiddenException).message).toMatch(
      /andere E-Mail-Adresse/,
    );
    expect((abgelehnt as ForbiddenException).getResponse()).toMatchObject({
      reason: INVITATION_FOR_OTHER_ADDRESS,
    });

    const membership = await service.accept(created.token, richtig.id);

    expect(membership.workspaceId).toBe(workspaceId);
  });

  it('refuses somebody who has not confirmed their address yet', async () => {
    const created = await invite('marie@firma.de');
    const unbestaetigt = await addUser('marie@firma.de', false);

    const abgelehnt: unknown = await service
      .accept(created.token, unbestaetigt.id)
      .catch((fehler: unknown) => fehler);

    expect(abgelehnt).toBeInstanceOf(ForbiddenException);
    expect((abgelehnt as ForbiddenException).getResponse()).toMatchObject({
      reason: EMAIL_NOT_VERIFIED,
    });

    expect(
      await dataSource
        .getRepository(MembershipEntity)
        .countBy({ userId: unbestaetigt.id, workspaceId }),
    ).toBe(0);
  });

  it('keeps the invitation open until the address is confirmed', async () => {
    const created = await invite('marie@firma.de');
    const person = await addUser('marie@firma.de', false);

    await service.accept(created.token, person.id).catch(() => null);

    await dataSource
      .getRepository(UserEntity)
      .update(person.id, { emailVerifiedAt: new Date() });

    const membership = await service.accept(created.token, person.id);

    expect(membership.workspaceId).toBe(workspaceId);
  });

  it('does not care how the address is capitalised', async () => {
    const created = await invite('neue@example.de');
    const newcomer = await addUser('Neue@Example.DE');

    await expect(
      service.accept(created.token, newcomer.id),
    ).resolves.toBeDefined();
  });
});

describe('removing somebody', () => {
  beforeEach(async () => {
    await addMember(memberId, MembershipRole.MEMBER);
  });

  const giveTask = async (assigneeId: string, completed = false) =>
    dataSource.getRepository(TaskEntity).save(
      dataSource.getRepository(TaskEntity).create({
        workspaceId,
        title: 'Angebot nachfassen',
        assigneeId,
        createdById: ownerId,
        completedAt: completed ? new Date() : null,
      }),
    );

  it('moves their open tasks to whoever removed them', async () => {
    await giveTask(memberId);
    await giveTask(memberId);

    const result = await service.removeMember(ownerId, workspaceId, memberId);

    expect(result.reassignedTasks).toBe(2);
    expect(
      await dataSource
        .getRepository(TaskEntity)
        .countBy({ assigneeId: ownerId }),
    ).toBe(2);
  });

  it('übergibt an einen Nachfolger und trennt Postfach und Kalender', async () => {
    await giveTask(memberId);
    await dataSource.query(
      `INSERT INTO "mailboxes" ("workspaceId", "userId", host, username, "passwordSealed", active)
       VALUES ($1, $2, 'imap.example.de', 'm', 'versiegelt', true)`,
      [workspaceId, memberId],
    );
    await dataSource.query(
      `INSERT INTO "appointments" ("workspaceId", title, "startsAt", "endsAt", "ownerId", "createdById")
       VALUES ($1, 'Künftig', now() + interval '1 day', now() + interval '25 hours', $2, $2),
              ($1, 'Vergangen', now() - interval '2 days', now() - interval '47 hours', $2, $2)`,
      [workspaceId, memberId],
    );
    await dataSource.query(
      `INSERT INTO "quotes" ("workspaceId", number, "issuedOn", "validUntil", status, "bearbeiterId")
       VALUES ($1, 'AN-1', '2026-10-01', '2026-11-01', 'draft', $2),
              ($1, 'AN-2', '2026-10-01', '2026-11-01', 'accepted', $2)`,
      [workspaceId, memberId],
    );
    await dataSource.query(
      `INSERT INTO "web_forms" ("workspaceId", "ownerId") VALUES ($1, $2)`,
      [workspaceId, memberId],
    );

    await service.removeMember(ownerId, workspaceId, memberId, adminId);

    expect(
      await dataSource
        .getRepository(TaskEntity)
        .countBy({ assigneeId: adminId }),
    ).toBe(1);

    const termine = (await dataSource.query(
      `SELECT title, "ownerId" FROM "appointments" WHERE "workspaceId" = $1 ORDER BY title`,
      [workspaceId],
    )) as { title: string; ownerId: string }[];

    expect(termine).toEqual([
      { title: 'Künftig', ownerId: adminId },
      { title: 'Vergangen', ownerId: memberId },
    ]);

    const angebote = (await dataSource.query(
      `SELECT number, "bearbeiterId" FROM "quotes" WHERE "workspaceId" = $1 ORDER BY number`,
      [workspaceId],
    )) as { number: string; bearbeiterId: string }[];

    expect(angebote.map((a) => a.bearbeiterId)).toEqual([adminId, memberId]);

    expect(
      await dataSource.query(
        `SELECT "ownerId" FROM "web_forms" WHERE "workspaceId" = $1`,
        [workspaceId],
      ),
    ).toEqual([{ ownerId: adminId }]);

    const [postfach] = (await dataSource.query(
      `SELECT active, "passwordSealed" FROM "mailboxes" WHERE "userId" = $1`,
      [memberId],
    )) as { active: boolean; passwordSealed: string }[];

    expect(postfach).toEqual({ active: false, passwordSealed: '' });
  });

  it('lässt private Termine und solche aus ihrem Kalender ohne Akte bei ihr', async () => {
    const [kunde] = (await dataSource.query(
      `INSERT INTO "contacts" ("workspaceId", "firstName", "lastName")
       VALUES ($1, 'Kai', 'Kunde') RETURNING id`,
      [workspaceId],
    )) as { id: string }[];

    await dataSource.query(
      `INSERT INTO "kalender_verbindungen" ("workspaceId", "userId", "serverUrl", benutzer, "passwortVersiegelt", sichtbarkeit)
       VALUES ($1, $2, 'https://dav.example.de/', 'm', 'x', 'belegt')`,
      [workspaceId, memberId],
    );
    await dataSource.query(
      `INSERT INTO "appointments" ("workspaceId", title, "startsAt", "endsAt", "ownerId", "createdById", privat, quelle, "contactId")
       VALUES ($1, 'Aus Stegwerk', now() + interval '1 day', now() + interval '25 hours', $2, $2, false, 'stegwerk', NULL),
              ($1, 'Privat', now() + interval '1 day', now() + interval '25 hours', $2, $2, true, 'stegwerk', NULL),
              ($1, 'Elternabend', now() + interval '1 day', now() + interval '25 hours', $2, $2, false, 'kalender', NULL),
              ($1, 'Kunde aus dem Kalender', now() + interval '1 day', now() + interval '25 hours', $2, $2, false, 'kalender', $3)`,
      [workspaceId, memberId, kunde.id],
    );

    await service.removeMember(ownerId, workspaceId, memberId, adminId);

    const termine = (await dataSource.query(
      `SELECT title, "ownerId", "nurBelegt" FROM "appointments" WHERE "workspaceId" = $1 ORDER BY title`,
      [workspaceId],
    )) as { title: string; ownerId: string; nurBelegt: boolean }[];

    expect(termine).toEqual([
      { title: 'Aus Stegwerk', ownerId: adminId, nurBelegt: false },
      { title: 'Elternabend', ownerId: memberId, nurBelegt: true },
      { title: 'Kunde aus dem Kalender', ownerId: adminId, nurBelegt: false },
      { title: 'Privat', ownerId: memberId, nurBelegt: false },
    ]);
  });

  it('übergibt Auftragsbestätigungen und Lieferscheine an den Nachfolger', async () => {
    const [angebot] = (await dataSource.query(
      `INSERT INTO "quotes" ("workspaceId", number, "issuedOn", "validUntil", status, "bearbeiterId")
       VALUES ($1, 'AN-1', '2026-10-01', '2026-11-01', 'sent', $2)
       RETURNING id`,
      [workspaceId, memberId],
    )) as { id: string }[];

    await dataSource.query(
      `INSERT INTO "begleitbelege" ("workspaceId", art, number, "angebotId", "issuedOn", "bearbeiterId", "bearbeiterSnapshot")
       VALUES ($1, 'auftragsbestaetigung', 'AB-1', $2, '2026-10-02', $3, '{"name":"Kim"}'),
              ($1, 'lieferschein', 'LS-1', $2, '2026-10-03', $3, '{"name":"Kim"}')`,
      [workspaceId, angebot.id, memberId],
    );

    await service.removeMember(ownerId, workspaceId, memberId, adminId);

    expect(
      await dataSource.query(
        `SELECT number, "bearbeiterId", "bearbeiterSnapshot" FROM "begleitbelege"
          WHERE "workspaceId" = $1 ORDER BY number`,
        [workspaceId],
      ),
    ).toEqual([
      {
        number: 'AB-1',
        bearbeiterId: adminId,
        bearbeiterSnapshot: { name: 'Kim' },
      },
      {
        number: 'LS-1',
        bearbeiterId: adminId,
        bearbeiterSnapshot: { name: 'Kim' },
      },
    ]);
  });

  it('lässt den Nachfolger mit „nur eigene“ die AB sehen und weiter liefern', async () => {
    const firma = await dataSource.getRepository(CompanyEntity).save(
      dataSource.getRepository(CompanyEntity).create({
        workspaceId,
        name: 'Nordwind GmbH',
        ownerId,
      }),
    );
    const rolle = await dataSource.getRepository(RoleEntity).save(
      dataSource.getRepository(RoleEntity).create({
        workspaceId,
        name: 'Nur eigene',
        everything: false,
        permissions: [Permission.COMPANY_VIEW],
        sichtbarkeit: { company: 'eigene', contact: 'eigene', deal: 'eigene' },
        isSystem: false,
      }),
    );
    const nachfolger = await addUser('nachfolger@example.de');

    await dataSource.getRepository(MembershipEntity).save({
      userId: nachfolger.id,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: rolle.id,
    });

    const letterheads = new LetterheadsService(
      dataSource.getRepository(LetterheadEntity),
    );
    const quotes = new QuotesService(
      dataSource.getRepository(QuoteEntity),
      dataSource,
      letterheads,
    );
    const belege = new BegleitbelegeService(
      dataSource.getRepository(BegleitbelegEntity),
      dataSource,
      quotes,
      letterheads,
      new AttachmentsService(
        dataSource.getRepository(AttachmentEntity),
        dataSource,
      ),
    );
    const permissions = new PermissionsService(
      dataSource.getRepository(MembershipEntity),
      dataSource.getRepository(RoleEntity),
    );
    const alsNachfolger = <T>(tun: () => Promise<T>): Promise<T> =>
      runWithRequestContext({ requestId: 'test' }, () => {
        setzeSichtfeld(() =>
          permissions.sichtfeldFuer({
            userId: nachfolger.id,
            workspaceId,
            email: nachfolger.email,
          }),
        );

        return tun();
      });

    const entwurf = await quotes.create(workspaceId, { companyId: firma.id });

    await quotes.setLines(workspaceId, entwurf.id, [
      {
        name: 'Palette Schrauben',
        quantity: 10,
        unit: 'Stück',
        unitPriceCents: 1250,
        taxRatePercent: 19,
      },
    ]);
    await quotes.markSent(workspaceId, entwurf.id);
    await dataSource.query(
      `UPDATE "quotes" SET "bearbeiterId" = $1 WHERE "id" = $2`,
      [memberId, entwurf.id],
    );

    const angebot = await quotes.decide(workspaceId, entwurf.id, true);
    const ab = await belege.auftragsbestaetigungStellen(workspaceId, null, {
      angebotId: angebot.id,
    });

    expect(ab.bearbeiterId).toBe(memberId);

    await expect(
      alsNachfolger(() => belege.findOne(workspaceId, ab.id)),
    ).rejects.toThrow(NotFoundException);

    await service.removeMember(ownerId, workspaceId, memberId, nachfolger.id);

    await expect(
      alsNachfolger(() => belege.findOne(workspaceId, ab.id)),
    ).resolves.toMatchObject({ id: ab.id });

    const ls = await alsNachfolger(() =>
      belege.lieferscheinStellen(workspaceId, nachfolger.id, {
        angebotId: angebot.id,
        auftragsbestaetigungId: ab.id,
        positionen: [{ angebotsPositionId: angebot.lines[0].id, menge: 4 }],
      }),
    );

    expect(ls.bearbeiterId).toBe(nachfolger.id);
    expect(ls.auftragsbestaetigungId).toBe(ab.id);
  });

  it('lässt nicht an jemanden außerhalb des Bereichs übergeben', async () => {
    const fremd = await addUser('fremd@example.de');

    await expect(
      service.removeMember(ownerId, workspaceId, memberId, fremd.id),
    ).rejects.toThrow('Übernehmen kann nur');
    await expect(
      service.removeMember(ownerId, workspaceId, memberId, memberId),
    ).rejects.toThrow('Übernehmen kann nur');
  });

  it('nimmt ihr die Freigaben, nicht die, die sie erteilt hat', async () => {
    const datensatz = '00000000-0000-4000-8000-00000000f001';

    await dataSource.query(
      `INSERT INTO "freigaben" ("workspaceId", "art", "datensatzId", "userId", "stufe", "erteiltVonId")
       VALUES ($1, 'company', $2, $3, 'lesen', $4),
              ($1, 'deal', $2, $4, 'bearbeiten', $3)`,
      [workspaceId, datensatz, memberId, ownerId],
    );

    await service.removeMember(ownerId, workspaceId, memberId);

    const uebrig = (await dataSource.query(
      `SELECT "userId" FROM "freigaben" WHERE "workspaceId" = $1`,
      [workspaceId],
    )) as { userId: string }[];

    expect(uebrig.map((zeile) => zeile.userId)).toEqual([ownerId]);
  });

  it('leaves their finished tasks alone', async () => {
    await giveTask(memberId, true);

    const result = await service.removeMember(ownerId, workspaceId, memberId);

    expect(result.reassignedTasks).toBe(0);
    expect(
      await dataSource
        .getRepository(TaskEntity)
        .countBy({ assigneeId: memberId }),
    ).toBe(1);
  });

  it('actually removes the membership', async () => {
    await service.removeMember(ownerId, workspaceId, memberId);

    expect(
      await dataSource
        .getRepository(MembershipEntity)
        .countBy({ userId: memberId, workspaceId }),
    ).toBe(0);
  });

  it('refuses a plain member', async () => {
    await expect(
      service.removeMember(memberId, workspaceId, adminId),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses somebody who is not in the workspace', async () => {
    const stranger = await addUser('fremde@example.de');

    await expect(
      service.removeMember(ownerId, workspaceId, stranger.id),
    ).rejects.toThrow(NotFoundException);
  });

  it('keeps the last owner', async () => {
    await expect(
      service.removeMember(ownerId, workspaceId, ownerId),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows removing an owner while another remains', async () => {
    const second = await addUser('zweite@example.de');

    await addMember(second.id, MembershipRole.OWNER);

    await expect(
      service.removeMember(second.id, workspaceId, ownerId),
    ).resolves.toMatchObject({ removed: true });
  });

  it('lässt von zwei Inhabern, die sich gleichzeitig entfernen, einen übrig', async () => {
    const second = await addUser('zweite@example.de');

    await addMember(second.id, MembershipRole.OWNER);

    const ergebnisse = await Promise.allSettled([
      service.removeMember(second.id, workspaceId, ownerId),
      service.removeMember(ownerId, workspaceId, second.id, ownerId),
    ]);

    expect(ergebnisse.filter((e) => e.status === 'fulfilled')).toHaveLength(1);
    expect(
      await dataSource.getRepository(MembershipEntity).countBy({
        workspaceId,
        role: MembershipRole.OWNER,
      }),
    ).toBe(1);
  });
});

describe('erlaubte Domains', () => {
  const beschraenke = (domains: string[]) =>
    dataSource
      .getRepository(WorkspaceEntity)
      .update(workspaceId, { einladungsDomains: domains });

  it('lädt nur an erlaubte Domains ein, Unterdomains eingeschlossen', async () => {
    await beschraenke(['example.de']);

    await expect(invite('vertrieb@nord.example.de')).resolves.toBeDefined();
    await expect(invite('privat@gmail.com')).rejects.toThrow(
      BadRequestException,
    );
    await expect(invite('jemand@notexample.de')).rejects.toThrow(
      BadRequestException,
    );
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it('lässt eine ältere Einladung an eine andere Domain nicht mehr annehmen', async () => {
    const created = await invite('privat@gmail.com');
    const person = await addUser('privat@gmail.com');

    await beschraenke(['example.de']);

    await expect(service.accept(created.token, person.id)).rejects.toThrow(
      BadRequestException,
    );

    await beschraenke([]);
    await expect(
      service.accept(created.token, person.id),
    ).resolves.toBeDefined();
  });

  it('gilt nur für den Bereich, der sie gesetzt hat', async () => {
    const anderer = await dataSource.getRepository(WorkspaceEntity).save(
      dataSource.getRepository(WorkspaceEntity).create({
        name: 'Anderer',
        slug: 'anderer',
        einladungsDomains: ['anderswo.de'],
      }),
    );

    expect(anderer.einladungsDomains).toEqual(['anderswo.de']);
    await expect(invite('neue@example.de')).resolves.toBeDefined();
  });
});
