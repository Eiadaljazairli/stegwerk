import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { type DataSource } from 'typeorm';

import { SubscriptionEntity } from '../billing/subscription.entity';
import { type MailService } from '../mail/mail.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { AuthService } from './auth.service';
import { EmailVerificationEntity } from './email-verification.entity';
import { EmailVerificationsService } from './email-verifications.service';
import { RefreshTokenEntity } from './refresh-token.entity';
import { TwoFactorService } from './two-factor.service';
import { RefreshTokensService } from './refresh-tokens.service';

const SUITE = 'auth';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: AuthService;

const mail = { send: jest.fn().mockResolvedValue(true) };

const config = {
  get: (key: string) => (key === 'refreshTokenDays' ? 30 : undefined),
  getOrThrow: () => 'https://app.example.de',
} as unknown as ConfigService;

const signUp = (email: string, workspaceName = 'Mein Vertrieb') =>
  service.signUp({
    email,
    password: 'EinLangesPasswort1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    workspaceName,
  });

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  service = new AuthService(
    dataSource,
    new JwtService({
      secret: 'test-secret',
      signOptions: { expiresIn: '15m' },
    }),
    new RefreshTokensService(
      dataSource.getRepository(RefreshTokenEntity),
      config,
    ),
    new TwoFactorService(dataSource, config),
    new EmailVerificationsService(
      dataSource.getRepository(EmailVerificationEntity),
      dataSource.getRepository(UserEntity),
      mail as unknown as MailService,
      config,
    ),
  );
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query('TRUNCATE TABLE users, workspaces CASCADE');
  mail.send.mockClear();
});

describe('signing up', () => {
  it('creates the account, the workspace and the owner seat together', async () => {
    const payload = await signUp('inhaberin@example.de');

    expect(payload.user.email).toBe('inhaberin@example.de');
    expect(payload.workspace.name).toBe('Mein Vertrieb');

    const membership = await dataSource
      .getRepository(MembershipEntity)
      .findOne({ where: { userId: payload.user.id } });

    expect(membership?.role).toBe(MembershipRole.OWNER);
  });

  it('does not write a subscription row, and should not', async () => {
    const payload = await signUp('inhaberin@example.de');

    expect(
      await dataSource
        .getRepository(SubscriptionEntity)
        .countBy({ workspaceId: payload.workspace.id }),
    ).toBe(0);
  });

  it('leaves the new address unconfirmed', async () => {
    const payload = await signUp('inhaberin@example.de');

    const user = await dataSource
      .getRepository(UserEntity)
      .findOne({ where: { id: payload.user.id } });

    expect(user?.emailVerifiedAt).toBeNull();
  });

  it('sends a confirmation link to the address given', async () => {
    await signUp('inhaberin@example.de');

    expect(mail.send).toHaveBeenCalledTimes(1);

    const sent = mail.send.mock.calls[0][0] as { to: string; text: string };

    expect(sent.to).toBe('inhaberin@example.de');
    expect(sent.text).toContain('https://app.example.de/adresse-bestaetigen/');
  });

  it('still creates the account when the mail cannot go out', async () => {
    mail.send.mockRejectedValueOnce(new Error('SMTP ist nicht erreichbar'));

    const payload = await signUp('inhaberin@example.de');

    expect(payload.token).toEqual(expect.any(String));
    expect(
      await dataSource
        .getRepository(UserEntity)
        .countBy({ id: payload.user.id }),
    ).toBe(1);
  });

  it('stores a hash, never the password', async () => {
    await signUp('inhaberin@example.de');

    const user = await dataSource
      .getRepository(UserEntity)
      .findOne({ where: { email: 'inhaberin@example.de' } });

    expect(user?.passwordHash).not.toBe('EinLangesPasswort1');
    expect(
      await bcrypt.compare('EinLangesPasswort1', user?.passwordHash ?? ''),
    ).toBe(true);
  });

  it('treats the address as case-insensitive', async () => {
    await signUp('Inhaberin@Example.DE');

    const user = await dataSource
      .getRepository(UserEntity)
      .findOne({ where: { email: 'inhaberin@example.de' } });

    expect(user).not.toBeNull();
  });

  it('refuses a second account on the same address', async () => {
    await signUp('inhaberin@example.de');

    await expect(signUp('inhaberin@example.de')).rejects.toThrow(
      ConflictException,
    );
  });

  it('leaves nothing behind when it refuses', async () => {
    await signUp('inhaberin@example.de');
    await signUp('inhaberin@example.de').catch(() => null);

    expect(await dataSource.getRepository(WorkspaceEntity).count()).toBe(1);
  });

  it('gives two workspaces of the same name different slugs', async () => {
    const first = await signUp('eine@example.de', 'Vertrieb');
    const second = await signUp('zwei@example.de', 'Vertrieb');

    const slugs = await dataSource
      .getRepository(WorkspaceEntity)
      .findByIds([first.workspace.id, second.workspace.id]);

    expect(new Set(slugs.map((workspace) => workspace.slug)).size).toBe(2);
  });

  it('hands back a session that works', async () => {
    const payload = await signUp('inhaberin@example.de');

    expect(payload.token).not.toBe('');
    expect(payload.refreshToken).not.toBe('');
  });
});

