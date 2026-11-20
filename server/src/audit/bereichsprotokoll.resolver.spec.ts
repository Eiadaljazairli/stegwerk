import { ForbiddenException } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { type DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { Permission, ROLE_TEMPLATES } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { RoleEntity } from '../workspaces/role.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { BereichsprotokollResolver } from './bereichsprotokoll.resolver';

const SUITE = 'bereichsprotokoll';

jest.setTimeout(60_000);

let dataSource: DataSource;
let resolver: BereichsprotokollResolver;
let inhaber: RequestUser;
let ohneRecht: RequestUser;
let mitRecht: RequestUser;
let fremd: RequestUser;

const konfig = { get: () => undefined } as unknown as ConfigService;

const aenderung = (
  wer: RequestUser,
  typ: string,
  wann: string,
  summary: string,
) =>
  dataSource.query(
    `INSERT INTO "audit_log"
       ("workspaceId", "actorId", "action", "entityType", "entityId", "summary", "createdAt")
     VALUES ($1, $2, 'updated', $3, $4, $5, $6)`,
    [wer.workspaceId, wer.userId, typ, randomUUID(), summary, wann],
  );

const ereignis = (wer: RequestUser, art: string, wann: string) =>
  dataSource.query(
    `INSERT INTO "sicherheits_ereignisse"
       ("workspaceId", "userId", "actorId", "art", "details", "createdAt")
     VALUES ($1, $2, $2, $3, '{"x": 1}', $4)`,
    [wer.workspaceId, wer.userId, art, wann],
  );

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);

  const m = dataSource.manager;
  const bereich = async (name: string) =>
    (await m.save(m.create(WorkspaceEntity, { name, slug: name }))).id;
  const person = async (
    workspaceId: string,
    kurz: string,
    rolle: { everything: boolean; permissions: Permission[] },
  ): Promise<RequestUser> => {
    const user = await m.save(
      m.create(UserEntity, {
        email: `${kurz}@protokoll.example`,
        passwordHash: 'x',
        firstName: kurz,
        lastName: 'Test',
      }),
    );
    const role = await m.save(
      m.create(RoleEntity, { workspaceId, name: kurz, ...rolle }),
    );

    await m.save(
      m.create(MembershipEntity, {
        userId: user.id,
        workspaceId,
        role: rolle.everything ? MembershipRole.OWNER : MembershipRole.MEMBER,
        roleId: role.id,
      }),
    );

    return { userId: user.id, workspaceId, email: user.email };
  };

  const hier = await bereich('hier');
  const dort = await bereich('dort');
  const admin = ROLE_TEMPLATES.find((v) => v.key === 'admin');

  inhaber = await person(hier, 'inhaber', {
    everything: true,
    permissions: [],
  });
  ohneRecht = await person(hier, 'mitglied', {
    everything: false,
    permissions: [Permission.COMPANY_VIEW],
  });
  mitRecht = await person(hier, 'admin', {
    everything: false,
    permissions: [...(admin?.permissions ?? [])],
  });
  fremd = await person(dort, 'fremd', { everything: true, permissions: [] });

  resolver = new BereichsprotokollResolver(
    dataSource,
    new PermissionsService(
      dataSource.getRepository(MembershipEntity),
      dataSource.getRepository(RoleEntity),
    ),
    konfig,
  );

  await aenderung(inhaber, 'Company', '2026-10-01T10:00:00Z', 'Firma A');
  await aenderung(mitRecht, 'Deal', '2026-10-02T10:00:00Z', 'Geschäft B');
  await ereignis(inhaber, 'anmeldung', '2026-10-03T10:00:00Z');
  await aenderung(fremd, 'Company', '2026-10-04T10:00:00Z', 'Fremde Firma');
  await ereignis(fremd, 'anmeldung', '2026-10-04T11:00:00Z');
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

