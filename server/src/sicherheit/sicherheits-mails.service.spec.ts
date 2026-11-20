import { type DataSource } from 'typeorm';

import { type MailService } from '../mail/mail.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { SicherheitsEreignisEntity } from './sicherheits-ereignis.entity';
import { SicherheitsMailsService } from './sicherheits-mails.service';

const SUITE = 'd5_sicherheitsmails';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: SicherheitsMailsService;
let gesendet: { to: string; subject: string }[];
let userId: string;
const vorEinerStunde = new Date(Date.now() - 3_600_000);

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE users, sicherheits_ereignisse CASCADE',
  );
  gesendet = [];
  service = new SicherheitsMailsService(dataSource, {
    send: (mail: { to: string; subject: string }) => {
      gesendet.push(mail);

      return Promise.resolve(true);
    },
  } as unknown as MailService);
  userId = (
    await dataSource.getRepository(UserEntity).save({
      email: 'anna@example.de',
      passwordHash: 'x',
      firstName: 'Anna',
      lastName: 'Test',
    })
  ).id;
});

const frueher = (geraet: string) =>
  dataSource.getRepository(SicherheitsEreignisEntity).save({
    art: 'anmeldung',
    userId,
    geraet,
    createdAt: vorEinerStunde,
  });

it('schreibt beim ersten Mal nicht', async () => {
  await service.pruefe({
    art: 'anmeldung',
    userId,
    geraet: 'Firefox auf Linux',
  });

  expect(gesendet).toHaveLength(0);
});

it('schreibt bei einem fremden Gerät, nicht bei einem bekannten', async () => {
  await frueher('Firefox auf Linux');

  await service.pruefe({
    art: 'anmeldung',
    userId,
    geraet: 'Firefox auf Linux',
  });
  expect(gesendet).toHaveLength(0);

  await service.pruefe({
    art: 'anmeldung',
    userId,
    geraet: 'Safari auf iPhone',
    ipGekuerzt: '203.0.113.0',
  });
  expect(gesendet).toHaveLength(1);
  expect(gesendet[0].to).toBe('anna@example.de');
});

it('schreibt, wenn der zweite Faktor abgeschaltet wird', async () => {
  await service.pruefe({ art: 'zwei_faktor_aus', userId });

  expect(gesendet[0].subject).toContain('ausgeschaltet');
});

it('meldet die Sperre nach Fehlversuchen, höchstens einmal am Tag', async () => {
  await service.pruefe({ art: 'konto_gesperrt', userId });

  expect(gesendet).toHaveLength(1);
  expect(gesendet[0].subject).toBe('Anmeldung vorübergehend gesperrt');

  await dataSource.getRepository(SicherheitsEreignisEntity).save({
    art: 'konto_gesperrt',
    userId,
    createdAt: vorEinerStunde,
  });

  await service.pruefe({ art: 'konto_gesperrt', userId });

  expect(gesendet).toHaveLength(1);
});
