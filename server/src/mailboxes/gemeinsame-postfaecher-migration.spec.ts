import { type DataSource } from 'typeorm';

import { GemeinsamePostfaecher1792700000000 } from '../database/migrations/1792700000000-GemeinsamePostfaecher';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';

const SUITE = 'gemeinsame_postfaecher_migration';

jest.setTimeout(60_000);

let dataSource: DataSource;
let workspaceId: string;
let annaId: string;
let benId: string;

const migration = new GemeinsamePostfaecher1792700000000();

const ausfuehren = async (schritt: 'up' | 'down'): Promise<void> => {
  const runner = dataSource.createQueryRunner();

  try {
    await migration[schritt](runner);
  } finally {
    await runner.release();
  }
};

const zugang = async (userId: string, konto: string): Promise<string> => {
  const [zeile] = (await dataSource.query(
    `INSERT INTO oauth_zugaenge ("workspaceId", "userId", anbieter, zweck, konto, "erneuerungVersiegelt")
     VALUES ($1, $2, 'google', 'postfach', $3, 'x') RETURNING id`,
    [workspaceId, userId, konto],
  )) as { id: string }[];

  return zeile.id;
};

const postfach = async (
  userId: string,
  username: string,
  weiteres: { art?: string; haupt?: boolean; oauthZugangId?: string } = {},
): Promise<string> => {
  const [zeile] = (await dataSource.query(
    `INSERT INTO mailboxes ("workspaceId", "userId", host, username, "passwordSealed", art, haupt, "oauthZugangId")
     VALUES ($1, $2, 'imap.wir.de', $3, 'x', $4, $5, $6) RETURNING id`,
    [
      workspaceId,
      userId,
      username,
      weiteres.art ?? 'persoenlich',
      weiteres.haupt ?? false,
      weiteres.oauthZugangId ?? null,
    ],
  )) as { id: string }[];

  return zeile.id;
};

const altesPostfach = (userId: string, username: string): Promise<unknown> =>
  dataSource.query(
    `INSERT INTO mailboxes ("workspaceId", "userId", host, username, "passwordSealed")
     VALUES ($1, $2, 'imap.wir.de', $3, 'x')`,
    [workspaceId, userId, username],
  );

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE mailboxes, oauth_zugaenge, roles, workspaces, users CASCADE',
  );

  workspaceId = (
    await dataSource
      .getRepository(WorkspaceEntity)
      .save({ name: 'Wir', slug: 'wir' })
  ).id;

  const users = dataSource.getRepository(UserEntity);

  annaId = (
    await users.save(
      users.create({
        email: 'anna@wir.de',
        passwordHash: 'x',
        firstName: 'Anna',
        lastName: 'Test',
      }),
    )
  ).id;
  benId = (
    await users.save(
      users.create({
        email: 'ben@wir.de',
        passwordHash: 'x',
        firstName: 'Ben',
        lastName: 'Test',
      }),
    )
  ).id;
});

describe('Migration GemeinsamePostfaecher', () => {
  it('rollt mit weiteren, gemeinsamen Postfächern und mehreren Zugängen zurück und wieder vor', async () => {
    const annaHauptZugang = await zugang(annaId, 'anna@wir.de');
    const annaZweitZugang = await zugang(annaId, 'anna2@wir.de');
    const infoZugang = await zugang(annaId, 'info@wir.de');
    const benZweitZugang = await zugang(benId, 'ben2@wir.de');

    const annaHaupt = await postfach(annaId, 'anna@wir.de', {
      haupt: true,
      oauthZugangId: annaHauptZugang,
    });

    await postfach(annaId, 'anna2@wir.de', { oauthZugangId: annaZweitZugang });
    const info = await postfach(annaId, 'info@wir.de', {
      art: 'gemeinsam',
      oauthZugangId: infoZugang,
    });
    const benHaupt = await postfach(benId, 'ben@wir.de', { haupt: true });

    await postfach(benId, 'ben2@wir.de', { oauthZugangId: benZweitZugang });

    await dataSource.query(
      `INSERT INTO mailbox_mitglieder ("workspaceId", "mailboxId", "userId") VALUES ($1, $2, $3)`,
      [workspaceId, info, benId],
    );
    await dataSource.query(
      `INSERT INTO mail_messages ("workspaceId", "mailboxId", "messageId", "fromAddress", "toAddresses", "sentAt", "zugewiesenAnId")
       VALUES ($1, $2, '<info-1@kunde.de>', 'kunde@nordwind.de', 'info@wir.de', now(), $3),
              ($1, $4, '<anna-1@kunde.de>', 'kunde@nordwind.de', 'anna@wir.de', now(), NULL)`,
      [workspaceId, info, benId, annaHaupt],
    );
    await dataSource.query(
      `INSERT INTO roles ("workspaceId", name, permissions)
       VALUES ($1, 'Teamleitung', '["workspace:members", "workspace:postfaecher"]'::jsonb),
              ($1, 'Vertrieb', '["contacts:read"]'::jsonb)`,
      [workspaceId],
    );

    await ausfuehren('down');

    const postfaecher = (await dataSource.query(
      `SELECT id FROM mailboxes ORDER BY username`,
    )) as { id: string }[];

    expect(postfaecher.map((zeile) => zeile.id)).toEqual([annaHaupt, benHaupt]);
    expect(
      (await dataSource.query(`SELECT "messageId" FROM mail_messages`)) as {
        messageId: string;
      }[],
    ).toEqual([{ messageId: '<anna-1@kunde.de>' }]);

    const zugaenge = (await dataSource.query(
      `SELECT id FROM oauth_zugaenge ORDER BY konto`,
    )) as { id: string }[];

    expect(zugaenge.map((zeile) => zeile.id).sort()).toEqual(
      [annaHauptZugang, benZweitZugang].sort(),
    );

    await expect(altesPostfach(annaId, 'anna3@wir.de')).rejects.toThrow(
      /IDX_mailboxes_workspace_user/,
    );
    await expect(zugang(benId, 'ben3@wir.de')).rejects.toThrow(
      /IDX_oauth_zugaenge_person_zweck/,
    );

    const rechte = (await dataSource.query(
      `SELECT name, permissions FROM roles ORDER BY name`,
    )) as { name: string; permissions: string[] }[];

    expect(rechte).toEqual([
      { name: 'Teamleitung', permissions: ['workspace:members'] },
      { name: 'Vertrieb', permissions: ['contacts:read'] },
    ]);

    await ausfuehren('up');

    const danach = (await dataSource.query(
      `SELECT id, art, haupt, bezeichnung FROM mailboxes ORDER BY username`,
    )) as { id: string; art: string; haupt: boolean; bezeichnung: null }[];

    expect(danach).toEqual([
      { id: annaHaupt, art: 'persoenlich', haupt: true, bezeichnung: null },
      { id: benHaupt, art: 'persoenlich', haupt: true, bezeichnung: null },
    ]);

    const wieder = (await dataSource.query(
      `SELECT name, permissions FROM roles ORDER BY name`,
    )) as { name: string; permissions: string[] }[];

    expect(wieder).toEqual([
      {
        name: 'Teamleitung',
        permissions: ['workspace:members', 'workspace:postfaecher'],
      },
      { name: 'Vertrieb', permissions: ['contacts:read'] },
    ]);

    await expect(postfach(annaId, 'anna3@wir.de')).resolves.toEqual(
      expect.any(String),
    );
  });
});
