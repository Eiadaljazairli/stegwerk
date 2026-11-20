import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { type ModuleRef } from '@nestjs/core';
import {
  buildSchema,
  getNullableType,
  type GraphQLOutputType,
  type GraphQLSchema,
  isEnumType,
  isListType,
  isObjectType,
} from 'graphql';
import { type DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { BillingService } from '../billing/billing.service';
import { DealEntity, DealStage } from '../crm/entities/deal.entity';
import { WERKZEUGE } from '../mcp/mcp-werkzeuge';
import { runWithRequestContext } from '../observability/request-context';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { Permission, ROLE_TEMPLATES } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { RoleEntity } from '../workspaces/role.entity';
import { setzeSichtfeld } from '../workspaces/sichtbarkeit';
import { zielSichtbar } from '../workspaces/ziel-sichtbarkeit';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { KiVorschlagEntity } from './ki-vorschlag.entity';
import {
  KiVorschlaegeResolver,
  sichtbarerStand,
} from './ki-vorschlaege.resolver';
import {
  gleicherStand,
  KiVorschlaegeService,
  VorschlagAbgelehnt,
} from './ki-vorschlaege.service';

const SUITE = 'ki_vorschlaege';

jest.setTimeout(60_000);

let dataSource: DataSource;
let rechte: PermissionsService;
let dienst: KiVorschlaegeService;
let resolver: KiVorschlaegeResolver;
let bereich: string;
let fremderBereich: string;
const leute = {} as Record<
  'inhaber' | 'aussendienst' | 'nurLesen' | 'ohneKi' | 'fremd' | 'schluessel',
  RequestUser
>;

const als = <T>(wer: RequestUser, tun: () => Promise<T>): Promise<T> =>
  runWithRequestContext({ requestId: 'test' }, () => {
    setzeSichtfeld(() => rechte.sichtfeldFuer(wer));

    return tun();
  });

const anfrage = (wer: RequestUser) => ({ user: wer });

let aboGesperrt = false;
const abo = {
  assertCanWrite: () =>
    aboGesperrt
      ? Promise.reject(
          new ForbiddenException(
            'Your subscription is not active. Update your billing to continue.',
          ),
        )
      : Promise.resolve(),
};

const platzhalter = (typ: GraphQLOutputType): unknown => {
  const kern = getNullableType(typ);

  if (isListType(kern)) {
    return [];
  }

  if (isEnumType(kern)) {
    return kern.getValues()[0].value;
  }

  if (isObjectType(kern)) {
    return {};
  }

  return { Int: 0, Float: 0, Boolean: false }[String(kern)] ?? 'x';
};

const schemaMitGeschaeften = (): GraphQLSchema => {
  const schema = buildSchema(
    readFileSync(join(__dirname, '..', '..', 'schema.gql'), 'utf8'),
  );

  for (const typ of Object.values(schema.getTypeMap())) {
    if (isObjectType(typ) && !typ.name.startsWith('__')) {
      for (const feld of Object.values(typ.getFields())) {
        feld.resolve = (quelle: Record<string, unknown>) =>
          quelle[feld.name] ?? platzhalter(feld.type);
      }
    }
  }

  const sichtbaresGeschaeft = async (
    wer: RequestUser,
    id: string,
  ): Promise<DealEntity> => {
    await rechte.assert(wer, Permission.DEAL_VIEW, 'Geschäfte zu sehen');

    const deal = await dataSource.getRepository(DealEntity).findOne({
      where: { id, workspaceId: wer.workspaceId },
    });

    if (
      deal === null ||
      !(await als(wer, () => zielSichtbar(dataSource.manager, { dealId: id })))
    ) {
      throw new NotFoundException('Dieses Geschäft gibt es nicht.');
    }

    return deal;
  };

  const alsAntwort = (deal: DealEntity) => ({
    ...deal,
    stage: deal.stage.toUpperCase(),
  });

  schema.getQueryType()!.getFields().deal.resolve = async (
    _quelle,
    { id }: { id: string },
    { req }: { req: { user: RequestUser } },
  ) => alsAntwort(await sichtbaresGeschaeft(req.user, id));

  schema.getMutationType()!.getFields().updateDeal.resolve = async (
    _quelle,
    { input }: { input: { id: string; stage?: string } },
    { req }: { req: { user: RequestUser } },
  ) => {
    await rechte.assert(req.user, Permission.DEAL_WRITE, 'Geschäfte zu ändern');

    const deal = await sichtbaresGeschaeft(req.user, input.id);

    deal.stage = (input.stage?.toLowerCase() ?? deal.stage) as DealStage;

    return alsAntwort(await dataSource.getRepository(DealEntity).save(deal));
  };

  return schema;
};

const geschaeft = (ownerId: string | null, workspaceId = bereich) =>
  dataSource.getRepository(DealEntity).save(
    dataSource.getRepository(DealEntity).create({
      workspaceId,
      name: 'Dachsanierung',
      stage: DealStage.LEAD,
      ownerId,
    }),
  );

const UPDATE = WERKZEUGE.find((w) => w.name === 'update_deal')!;

const vorschlagen = (dealId: string, stage = 'won') =>
  als(leute.schluessel, () =>
    dienst.vorschlagen(anfrage(leute.schluessel), UPDATE, {
      id: dealId,
      stage,
    }),
  );

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  rechte = new PermissionsService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(RoleEntity),
  );

  const schema = schemaMitGeschaeften();

  dienst = new KiVorschlaegeService(
    dataSource.getRepository(KiVorschlagEntity),
    rechte,
    {
      get: (token: unknown) => (token === BillingService ? abo : { schema }),
    } as unknown as ModuleRef,
  );
  resolver = new KiVorschlaegeResolver(dienst, rechte);
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(async () => {
  await dataSource.query('TRUNCATE TABLE workspaces, users CASCADE');
  aboGesperrt = false;

  const m = dataSource.manager;

  bereich = (await m.save(m.create(WorkspaceEntity, { name: 'V', slug: 'v' })))
    .id;
  fremderBereich = (
    await m.save(m.create(WorkspaceEntity, { name: 'F', slug: 'f' }))
  ).id;

  const rolle = (
    workspaceId: string,
    name: string,
    permissions: Permission[],
    eigene = false,
  ) =>
    m.save(
      m.create(RoleEntity, {
        workspaceId,
        name,
        everything: false,
        permissions,
        ...(eigene
          ? {
              sichtbarkeit: {
                company: 'eigene',
                contact: 'eigene',
                deal: 'eigene',
              },
            }
          : {}),
      }),
    );
  const inhaberRolle = (workspaceId: string) =>
    m.save(
      m.create(RoleEntity, {
        workspaceId,
        name: ROLE_TEMPLATES[0].name,
        templateKey: 'owner',
        everything: true,
        permissions: [],
        isSystem: true,
      }),
    );
  const person = async (
    kurz: keyof typeof leute,
    workspaceId: string,
    roleId: string,
    enumRolle = MembershipRole.MEMBER,
  ) => {
    const user = await m.save(
      m.create(UserEntity, {
        email: `${kurz}@ki.test`,
        passwordHash: 'x',
        firstName: kurz,
        lastName: 'Test',
      }),
    );

    await m.save(
      m.create(MembershipEntity, {
        userId: user.id,
        workspaceId,
        role: enumRolle,
        roleId,
      }),
    );
    leute[kurz] = { userId: user.id, workspaceId, email: user.email };
  };

  await person(
    'inhaber',
    bereich,
    (await inhaberRolle(bereich)).id,
    MembershipRole.OWNER,
  );
  await person(
    'aussendienst',
    bereich,
    (
      await rolle(
        bereich,
        'Außendienst',
        [Permission.DEAL_VIEW, Permission.DEAL_WRITE, Permission.KI_APPROVE],
        true,
      )
    ).id,
  );
  await person(
    'nurLesen',
    bereich,
    (
      await rolle(bereich, 'Lesen mit KI', [
        Permission.DEAL_VIEW,
        Permission.KI_APPROVE,
      ])
    ).id,
  );
  await person(
    'ohneKi',
    bereich,
    (
      await rolle(bereich, 'Ohne KI', [
        Permission.DEAL_VIEW,
        Permission.DEAL_WRITE,
      ])
    ).id,
  );
  await person(
    'fremd',
    fremderBereich,
    (await inhaberRolle(fremderBereich)).id,
    MembershipRole.OWNER,
  );

  const [schluessel] = (await dataSource.query(
    `INSERT INTO "api_keys" ("workspaceId", "name", "kennung", "hash", "permissions", "schreibmodus", "createdById")
     VALUES ($1, 'Assistent', 'kennung-ki', 'x', ARRAY['deal:view'], 'vorschlag', $2) RETURNING "id"`,
    [bereich, leute.inhaber.userId],
  )) as { id: string }[];

  leute.schluessel = {
    userId: schluessel.id,
    workspaceId: bereich,
    email: 'Assistent (Schlüssel)',
    apiKey: {
      id: schluessel.id,
      name: 'Assistent',
      permissions: ['deal:view'],
      schreibmodus: 'vorschlag',
    },
  };
});

