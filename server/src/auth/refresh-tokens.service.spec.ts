import { UnauthorizedException } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { type DataSource } from 'typeorm';

import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { RefreshTokenEntity } from './refresh-token.entity';
import { geraetAus, kuerzeIp } from '../observability/geraet';
import { runWithRequestContext } from '../observability/request-context';
import {
  KURZE_SITZUNG_STUNDEN,
  RefreshTokensService,
} from './refresh-tokens.service';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: RefreshTokensService;
let userId: string;
let workspaceId: string;

const config = {
  get: (key: string) => (key === 'refreshTokenDays' ? 30 : undefined),
} as unknown as ConfigService;

const hashOf = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const rowFor = (token: string) =>
  dataSource
    .getRepository(RefreshTokenEntity)
    .findOne({ where: { tokenHash: hashOf(token) } });

beforeAll(async () => {
  dataSource = await createTestDatabase('refresh_tokens');
  service = new RefreshTokensService(
    dataSource.getRepository(RefreshTokenEntity),
    config,
  );

  const users = dataSource.getRepository(UserEntity);
  const user = await users.save(
    users.create({
      email: 'inhaberin@example.de',
      passwordHash: 'x',
      firstName: 'Ada',
      lastName: 'Lovelace',
    }),
  );

  const workspaces = dataSource.getRepository(WorkspaceEntity);

  userId = user.id;
  workspaceId = (
    await workspaces.save(workspaces.create({ name: 'Probe', slug: 'probe' }))
  ).id;
});

afterAll(async () => {
  await dropTestDatabase(dataSource, 'refresh_tokens');
});

beforeEach(async () => {
  await dataSource.query('TRUNCATE TABLE refresh_tokens CASCADE');
});

describe('issuing', () => {
  it('never stores the token it hands out', async () => {
    const { token } = await service.issue(userId, workspaceId);

    const stored = await dataSource.getRepository(RefreshTokenEntity).find();

    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored[0].tokenHash).toBe(hashOf(token));
  });

  it('issues a different token every time', async () => {
    const first = await service.issue(userId, workspaceId);
    const second = await service.issue(userId, workspaceId);

    expect(first.token).not.toBe(second.token);
  });

  it('remembers which workspace the session was acting in', async () => {
    const { record } = await service.issue(userId, workspaceId);

    expect(record.workspaceId).toBe(workspaceId);
  });
});

