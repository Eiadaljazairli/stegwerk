import { ForbiddenException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { BetriebService } from './betrieb.service';
import { bereichFuer, NutzungService } from './nutzung.service';

const SUITE = 'betrieb';

jest.setTimeout(60_000);

let dataSource: DataSource;
let betrieb: BetriebService;

const konto = (email: string, extra: Partial<UserEntity> = {}) => {
  const users = dataSource.getRepository(UserEntity);

  return users.save(
    users.create({
      email,
      passwordHash: 'x',
      firstName: 'Bea',
      lastName: 'Trieb',
      ...extra,
    }),
  );
};

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  betrieb = new BetriebService(
    { get: () => ['chefin@stegwerk.test'] } as never,
    dataSource,
  );
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

describe('BetriebService', () => {
  it('erkennt den Betreiber an der Adresse, ohne Groß und Klein', () => {
    expect(betrieb.istBetreiber(' Chefin@Stegwerk.test')).toBe(true);
    expect(betrieb.istBetreiber('kunde@firma.test')).toBe(false);
  });

  it('weist jeden anderen ab', async () => {
    const kunde = await konto('kunde@firma.test', {
      emailVerifiedAt: new Date(),
      totpEnabledAt: new Date(),
    });

    await expect(betrieb.uebersicht(kunde.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('verlangt vom Betreiber den zweiten Faktor', async () => {
    const chefin = await konto('chefin@stegwerk.test', {
      emailVerifiedAt: new Date(),
    });

    await expect(betrieb.uebersicht(chefin.id)).rejects.toThrow('Zwei-Faktor');

    await dataSource
      .getRepository(UserEntity)
      .update(chefin.id, { totpEnabledAt: new Date() });

    const m = dataSource.manager;
    const kunde = await dataSource
      .getRepository(UserEntity)
      .findOneByOrFail({ email: 'kunde@firma.test' });
    const [eigener, fremder] = await m.save([
      m.create(WorkspaceEntity, { name: 'Betrieb intern', slug: 'intern' }),
      m.create(WorkspaceEntity, { name: 'Kunde GmbH', slug: 'kunde' }),
    ]);

    await m.save([
      m.create(MembershipEntity, {
        userId: chefin.id,
        workspaceId: eigener.id,
        role: MembershipRole.OWNER,
      }),
      m.create(MembershipEntity, {
        userId: kunde.id,
        workspaceId: fremder.id,
        role: MembershipRole.OWNER,
      }),
    ]);

    const sicht = await betrieb.uebersicht(chefin.id);

    expect(sicht.zahlen).toMatchObject({
      konten: 1,
      bestaetigt: 1,
      neuDieseWoche: 1,
      arbeitsbereiche: 1,
    });
    expect(sicht.konten).toEqual([
      expect.objectContaining({
        email: 'kunde@firma.test',
        name: 'Bea Trieb',
        zweiFaktor: true,
        bereichNamen: ['Kunde GmbH (Inhaber)'],
      }),
    ]);
    expect(sicht.bereiche).toEqual([
      expect.objectContaining({
        name: 'Kunde GmbH',
        mitglieder: 1,
        inhaber: 'kunde@firma.test',
        kontakte: 0,
        rechnungen: 0,
        speicherBytes: 0,
      }),
    ]);
  });

  it('zeigt, wann ein Konto da war und welche Bereiche es nutzte', async () => {
    const users = dataSource.getRepository(UserEntity);
    const chefin = await users.findOneByOrFail({
      email: 'chefin@stegwerk.test',
    });
    const kunde = await users.findOneByOrFail({ email: 'kunde@firma.test' });
    const nutzung = new NutzungService(dataSource);

    nutzung.merke(kunde.id, 'Rechnungen', false);
    nutzung.merke(kunde.id, 'Rechnungen', false);
    nutzung.merke(kunde.id, 'Rechnungen', true);
    nutzung.merke(kunde.id, 'Kontakte', false);
    nutzung.merke(kunde.id, null, false);
    await nutzung.schreiben();
    nutzung.merke(kunde.id, 'Rechnungen', false);
    await nutzung.schreiben();

    const detail = await betrieb.konto(chefin.id, kunde.id);

    expect(detail.zuletztGesehen).toBeInstanceOf(Date);
    expect(detail.nutzung).toEqual([
      expect.objectContaining({
        bereich: 'Rechnungen',
        angesehen: 3,
        geaendert: 1,
        tage: 1,
      }),
      expect.objectContaining({
        bereich: 'Kontakte',
        angesehen: 1,
        geaendert: 0,
      }),
    ]);
    expect(detail.tage).toEqual([expect.objectContaining({ anzahl: 5 })]);
  });

  it('ordnet Klassen den Bereichen zu', () => {
    expect(bereichFuer('InvoicesResolver')).toBe('Rechnungen');
    expect(bereichFuer('AuthResolver')).toBeNull();
    expect(bereichFuer('DealStagesResolver')).toBeNull();
    expect(bereichFuer('DealStagesResolver', true)).toBe('Phasen');
    expect(bereichFuer('NeuesDingResolver')).toBe('NeuesDing');
  });
});