describe('vorschlagen', () => {
  it('schreibt nichts und hält Vorher und Nachher fest', async () => {
    const deal = await geschaeft(leute.inhaber.userId);
    const vorschlag = await vorschlagen(deal.id);

    expect(vorschlag).toMatchObject({
      status: 'offen',
      werkzeug: 'update_deal',
      vorher: { stage: 'LEAD' },
      nachher: { stage: 'WON' },
      zielArt: 'deal',
      dealId: deal.id,
      zielName: 'Dachsanierung',
      schluesselName: 'Assistent',
    });
    expect(
      (
        await dataSource
          .getRepository(DealEntity)
          .findOneByOrFail({ id: deal.id })
      ).stage,
    ).toBe(DealStage.LEAD);
  });

  it('lehnt ab, was der Schlüssel nicht sieht, und was schon so ist', async () => {
    const fremdes = await geschaeft(null, fremderBereich);

    await expect(vorschlagen(fremdes.id)).rejects.toBeInstanceOf(
      VorschlagAbgelehnt,
    );

    const deal = await geschaeft(null);

    await expect(vorschlagen(deal.id, 'lead')).rejects.toThrow(
      'nichts vorzuschlagen',
    );
    expect(await dataSource.getRepository(KiVorschlagEntity).count()).toBe(0);
  });

  it('legt bei gesperrtem Abo keinen Vorschlag an', async () => {
    const deal = await geschaeft(null);

    aboGesperrt = true;

    await expect(vorschlagen(deal.id)).rejects.toThrow(
      'subscription is not active',
    );
    await expect(vorschlagen(deal.id)).rejects.toBeInstanceOf(
      VorschlagAbgelehnt,
    );
    expect(await dataSource.getRepository(KiVorschlagEntity).count()).toBe(0);
  });
});

