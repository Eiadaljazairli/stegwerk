import { ForbiddenException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import {
  EinladungsVorschlaegeService,
  empfaengerMitNamen,
  istSammeladresse,
  vorschlaegeAus,
} from './einladungs-vorschlaege';
import { InvitationsResolver } from './invitations.resolver';
import { MembershipRole } from './membership.entity';
import { Permission } from './permissions';
import { PermissionsService } from './permissions.service';
import { MembershipEntity } from './membership.entity';
import { RoleEntity } from './role.entity';

const SUITE = 'einladungsvorschlaege';

jest.setTimeout(60_000);

describe('vorschlaegeAus', () => {
  const ausschluss = {
    domain: 'firma.de',
    bekannt: new Set(['ich@firma.de']),
    sperren: new Set(['@werbung.firma.de', 'gesperrt@firma.de']),
  };

  it('zählt, sortiert und nimmt den ersten Namen', () => {
    expect(
      vorschlaegeAus(
        [
          { email: 'Ben@Firma.de', name: null },
          { email: 'ben@firma.de', name: 'Ben Brandt' },
          { email: 'anna@firma.de', name: 'Anna' },
          { email: 'ben@firma.de', name: 'B. Brandt' },
        ],
        ausschluss,
      ),
    ).toEqual([
      { email: 'ben@firma.de', name: 'Ben Brandt', anzahl: 3 },
      { email: 'anna@firma.de', name: 'Anna', anzahl: 1 },
    ]);
  });

  it('lässt fremde Domains, Bekannte, Sperren und Sammeladressen weg', () => {
    expect(
      vorschlaegeAus(
        [
          { email: 'kunde@kunde.de', name: null },
          { email: 'ich@firma.de', name: null },
          { email: 'gesperrt@firma.de', name: null },
          { email: 'info@firma.de', name: null },
          { email: 'noreply@firma.de', name: null },
          { email: 'jemand@unter.firma.de', name: null },
        ],
        ausschluss,
      ),
    ).toEqual([]);
  });

  it('schlägt bei einer Freemail-Anmeldung nichts vor', () => {
    expect(
      vorschlaegeAus([{ email: 'freund@gmail.com', name: null }], {
        ...ausschluss,
        domain: 'gmail.com',
      }),
    ).toEqual([]);
  });

  it('hört bei zehn auf', () => {
    const viele = Array.from({ length: 15 }, (_, i) => ({
      email: `p${String(i)}@firma.de`,
      name: null,
    }));

    expect(vorschlaegeAus(viele, ausschluss)).toHaveLength(10);
  });

  it('erkennt Sammeladressen', () => {
    expect(istSammeladresse('info@firma.de')).toBe(true);
    expect(istSammeladresse('no-reply-123@firma.de')).toBe(true);
    expect(istSammeladresse('erika@firma.de')).toBe(false);
  });

  it('liest Namen aus der An-Zeile, auch mit Komma im Namen', () => {
    expect(
      empfaengerMitNamen(
        '"Muster, Erika" <erika@firma.de>, ben@firma.de, Kein <kunde@k.de>',
      ),
    ).toEqual([
      { email: 'erika@firma.de', name: 'Muster, Erika' },
      { email: 'ben@firma.de', name: null },
      { email: 'kunde@k.de', name: 'Kein' },
    ]);
  });
});

describe('einladungsVorschlaege', () => {
  let dataSource: DataSource;
  let resolver: InvitationsResolver;
  let workspaceId: string;
  let fremderBereich: string;
  const leute = {} as Record<'inhaber' | 'eingeschraenkt', RequestUser>;

  const sql = (text: string, werte: unknown[] = []) =>
    dataSource.query(text, werte) as Promise<{ id: string }[]>;

  beforeAll(async () => {
    dataSource = await createTestDatabase(SUITE);

    const bereich = async (name: string) =>
      (
        await sql(
          `INSERT INTO "workspaces" ("name", "slug") VALUES ($1, $1) RETURNING "id"`,
          [name],
        )
      )[0].id;

    workspaceId = await bereich('vorschlag');
    fremderBereich = await bereich('fremd');

    const rolle = async (everything: boolean, permissions: string[]) =>
      (
        await sql(
          `INSERT INTO "roles" ("workspaceId", "name", "everything", "permissions")
           VALUES ($1, $2, $3, $4) RETURNING "id"`,
          [
            workspaceId,
            everything ? 'Inhaber' : 'Lesen',
            everything,
            JSON.stringify(permissions),
          ],
        )
      )[0].id;
    const alles = await rolle(true, []);
    const lesen = await rolle(false, [Permission.COMPANY_VIEW]);

    const person = async (email: string, roleId: string | null) => {
      const id = (
        await sql(
          `INSERT INTO "users" ("email", "passwordHash", "firstName", "lastName")
           VALUES ($1, 'x', 'A', 'B') RETURNING "id"`,
          [email],
        )
      )[0].id;

      if (roleId !== null) {
        await sql(
          `INSERT INTO "memberships" ("userId", "workspaceId", "role", "roleId")
           VALUES ($1, $2, $3, $4)`,
          [
            id,
            workspaceId,
            roleId === alles ? MembershipRole.OWNER : MembershipRole.MEMBER,
            roleId,
          ],
        );
      }

      return id;
    };

    const ich = await person('chefin@firma.de', alles);
    const kollege = await person('kollege@firma.de', lesen);

    leute.inhaber = { userId: ich, workspaceId } as RequestUser;
    leute.eingeschraenkt = { userId: kollege, workspaceId } as RequestUser;

    const postfach = async (userId: string, bereichId: string) =>
      (
        await sql(
          `INSERT INTO "mailboxes" ("username", "host", "userId", "workspaceId", "passwordSealed")
           VALUES ($1, 'imap.firma.de', $2, $3, 'x') RETURNING "id"`,
          [`${userId}@firma.de`, userId, bereichId],
        )
      )[0].id;
    const nachricht = (
      mailboxId: string,
      bereichId: string,
      von: string,
      an: string,
      vorTagen = 1,
    ) =>
      sql(
        `INSERT INTO "mail_messages" ("fromAddress", "fromName", "sentAt", "toAddresses", "workspaceId", "mailboxId", "messageId")
         VALUES ($1, NULL, now() - ($2 || ' days')::interval, $3, $4, $5, gen_random_uuid()::text)`,
        [von, String(vorTagen), an, bereichId, mailboxId],
      );

    const meins = await postfach(ich, workspaceId);
    const seins = await postfach(kollege, workspaceId);
    const meinsFremd = await postfach(ich, fremderBereich);

    await nachricht(meins, workspaceId, 'erika@firma.de', 'chefin@firma.de');
    await nachricht(
      meins,
      workspaceId,
      'chefin@firma.de',
      '"Erika Muster" <erika@firma.de>, ben@firma.de, kunde@kunde.de, kollege@firma.de',
    );
    await nachricht(meins, workspaceId, 'alt@firma.de', 'chefin@firma.de', 200);
    await nachricht(meins, workspaceId, 'gesperrt@firma.de', 'chefin@firma.de');
    await nachricht(
      meins,
      workspaceId,
      'eingeladen@firma.de',
      'chefin@firma.de',
    );
    await nachricht(seins, workspaceId, 'geheim@firma.de', 'kollege@firma.de');
    await nachricht(
      meinsFremd,
      fremderBereich,
      'anderswo@firma.de',
      'chefin@firma.de',
    );

    await sql(
      `INSERT INTO "mail_sperren" ("workspaceId", "eintrag") VALUES ($1, 'gesperrt@firma.de')`,
      [workspaceId],
    );
    await sql(
      `INSERT INTO "invitations" ("workspaceId", "email", "tokenHash", "expiresAt", "invitedById")
       VALUES ($1, 'eingeladen@firma.de', 'h', now() + interval '3 days', $2)`,
      [workspaceId, ich],
    );

    const termin = (
      await sql(
        `INSERT INTO "appointments" ("startsAt", "endsAt", "title", "workspaceId", "ownerId", "createdById")
         VALUES (now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 'Planung', $1, $2, $2)
         RETURNING "id"`,
        [workspaceId, ich],
      )
    )[0].id;

    await sql(
      `INSERT INTO "appointment_attendees" ("appointmentId", "workspaceId", "email", "name")
       VALUES ($1, $2, 'carla@firma.de', 'Carla Clausen')`,
      [termin, workspaceId],
    );

    resolver = new InvitationsResolver(
      {} as never,
      {} as never,
      new PermissionsService(
        dataSource.getRepository(MembershipEntity),
        dataSource.getRepository(RoleEntity),
      ),
      {} as never,
      new EinladungsVorschlaegeService(dataSource),
    );
  });

  afterAll(async () => {
    await dropTestDatabase(dataSource, SUITE);
  });

  it('schlägt Kollegen aus eigener Post und eigenen Terminen vor', async () => {
    const vorschlaege = await resolver.einladungsVorschlaege(leute.inhaber);

    expect(vorschlaege).toEqual([
      { email: 'erika@firma.de', name: 'Erika Muster', anzahl: 2 },
      { email: 'ben@firma.de', name: null, anzahl: 1 },
      { email: 'carla@firma.de', name: 'Carla Clausen', anzahl: 1 },
    ]);
  });

  it('liest weder fremde Postfächer noch andere Bereiche', async () => {
    const adressen = (await resolver.einladungsVorschlaege(leute.inhaber)).map(
      (v) => v.email,
    );

    expect(adressen).not.toContain('geheim@firma.de');
    expect(adressen).not.toContain('anderswo@firma.de');
    expect(adressen).not.toContain('kollege@firma.de');
    expect(adressen).not.toContain('eingeladen@firma.de');
    expect(adressen).not.toContain('gesperrt@firma.de');
    expect(adressen).not.toContain('alt@firma.de');
  });

  it('verlangt das Recht, Mitglieder einzuladen', async () => {
    await expect(
      resolver.einladungsVorschlaege(leute.eingeschraenkt),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('gibt für einen fremden Bereich nichts heraus', async () => {
    await expect(
      resolver.einladungsVorschlaege({
        ...leute.inhaber,
        workspaceId: fremderBereich,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
