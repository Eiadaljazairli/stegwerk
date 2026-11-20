import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { LetterheadEntity } from '../quotes/letterhead.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { ROLE_TEMPLATES } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { RoleEntity } from '../workspaces/role.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { AvvAnnahmeEntity } from './avv-annahme.entity';
import { AvvService } from './avv.service';

const SUITE = 'avv_annahme';

jest.setTimeout(60_000);

let dataSource: DataSource;
let service: AvvService;
let workspaceId: string;
let inhaberId: string;
let mitgliedId: string;

const als = (userId: string): RequestUser => ({
  userId,
  workspaceId,
  email: `${userId}@example.de`,
});

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  service = new AvvService(
    dataSource.getRepository(AvvAnnahmeEntity),
    dataSource.getRepository(LetterheadEntity),
    new PermissionsService(
      dataSource.getRepository(MembershipEntity),
      dataSource.getRepository(RoleEntity),
    ),
    new ConfigService({ legal: { companyName: 'Stegwerk', legalForm: 'UG' } }),
  );
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query('TRUNCATE TABLE workspaces, users CASCADE');

  const workspace = await dataSource
    .getRepository(WorkspaceEntity)
    .save({ name: 'Muster Vertrieb', slug: 'muster' });
  workspaceId = workspace.id;

  const users = dataSource.getRepository(UserEntity);
  const anlegen = (email: string, firstName: string) =>
    users.save(
      users.create({ email, passwordHash: 'x', firstName, lastName: 'Muster' }),
    );

  inhaberId = (await anlegen('inhaber@example.de', 'Ina')).id;
  mitgliedId = (await anlegen('mitglied@example.de', 'Max')).id;

  const roles = dataSource.getRepository(RoleEntity);
  const seeded = await roles.save(
    ROLE_TEMPLATES.map((vorlage) =>
      roles.create({
        workspaceId,
        name: vorlage.name,
        description: vorlage.description,
        templateKey: vorlage.key,
        everything: vorlage.everything,
        permissions: [...vorlage.permissions],
        isSystem: true,
      }),
    ),
  );
  const rolle = (key: string) =>
    seeded.find((eintrag) => eintrag.templateKey === key)?.id ?? null;

  await dataSource.getRepository(MembershipEntity).save([
    {
      userId: inhaberId,
      workspaceId,
      role: MembershipRole.OWNER,
      roleId: rolle('owner'),
    },
    {
      userId: mitgliedId,
      workspaceId,
      role: MembershipRole.MEMBER,
      roleId: rolle('member'),
    },
  ]);

  await dataSource.getRepository(LetterheadEntity).save({
    workspaceId,
    companyName: 'Muster GmbH',
    street: 'Hauptstraße 1',
    postalCode: '10115',
    city: 'Berlin',
  });
});

const PRUEFUNG = process.env.LEGAL_DPA_REVIEWED;

beforeAll(() => {
  process.env.LEGAL_DPA_REVIEWED = 'true';
});

afterAll(() => {
  if (PRUEFUNG === undefined) {
    delete process.env.LEGAL_DPA_REVIEWED;
  } else {
    process.env.LEGAL_DPA_REVIEWED = PRUEFUNG;
  }
});

describe('AVV annehmen', () => {
  it('hält fest, wer für wen welchen Wortlaut angenommen hat', async () => {
    const annahme = await service.annehmen(als(inhaberId));

    expect(annahme.angenommenVon).toBe('Ina Muster <inhaber@example.de>');
    expect(annahme.auftraggeber).toBe(
      'Muster GmbH, Hauptstraße 1, 10115 Berlin',
    );
    expect(annahme.fassung).toBe(service.fassung());
    expect(annahme.fassung).toMatch(/^[0-9a-f]{64}$/);
    expect((await service.letzte(workspaceId))?.id).toBe(annahme.id);
  });

  it('lässt ein einfaches Mitglied nicht für das Unternehmen annehmen', async () => {
    await expect(service.annehmen(als(mitgliedId))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(await service.letzte(workspaceId)).toBeNull();
  });

  it('lässt einen ungeprüften Entwurf nicht annehmen', async () => {
    process.env.LEGAL_DPA_REVIEWED = 'false';

    try {
      await expect(service.annehmen(als(inhaberId))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    } finally {
      process.env.LEGAL_DPA_REVIEWED = 'true';
    }
  });

  it('nimmt den Bereichsnamen, wenn der Briefkopf leer ist', async () => {
    await dataSource.getRepository(LetterheadEntity).delete({ workspaceId });

    expect(await service.auftraggeber(workspaceId)).toBe('Muster Vertrieb');
  });
});
