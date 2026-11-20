import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { type DataSource } from 'typeorm';

import { type MailService } from '../mail/mail.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { EmailVerificationEntity } from './email-verification.entity';
import {
  EMAIL_VERIFICATION_FOR_OTHER_ACCOUNT,
  EmailVerificationsService,
} from './email-verifications.service';

const SUITE = 'emailverifications';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: EmailVerificationsService;

const mail = { send: jest.fn().mockResolvedValue(true) };

const config = {
  getOrThrow: () => 'https://app.example.de',
} as unknown as ConfigService;

const addUser = async (email: string, verifiedAt: Date | null = null) => {
  const users = dataSource.getRepository(UserEntity);

  return users.save(
    users.create({
      email,
      passwordHash: 'x',
      firstName: 'Test',
      lastName: 'Person',
      emailVerifiedAt: verifiedAt,
    }),
  );
};

const tokenAusMail = (aufruf = 0): string => {
  const text = String(
    (mail.send.mock.calls[aufruf][0] as { text: string }).text,
  );

  return text.split('/adresse-bestaetigen/')[1].split('\n')[0];
};

const marken = () => dataSource.getRepository(EmailVerificationEntity);

const markeAltern = async (userId: string, millisekunden: number) => {
  await marken().query(
    `UPDATE email_verifications SET "createdAt" = now() - ($1 || ' milliseconds')::interval
      WHERE "userId" = $2`,
    [millisekunden, userId],
  );
};

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  service = new EmailVerificationsService(
    marken(),
    dataSource.getRepository(UserEntity),
    mail as unknown as MailService,
    config,
  );
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query('TRUNCATE TABLE users CASCADE');
  mail.send.mockClear();
});

