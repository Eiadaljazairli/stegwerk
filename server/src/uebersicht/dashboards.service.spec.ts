import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import {
  DashboardsService,
  MAX_GETEILTE_DASHBOARDS,
  MAX_PRIVATE_DASHBOARDS,
} from './dashboards.service';
import { STANDARD_KACHELN } from './kacheln';
import { UebersichtService } from './uebersicht.service';

const SUITE = 'dashboards';

jest.setTimeout(60_000);

let dataSource: DataSource;
let dienst: DashboardsService;
let workspaceId: string;
let andererBereich: string;
let anna: string;
let ben: string;
let chef: string;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  dienst = new DashboardsService(dataSource, new UebersichtService(dataSource));

  const bereiche = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (
    await bereiche.save(bereiche.create({ name: 'Vertrieb', slug: 'db-v' }))
  ).id;
  andererBereich = (
    await bereiche.save(bereiche.create({ name: 'Andere', slug: 'db-a' }))
  ).id;

  const users = dataSource.getRepository(UserEntity);
  const person = async (email: string) =>
    (
      await users.save(
        users.create({
          email,
          passwordHash: 'x',
          firstName: email.slice(0, 4),
          lastName: 'Test',
        }),
      )
    ).id;

  [anna, ben, chef] = await Promise.all([
    person('anna@db.test'),
    person('ben@db.test'),
    person('chef@db.test'),
  ]);

  await dataSource.getRepository(MembershipEntity).save([
    { userId: anna, workspaceId, role: MembershipRole.MEMBER },
    { userId: ben, workspaceId, role: MembershipRole.MEMBER },
    { userId: chef, workspaceId, role: MembershipRole.ADMIN },
  ]);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query('DELETE FROM "dashboards"');
});

