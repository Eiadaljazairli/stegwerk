import { BadRequestException } from '@nestjs/common';

import { AnmeldeVerknuepfungEntity } from './anmeldung-sso.entities';
import { PasswordResetsService } from './password-resets.service';

type Row = Record<string, unknown>;

const makeService = (options: {
  user?: Row | null;
  reset?: Row | null;
  verknuepfungen?: Row[];
}) => {
  const resets = {
    rows: [] as Row[],
    findOne: jest.fn().mockResolvedValue(options.reset ?? null),
    create: jest.fn((row: Row) => row),
    save: jest.fn(async (row: Row) => {
      resets.rows.push(row);

      return row;
    }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
  };

  const verknuepfungen = {
    find: jest.fn().mockResolvedValue(options.verknuepfungen ?? []),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
  };

  const offene = {
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
  };

  const users = {
    findOne: jest.fn().mockResolvedValue(options.user ?? null),
    save: jest.fn(async (row: Row) => row),
    manager: {
      getRepository: (entity: unknown) =>
        entity === AnmeldeVerknuepfungEntity ? verknuepfungen : offene,
    },
  };

  const refreshTokens = {
    revokeAllForUser: jest.fn().mockResolvedValue(undefined),
  };
  const mail = { send: jest.fn().mockResolvedValue(true) };
  const config = {
    getOrThrow: jest.fn().mockReturnValue('https://app.example.de'),
  };

  const service = new PasswordResetsService(
    resets as never,
    users as never,
    refreshTokens as never,
    mail as never,
    config as never,
  );

  return {
    service,
    resets,
    users,
    refreshTokens,
    mail,
    verknuepfungen,
    offene,
  };
};

const anHourFromNow = () => new Date(Date.now() + 60 * 60 * 1000);

describe('PasswordResetsService.request', () => {
  it('sends nothing for an address with no account', async () => {
    const { service, mail, resets } = makeService({ user: null });

    await service.request('niemand@example.de');

    expect(mail.send).not.toHaveBeenCalled();
    expect(resets.save).not.toHaveBeenCalled();
  });

  it('does not throw for an unknown address', async () => {
    const { service } = makeService({ user: null });

    await expect(
      service.request('niemand@example.de'),
    ).resolves.toBeUndefined();
  });

  it('sends exactly one mail carrying a link for a known address', async () => {
    const { service, mail } = makeService({
      user: { id: 'user-1', email: 'kundin@example.de' },
    });

    await service.request('Kundin@Example.de');

    expect(mail.send).toHaveBeenCalledTimes(1);

    const sent = mail.send.mock.calls[0][0];

    expect(sent.to).toBe('kundin@example.de');
    expect(sent.text).toContain('https://app.example.de/passwort-neu/');
  });

  it('invalidates any link already outstanding', async () => {
    const { service, resets } = makeService({
      user: { id: 'user-1', email: 'kundin@example.de' },
    });

    await service.request('kundin@example.de');

    expect(resets.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      expect.objectContaining({ usedAt: expect.any(Date) }),
    );
  });

  it('never stores the token it mails out', async () => {
    const { service, mail, resets } = makeService({
      user: { id: 'user-1', email: 'kundin@example.de' },
    });

    await service.request('kundin@example.de');

    const link = String(mail.send.mock.calls[0][0].text);
    const token = link.split('/passwort-neu/')[1].split('\n')[0];
    const stored = JSON.stringify(resets.rows);

    expect(token.length).toBeGreaterThan(20);
    expect(stored).not.toContain(token);
  });
});

describe('PasswordResetsService.complete', () => {
  it('refuses a token that does not exist', async () => {
    const { service } = makeService({
      reset: null,
      user: { id: 'user-1', email: 'kundin@example.de', passwordHash: 'alt' },
    });

    await expect(
      service.complete('erfunden', 'EinLangesPasswort1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses an expired token', async () => {
    const { service, users } = makeService({
      reset: {
        userId: 'user-1',
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      },
      user: { id: 'user-1', email: 'kundin@example.de', passwordHash: 'alt' },
    });

    await expect(service.complete('alt', 'EinLangesPasswort1')).rejects.toThrow(
      BadRequestException,
    );
    expect(users.save).not.toHaveBeenCalled();
  });

  it('stores a hash, never the password itself', async () => {
    const { service, users } = makeService({
      reset: { userId: 'user-1', expiresAt: anHourFromNow(), usedAt: null },
      user: { id: 'user-1', email: 'kundin@example.de', passwordHash: 'alt' },
    });

    await service.complete('gültig', 'EinLangesPasswort1');

    const saved = users.save.mock.calls[0][0] as { passwordHash: string };

    expect(saved.passwordHash).not.toBe('EinLangesPasswort1');
    expect(saved.passwordHash.startsWith('$2')).toBe(true);
  });

  it('marks the token used, so the link cannot be replayed', async () => {
    const record = {
      userId: 'user-1',
      expiresAt: anHourFromNow(),
      usedAt: null as Date | null,
    };
    const { service } = makeService({
      reset: record,
      user: { id: 'user-1', email: 'kundin@example.de', passwordHash: 'alt' },
    });

    await service.complete('gültig', 'EinLangesPasswort1');

    expect(record.usedAt).toBeInstanceOf(Date);
  });

  it('ends every existing session', async () => {
    const { service, refreshTokens } = makeService({
      reset: { userId: 'user-1', expiresAt: anHourFromNow(), usedAt: null },
      user: { id: 'user-1', email: 'kundin@example.de', passwordHash: 'alt' },
    });

    await service.complete('gültig', 'EinLangesPasswort1');

    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
  });

  it('counts as proof that the address belongs to this account', async () => {
    const { service, users } = makeService({
      reset: { userId: 'user-1', expiresAt: anHourFromNow(), usedAt: null },
      user: {
        id: 'user-1',
        email: 'kundin@example.de',
        passwordHash: 'alt',
        emailVerifiedAt: null,
      },
    });

    await service.complete('gültig', 'EinLangesPasswort1');

    const saved = users.save.mock.calls[0][0] as { emailVerifiedAt: Date };

    expect(saved.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('removes Google/Microsoft links of an account whose address was unconfirmed', async () => {
    const { service, verknuepfungen } = makeService({
      reset: { userId: 'user-1', expiresAt: anHourFromNow(), usedAt: null },
      user: {
        id: 'user-1',
        email: 'kundin@example.de',
        passwordHash: 'alt',
        emailVerifiedAt: null,
      },
      verknuepfungen: [{ userId: 'user-1', anbieter: 'microsoft' }],
    });

    await service.complete('gültig', 'EinLangesPasswort1');

    expect(verknuepfungen.delete).toHaveBeenCalledWith({ userId: 'user-1' });
  });

  it('keeps the links when the address was already confirmed', async () => {
    const { service, verknuepfungen, offene } = makeService({
      reset: { userId: 'user-1', expiresAt: anHourFromNow(), usedAt: null },
      user: {
        id: 'user-1',
        email: 'kundin@example.de',
        passwordHash: 'alt',
        emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
      },
      verknuepfungen: [{ userId: 'user-1', anbieter: 'google' }],
    });

    await service.complete('gültig', 'EinLangesPasswort1');

    expect(verknuepfungen.delete).not.toHaveBeenCalled();
    expect(offene.delete).toHaveBeenCalledTimes(2);
    expect(offene.delete).toHaveBeenCalledWith({ userId: 'user-1' });
  });

  it('leaves an address that was already confirmed alone', async () => {
    const schon = new Date('2026-01-01T00:00:00Z');
    const { service, users } = makeService({
      reset: { userId: 'user-1', expiresAt: anHourFromNow(), usedAt: null },
      user: {
        id: 'user-1',
        email: 'kundin@example.de',
        passwordHash: 'alt',
        emailVerifiedAt: schon,
      },
    });

    await service.complete('gültig', 'EinLangesPasswort1');

    const saved = users.save.mock.calls[0][0] as { emailVerifiedAt: Date };

    expect(saved.emailVerifiedAt).toBe(schon);
  });

  it('tells the account holder afterwards', async () => {
    const { service, mail } = makeService({
      reset: { userId: 'user-1', expiresAt: anHourFromNow(), usedAt: null },
      user: { id: 'user-1', email: 'kundin@example.de', passwordHash: 'alt' },
    });

    await service.complete('gültig', 'EinLangesPasswort1');

    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0].to).toBe('kundin@example.de');
  });
});
