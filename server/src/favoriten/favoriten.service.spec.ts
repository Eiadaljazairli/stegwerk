import { type DataSource } from 'typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { FavoritArt } from './favoriten.dto';
import { FavoritenService } from './favoriten.service';

const SUITE = 'b8_favoriten';

jest.setTimeout(60_000);

let dataSource: DataSource;
let favoriten: FavoritenService;
let workspaceId: string;
let fremderBereich: string;
let anna: UserEntity;
let ben: UserEntity;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  favoriten = new FavoritenService(dataSource);

  const m = dataSource.manager;

  workspaceId = (
    await m.save(m.create(WorkspaceEntity, { name: 'Stern', slug: 'stern' }))
  ).id;
  fremderBereich = (
    await m.save(m.create(WorkspaceEntity, { name: 'Fremd', slug: 'fremd' }))
  ).id;

  const person = (email: string, firstName: string) =>
    m.save(
      m.create(UserEntity, {
        email,
        passwordHash: 'x',
        firstName,
        lastName: 'Stern',
      }),
    );

  anna = await person('anna@stern.test', 'Anna');
  ben = await person('ben@stern.test', 'Ben');
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

const firma = (name: string, bereich = workspaceId) =>
  dataSource.manager.save(
    dataSource.manager.create(CompanyEntity, { workspaceId: bereich, name }),
  );

describe('Favoriten', () => {
  it('setzt und nimmt den Stern', async () => {
    const nordwind = await firma('Nordwind GmbH');

    await expect(
      favoriten.umschalten(anna.id, workspaceId, FavoritArt.FIRMA, nordwind.id),
    ).resolves.toBe(true);

    expect(
      await favoriten.liste(anna.id, workspaceId, [FavoritArt.FIRMA]),
    ).toEqual([
      expect.objectContaining({
        art: FavoritArt.FIRMA,
        datensatzId: nordwind.id,
        titel: 'Nordwind GmbH',
      }),
    ]);

    await expect(
      favoriten.umschalten(anna.id, workspaceId, FavoritArt.FIRMA, nordwind.id),
    ).resolves.toBe(false);

    expect(
      await favoriten.liste(anna.id, workspaceId, [FavoritArt.FIRMA]),
    ).toEqual([]);
  });

  it('gehört der Person, nicht dem Bereich', async () => {
    const sued = await firma('Südwind KG');

    await favoriten.umschalten(anna.id, workspaceId, FavoritArt.FIRMA, sued.id);

    expect(
      await favoriten.liste(ben.id, workspaceId, [FavoritArt.FIRMA]),
    ).toEqual([]);
  });

  it('nimmt keinen Datensatz aus einem anderen Bereich', async () => {
    const fremd = await firma('Fremd AG', fremderBereich);

    await expect(
      favoriten.umschalten(anna.id, workspaceId, FavoritArt.FIRMA, fremd.id),
    ).rejects.toThrow('Diesen Datensatz gibt es nicht.');
  });

  it('blendet aus, was im Papierkorb liegt, und zeigt es danach wieder', async () => {
    const m = dataSource.manager;
    const deal = await m.save(
      m.create(DealEntity, {
        workspaceId,
        name: 'Lagerhalle',
        amount: 1000,
        currency: 'EUR',
      }),
    );

    await favoriten.umschalten(
      anna.id,
      workspaceId,
      FavoritArt.GESCHAEFT,
      deal.id,
    );
    await m.getRepository(DealEntity).softDelete({ id: deal.id });

    expect(
      await favoriten.liste(anna.id, workspaceId, [FavoritArt.GESCHAEFT]),
    ).toEqual([]);

    await m.getRepository(DealEntity).restore({ id: deal.id });

    expect(
      (await favoriten.liste(anna.id, workspaceId, [FavoritArt.GESCHAEFT])).map(
        (f) => f.titel,
      ),
    ).toEqual(['Lagerhalle']);
  });

  it('zeigt nur die erlaubten Arten, Kontakte mit vollem Namen', async () => {
    const m = dataSource.manager;
    const kontakt = await m.save(
      m.create(ContactEntity, {
        workspaceId,
        firstName: 'Clara',
        lastName: 'Weber',
      }),
    );

    await favoriten.umschalten(
      ben.id,
      workspaceId,
      FavoritArt.KONTAKT,
      kontakt.id,
    );

    expect(
      (await favoriten.liste(ben.id, workspaceId, [FavoritArt.KONTAKT])).map(
        (f) => f.titel,
      ),
    ).toEqual(['Clara Weber']);
    expect(
      await favoriten.liste(ben.id, workspaceId, [FavoritArt.FIRMA]),
    ).toEqual([]);
    expect(await favoriten.liste(ben.id, workspaceId, [])).toEqual([]);
  });

  it('liefert auch mehr als fünfzig Sterne, damit jeder Stern seinen Datensatz findet', async () => {
    const m = dataSource.manager;
    const zeigt = await m.save(
      m.create(UserEntity, {
        email: 'viele@stern.test',
        passwordHash: 'x',
        firstName: 'Viele',
        lastName: 'Stern',
      }),
    );

    for (let i = 0; i < 55; i += 1) {
      const f = await firma(`Firma ${String(i)}`);
      await favoriten.umschalten(zeigt.id, workspaceId, FavoritArt.FIRMA, f.id);
    }

    expect(
      await favoriten.liste(zeigt.id, workspaceId, [FavoritArt.FIRMA]),
    ).toHaveLength(55);
  });
});
