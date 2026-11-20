import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { RoleEntity } from '../workspaces/role.entity';
import { RolesService } from '../workspaces/roles.service';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { ApiKeyEntity } from './api-key.entity';
import { ApiKeysService, HOECHSTZAHL } from './api-keys.service';

const SUITE = 'api-keys';
const TAG_MS = 24 * 60 * 60 * 1000;

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: ApiKeysService;
let permissions: PermissionsService;
let roles: RolesService;
let workspaceId: string;
let fremderWorkspaceId: string;
let inhaberId: string;
let leserId: string;

const als = (userId: string, id = workspaceId): RequestUser => ({
  userId,
  workspaceId: id,
  email: `${userId}@example.de`,
});

const person = async (
  email: string,
  vorlage: 'owner' | 'readonly',
  wo = workspaceId,
) => {
  const users = dataSource.getRepository(UserEntity);
  const user = await users.save(
    users.create({
      email: `${email}-${wo.slice(0, 8)}@example.de`,
      passwordHash: 'x',
      firstName: 'Test',
      lastName: 'Person',
    }),
  );

  const rolle = await dataSource
    .getRepository(RoleEntity)
    .findOneOrFail({ where: { workspaceId: wo, templateKey: vorlage } });

  const memberships = dataSource.getRepository(MembershipEntity);

  await memberships.save(
    memberships.create({
      userId: user.id,
      workspaceId: wo,
      role: vorlage === 'owner' ? MembershipRole.OWNER : MembershipRole.MEMBER,
      roleId: rolle.id,
    }),
  );

  return user.id;
};

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  permissions = new PermissionsService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(RoleEntity),
  );
  roles = new RolesService(
    dataSource.getRepository(RoleEntity),
    dataSource.getRepository(MembershipEntity),
  );
  service = new ApiKeysService(
    dataSource.getRepository(ApiKeyEntity),
    permissions,
  );
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query(
    'TRUNCATE TABLE api_keys, memberships, roles, users, workspaces CASCADE',
  );

  const workspaces = dataSource.getRepository(WorkspaceEntity);

  workspaceId = (
    await workspaces.save(
      workspaces.create({ name: 'Nordwind', slug: 'nordwind' }),
    )
  ).id;
  fremderWorkspaceId = (
    await workspaces.save(
      workspaces.create({ name: 'Südwind', slug: 'suedwind' }),
    )
  ).id;

  await roles.list(workspaceId);
  await roles.list(fremderWorkspaceId);

  inhaberId = await person('inhaber', 'owner');
  leserId = await person('leser', 'readonly');
});