describe('annehmen', () => {
  it('führt mit den Rechten der Inhaberin aus, und nur einmal', async () => {
    const deal = await geschaeft(null);
    const vorschlag = await vorschlagen(deal.id);

    const ergebnis = await als(leute.inhaber, () =>
      dienst.annehmen(
        leute.inhaber,
        anfrage(leute.inhaber),
        vorschlag.id,
        false,
      ),
    );

    expect(ergebnis.veraltet).toBe(false);
    expect(ergebnis.vorschlag).toMatchObject({
      status: 'angenommen',
      entschiedenVonId: leute.inhaber.userId,
    });
    expect(
      (
        await dataSource
          .getRepository(DealEntity)
          .findOneByOrFail({ id: deal.id })
      ).stage,
    ).toBe(DealStage.WON);

    await expect(
      als(leute.inhaber, () =>
        dienst.annehmen(
          leute.inhaber,
          anfrage(leute.inhaber),
          vorschlag.id,
          false,
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('nimmt bei zwei gleichzeitigen Klicks genau einmal an', async () => {
    const deal = await geschaeft(null);
    const vorschlag = await vorschlagen(deal.id);
    const klick = () =>
      als(leute.inhaber, () =>
        dienst.annehmen(
          leute.inhaber,
          anfrage(leute.inhaber),
          vorschlag.id,
          false,
        ),
      );

    const ergebnisse = await Promise.allSettled([klick(), klick()]);

    expect(ergebnisse.filter((e) => e.status === 'fulfilled')).toHaveLength(1);
    expect(ergebnisse.filter((e) => e.status === 'rejected')).toHaveLength(1);
  });

  it('fragt nach, wenn sich das Feld seit dem Vorschlag geändert hat', async () => {
    const deal = await geschaeft(null);
    const vorschlag = await vorschlagen(deal.id);

    await dataSource
      .getRepository(DealEntity)
      .update(deal.id, { stage: DealStage.NEGOTIATION });

    const erst = await als(leute.inhaber, () =>
      dienst.annehmen(
        leute.inhaber,
        anfrage(leute.inhaber),
        vorschlag.id,
        false,
      ),
    );

    expect(erst).toMatchObject({
      veraltet: true,
      aktuell: { stage: 'NEGOTIATION' },
      vorschlag: { status: 'offen' },
    });
    expect(
      (
        await dataSource
          .getRepository(DealEntity)
          .findOneByOrFail({ id: deal.id })
      ).stage,
    ).toBe(DealStage.NEGOTIATION);

    const dann = await als(leute.inhaber, () =>
      dienst.annehmen(
        leute.inhaber,
        anfrage(leute.inhaber),
        vorschlag.id,
        true,
      ),
    );

    expect(dann.veraltet).toBe(false);
    expect(
      (
        await dataSource
          .getRepository(DealEntity)
          .findOneByOrFail({ id: deal.id })
      ).stage,
    ).toBe(DealStage.WON);
  });

  it('scheitert ohne Schreibrecht und bleibt offen, mit Grund', async () => {
    const deal = await geschaeft(null);
    const vorschlag = await vorschlagen(deal.id);

    await expect(
      als(leute.nurLesen, () =>
        dienst.annehmen(
          leute.nurLesen,
          anfrage(leute.nurLesen),
          vorschlag.id,
          false,
        ),
      ),
    ).rejects.toThrow('Berechtigung');

    const danach = await dataSource
      .getRepository(KiVorschlagEntity)
      .findOneByOrFail({ id: vorschlag.id });

    expect(danach.status).toBe('offen');
    expect(danach.fehler).toContain('Berechtigung');
    expect(
      (
        await dataSource
          .getRepository(DealEntity)
          .findOneByOrFail({ id: deal.id })
      ).stage,
    ).toBe(DealStage.LEAD);
  });
});

describe('wer was sieht', () => {
  it('zeigt der eingeschränkten Rolle nur Vorschläge an eigenen Geschäften', async () => {
    const eigenes = await geschaeft(leute.aussendienst.userId);
    const fremdes = await geschaeft(leute.inhaber.userId);
    const zumEigenen = await vorschlagen(eigenes.id);
    const zumFremden = await vorschlagen(fremdes.id);

    const sichtbar = await als(leute.aussendienst, () =>
      dienst.liste(leute.aussendienst, ['offen']),
    );

    expect(sichtbar.map((v) => v.id)).toEqual([zumEigenen.id]);

    await expect(
      als(leute.aussendienst, () =>
        dienst.annehmen(
          leute.aussendienst,
          anfrage(leute.aussendienst),
          zumFremden.id,
          false,
        ),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      als(leute.aussendienst, () =>
        dienst.verwerfen(leute.aussendienst, zumFremden.id, null),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    const inhaberin = await als(leute.inhaber, () =>
      dienst.liste(leute.inhaber, ['offen']),
    );

    expect(inhaberin).toHaveLength(2);
  });

  it('zeigt einem fremden Bereich nichts und lässt ihn nichts entscheiden', async () => {
    const deal = await geschaeft(null);
    const vorschlag = await vorschlagen(deal.id);

    expect(
      await als(leute.fremd, () => dienst.liste(leute.fremd, ['offen'])),
    ).toEqual([]);
    await expect(
      als(leute.fremd, () =>
        dienst.annehmen(leute.fremd, anfrage(leute.fremd), vorschlag.id, true),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('verlangt das Recht workspace:ki und antwortet der Glocke ohne Recht mit 0', async () => {
    const deal = await geschaeft(null);

    await vorschlagen(deal.id);

    await expect(
      als(leute.ohneKi, () => resolver.kiVorschlaege(leute.ohneKi)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      als(leute.ohneKi, () =>
        resolver.kiVorschlagAnnehmen(leute.ohneKi, {}, 'x'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      await als(leute.ohneKi, () => resolver.offeneKiVorschlaege(leute.ohneKi)),
    ).toBe(0);
    expect(
      await als(leute.inhaber, () =>
        resolver.offeneKiVorschlaege(leute.inhaber),
      ),
    ).toBe(1);

    const [ansicht] = await als(leute.inhaber, () =>
      resolver.kiVorschlaege(leute.inhaber),
    );

    expect(ansicht).toMatchObject({
      zielPfad: `/geschaefte/${deal.id}`,
      vorher: '{"stage":"LEAD"}',
      nachher: '{"stage":"WON"}',
    });
  });

  it('zeigt Vorher und Nachher ohne die Felder, die die Rolle nicht sieht', async () => {
    const m = dataSource.manager;
    const rolle = await m.save(
      m.create(RoleEntity, {
        workspaceId: bereich,
        name: 'Ohne Betrag',
        everything: false,
        permissions: [Permission.DEAL_VIEW, Permission.KI_APPROVE],
        feldrechte: { 'deal.amount': 'verborgen' },
      }),
    );
    const user = await m.save(
      m.create(UserEntity, {
        email: 'ohnebetrag@ki.test',
        passwordHash: 'x',
        firstName: 'Ohne',
        lastName: 'Betrag',
      }),
    );

    await m.save(
      m.create(MembershipEntity, {
        userId: user.id,
        workspaceId: bereich,
        role: MembershipRole.MEMBER,
        roleId: rolle.id,
      }),
    );

    const ohneBetrag: RequestUser = {
      userId: user.id,
      workspaceId: bereich,
      email: user.email,
    };
    const deal = await geschaeft(null);
    const vorschlag = await vorschlagen(deal.id);

    await dataSource.getRepository(KiVorschlagEntity).update(vorschlag.id, {
      vorher: { stage: 'LEAD', amount: 1000 },
      nachher: { stage: 'WON', amount: 5000 },
    });

    const [ansicht] = await als(ohneBetrag, () =>
      resolver.kiVorschlaege(ohneBetrag),
    );

    expect(ansicht).toMatchObject({
      vorher: '{"stage":"LEAD"}',
      nachher: '{"stage":"WON"}',
    });

    const [inhaberin] = await als(leute.inhaber, () =>
      resolver.kiVorschlaege(leute.inhaber),
    );

    expect(JSON.parse(inhaberin.nachher)).toEqual({
      stage: 'WON',
      amount: 5000,
    });
  });

  it('kürzt auch eigene Felder und lässt fremde Werkzeuge in Ruhe', () => {
    const rechte = {
      'deal.probability': 'verborgen',
      'custom:deal:budget': 'verborgen',
    } as const;

    expect(
      sichtbarerStand(rechte, 'update_deal', {
        probability: 40,
        stage: 'WON',
        customFields: { budget: 9, farbe: 'rot' },
      }),
    ).toEqual({ stage: 'WON', customFields: { farbe: 'rot' } });
    expect(sichtbarerStand(rechte, 'create_note', { text: 'Hallo' })).toEqual({
      text: 'Hallo',
    });
    expect(sichtbarerStand(rechte, 'update_deal', null)).toBeNull();
  });

  it('zeigt alle offenen, auch wenn viele neuere entschieden sind', async () => {
    const deal = await geschaeft(leute.aussendienst.userId);
    const erster = await vorschlagen(deal.id);
    const repo = dataSource.getRepository(KiVorschlagEntity);
    const { id: _id, createdAt: _wann, entschiedenVon: _wer, ...rest } = erster;

    await repo.save(
      Array.from({ length: 249 }, () => repo.create({ ...rest })),
    );
    await dataSource.query(
      `UPDATE "ki_vorschlaege" k SET "createdAt" = now() - (n.r * interval '1 minute')
         FROM (SELECT "id", row_number() OVER (ORDER BY "id") AS r FROM "ki_vorschlaege") n
        WHERE n."id" = k."id"`,
    );
    await dataSource.query(
      `UPDATE "ki_vorschlaege" SET "status" = 'angenommen', "entschiedenVonId" = $1, "entschiedenAm" = now()
        WHERE "id" IN (SELECT "id" FROM "ki_vorschlaege" ORDER BY "createdAt" DESC LIMIT 200)`,
      [leute.inhaber.userId],
    );

    const alle = await als(leute.inhaber, () =>
      resolver.kiVorschlaege(leute.inhaber, [
        'offen',
        'angenommen',
        'verworfen',
      ]),
    );

    expect(alle.filter((v) => v.status === 'offen')).toHaveLength(50);
    expect(alle.filter((v) => v.status === 'angenommen')).toHaveLength(200);
    expect(
      await als(leute.inhaber, () =>
        resolver.offeneKiVorschlaege(leute.inhaber),
      ),
    ).toBe(50);
    expect(
      await als(leute.aussendienst, () =>
        resolver.offeneKiVorschlaege(leute.aussendienst),
      ),
    ).toBe(50);
  });

  it('verwirft mit Grund und nur einmal', async () => {
    const deal = await geschaeft(null);
    const vorschlag = await vorschlagen(deal.id);

    const verworfen = await als(leute.inhaber, () =>
      dienst.verwerfen(leute.inhaber, vorschlag.id, ' Passt nicht '),
    );

    expect(verworfen).toMatchObject({
      status: 'verworfen',
      grund: 'Passt nicht',
    });
    await expect(
      als(leute.inhaber, () =>
        dienst.verwerfen(leute.inhaber, vorschlag.id, null),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('gleicherStand', () => {
  it('vergleicht unabhängig von der Reihenfolge', () => {
    expect(gleicherStand({ a: 1, b: null }, { b: null, a: 1 })).toBe(true);
    expect(gleicherStand({ a: 1 }, { a: 2 })).toBe(false);
    expect(gleicherStand(null, null)).toBe(true);
  });
});
