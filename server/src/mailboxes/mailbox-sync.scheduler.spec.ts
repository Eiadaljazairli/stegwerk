import { MailboxSyncScheduler } from './mailbox-sync.scheduler';

const postfach = (id: string) => ({
  id,
  workspaceId: `w-${id}`,
  userId: `u-${id}`,
});

const bauen = (sync: (w: string, u: string) => Promise<unknown>) => {
  const find = jest
    .fn()
    .mockResolvedValue([postfach('a'), postfach('b'), postfach('c')]);
  const assertCanWrite = jest.fn().mockResolvedValue(undefined);
  const zeitgeber = new MailboxSyncScheduler(
    { find } as never,
    {
      syncPostfach: (p: { workspaceId: string; userId: string }) =>
        sync(p.workspaceId, p.userId),
    } as never,
    { assertCanWrite } as never,
  );

  return { zeitgeber, find, assertCanWrite };
};

describe('MailboxSyncScheduler', () => {
  it('holt jedes Postfach ab und lässt sich von einem Fehler nicht aufhalten', async () => {
    const sync = jest.fn((w: string) =>
      w === 'w-b'
        ? Promise.reject(new Error('falsches Passwort'))
        : Promise.resolve({}),
    );
    const { zeitgeber } = bauen(sync);

    await expect(zeitgeber.runde()).resolves.toBe(2);
    expect(sync).toHaveBeenCalledTimes(3);
  });

  it('beginnt keine zweite Runde, solange die erste läuft', async () => {
    let fertig: () => void = () => undefined;
    const sync = jest.fn(
      () => new Promise<void>((resolve) => (fertig = resolve)),
    );
    const { zeitgeber } = bauen(sync);

    const erste = zeitgeber.runde();

    await expect(zeitgeber.runde()).resolves.toBe(0);
    fertig();
    await new Promise((r) => setImmediate(r));
    fertig();
    await new Promise((r) => setImmediate(r));
    fertig();
    await expect(erste).resolves.toBe(3);
  });

  it('ruft ohne laufendes Abo nicht ab', async () => {
    const sync = jest.fn().mockResolvedValue({});
    const { zeitgeber, assertCanWrite } = bauen(sync);

    assertCanWrite.mockRejectedValue(new Error('Abo abgelaufen'));

    await expect(zeitgeber.runde()).resolves.toBe(0);
    expect(sync).not.toHaveBeenCalled();
  });
});

describe('MailboxSyncScheduler nach Fehlern', () => {
  const JETZT = new Date('2026-10-20T08:00:00Z');
  const vor = (minuten: number) => new Date(JETZT.getTime() - minuten * 60_000);

  it('versucht ein Postfach mit Fehler erst, wenn sein Abstand um ist', async () => {
    const find = jest.fn().mockResolvedValue([
      {
        ...postfach('a'),
        lastError: 'Keine Verbindung zum Server.',
        fehlerArt: 'voruebergehend',
        fehlversuche: 2,
        lastSyncedAt: vor(15),
      },
      {
        ...postfach('b'),
        lastError: 'Keine Verbindung zum Server.',
        fehlerArt: 'voruebergehend',
        fehlversuche: 2,
        lastSyncedAt: vor(25),
      },
      {
        ...postfach('c'),
        lastError: 'Anmeldung fehlgeschlagen.',
        fehlerArt: 'anmeldung',
        fehlversuche: 1,
        lastSyncedAt: vor(30),
      },
      { ...postfach('d'), lastError: null, lastSyncedAt: vor(12) },
    ]);
    const sync = jest.fn().mockResolvedValue({});
    const zeitgeber = new MailboxSyncScheduler(
      { find } as never,
      {
        syncPostfach: (p: { workspaceId: string; userId: string }) =>
          sync(p.workspaceId, p.userId),
      } as never,
      { assertCanWrite: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(zeitgeber.runde(JETZT)).resolves.toBe(2);
    expect(sync.mock.calls.map(([w]) => w as string)).toEqual(['w-b', 'w-d']);
  });

  it('schreibt nach einem Tag Stillstand einmal eine Mail an die Person', async () => {
    const gestoert = {
      ...postfach('a'),
      username: 'ich@firma.de',
      lastError: 'Anmeldung fehlgeschlagen.',
      fehlerArt: 'anmeldung',
      fehlversuche: 9,
      fehlerSeit: vor(25 * 60),
      fehlerMailAm: null,
      user: { email: 'person@firma.de' },
    };
    const update = jest.fn().mockResolvedValue(undefined);
    const send = jest.fn().mockResolvedValue(true);
    const zeitgeber = new MailboxSyncScheduler(
      {
        find: jest
          .fn()
          .mockResolvedValueOnce([gestoert])
          .mockResolvedValueOnce([{ ...gestoert, fehlerMailAm: JETZT }]),
        update,
      } as never,
      {} as never,
      {} as never,
      { send } as never,
      { get: () => 'https://app.example.de' } as never,
    );

    await expect(zeitgeber.stillstandMelden(JETZT)).resolves.toBe(1);
    await expect(zeitgeber.stillstandMelden(JETZT)).resolves.toBe(0);
    expect(update).toHaveBeenCalledWith('a', { fehlerMailAm: JETZT });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({
      to: 'person@firma.de',
      subject: 'Ihr Postfach wird seit einem Tag nicht abgerufen',
    });
    expect((send.mock.calls[0][0] as { text: string }).text).toContain(
      'https://app.example.de/postfach',
    );
  });
});