describe('Dashboards', () => {
  it('zeigt geteilte allen, private nur dem Ersteller', async () => {
    const team = await dienst.anlegen(workspaceId, anna, {
      name: 'Vertrieb Nord',
      privat: false,
      vonUebersicht: false,
    });
    const meins = await dienst.anlegen(workspaceId, anna, {
      name: 'Nur ich',
      privat: true,
      vonUebersicht: false,
    });

    expect(
      (await dienst.liste(workspaceId, anna)).map((d) => d.name).sort(),
    ).toEqual(['Nur ich', 'Vertrieb Nord']);
    expect((await dienst.liste(workspaceId, ben)).map((d) => d.name)).toEqual([
      'Vertrieb Nord',
    ]);
    await expect(dienst.holen(workspaceId, ben, meins.id)).rejects.toThrow(
      NotFoundException,
    );
    await expect(dienst.holen(andererBereich, anna, team.id)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('übernimmt auf Wunsch die eigene Übersicht als Anfang', async () => {
    const kopie = await dienst.anlegen(workspaceId, anna, {
      name: 'Kopie',
      privat: true,
      vonUebersicht: true,
    });
    const leer = await dienst.anlegen(workspaceId, anna, {
      name: 'Leer',
      privat: true,
      vonUebersicht: false,
    });

    expect(kopie.kacheln.map((k) => k.id)).toEqual(
      STANDARD_KACHELN.map((k) => k.id),
    );
    expect(leer.kacheln).toEqual([]);
  });

  it('lässt ändern nur Ersteller und, wenn geteilt, die Verwaltung', async () => {
    const team = await dienst.anlegen(workspaceId, anna, {
      name: 'Team',
      privat: false,
      vonUebersicht: false,
    });

    expect(
      (await dienst.liste(workspaceId, ben)).find((d) => d.id === team.id)
        ?.darfAendern,
    ).toBe(false);
    await expect(
      dienst.aendern(workspaceId, ben, team.id, { name: 'Meins' }),
    ).rejects.toThrow(ForbiddenException);
    await expect(dienst.loeschen(workspaceId, ben, team.id)).rejects.toThrow(
      ForbiddenException,
    );

    const umbenannt = await dienst.aendern(workspaceId, chef, team.id, {
      name: 'Team Süd',
    });

    expect(umbenannt.name).toBe('Team Süd');
    await expect(
      dienst.aendern(workspaceId, chef, team.id, { privat: true }),
    ).rejects.toThrow(ForbiddenException);
    expect(await dienst.loeschen(workspaceId, chef, team.id)).toBe(true);
  });

  it('speichert nur geprüfte Kacheln', async () => {
    const d = await dienst.anlegen(workspaceId, anna, {
      name: 'Zahlen',
      privat: true,
      vonUebersicht: false,
    });
    const gespeichert = await dienst.kachelnSpeichern(workspaceId, anna, d.id, [
      {
        id: 'k1',
        typ: 'balken',
        objekt: 'deal',
        mass: 'summe',
        gruppe: 'quartal',
      },
    ]);

    expect(gespeichert.kacheln[0]).toMatchObject({
      typ: 'balken',
      gruppe: 'quartal',
    });
    await expect(
      dienst.kachelnSpeichern(workspaceId, anna, d.id, [
        { id: 'k1', typ: 'balken', objekt: 'deal', gruppe: 'drop table' },
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('hält Namen eindeutig und Grenzen ein', async () => {
    await dienst.anlegen(workspaceId, anna, {
      name: 'Doppelt',
      privat: false,
      vonUebersicht: false,
    });
    await expect(
      dienst.anlegen(workspaceId, ben, {
        name: 'doppelt',
        privat: false,
        vonUebersicht: false,
      }),
    ).rejects.toThrow('Es gibt schon ein Dashboard mit diesem Namen.');
    await expect(
      dienst.anlegen(workspaceId, ben, {
        name: 'Doppelt',
        privat: true,
        vonUebersicht: false,
      }),
    ).resolves.toMatchObject({ privat: true });
    await expect(
      dienst.anlegen(workspaceId, ben, {
        name: '   ',
        privat: true,
        vonUebersicht: false,
      }),
    ).rejects.toThrow('Ein Dashboard braucht einen Namen.');

    for (let i = 1; i < MAX_PRIVATE_DASHBOARDS; i += 1) {
      await dienst.anlegen(workspaceId, ben, {
        name: `Nr. ${String(i)}`,
        privat: true,
        vonUebersicht: false,
      });
    }

    await expect(
      dienst.anlegen(workspaceId, ben, {
        name: 'Eins zu viel',
        privat: true,
        vonUebersicht: false,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('hält die Grenzen auch beim Wechsel zwischen privat und geteilt', async () => {
    for (let i = 0; i < MAX_GETEILTE_DASHBOARDS; i += 1) {
      await dienst.anlegen(workspaceId, anna, {
        name: `Team ${String(i)}`,
        privat: false,
        vonUebersicht: false,
      });
    }

    const eigenes = await dienst.anlegen(workspaceId, ben, {
      name: 'Eigenes',
      privat: true,
      vonUebersicht: false,
    });

    await expect(
      dienst.aendern(workspaceId, ben, eigenes.id, { privat: false }),
    ).rejects.toThrow('Höchstens 30 geteilte Dashboards je Bereich.');

    for (let i = 1; i < MAX_PRIVATE_DASHBOARDS; i += 1) {
      await dienst.anlegen(workspaceId, anna, {
        name: `Privat ${String(i)}`,
        privat: true,
        vonUebersicht: false,
      });
    }

    const letztes = await dienst.anlegen(workspaceId, anna, {
      name: 'Privat 0',
      privat: true,
      vonUebersicht: false,
    });

    await expect(
      dienst.aendern(workspaceId, anna, letztes.id, { name: 'Umbenannt' }),
    ).resolves.toMatchObject({ name: 'Umbenannt', privat: true });

    const team = (await dienst.liste(workspaceId, anna)).find(
      (dashboard) => dashboard.name === 'Team 0',
    );

    await expect(
      dienst.aendern(workspaceId, anna, team?.id ?? '', { privat: true }),
    ).rejects.toThrow('Höchstens 20 eigene Dashboards je Person.');
  });
});
