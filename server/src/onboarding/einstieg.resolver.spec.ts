import 'reflect-metadata';

import {
  BadRequestException,
  type CanActivate,
  ForbiddenException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { type ConfigService } from '@nestjs/config';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { type DataSource } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingService } from '../billing/billing.service';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { BillingPlan, SubscriptionStatus } from '../billing/plans';
import { SubscriptionEntity } from '../billing/subscription.entity';
import { DealStagesService } from '../crm/deal-stages.service';
import { DealEntity, DealStage } from '../crm/entities/deal.entity';
import { DealStageSettingEntity } from '../crm/entities/deal-stage-setting.entity';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import {
  CustomFieldEntity,
  CustomFieldType,
} from '../custom-fields/custom-field.types';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { InvitationEntity } from '../workspaces/invitation.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { RoleEntity } from '../workspaces/role.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import {
  BEISPIEL_FIRMEN,
  BEISPIEL_GESCHAEFTE,
  BEISPIEL_KONTAKTE,
} from './beispieldaten';
import { EinstiegResolver } from './einstieg.resolver';

const SUITE = 'einstieg';

jest.setTimeout(60_000);

let dataSource: DataSource;
let resolver: EinstiegResolver;
let inhaber: RequestUser;
let mitglied: RequestUser;

const BEISPIELE =
  BEISPIEL_FIRMEN.length +
  BEISPIEL_KONTAKTE.length +
  BEISPIEL_GESCHAEFTE.length;

const zaehle = async (sql: string, werte: unknown[] = []) =>
  Number(((await dataSource.query(sql, werte)) as { n: string }[])[0]?.n ?? 0);

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);

  const m = dataSource.manager;
  const workspaceId = (
    await m.save(
      m.create(WorkspaceEntity, { name: 'Einstieg', slug: 'einstieg' }),
    )
  ).id;
  const person = async (
    kurz: string,
    rolle: { everything: boolean; permissions: Permission[] },
  ): Promise<RequestUser> => {
    const user = await m.save(
      m.create(UserEntity, {
        email: `${kurz}@einstieg.example`,
        passwordHash: 'x',
        firstName: kurz,
        lastName: 'Test',
      }),
    );
    const role = await m.save(
      m.create(RoleEntity, { workspaceId, name: kurz, ...rolle }),
    );

    await m.save(
      m.create(MembershipEntity, {
        userId: user.id,
        workspaceId,
        role: rolle.everything ? MembershipRole.OWNER : MembershipRole.MEMBER,
        roleId: role.id,
      }),
    );

    return { userId: user.id, workspaceId, email: user.email };
  };

  inhaber = await person('inhaber', { everything: true, permissions: [] });
  mitglied = await person('mitglied', {
    everything: false,
    permissions: [Permission.COMPANY_VIEW, Permission.COMPANY_WRITE],
  });

  resolver = new EinstiegResolver(
    dataSource,
    new PermissionsService(
      dataSource.getRepository(MembershipEntity),
      dataSource.getRepository(RoleEntity),
    ),
    new DealStagesService(
      dataSource.getRepository(DealStageSettingEntity),
      dataSource.getRepository(DealEntity),
    ),
    new CustomFieldsService(dataSource.getRepository(CustomFieldDefinition)),
  );
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