describe('einen Schlüssel anlegen', () => {
  it('gibt den Klartext genau einmal heraus und speichert ihn nicht', async () => {
    const { schluessel, token } = await service.anlegen(als(inhaberId), {
      name: 'Nächtlicher Import',
      permissions: [Permission.COMPANY_WRITE],
    });

    expect(token).toMatch(/^swk_[A-Za-z0-9]+_[A-Za-z0-9]+$/u);

    const gespeichert = await dataSource
      .getRepository(ApiKeyEntity)
      .findOneOrFail({ where: { id: schluessel.id } });
    const geheimnis = token.split('_')[2];

    expect(gespeichert.hash).not.toContain(geheimnis);
    expect(JSON.stringify(gespeichert)).not.toContain(geheimnis);
  });

  it('ergänzt das Sehen zum Schreiben', async () => {
    const { schluessel } = await service.anlegen(als(inhaberId), {
      name: 'Import',
      permissions: [Permission.COMPANY_WRITE],
    });

    expect(schluessel.permissions).toContain(Permission.COMPANY_VIEW);
  });

  it('wirft unbekannte Rechte weg', async () => {
    const { schluessel } = await service.anlegen(als(inhaberId), {
      name: 'Import',
      permissions: [Permission.COMPANY_VIEW, 'company:fliegen'],
    });

    expect(schluessel.permissions).not.toContain('company:fliegen');
  });

  it('lehnt einen Schlüssel ohne jedes Recht ab', async () => {
    await expect(
      service.anlegen(als(inhaberId), { name: 'Leer', permissions: [] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('lehnt einen Schlüssel ohne Namen ab', async () => {
    await expect(
      service.anlegen(als(inhaberId), {
        name: '   ',
        permissions: [Permission.COMPANY_VIEW],
      }),
    ).rejects.toThrow(/braucht einen Namen/u);
  });

  it('lehnt eine Frist in der Vergangenheit ab', async () => {
    await expect(
      service.anlegen(als(inhaberId), {
        name: 'Schon vorbei',
        permissions: [Permission.COMPANY_VIEW],
        expiresAt: new Date(Date.now() - TAG_MS),
      }),
    ).rejects.toThrow(/Vergangenheit/u);
  });

  it('begrenzt, wie viele zugleich gelten', async () => {
    for (let i = 0; i < HOECHSTZAHL; i += 1) {
      await service.anlegen(als(inhaberId), {
        name: `Schlüssel ${i}`,
        permissions: [Permission.COMPANY_VIEW],
      });
    }

    await expect(
      service.anlegen(als(inhaberId), {
        name: 'Einer zu viel',
        permissions: [Permission.COMPANY_VIEW],
      }),
    ).rejects.toThrow(/Widerrufen Sie zuerst/u);
  });

  it('zählt widerrufene nicht gegen die Grenze', async () => {
    const angelegt = [];

    for (let i = 0; i < HOECHSTZAHL; i += 1) {
      angelegt.push(
        await service.anlegen(als(inhaberId), {
          name: `Schlüssel ${i}`,
          permissions: [Permission.COMPANY_VIEW],
        }),
      );
    }

    await service.widerrufen(workspaceId, angelegt[0].schluessel.id);

    await expect(
      service.anlegen(als(inhaberId), {
        name: 'Nachrücker',
        permissions: [Permission.COMPANY_VIEW],
      }),
    ).resolves.toBeDefined();
  });
});

describe('die Grenze nach oben', () => {
  it('lässt niemanden einen Schlüssel bauen, der mehr kann als er selbst', async () => {
    await expect(
      service.anlegen(als(leserId), {
        name: 'Mehr als ich darf',
        permissions: [Permission.INVOICE_ISSUE],
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('nennt das fehlende Recht beim Namen', async () => {
    await expect(
      service.anlegen(als(leserId), {
        name: 'Mehr als ich darf',
        permissions: [Permission.INVOICE_ISSUE],
      }),
    ).rejects.toThrow(/invoice:issue/u);
  });

  it('lässt durch, was der Anlegende selbst hat', async () => {
    await expect(
      service.anlegen(als(leserId), {
        name: 'Nur lesen',
        permissions: [Permission.COMPANY_VIEW],
      }),
    ).resolves.toBeDefined();
  });

  it('lässt einen Schlüssel keine weiteren Schlüssel anlegen', async () => {
    const anrufer: RequestUser = {
      ...als(inhaberId),
      apiKey: {
        id: 'x',
        name: 'Erster',
        permissions: [Permission.MEMBER_MANAGE],
      },
    };

    await expect(
      service.anlegen(anrufer, {
        name: 'Zweiter',
        permissions: [Permission.COMPANY_VIEW],
      }),
    ).rejects.toThrow(/keine weiteren Schlüssel/u);
  });
});

describe('einen vorgezeigten Schlüssel prüfen', () => {
  const anlegen = () =>
    service.anlegen(als(inhaberId), {
      name: 'Import',
      permissions: [Permission.COMPANY_WRITE],
    });

  it('erkennt den richtigen', async () => {
    const { token, schluessel } = await anlegen();
    const anrufer = await service.anrufer(token);

    expect(anrufer?.workspaceId).toBe(workspaceId);
    expect(anrufer?.apiKey?.id).toBe(schluessel.id);
    expect(anrufer?.apiKey?.permissions).toContain(Permission.COMPANY_WRITE);
  });

  it('weist einen falschen zurück, auch bei richtiger Kennung', async () => {
    const { token } = await anlegen();
    const [praefix, kennung] = token.split('_');
    const gefaelscht = `${praefix}_${kennung}_${'a'.repeat(43)}`;

    expect(await service.anrufer(gefaelscht)).toBeNull();
  });

  it('weist zurück, was gar nicht die Form eines Schlüssels hat', async () => {
    for (const unsinn of ['', 'swk_', 'swk_abc', 'ey.Jh.bGc', 'swk_a_b_c']) {
      expect(await service.anrufer(unsinn)).toBeNull();
    }
  });

  it('weist einen widerrufenen zurück — sofort, ohne Sitzung abzuwarten', async () => {
    const { token, schluessel } = await anlegen();

    expect(await service.anrufer(token)).not.toBeNull();

    await service.widerrufen(workspaceId, schluessel.id);

    expect(await service.anrufer(token)).toBeNull();
  });

  it('weist einen abgelaufenen zurück', async () => {
    const { token, schluessel } = await service.anlegen(als(inhaberId), {
      name: 'Mit Frist',
      permissions: [Permission.COMPANY_VIEW],
      expiresAt: new Date(Date.now() + TAG_MS),
    });

    expect(await service.anrufer(token)).not.toBeNull();

    await dataSource
      .getRepository(ApiKeyEntity)
      .update(schluessel.id, { expiresAt: new Date(Date.now() - 1000) });

    expect(await service.anrufer(token)).toBeNull();
  });

  it('vermerkt, dass er benutzt wurde', async () => {
    const { token, schluessel } = await anlegen();

    expect(schluessel.lastUsedAt).toBeNull();

    await service.anrufer(token);

    const danach = await dataSource
      .getRepository(ApiKeyEntity)
      .findOneOrFail({ where: { id: schluessel.id } });

    expect(danach.lastUsedAt).not.toBeNull();
  });

  it('schreibt den Vermerk nicht bei jeder Anfrage', async () => {
    const { token, schluessel } = await anlegen();

    await service.anrufer(token);

    const erst = await dataSource
      .getRepository(ApiKeyEntity)
      .findOneOrFail({ where: { id: schluessel.id } });

    await service.anrufer(token);

    const dann = await dataSource
      .getRepository(ApiKeyEntity)
      .findOneOrFail({ where: { id: schluessel.id } });

    expect(dann.lastUsedAt?.getTime()).toBe(erst.lastUsedAt?.getTime());
  });
});

describe('die Rechte eines Schlüssels', () => {
  it('kommen aus dem Schlüssel und nicht aus einer Mitgliedschaft', async () => {
    const { token } = await service.anlegen(als(inhaberId), {
      name: 'Nur Firmen',
      permissions: [Permission.COMPANY_WRITE],
    });
    const anrufer = (await service.anrufer(token)) as RequestUser;

    expect(await permissions.can(anrufer, Permission.COMPANY_WRITE)).toBe(true);
    expect(await permissions.can(anrufer, Permission.INVOICE_ISSUE)).toBe(
      false,
    );
  });

  it('machen ihn nie allmächtig', async () => {
    const { token } = await service.anlegen(als(inhaberId), {
      name: 'Viel',
      permissions: [Permission.COMPANY_WRITE, Permission.DEAL_WRITE],
    });
    const anrufer = (await service.anrufer(token)) as RequestUser;

    expect(await permissions.permissionsOf(anrufer)).toMatchObject({
      everything: false,
    });
    expect(await permissions.can(anrufer, Permission.DATA_PRIVACY)).toBe(false);
  });

  it('sagen bei einer Ablehnung, welches Recht fehlt', async () => {
    const { token } = await service.anlegen(als(inhaberId), {
      name: 'Nur Firmen',
      permissions: [Permission.COMPANY_VIEW],
    });
    const anrufer = (await service.anrufer(token)) as RequestUser;

    await expect(
      permissions.assert(anrufer, Permission.INVOICE_ISSUE, 'zu stellen'),
    ).rejects.toThrow(/Nur Firmen.*invoice:issue/su);
  });
});

describe('die Grenze zum Arbeitsbereich', () => {
  it('widerruft keinen Schlüssel eines fremden Arbeitsbereichs', async () => {
    const fremderInhaber = await person('fremd', 'owner', fremderWorkspaceId);
    const { schluessel } = await service.anlegen(
      als(fremderInhaber, fremderWorkspaceId),
      { name: 'Fremd', permissions: [Permission.COMPANY_VIEW] },
    );

    await expect(
      service.widerrufen(workspaceId, schluessel.id),
    ).rejects.toThrow(/gibt es nicht/u);

    const unberuehrt = await dataSource
      .getRepository(ApiKeyEntity)
      .findOneOrFail({ where: { id: schluessel.id } });

    expect(unberuehrt.revokedAt).toBeNull();
  });

  it('stellt gültige Schlüssel über widerrufene', async () => {
    const { schluessel: alt } = await service.anlegen(als(inhaberId), {
      name: 'Alt',
      permissions: [Permission.COMPANY_VIEW],
    });

    await service.widerrufen(workspaceId, alt.id);
    await service.anlegen(als(inhaberId), {
      name: 'Gültig',
      permissions: [Permission.COMPANY_VIEW],
    });

    expect((await service.list(workspaceId)).map((s) => s.name)).toEqual([
      'Gültig',
      'Alt',
    ]);
  });

  it('zeigt in der Liste nur die eigenen', async () => {
    const fremderInhaber = await person('fremd', 'owner', fremderWorkspaceId);

    await service.anlegen(als(inhaberId), {
      name: 'Eigener',
      permissions: [Permission.COMPANY_VIEW],
    });
    await service.anlegen(als(fremderInhaber, fremderWorkspaceId), {
      name: 'Fremder',
      permissions: [Permission.COMPANY_VIEW],
    });

    const liste = await service.list(workspaceId);

    expect(liste).toHaveLength(1);
    expect(liste[0].name).toBe('Eigener');
  });
});

describe('widerrufen', () => {
  it('behält den ersten Zeitpunkt', async () => {
    const { schluessel } = await service.anlegen(als(inhaberId), {
      name: 'Import',
      permissions: [Permission.COMPANY_VIEW],
    });

    const erst = await service.widerrufen(workspaceId, schluessel.id);
    const nochmal = await service.widerrufen(workspaceId, schluessel.id);

    expect(nochmal.revokedAt?.getTime()).toBe(erst.revokedAt?.getTime());
  });

  it('löscht die Zeile nicht', async () => {
    const { schluessel } = await service.anlegen(als(inhaberId), {
      name: 'Import',
      permissions: [Permission.COMPANY_VIEW],
    });

    await service.widerrufen(workspaceId, schluessel.id);

    expect(
      await dataSource
        .getRepository(ApiKeyEntity)
        .countBy({ id: schluessel.id }),
    ).toBe(1);
  });
});

describe('nur vorschlagen', () => {
  it('lässt einen vorschlagenden Schlüssel nur sehen, auch an MCP vorbei', async () => {
    const { schluessel, token } = await service.anlegen(als(inhaberId), {
      name: 'Assistent',
      permissions: [Permission.DEAL_WRITE, Permission.COMPANY_VIEW],
      schreibmodus: 'vorschlag',
    });

    expect(schluessel.schreibmodus).toBe('vorschlag');

    const anrufer = (await service.anrufer(token)) as RequestUser;

    expect(anrufer.apiKey?.schreibmodus).toBe('vorschlag');
    expect(await permissions.can(anrufer, Permission.DEAL_VIEW)).toBe(true);
    expect(await permissions.can(anrufer, Permission.DEAL_WRITE)).toBe(false);
  });

  it('bleibt ohne Angabe direkt, wie jeder Schlüssel vor dieser Wahl', async () => {
    const { token } = await service.anlegen(als(inhaberId), {
      name: 'Import',
      permissions: [Permission.COMPANY_WRITE],
    });
    const anrufer = (await service.anrufer(token)) as RequestUser;

    expect(anrufer.apiKey?.schreibmodus).toBe('direkt');
    expect(await permissions.can(anrufer, Permission.COMPANY_WRITE)).toBe(true);
  });

  it('gibt einem Schlüssel nie das Recht, Vorschläge freizugeben', async () => {
    const { schluessel } = await service.anlegen(als(inhaberId), {
      name: 'Assistent',
      permissions: [Permission.KI_APPROVE, Permission.DEAL_VIEW],
    });

    expect(schluessel.permissions).toEqual([Permission.DEAL_VIEW]);
  });

  it('schaltet um, wirkt sofort und nur im eigenen Bereich', async () => {
    const { schluessel, token } = await service.anlegen(als(inhaberId), {
      name: 'Assistent',
      permissions: [Permission.DEAL_WRITE],
    });

    await service.schreibmodusSetzen(
      als(inhaberId),
      schluessel.id,
      'vorschlag',
    );

    const anrufer = (await service.anrufer(token)) as RequestUser;

    expect(await permissions.can(anrufer, Permission.DEAL_WRITE)).toBe(false);

    const fremd = await person('fremd', 'owner', fremderWorkspaceId);

    await expect(
      service.schreibmodusSetzen(
        als(fremd, fremderWorkspaceId),
        schluessel.id,
        'direkt',
      ),
    ).rejects.toThrow('gibt es nicht');
    await expect(
      service.schreibmodusSetzen(anrufer, schluessel.id, 'direkt'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