describe('signing in', () => {
  beforeEach(async () => {
    await signUp('inhaberin@example.de');
  });

  it('accepts the right password', async () => {
    const payload = await service.signIn({
      email: 'inhaberin@example.de',
      password: 'EinLangesPasswort1',
    });

    expect(payload.user.email).toBe('inhaberin@example.de');
  });

  it('accepts the address in any case', async () => {
    await expect(
      service.signIn({
        email: 'INHABERIN@example.de',
        password: 'EinLangesPasswort1',
      }),
    ).resolves.toBeDefined();
  });

  it('answers the same way for a wrong password and an unknown address', async () => {
    const wrongPassword = await service
      .signIn({ email: 'inhaberin@example.de', password: 'falsch' })
      .catch((error: Error) => error.message);

    const unknownAddress = await service
      .signIn({ email: 'niemand@example.de', password: 'EinLangesPasswort1' })
      .catch((error: Error) => error.message);

    expect(wrongPassword).toBe(unknownAddress);
  });

  it('refuses a wrong password', async () => {
    await expect(
      service.signIn({ email: 'inhaberin@example.de', password: 'falsch' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('refuses an account with no workspace left', async () => {
    await dataSource.query('TRUNCATE TABLE memberships CASCADE');

    await expect(
      service.signIn({
        email: 'inhaberin@example.de',
        password: 'EinLangesPasswort1',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('opens the workspace that was asked for', async () => {
    const second = await signUp('zweite@example.de', 'Zweitfirma');
    const user = await dataSource
      .getRepository(UserEntity)
      .findOneOrFail({ where: { email: 'inhaberin@example.de' } });

    await dataSource.getRepository(MembershipEntity).save(
      dataSource.getRepository(MembershipEntity).create({
        userId: user.id,
        workspaceId: second.workspace.id,
        role: MembershipRole.MEMBER,
      }),
    );

    const payload = await service.signIn({
      email: 'inhaberin@example.de',
      password: 'EinLangesPasswort1',
      workspaceId: second.workspace.id,
    });

    expect(payload.workspace.id).toBe(second.workspace.id);
  });

  it('refuses a workspace the person does not belong to', async () => {
    const other = await signUp('fremde@example.de', 'Fremdfirma');

    await expect(
      service.signIn({
        email: 'inhaberin@example.de',
        password: 'EinLangesPasswort1',
        workspaceId: other.workspace.id,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});

describe('switching workspace', () => {
  it('issues a token for the other workspace', async () => {
    const first = await signUp('inhaberin@example.de');
    const second = await signUp('zweite@example.de', 'Zweitfirma');

    await dataSource.getRepository(MembershipEntity).save(
      dataSource.getRepository(MembershipEntity).create({
        userId: first.user.id,
        workspaceId: second.workspace.id,
        role: MembershipRole.MEMBER,
      }),
    );

    const payload = await service.switchWorkspace(
      first.user.id,
      second.workspace.id,
    );

    expect(payload.workspace.id).toBe(second.workspace.id);
    expect(payload.token).not.toBe(first.token);
  });

  it('refuses one the person does not belong to', async () => {
    const first = await signUp('inhaberin@example.de');
    const other = await signUp('fremde@example.de', 'Fremdfirma');

    await expect(
      service.switchWorkspace(first.user.id, other.workspace.id),
    ).rejects.toThrow(UnauthorizedException);
  });
});

describe('der zweite Faktor', () => {
  it('lässt sich nicht ohne Code neu einrichten, solange er an ist', async () => {
    const { user } = await signUp('zweifaktor@example.de', 'Zweifaktor');

    await dataSource
      .getRepository(UserEntity)
      .update(user.id, { totpEnabledAt: new Date() });

    await expect(
      new TwoFactorService(dataSource, config).beginnen(user.id, user.email),
    ).rejects.toThrow('schon eingeschaltet');

    const danach = await dataSource
      .getRepository(UserEntity)
      .findOneByOrFail({ id: user.id });

    expect(danach.totpEnabledAt).not.toBeNull();
  });
});

describe('Passwortregeln bei der Registrierung', () => {
  it('lehnt ein leicht zu erratendes Passwort ab und legt nichts an', async () => {
    await expect(
      service.signUp({
        email: 'inhaberin@example.de',
        password: 'Passwort2024!!',
        firstName: 'Ada',
        lastName: 'Lovelace',
        workspaceName: 'Mein Vertrieb',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(await dataSource.getRepository(UserEntity).count()).toBe(0);
    expect(await dataSource.getRepository(WorkspaceEntity).count()).toBe(0);
  });

  it('lehnt den eigenen Namen mit Jahreszahl ab', async () => {
    await expect(
      service.signUp({
        email: 'ada@example.de',
        password: 'AdaLovelace1815',
        firstName: 'Ada',
        lastName: 'Lovelace',
        workspaceName: 'Mein Vertrieb',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('Angemeldet bleiben', () => {
  const dauerhaftAmToken = async (userId: string) =>
    (
      await dataSource
        .getRepository(RefreshTokenEntity)
        .find({ where: { userId }, order: { createdAt: 'DESC' } })
    )[0]?.dauerhaft;

  beforeEach(async () => {
    await signUp('inhaberin@example.de');
  });

  it('bleibt ohne Angabe dauerhaft, wie vorher', async () => {
    const payload = await service.signIn({
      email: 'inhaberin@example.de',
      password: 'EinLangesPasswort1',
    });

    expect(payload.angemeldetBleiben).toBe(true);
    expect(await dauerhaftAmToken(payload.user.id)).toBe(true);
  });

  it('gibt ohne Haken eine kurze Sitzung, die beim Erneuern kurz bleibt', async () => {
    const payload = await service.signIn({
      email: 'inhaberin@example.de',
      password: 'EinLangesPasswort1',
      angemeldetBleiben: false,
    });

    expect(payload.angemeldetBleiben).toBe(false);
    expect(await dauerhaftAmToken(payload.user.id)).toBe(false);

    const erneuert = await service.refresh(payload.refreshToken);

    expect(erneuert.angemeldetBleiben).toBe(false);
  });

  it('nimmt den Haken beim Wechsel des Bereichs mit', async () => {
    const payload = await service.signIn({
      email: 'inhaberin@example.de',
      password: 'EinLangesPasswort1',
      angemeldetBleiben: false,
    });

    const gewechselt = await service.switchWorkspace(
      payload.user.id,
      payload.workspace.id,
      false,
    );

    expect(gewechselt.angemeldetBleiben).toBe(false);
    expect(await dauerhaftAmToken(payload.user.id)).toBe(false);
  });
});
