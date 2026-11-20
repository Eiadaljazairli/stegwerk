import { type DataSource } from 'typeorm';

import { ContactEntity } from '../crm/entities/contact.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { ErsteSchritteResolver } from './erste-schritte.resolver';

const SUITE = 'erste_schritte';

jest.setTimeout(60_000);

let dataSource: DataSource;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

it('meldet einen neuen Bereich als leer und hakt ab, was dazukommt', async () => {
  const m = dataSource.manager;
  const bereich = await m.save(
    m.create(WorkspaceEntity, { name: 'Neu', slug: 'neu' }),
  );
  const anna = await m.save(
    m.create(UserEntity, {
      email: 'anna@neu.test',
      passwordHash: 'x',
      firstName: 'Anna',
      lastName: 'Neu',
    }),
  );

  await m.save(
    m.create(MembershipEntity, {
      userId: anna.id,
      workspaceId: bereich.id,
      role: MembershipRole.OWNER,
    }),
  );

  const luecken = { gaps: jest.fn().mockResolvedValue([{ field: 'iban' }]) };
  const resolver = new ErsteSchritteResolver(dataSource, luecken as never);
  const user = { userId: anna.id, workspaceId: bereich.id, email: anna.email };

  expect(await resolver.ersteSchritte(user)).toEqual({
    briefkopf: false,
    kontakte: false,
    geschaeft: false,
    team: false,
    angebot: false,
    zweiFaktor: false,
    postfach: false,
  });

  await m.save(
    m.create(ContactEntity, {
      workspaceId: bereich.id,
      firstName: 'E',
      lastName: 'M',
    }),
  );
  luecken.gaps.mockResolvedValue([]);

  expect(await resolver.ersteSchritte(user)).toMatchObject({
    briefkopf: true,
    kontakte: true,
  });
});