describe('das Protokoll des Bereichs', () => {
  it('zeigt Änderungen und Sicherheitsereignisse, neueste zuerst', async () => {
    const seite = await resolver.bereichsprotokoll(inhaber);

    expect(seite.eintraege.map((e) => e.zusammenfassung ?? e.art)).toEqual([
      'anmeldung',
      'Geschäft B',
      'Firma A',
    ]);
    expect(seite.eintraege[0].wer).toBe('inhaber Test');
    expect(seite.aenderungenMonate).toBeGreaterThan(0);
  });

  it('zeigt nichts aus einem anderen Bereich', async () => {
    const seite = await resolver.bereichsprotokoll(inhaber);

    expect(
      seite.eintraege.some((e) => e.zusammenfassung === 'Fremde Firma'),
    ).toBe(false);
  });

  it('verlangt das eigene Recht', async () => {
    await expect(resolver.bereichsprotokoll(ohneRecht)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(resolver.bereichsprotokollCsv(ohneRecht)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('gibt es der Administrator-Vorlage', async () => {
    await expect(resolver.bereichsprotokoll(mitRecht)).resolves.toBeDefined();
  });

  it('filtert nach Quelle, Person, Objekt und Zeitraum', async () => {
    const nur = async (filter: object) =>
      (await resolver.bereichsprotokoll(inhaber, filter)).eintraege.map(
        (e) => e.zusammenfassung ?? e.art,
      );

    expect(await nur({ quelle: 'sicherheit' })).toEqual(['anmeldung']);
    expect(await nur({ personId: mitRecht.userId })).toEqual(['Geschäft B']);
    expect(await nur({ objekt: 'Company' })).toEqual(['Firma A']);
    expect(
      await nur({
        von: new Date('2026-10-02T00:00:00Z'),
        bis: new Date('2026-10-02T23:59:59Z'),
      }),
    ).toEqual(['Geschäft B']);
  });

  it('blättert', async () => {
    const erste = await resolver.bereichsprotokoll(inhaber, { limit: 2 });
    const zweite = await resolver.bereichsprotokoll(inhaber, {
      limit: 2,
      offset: 2,
    });

    expect(erste.weitere).toBe(true);
    expect(zweite.weitere).toBe(false);
    expect(zweite.eintraege).toHaveLength(1);
  });

  it('exportiert dieselbe Auswahl als CSV', async () => {
    const csv = await resolver.bereichsprotokollCsv(inhaber, {
      quelle: 'aenderung',
    });

    expect(csv).toContain('Zeit;Quelle;Person');
    expect(csv).toContain('Firma A');
    expect(csv).not.toContain('anmeldung');
  });

  it('schreibt die Zeit mit Uhrzeit in deutscher Zeit', async () => {
    await aenderung(inhaber, 'Company', '2026-10-22T22:30:00Z', 'Firma Nacht');

    try {
      const csv = await resolver.bereichsprotokollCsv(inhaber, {
        von: new Date('2026-10-22T00:00:00Z'),
        bis: new Date('2026-10-23T00:00:00Z'),
      });

      expect(csv).toContain('23.10.26, 00:30:00;Änderung');
      expect(csv).not.toContain('22.10.2026');
    } finally {
      await dataSource.query(
        `DELETE FROM "audit_log" WHERE "summary" = 'Firma Nacht'`,
      );
    }
  });
});

describe('wer handelte, wenn es keine Person war', () => {
  it('nennt den API-Schlüssel statt „Entfernte Person“ oder „System“', async () => {
    const [schluessel] = (await dataSource.query(
      `INSERT INTO "api_keys" ("workspaceId", "name", "kennung", "hash")
       VALUES ($1, 'mcp-claude', 'kennungx', 'hash') RETURNING "id"`,
      [inhaber.workspaceId],
    )) as { id: string }[];

    await dataSource.query(
      `INSERT INTO "sicherheits_ereignisse"
         ("workspaceId", "actorId", "art", "details", "createdAt")
       VALUES ($1, $2, 'export', '{"liste": "DEAL", "auswahl": null}', '2026-11-01T10:00:00Z')`,
      [inhaber.workspaceId, schluessel.id],
    );
    await dataSource.query(
      `INSERT INTO "sicherheits_ereignisse"
         ("workspaceId", "actorId", "art", "details", "createdAt")
       VALUES ($1, NULL, 'mcp_verbunden', '{"schluessel": "mcp-claude"}', '2026-11-01T11:00:00Z')`,
      [inhaber.workspaceId],
    );

    const seite = await resolver.bereichsprotokoll(inhaber, {
      quelle: 'sicherheit',
      von: new Date('2026-11-01T00:00:00Z'),
    });

    expect(seite.eintraege.map((e) => e.wer)).toEqual([
      'API-Schlüssel „mcp-claude“',
      'API-Schlüssel „mcp-claude“',
    ]);
  });
});

describe('Beteiligte ohne Recht auf Kontakte', () => {
  it('nennt sie „Nicht sichtbar“ statt mit Namen', async () => {
    const leser = { ...mitRecht };
    const kontaktId = randomUUID();
    const rolle = await dataSource.getRepository(RoleEntity).save(
      dataSource.getRepository(RoleEntity).create({
        workspaceId: mitRecht.workspaceId,
        name: 'ohne Kontakte',
        everything: false,
        permissions: [Permission.AUDIT_VIEW, Permission.DEAL_VIEW],
      }),
    );

    await dataSource.query(
      `UPDATE "memberships" SET "roleId" = $1 WHERE "userId" = $2`,
      [rolle.id, leser.userId],
    );
    await dataSource.query(
      `INSERT INTO "audit_log"
         ("workspaceId", "actorId", "action", "entityType", "entityId", "summary", "changes", "createdAt")
       VALUES ($1, $2, 'updated', 'Deal', $3, 'Beteiligte geändert', $4, '2026-10-05T10:00:00Z')`,
      [
        leser.workspaceId,
        inhaber.userId,
        randomUUID(),
        JSON.stringify({
          beteiligte: [null, 'Erika Verborgen'],
          beteiligteKontaktId: [null, kontaktId],
        }),
      ],
    );

    const seite = await resolver.bereichsprotokoll(leser, {
      objekt: 'Deal',
    });
    const eintrag = seite.eintraege.find(
      (e) => e.zusammenfassung === 'Beteiligte geändert',
    );

    expect(eintrag?.einzelheiten).toContain('Nicht sichtbar');
    expect(eintrag?.einzelheiten).not.toContain('Erika Verborgen');
    expect(eintrag?.einzelheiten).not.toContain(kontaktId);
  });
});