describe('eine Bestätigung anfordern', () => {
  it('schickt genau eine Mail mit Link an die Adresse des Kontos', async () => {
    const user = await addUser('neu@example.de');

    await service.send(user.id);

    expect(mail.send).toHaveBeenCalledTimes(1);

    const sent = mail.send.mock.calls[0][0] as { to: string; text: string };

    expect(sent.to).toBe('neu@example.de');
    expect(sent.text).toContain('https://app.example.de/adresse-bestaetigen/');
  });

  it('legt die Marke nie im Klartext ab', async () => {
    const user = await addUser('neu@example.de');

    await service.send(user.id);

    const token = tokenAusMail();
    const gespeichert = await marken().find();

    expect(token.length).toBeGreaterThan(20);
    expect(JSON.stringify(gespeichert)).not.toContain(token);
    expect(gespeichert[0].tokenHash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
  });

  it('entwertet einen Link, der noch offen war', async () => {
    const user = await addUser('neu@example.de');

    await service.send(user.id);
    await markeAltern(user.id, 61_000);
    await service.send(user.id);

    await expect(service.verify(tokenAusMail(0), user.id)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.verify(tokenAusMail(1), user.id),
    ).resolves.toBeUndefined();
  });

  it('schickt nichts an ein Konto, das die Adresse längst bestätigt hat', async () => {
    const user = await addUser('alt@example.de', new Date());

    await service.send(user.id);

    expect(mail.send).not.toHaveBeenCalled();
    expect(await marken().count()).toBe(0);
  });

  it('lehnt eine zweite Mail innerhalb der Wartezeit ab', async () => {
    const user = await addUser('neu@example.de');

    await service.send(user.id);

    await expect(service.send(user.id)).rejects.toThrow(BadRequestException);
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it('schickt nach der Wartezeit wieder', async () => {
    const user = await addUser('neu@example.de');

    await service.send(user.id);
    await markeAltern(user.id, 61_000);

    await expect(service.send(user.id)).resolves.toBeUndefined();
    expect(mail.send).toHaveBeenCalledTimes(2);
  });

  it('zählt die Wartezeit je Konto, nicht für alle', async () => {
    const eine = await addUser('eine@example.de');
    const andere = await addUser('andere@example.de');

    await service.send(eine.id);

    await expect(service.send(andere.id)).resolves.toBeUndefined();
  });

  it('lehnt ein Konto ab, das es nicht gibt', async () => {
    await expect(
      service.send('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(BadRequestException);
    expect(mail.send).not.toHaveBeenCalled();
  });
});

describe('eine Bestätigung einlösen', () => {
  it('schreibt den Zeitpunkt in das Konto', async () => {
    const user = await addUser('neu@example.de');

    await service.send(user.id);
    await service.verify(tokenAusMail(), user.id);

    const frisch = await dataSource
      .getRepository(UserEntity)
      .findOne({ where: { id: user.id } });

    expect(frisch?.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('lehnt eine Marke ab, die niemand ausgestellt hat', async () => {
    const user = await addUser('neu@example.de');

    await expect(service.verify('erfunden', user.id)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('lehnt eine abgelaufene Marke ab', async () => {
    const user = await addUser('neu@example.de');

    await service.send(user.id);
    await marken().update(
      { userId: user.id },
      { expiresAt: new Date(Date.now() - 1000) },
    );

    await expect(service.verify(tokenAusMail(), user.id)).rejects.toThrow(
      BadRequestException,
    );

    const frisch = await dataSource
      .getRepository(UserEntity)
      .findOne({ where: { id: user.id } });

    expect(frisch?.emailVerifiedAt).toBeNull();
  });

  it('lässt dieselbe Marke nicht zweimal gelten', async () => {
    const user = await addUser('neu@example.de');

    await service.send(user.id);

    const token = tokenAusMail();

    await service.verify(token, user.id);

    await expect(service.verify(token, user.id)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('lehnt den Link ab, wenn ein anderes Konto angemeldet ist', async () => {
    const eingeladene = await addUser('marie@firma.de');
    const fremde = await addUser('fremd@example.de');

    await service.send(eingeladene.id);

    await expect(
      service.verify(tokenAusMail(), fremde.id),
    ).rejects.toMatchObject({
      response: { reason: EMAIL_VERIFICATION_FOR_OTHER_ACCOUNT },
    });
    await expect(service.verify(tokenAusMail(), fremde.id)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('bestätigt dabei kein Konto, auch nicht das falsche', async () => {
    const eingeladene = await addUser('marie@firma.de');
    const fremde = await addUser('fremd@example.de');

    await service.send(eingeladene.id);
    await service.verify(tokenAusMail(), fremde.id).catch(() => null);

    const users = dataSource.getRepository(UserEntity);

    expect(
      (await users.findOneBy({ id: fremde.id }))?.emailVerifiedAt,
    ).toBeNull();
    expect(
      (await users.findOneBy({ id: eingeladene.id }))?.emailVerifiedAt,
    ).toBeNull();
  });

  it('lässt den Link für das richtige Konto danach noch gelten', async () => {
    const eingeladene = await addUser('marie@firma.de');
    const fremde = await addUser('fremd@example.de');

    await service.send(eingeladene.id);

    const token = tokenAusMail();

    await service.verify(token, fremde.id).catch(() => null);

    await expect(
      service.verify(token, eingeladene.id),
    ).resolves.toBeUndefined();
  });

  it('behält den ersten Zeitpunkt', async () => {
    const user = await addUser('neu@example.de');

    await service.send(user.id);
    await service.verify(tokenAusMail(), user.id);

    const users = dataSource.getRepository(UserEntity);
    const erster = (await users.findOneBy({ id: user.id }))?.emailVerifiedAt;

    const zweite = await marken().save(
      marken().create({
        userId: user.id,
        tokenHash: createHash('sha256').update('zweite').digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
      }),
    );

    await service.verify('zweite', user.id);

    expect((await users.findOneBy({ id: user.id }))?.emailVerifiedAt).toEqual(
      erster,
    );
    expect(
      (await marken().findOneBy({ id: zweite.id }))?.usedAt,
    ).toBeInstanceOf(Date);
  });
});

describe('aufräumen', () => {
  it('löscht abgelaufene Marken und lässt die gültigen stehen', async () => {
    const user = await addUser('neu@example.de');

    await service.send(user.id);

    const gueltig = await marken().count();

    expect(gueltig).toBe(1);
    expect(await service.purgeExpired()).toBe(0);

    await marken().update(
      { userId: user.id },
      { expiresAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
    );

    expect(await service.purgeExpired()).toBe(1);
    expect(await marken().count()).toBe(0);
  });
});