describe('Abo', () => {
  it('prüft das Abo hinter der Anmeldung', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, EinstiegResolver) as unknown,
    ).toEqual([GqlAuthGuard, BillingWriteGuard]);
  });

  describe('bei abgelaufenem Abo', () => {
    let gesperrt: RequestUser;
    let wache: CanActivate;

    const mitKasse = {
      get: (schluessel: string) =>
        schluessel === 'stripeSecretKey' ? 'sk_test_probe' : undefined,
    } as unknown as ConfigService;

    const ueberDieWache = async <T>(
      methode: keyof EinstiegResolver,
      aufruf: () => Promise<T>,
    ): Promise<T> => {
      const art = Reflect.getMetadata(
        'graphql:resolver_type',
        EinstiegResolver.prototype[methode],
      ) as string;
      const kontext = new ExecutionContextHost([
        undefined,
        {},
        { req: { user: gesperrt } },
        { operation: { operation: art.toLowerCase() } },
      ]);

      kontext.setType('graphql');

      if (!(await wache.canActivate(kontext))) {
        throw new ForbiddenException();
      }

      return aufruf();
    };

    beforeAll(async () => {
      const m = dataSource.manager;
      const workspaceId = (
        await m.save(
          m.create(WorkspaceEntity, { name: 'Gesperrt', slug: 'gesperrt' }),
        )
      ).id;
      const user = await m.save(
        m.create(UserEntity, {
          email: 'gesperrt@einstieg.example',
          passwordHash: 'x',
          firstName: 'Gesperrt',
          lastName: 'Test',
        }),
      );
      const role = await m.save(
        m.create(RoleEntity, {
          workspaceId,
          name: 'Inhaber',
          everything: true,
          permissions: [],
        }),
      );

      await m.save(
        m.create(MembershipEntity, {
          userId: user.id,
          workspaceId,
          role: MembershipRole.OWNER,
          roleId: role.id,
        }),
      );
      await m.save(
        m.create(SubscriptionEntity, {
          workspaceId,
          plan: BillingPlan.STARTER,
          status: SubscriptionStatus.CANCELED,
          currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
        }),
      );

      gesperrt = { userId: user.id, workspaceId, email: user.email };

      const billing = new BillingService(
        dataSource.getRepository(SubscriptionEntity),
        dataSource.getRepository(MembershipEntity),
        dataSource.getRepository(InvitationEntity),
        mitKasse,
      );

      await expect(billing.getEntitlement(workspaceId)).resolves.toMatchObject({
        canWrite: false,
      });

      wache = new BillingWriteGuard(billing);
    });

    const geschrieben = async () =>
      zaehle(
        `SELECT
           (SELECT count(*) FROM "companies" WHERE "workspaceId" = $1)
         + (SELECT count(*) FROM "contacts" WHERE "workspaceId" = $1)
         + (SELECT count(*) FROM "deals" WHERE "workspaceId" = $1)
         + (SELECT count(*) FROM "tasks" WHERE "workspaceId" = $1)
         + (SELECT count(*) FROM "notes" WHERE "workspaceId" = $1)
         + (SELECT count(*) FROM "deal_stage_settings" WHERE "workspaceId" = $1)
         + (SELECT count(*) FROM "custom_fields" WHERE "workspaceId" = $1)
           AS n`,
        [gesperrt.workspaceId],
      );

    it('lädt keine Beispieldaten', async () => {
      await expect(
        ueberDieWache('beispieldatenLaden', () =>
          resolver.beispieldatenLaden(gesperrt),
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(await geschrieben()).toBe(0);
    });

    it('entfernt keine Beispieldaten', async () => {
      const [{ id }] = (await dataSource.query(
        `INSERT INTO "companies" ("workspaceId", "name", "herkunft")
         VALUES ($1, 'Beispiel GmbH', 'beispiel') RETURNING "id"`,
        [gesperrt.workspaceId],
      )) as { id: string }[];

      await expect(
        ueberDieWache('beispieldatenEntfernen', () =>
          resolver.beispieldatenEntfernen(gesperrt),
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(await geschrieben()).toBe(1);

      await dataSource.query(`DELETE FROM "companies" WHERE "id" = $1`, [id]);
    });

    it('wendet keine Branchenvorlage an', async () => {
      await expect(
        ueberDieWache('branchenvorlageAnwenden', () =>
          resolver.branchenvorlageAnwenden(gesperrt, 'handwerk'),
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(await geschrieben()).toBe(0);
    });

    it('lässt das Lesen zu', async () => {
      await expect(
        ueberDieWache('beispieldaten', () => resolver.beispieldaten(gesperrt)),
      ).resolves.toBe(0);
    });
  });
});

describe('Beispieldaten', () => {
  it('verlangt das Recht, den Bereich einzurichten', async () => {
    await expect(resolver.beispieldatenLaden(mitglied)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(resolver.beispieldatenEntfernen(mitglied)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      resolver.branchenvorlageAnwenden(mitglied, 'handwerk'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lädt Firmen, Kontakte, Geschäfte, Aufgaben und eine Notiz', async () => {
    await expect(resolver.beispieldatenLaden(inhaber)).resolves.toBe(BEISPIELE);
    await expect(resolver.beispieldaten(inhaber)).resolves.toBe(BEISPIELE);

    expect(
      await zaehle(
        `SELECT count(*) AS n FROM "tasks" WHERE "workspaceId" = $1`,
        [inhaber.workspaceId],
      ),
    ).toBe(3);
    expect(
      await zaehle(
        `SELECT count(*) AS n FROM "deals" WHERE "workspaceId" = $1 AND "herkunft" = 'beispiel' AND "primaryContactId" IS NOT NULL`,
        [inhaber.workspaceId],
      ),
    ).toBe(BEISPIEL_GESCHAEFTE.length);
  });

  it('lädt nicht zweimal', async () => {
    await expect(resolver.beispieldatenLaden(inhaber)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('entfernt nichts, woran eine Rechnung hängt', async () => {
    const [{ id: firma }] = (await dataSource.query(
      `SELECT "id" FROM "companies" WHERE "workspaceId" = $1 AND "herkunft" = 'beispiel' LIMIT 1`,
      [inhaber.workspaceId],
    )) as { id: string }[];
    const [{ id: rechnung }] = (await dataSource.query(
      `INSERT INTO "invoices" ("workspaceId", "companyId", "issuedOn")
       VALUES ($1, $2, CURRENT_DATE) RETURNING "id"`,
      [inhaber.workspaceId, firma],
    )) as { id: string }[];

    await expect(resolver.beispieldatenEntfernen(inhaber)).rejects.toThrow(
      /Rechnungen/,
    );
    await expect(resolver.beispieldaten(inhaber)).resolves.toBe(BEISPIELE);

    await dataSource.query(`DELETE FROM "invoices" WHERE "id" = $1`, [
      rechnung,
    ]);
  });

  it('entfernt alle Beispiele und lässt eigene Daten stehen', async () => {
    const [{ id: beispielFirma }] = (await dataSource.query(
      `SELECT "id" FROM "companies" WHERE "workspaceId" = $1 AND "herkunft" = 'beispiel' LIMIT 1`,
      [inhaber.workspaceId],
    )) as { id: string }[];
    const [{ id: eigener }] = (await dataSource.query(
      `INSERT INTO "contacts" ("workspaceId", "firstName", "lastName", "companyId", "herkunft")
       VALUES ($1, 'Eigene', 'Person', $2, 'manuell') RETURNING "id"`,
      [inhaber.workspaceId, beispielFirma],
    )) as { id: string }[];

    await expect(resolver.beispieldatenEntfernen(inhaber)).resolves.toBe(
      BEISPIELE,
    );
    await expect(resolver.beispieldaten(inhaber)).resolves.toBe(0);

    expect(
      await zaehle(
        `SELECT count(*) AS n FROM "tasks" WHERE "workspaceId" = $1`,
        [inhaber.workspaceId],
      ),
    ).toBe(0);
    expect(
      await zaehle(
        `SELECT count(*) AS n FROM "notes" WHERE "workspaceId" = $1`,
        [inhaber.workspaceId],
      ),
    ).toBe(0);

    const [rest] = (await dataSource.query(
      `SELECT "companyId" FROM "contacts" WHERE "id" = $1`,
      [eigener],
    )) as { companyId: string | null }[];

    expect(rest).toEqual({ companyId: null });
  });

  it('entfernt Verweise eigener Verknüpfungsfelder auf Beispiele', async () => {
    await resolver.beispieldatenLaden(inhaber);

    const felder = new CustomFieldsService(
      dataSource.getRepository(CustomFieldDefinition),
    );

    await felder.create(inhaber.workspaceId, {
      entity: CustomFieldEntity.CONTACT,
      label: 'Partnerfirma',
      type: CustomFieldType.RELATION,
      zielEntity: CustomFieldEntity.COMPANY,
    });
    await felder.create(inhaber.workspaceId, {
      entity: CustomFieldEntity.DEAL,
      label: 'Beteiligte',
      type: CustomFieldType.RELATION,
      zielEntity: CustomFieldEntity.COMPANY,
      mehrere: true,
    });

    const [{ id: beispielFirma }] = (await dataSource.query(
      `SELECT "id" FROM "companies" WHERE "workspaceId" = $1 AND "herkunft" = 'beispiel' LIMIT 1`,
      [inhaber.workspaceId],
    )) as { id: string }[];
    const [{ id: eigeneFirma }] = (await dataSource.query(
      `INSERT INTO "companies" ("workspaceId", "name", "herkunft")
       VALUES ($1, 'Eigene GmbH', 'manuell') RETURNING "id"`,
      [inhaber.workspaceId],
    )) as { id: string }[];
    const [{ id: kontakt }] = (await dataSource.query(
      `INSERT INTO "contacts" ("workspaceId", "firstName", "lastName", "herkunft", "customFields")
       VALUES ($1, 'Eigene', 'Person', 'manuell', jsonb_build_object('partnerfirma', $2::text))
       RETURNING "id"`,
      [inhaber.workspaceId, beispielFirma],
    )) as { id: string }[];
    const [{ id: geschaeft }] = (await dataSource.query(
      `INSERT INTO "deals" ("workspaceId", "name", "herkunft", "customFields")
       VALUES ($1, 'Eigenes', 'manuell',
         jsonb_build_object('beteiligte', jsonb_build_array($2::text, $3::text)))
       RETURNING "id"`,
      [inhaber.workspaceId, beispielFirma, eigeneFirma],
    )) as { id: string }[];

    await resolver.beispieldatenEntfernen(inhaber);

    const werte = (await dataSource.query(
      `SELECT "customFields" AS f FROM "contacts" WHERE "id" = $1
       UNION ALL
       SELECT "customFields" FROM "deals" WHERE "id" = $2`,
      [kontakt, geschaeft],
    )) as { f: Record<string, unknown> }[];

    expect(werte.map((zeile) => zeile.f)).toEqual([
      {},
      { beteiligte: [eigeneFirma] },
    ]);

    await dataSource.query(`DELETE FROM "contacts" WHERE "id" = $1`, [kontakt]);
    await dataSource.query(`DELETE FROM "deals" WHERE "id" = $1`, [geschaeft]);
    await dataSource.query(`DELETE FROM "companies" WHERE "id" = $1`, [
      eigeneFirma,
    ]);
    await dataSource.query(
      `DELETE FROM "custom_fields" WHERE "workspaceId" = $1 AND "type" = $2`,
      [inhaber.workspaceId, CustomFieldType.RELATION],
    );
  });

  it('lässt sich danach erneut laden', async () => {
    await expect(resolver.beispieldatenLaden(inhaber)).resolves.toBe(BEISPIELE);
    await expect(resolver.beispieldatenEntfernen(inhaber)).resolves.toBe(
      BEISPIELE,
    );
  });
});

describe('Branchenvorlagen', () => {
  it('benennt die Phasen und legt fehlende Felder an', async () => {
    await expect(
      resolver.branchenvorlageAnwenden(inhaber, 'handwerk'),
    ).resolves.toBe(3);

    const [phase] = (await dataSource.query(
      `SELECT "label" FROM "deal_stage_settings"
        WHERE "workspaceId" = $1 AND "stage" = $2`,
      [inhaber.workspaceId, DealStage.WON],
    )) as { label: string }[];

    expect(phase?.label).toBe('Auftrag');
  });

  it('legt beim zweiten Mal keine Felder doppelt an', async () => {
    await expect(
      resolver.branchenvorlageAnwenden(inhaber, 'handwerk'),
    ).resolves.toBe(0);
  });

  it('lässt Wahrscheinlichkeit, Farbe und Ausblendung der Phasen stehen', async () => {
    await dataSource.query(
      `UPDATE "deal_stage_settings"
          SET "probability" = CASE "stage" WHEN 'proposal' THEN 60 WHEN 'negotiation' THEN 85 END,
              "farbe" = CASE "stage" WHEN 'proposal' THEN 'gruen' END,
              "ausgeblendet" = CASE "stage" WHEN 'qualified' THEN true END
        WHERE "workspaceId" = $1 AND "pipelineId" IS NULL`,
      [inhaber.workspaceId],
    );

    await resolver.branchenvorlageAnwenden(inhaber, 'agentur');

    const phasen = (await dataSource.query(
      `SELECT "stage", "label", "probability", "farbe", "ausgeblendet"
         FROM "deal_stage_settings"
        WHERE "workspaceId" = $1 AND "pipelineId" IS NULL
        ORDER BY "stage"`,
      [inhaber.workspaceId],
    )) as Record<string, unknown>[];
    const phase = (stage: DealStage) => phasen.find((p) => p.stage === stage);

    expect(phase(DealStage.PROPOSAL)).toMatchObject({
      label: 'Konzept & Angebot',
      probability: 60,
      farbe: 'gruen',
      ausgeblendet: null,
    });
    expect(phase(DealStage.NEGOTIATION)).toMatchObject({
      label: 'Pitch',
      probability: 85,
      farbe: null,
    });
    expect(phase(DealStage.QUALIFIED)).toMatchObject({
      label: 'Briefing',
      probability: null,
      ausgeblendet: true,
    });
  });

  it('überspringt ein archiviertes Feld mit gleichem Namen, ohne abzubrechen', async () => {
    await dataSource.query(
      `UPDATE "custom_fields" SET "archivedAt" = now()
        WHERE "workspaceId" = $1 AND "key" = 'baustelle'`,
      [inhaber.workspaceId],
    );
    await dataSource.query(
      `DELETE FROM "custom_fields"
        WHERE "workspaceId" = $1 AND "key" IN ('gewerk', 'ausfuehrung_ab')`,
      [inhaber.workspaceId],
    );

    await expect(
      resolver.branchenvorlageAnwenden(inhaber, 'handwerk'),
    ).resolves.toBe(2);
    await expect(
      resolver.branchenvorlageAnwenden(inhaber, 'handwerk'),
    ).resolves.toBe(0);

    expect(
      await zaehle(
        `SELECT count(*) AS n FROM "custom_fields"
          WHERE "workspaceId" = $1 AND "key" = 'baustelle' AND "archivedAt" IS NOT NULL`,
        [inhaber.workspaceId],
      ),
    ).toBe(1);
  });

  it('kennt nur die eigenen Vorlagen', async () => {
    await expect(
      resolver.branchenvorlageAnwenden(inhaber, 'constructor'),
    ).rejects.toThrow(BadRequestException);
  });
});