describe('rotation', () => {
  it('exchanges a token for a new one', async () => {
    const { token } = await service.issue(userId, workspaceId);

    const rotated = await service.rotate(token);

    expect(rotated.token).not.toBe(token);
    expect(rotated.record.userId).toBe(userId);
    expect(rotated.record.workspaceId).toBe(workspaceId);
  });

  it('revokes the token it replaced', async () => {
    const { token } = await service.issue(userId, workspaceId);

    const rotated = await service.rotate(token);
    const old = await rowFor(token);

    expect(old?.revokedAt).toBeInstanceOf(Date);
    expect(old?.replacedById).toBe(rotated.record.id);
  });

  it('rejects a token that was never issued', async () => {
    await expect(service.rotate('frei-erfunden')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an expired token', async () => {
    const { token, record } = await service.issue(userId, workspaceId);

    await dataSource
      .getRepository(RefreshTokenEntity)
      .update(record.id, { expiresAt: new Date(Date.now() - 1000) });

    await expect(service.rotate(token)).rejects.toThrow(UnauthorizedException);
  });

  it('does not issue a replacement for an expired token', async () => {
    const { token, record } = await service.issue(userId, workspaceId);

    await dataSource
      .getRepository(RefreshTokenEntity)
      .update(record.id, { expiresAt: new Date(Date.now() - 1000) });

    await service.rotate(token).catch(() => undefined);

    expect(await dataSource.getRepository(RefreshTokenEntity).count()).toBe(1);
  });
});

const nachDerSchonfrist = async (token: string) => {
  const row = await rowFor(token);

  await dataSource
    .getRepository(RefreshTokenEntity)
    .update(row!.id, { revokedAt: new Date(Date.now() - 60_000) });
};

describe('reuse detection', () => {
  it('refuses a token that was already rotated', async () => {
    const { token } = await service.issue(userId, workspaceId);

    await service.rotate(token);
    await nachDerSchonfrist(token);

    await expect(service.rotate(token)).rejects.toThrow(UnauthorizedException);
  });

  it('lets a second tab renew within seconds, without signing anyone out', async () => {
    const { token } = await service.issue(userId, workspaceId);

    const [erster, zweiter] = await Promise.all([
      service.rotate(token),
      service.rotate(token),
    ]);

    expect(erster.token).not.toBe(zweiter.token);
    expect((await rowFor(erster.token))?.revokedAt).toBeNull();
    expect((await rowFor(zweiter.token))?.revokedAt).toBeNull();
  });

  it('beendet beim Abmelden die ganze Sitzung, auch kurz nach dem Erneuern', async () => {
    const { token } = await service.issue(userId, workspaceId);
    const neu = await service.rotate(token);

    await service.abmelden(token);

    expect((await rowFor(neu.token))?.revokedAt).not.toBeNull();
    await expect(service.rotate(token)).rejects.toThrow(
      'Diese Sitzung wurde beendet',
    );
    await expect(service.rotate(neu.token)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('reißt beim Abmelden keine anderen Sitzungen mit', async () => {
    const eins = await service.issue(userId, workspaceId);
    const zwei = await service.issue(userId, workspaceId);

    await service.abmelden(eins.token);

    expect((await rowFor(zwei.token))?.revokedAt).toBeNull();
    await expect(service.rotate(zwei.token)).resolves.toBeDefined();
  });

  it('does not revive a token that was signed out', async () => {
    const { token } = await service.issue(userId, workspaceId);

    await service.revoke(token);

    await expect(service.rotate(token)).rejects.toThrow(UnauthorizedException);
  });

  it('drops every session for the user when one is replayed', async () => {
    const { token } = await service.issue(userId, workspaceId);
    const rotated = await service.rotate(token);
    const other = await service.issue(userId, workspaceId);

    await nachDerSchonfrist(token);
    await service.rotate(token).catch(() => undefined);

    expect((await rowFor(rotated.token))?.revokedAt).toBeInstanceOf(Date);
    expect((await rowFor(other.token))?.revokedAt).toBeInstanceOf(Date);
  });

  it('leaves other users alone', async () => {
    const users = dataSource.getRepository(UserEntity);
    const stranger = await users.save(
      users.create({
        email: 'fremde@example.de',
        passwordHash: 'x',
        firstName: 'Grace',
        lastName: 'Hopper',
      }),
    );

    const theirs = await service.issue(stranger.id, workspaceId);
    const { token } = await service.issue(userId, workspaceId);

    await service.rotate(token);
    await nachDerSchonfrist(token);
    await service.rotate(token).catch(() => undefined);

    expect((await rowFor(theirs.token))?.revokedAt).toBeNull();
  });
});

describe('revoking', () => {
  it('ends a single session', async () => {
    const { token } = await service.issue(userId, workspaceId);

    await service.revoke(token);

    expect((await rowFor(token))?.revokedAt).toBeInstanceOf(Date);
    await expect(service.rotate(token)).rejects.toThrow(UnauthorizedException);
  });

  it('does not move the revocation time of an already revoked session', async () => {
    const { token } = await service.issue(userId, workspaceId);

    await service.revoke(token);
    const first = (await rowFor(token))?.revokedAt;

    await service.revoke(token);

    expect((await rowFor(token))?.revokedAt).toEqual(first);
  });

  it('ends every session for one user', async () => {
    const first = await service.issue(userId, workspaceId);
    const second = await service.issue(userId, workspaceId);

    await service.revokeAllForUser(userId);

    expect((await rowFor(first.token))?.revokedAt).toBeInstanceOf(Date);
    expect((await rowFor(second.token))?.revokedAt).toBeInstanceOf(Date);
  });
});

describe('housekeeping', () => {
  it('deletes expired rows and keeps live ones', async () => {
    const live = await service.issue(userId, workspaceId);
    const stale = await service.issue(userId, workspaceId);

    await dataSource
      .getRepository(RefreshTokenEntity)
      .update(stale.record.id, { expiresAt: new Date(Date.now() - 1000) });

    expect(await service.purgeExpired()).toBe(1);
    expect(await rowFor(live.token)).not.toBeNull();
    expect(await rowFor(stale.token)).toBeNull();
  });
});

describe('Sitzungen', () => {
  it('hält eine Sitzung über Erneuerungen zusammen und merkt Gerät und gekürzte IP', async () => {
    const erste = await runWithRequestContext(
      {
        requestId: 't',
        geraet: 'Firefox auf Linux',
        ipGekuerzt: '203.0.113.0',
      },
      () => service.issue(userId, workspaceId),
    );

    expect(erste.record.familyId).toBe(erste.record.id);
    expect(erste.record.geraet).toBe('Firefox auf Linux');

    const zweite = await service.rotate(erste.token);

    expect(zweite.record.familyId).toBe(erste.record.id);
    expect(await service.sitzungVon(zweite.token)).toBe(erste.record.id);
  });

  it('beendet eine Sitzung oder alle anderen, nie fremde', async () => {
    const hier = await service.issue(userId, workspaceId);
    const dort = await service.issue(userId, workspaceId);
    const hierId = await service.sitzungVon(hier.token);
    const dortId = await service.sitzungVon(dort.token);

    expect(
      await service.beenden(
        '00000000-0000-4000-8000-000000000000',
        dortId as string,
      ),
    ).toBe(false);
    expect(await service.beenden(userId, dortId as string)).toBe(true);
    await expect(service.rotate(dort.token)).rejects.toThrow();

    await service.issue(userId, workspaceId);
    await service.andereBeenden(userId, hierId);

    const offen = await service.aktive(userId);

    expect(offen.map((t) => t.familyId)).toEqual([hierId]);
  });
});

describe('Gerät und IP', () => {
  it('nennt nur Browser und System und kürzt die Adresse', () => {
    expect(
      geraetAus(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0',
      ),
    ).toBe('Edge auf Windows');
    expect(
      geraetAus(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari auf iOS');
    expect(kuerzeIp('::ffff:198.51.100.23')).toBe('198.51.100.0');
    expect(kuerzeIp('2001:db8:abcd:12::1')).toBe('2001:db8:abcd::');
  });
});

describe('Abmelden nach Leerlauf', () => {
  const setzeFrist = (minuten: number | null) =>
    dataSource.query(
      `UPDATE "workspaces" SET "leerlaufMinuten" = $1 WHERE "id" = $2`,
      [minuten, workspaceId],
    );
  const zurueckdatieren = (token: string, minuten: number) =>
    dataSource.query(
      `UPDATE "refresh_tokens"
          SET "letzteEingabeAm" = now() - make_interval(mins => $1)
        WHERE "tokenHash" = $2`,
      [minuten, hashOf(token)],
    );

  afterEach(async () => {
    await setzeFrist(null);
  });

  it('erneuert, solange die letzte Eingabe innerhalb der Frist liegt', async () => {
    await setzeFrist(30);

    const { token } = await service.issue(userId, workspaceId);

    await zurueckdatieren(token, 10);

    await expect(service.rotate(token)).resolves.toBeDefined();
  });

  it('beendet die Sitzung nach Ablauf, auch ohne Meldung des Browsers', async () => {
    await setzeFrist(30);

    const { token } = await service.issue(userId, workspaceId);

    await zurueckdatieren(token, 45);

    await expect(service.rotate(token)).rejects.toThrow('Inaktivität');
    expect((await rowFor(token))?.revokedAt).not.toBeNull();
  });

  it('lässt eine gemeldete jüngere Eingabe gelten', async () => {
    await setzeFrist(30);

    const { token } = await service.issue(userId, workspaceId);

    await zurueckdatieren(token, 45);

    const neu = await service.rotate(token, Date.now() - 60_000);

    expect(neu.record.letzteEingabeAm?.getTime()).toBeGreaterThan(
      Date.now() - 120_000,
    );
  });

  it('nimmt keine Eingabe aus der Zukunft an', async () => {
    await setzeFrist(30);

    const { token } = await service.issue(userId, workspaceId);
    const neu = await service.rotate(token, Date.now() + 86_400_000);

    expect(neu.record.letzteEingabeAm?.getTime()).toBeLessThanOrEqual(
      Date.now(),
    );
  });

  it('greift nicht, wenn der Bereich es nicht eingeschaltet hat', async () => {
    const { token } = await service.issue(userId, workspaceId);

    await zurueckdatieren(token, 600);

    await expect(service.rotate(token)).resolves.toBeDefined();
  });
});

describe('Angemeldet bleiben', () => {
  const TAG_MS = 24 * 60 * 60 * 1000;

  it('hält eine dauerhafte Sitzung dreißig Tage', async () => {
    const { record } = await service.issue(userId, workspaceId);

    expect(record.dauerhaft).toBe(true);
    expect(record.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      29 * TAG_MS,
    );
  });

  it('gibt einer kurzen Sitzung nur die kurze Frist', async () => {
    const { record } = await service.issue(
      userId,
      workspaceId,
      undefined,
      false,
    );

    expect(record.dauerhaft).toBe(false);
    expect(record.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
      KURZE_SITZUNG_STUNDEN * 60 * 60 * 1000,
    );
  });

  it('vererbt den Haken beim Erneuern, in beide Richtungen', async () => {
    const kurz = await service.issue(userId, workspaceId, undefined, false);
    const lang = await service.issue(userId, workspaceId);

    const kurzNeu = await service.rotate(kurz.token);
    const langNeu = await service.rotate(lang.token);

    expect(kurzNeu.record.dauerhaft).toBe(false);
    expect(kurzNeu.record.expiresAt.getTime() - Date.now()).toBeLessThan(
      TAG_MS,
    );
    expect(langNeu.record.dauerhaft).toBe(true);
    expect(await service.istDauerhaft(kurzNeu.token)).toBe(false);
    expect(await service.istDauerhaft(langNeu.token)).toBe(true);
  });

  it('lässt Sitzungen von vor dem Haken dauerhaft', async () => {
    const { token } = await service.issue(userId, workspaceId);

    await dataSource.query(
      `UPDATE "refresh_tokens" SET "dauerhaft" = DEFAULT WHERE "tokenHash" = $1`,
      [hashOf(token)],
    );

    expect((await rowFor(token))?.dauerhaft).toBe(true);
    expect(await service.istDauerhaft(null)).toBe(true);
    expect(await service.istDauerhaft('unbekannt')).toBe(true);
  });

  it('beendet eine kurze Sitzung nach Ablauf der Frist', async () => {
    const { token } = await service.issue(
      userId,
      workspaceId,
      undefined,
      false,
    );

    await dataSource.query(
      `UPDATE "refresh_tokens" SET "expiresAt" = now() - interval '1 minute'
        WHERE "tokenHash" = $1`,
      [hashOf(token)],
    );

    await expect(service.rotate(token)).rejects.toThrow(UnauthorizedException);
  });

  it('lässt den Leerlauf des Bereichs auch für dauerhafte Sitzungen gelten', async () => {
    await dataSource.query(
      `UPDATE "workspaces" SET "leerlaufMinuten" = 30 WHERE "id" = $1`,
      [workspaceId],
    );

    try {
      const { token } = await service.issue(userId, workspaceId);

      await dataSource.query(
        `UPDATE "refresh_tokens"
            SET "letzteEingabeAm" = now() - interval '45 minutes'
          WHERE "tokenHash" = $1`,
        [hashOf(token)],
      );

      await expect(service.rotate(token)).rejects.toThrow(/Inaktivität/);
    } finally {
      await dataSource.query(
        `UPDATE "workspaces" SET "leerlaufMinuten" = NULL WHERE "id" = $1`,
        [workspaceId],
      );
    }
  });
});
