import { EventEmitter } from 'events';
import { type Request, type Response } from 'express';

import { type Abonnent, type LiveService } from './live.service';
import {
  HOECHSTDAUER_MS,
  LiveController,
  WECHSEL_FRIST_MS,
} from './live.controller';

const antwort = () => {
  const geschrieben: string[] = [];
  const kopf: Record<string, string> = {};
  const res = {
    statusCode: 0,
    writableEnded: false,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;

      return res;
    },
    json(body: unknown) {
      res.body = body;
      res.writableEnded = true;
    },
    setHeader(name: string, wert: string) {
      kopf[name] = wert;
    },
    flushHeaders: () => undefined,
    write(text: string) {
      geschrieben.push(text);
    },
    end() {
      res.writableEnded = true;
    },
  };

  return { res, geschrieben, kopf };
};

const dienst = (gueltig: boolean) => {
  const abonnenten: Abonnent[] = [];
  const abgemeldet = { ja: false };
  const live = {
    ticketEinloesen: jest.fn(async () =>
      gueltig ? { userId: 'u1', workspaceId: 'w1' } : null,
    ),
    abonnieren: jest.fn((abonnent: Abonnent) => {
      abonnenten.push(abonnent);

      return () => {
        abgemeldet.ja = true;
      };
    }),
  } as unknown as LiveService;

  return { live, abonnenten, abgemeldet };
};

it('weist eine ungültige Karte mit 401 ab, ohne einen Strom zu öffnen', async () => {
  const { live, abonnenten } = dienst(false);
  const { res } = antwort();

  await new LiveController(live).strom(
    'falsch',
    new EventEmitter() as unknown as Request,
    res as unknown as Response,
  );

  expect(res.statusCode).toBe(401);
  expect(abonnenten).toHaveLength(0);
});

it('öffnet einen ungepufferten Strom und schreibt Ereignisse', async () => {
  const { live, abonnenten, abgemeldet } = dienst(true);
  const { res, geschrieben, kopf } = antwort();
  const anfrage = new EventEmitter();

  await new LiveController(live).strom(
    'karte',
    anfrage as unknown as Request,
    res as unknown as Response,
  );

  expect(res.statusCode).toBe(200);
  expect(kopf['Content-Type']).toMatch(/^text\/event-stream/u);
  expect(kopf['X-Accel-Buffering']).toBe('no');
  expect(abonnenten[0]).toMatchObject({ userId: 'u1', workspaceId: 'w1' });
  expect(geschrieben).toEqual(['event: bereit\ndata: {}\n\n']);

  abonnenten[0].senden([
    { objekt: 'deal', id: 'd1', aktion: 'updated', von: null, tab: null },
  ]);

  expect(geschrieben[1]).toBe(
    'event: aenderungen\ndata: [{"objekt":"deal","id":"d1","aktion":"updated","von":null,"tab":null}]\n\n',
  );

  anfrage.emit('close');

  expect(abgemeldet.ja).toBe(true);
});

it('kündigt das planmäßige Ende mit „wechsel“ an und schließt erst nach einer Frist', async () => {
  jest.useFakeTimers();

  try {
    const { live } = dienst(true);
    const { res, geschrieben } = antwort();
    const anfrage = new EventEmitter();

    await new LiveController(live).strom(
      'karte',
      anfrage as unknown as Request,
      res as unknown as Response,
    );

    jest.advanceTimersByTime(HOECHSTDAUER_MS);

    expect(geschrieben).toContain('event: wechsel\ndata: {}\n\n');
    expect(res.writableEnded).toBe(false);

    jest.advanceTimersByTime(WECHSEL_FRIST_MS);

    expect(res.writableEnded).toBe(true);
    anfrage.emit('close');
  } finally {
    jest.useRealTimers();
  }
});

it('kündigt dem verdrängten Fenster das Ende mit „verdraengt“ an', async () => {
  const { live, abonnenten, abgemeldet } = dienst(true);
  const { res, geschrieben } = antwort();
  const anfrage = new EventEmitter();

  await new LiveController(live).strom(
    'karte',
    anfrage as unknown as Request,
    res as unknown as Response,
  );

  abonnenten[0].schliessen('verdraengt');

  expect(geschrieben).toContain('event: verdraengt\ndata: {}\n\n');
  expect(res.writableEnded).toBe(true);
  expect(abgemeldet.ja).toBe(true);
});

it('öffnet keinen Strom, wenn die Anfrage schon beim Einlösen der Karte abbricht', async () => {
  const { live, abonnenten } = dienst(true);
  const { res } = antwort();
  const anfrage = new EventEmitter();
  const einloesen = live.ticketEinloesen as jest.Mock;

  einloesen.mockImplementationOnce(async () => {
    anfrage.emit('close');

    return { userId: 'u1', workspaceId: 'w1' };
  });

  await new LiveController(live).strom(
    'karte',
    anfrage as unknown as Request,
    res as unknown as Response,
  );

  expect(abonnenten).toHaveLength(0);
  expect(res.statusCode).toBe(0);
});

it('meldet nach der Frist des Wechsels auch ab, ohne auf „close“ zu warten', async () => {
  jest.useFakeTimers();

  try {
    const { live, abgemeldet } = dienst(true);
    const { res } = antwort();

    await new LiveController(live).strom(
      'karte',
      new EventEmitter() as unknown as Request,
      res as unknown as Response,
    );

    jest.advanceTimersByTime(HOECHSTDAUER_MS + WECHSEL_FRIST_MS);

    expect(res.writableEnded).toBe(true);
    expect(abgemeldet.ja).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});
