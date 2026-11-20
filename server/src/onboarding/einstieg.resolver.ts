import { BadRequestException, UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource, type EntityManager } from 'typeorm';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { NurMenschWache } from '../api-keys/api-key.guard';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { DealStagesService } from '../crm/deal-stages.service';
import { DealStage } from '../crm/entities/deal.entity';
import {
  CustomFieldsService,
  toKey,
} from '../custom-fields/custom-fields.service';
import {
  CustomFieldEntity,
  type CustomFieldType,
  MAX_FIELDS_PER_ENTITY,
} from '../custom-fields/custom-field.types';
import { verweiseEntfernen } from '../custom-fields/verknuepfung';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import {
  BEISPIEL_AUFGABEN,
  BEISPIEL_FIRMEN,
  BEISPIEL_GESCHAEFTE,
  BEISPIEL_HERKUNFT,
  BEISPIEL_KONTAKTE,
  BRANCHENVORLAGEN,
} from './beispieldaten';

const TAG = 86_400_000;
const datum = (inTagen: number) =>
  new Date(Date.now() + inTagen * TAG).toISOString().slice(0, 10);

const BLOCKIERT = [
  ['quotes', 'Angebote'],
  ['invoices', 'Rechnungen'],
  ['attachments', 'Dateien'],
] as const;

@Resolver()
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class EinstiegResolver {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly permissions: PermissionsService,
    private readonly phasen: DealStagesService,
    private readonly felder: CustomFieldsService,
  ) {}

  @Query(() => Int)
  async beispieldaten(@CurrentUser() user: RequestUser): Promise<number> {
    await this.permissions.assert(
      user,
      Permission.FIELD_MANAGE,
      'die Beispieldaten zu sehen',
    );

    const [zeile] = (await this.dataSource.query(
      `SELECT
         (SELECT count(*) FROM "companies" WHERE "workspaceId" = $1 AND "herkunft" = $2)
       + (SELECT count(*) FROM "contacts" WHERE "workspaceId" = $1 AND "herkunft" = $2)
       + (SELECT count(*) FROM "deals" WHERE "workspaceId" = $1 AND "herkunft" = $2)
         AS "anzahl"`,
      [user.workspaceId, BEISPIEL_HERKUNFT],
    )) as { anzahl: string }[];

    return Number(zeile?.anzahl ?? 0);
  }

  @Mutation(() => Int)
  @UseGuards(NurMenschWache)
  async beispieldatenLaden(@CurrentUser() user: RequestUser): Promise<number> {
    await this.permissions.assert(
      user,
      Permission.FIELD_MANAGE,
      'Beispieldaten zu laden',
    );

    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `beispieldaten:${user.workspaceId}`,
      ]);

      const [vorhanden] = (await manager.query(
        `SELECT 1 FROM "companies" WHERE "workspaceId" = $1 AND "herkunft" = $2 LIMIT 1`,
        [user.workspaceId, BEISPIEL_HERKUNFT],
      )) as unknown[];

      if (vorhanden !== undefined) {
        throw new BadRequestException('Die Beispieldaten sind schon geladen.');
      }

      return this.anlegen(manager, user);
    });
  }

  @Mutation(() => Int)
  @UseGuards(NurMenschWache)
  async beispieldatenEntfernen(
    @CurrentUser() user: RequestUser,
  ): Promise<number> {
    await this.permissions.assert(
      user,
      Permission.FIELD_MANAGE,
      'Beispieldaten zu entfernen',
    );

    return this.dataSource.transaction(async (manager) => {
      const w = [user.workspaceId, BEISPIEL_HERKUNFT];
      const unter = (tabelle: string) =>
        `SELECT "id" FROM "${tabelle}" WHERE "workspaceId" = $1 AND "herkunft" = $2`;

      for (const [tabelle, was] of BLOCKIERT) {
        const [treffer] = (await manager.query(
          `SELECT 1 FROM "${tabelle}" t
            WHERE t."workspaceId" = $1
              AND (t."companyId" IN (${unter('companies')})
                OR t."contactId" IN (${unter('contacts')})
                OR t."dealId" IN (${unter('deals')}))
            LIMIT 1`,
          w,
        )) as unknown[];

        if (treffer !== undefined) {
          throw new BadRequestException(
            `An den Beispieldaten hängen ${was}. Entfernen Sie die Beispiele dann einzeln.`,
          );
        }
      }

      let entfernt = 0;

      for (const [tabelle, art] of [
        ['deals', CustomFieldEntity.DEAL],
        ['contacts', CustomFieldEntity.CONTACT],
        ['companies', CustomFieldEntity.COMPANY],
      ] as const) {
        const [zeilen, anzahl] = (await manager.query(
          `DELETE FROM "${tabelle}" WHERE "workspaceId" = $1 AND "herkunft" = $2
            RETURNING "id"`,
          w,
        )) as [{ id: string }[], number];

        await verweiseEntfernen(
          manager,
          user.workspaceId,
          art,
          zeilen.map((zeile) => zeile.id),
        );
        entfernt += anzahl;
      }

      return entfernt;
    });
  }

  @Mutation(() => Int)
  @UseGuards(NurMenschWache)
  async branchenvorlageAnwenden(
    @CurrentUser() user: RequestUser,
    @Args('vorlage') vorlage: string,
  ): Promise<number> {
    await this.permissions.assert(
      user,
      Permission.FIELD_MANAGE,
      'eine Branchenvorlage anzuwenden',
    );

    const gewaehlt = Object.prototype.hasOwnProperty.call(
      BRANCHENVORLAGEN,
      vorlage,
    )
      ? BRANCHENVORLAGEN[vorlage]
      : undefined;

    if (gewaehlt === undefined) {
      throw new BadRequestException('Diese Vorlage gibt es nicht.');
    }

    const vorhandene = (await this.dataSource.query(
      `SELECT "entity", "key", "archivedAt" IS NULL AS "live" FROM "custom_fields"
        WHERE "workspaceId" = $1`,
      [user.workspaceId],
    )) as { entity: string; key: string; live: boolean }[];
    const vergeben = new Set(vorhandene.map((f) => `${f.entity}:${f.key}`));
    const anzulegen = gewaehlt.felder.filter((feld) => {
      const schluessel = `${feld.entity.toLowerCase()}:${toKey(feld.label)}`;

      if (vergeben.has(schluessel)) {
        return false;
      }

      vergeben.add(schluessel);

      return true;
    });

    for (const entity of new Set(anzulegen.map((f) => f.entity))) {
      const live = vorhandene.filter(
        (f) => f.live && f.entity === entity.toLowerCase(),
      ).length;

      if (
        live + anzulegen.filter((f) => f.entity === entity).length >
        MAX_FIELDS_PER_ENTITY
      ) {
        throw new BadRequestException(
          `Ein Datensatz kann höchstens ${MAX_FIELDS_PER_ENTITY} eigene Felder haben.`,
        );
      }
    }

    const eingestellt = new Map(
      (
        (await this.dataSource.query(
          `SELECT "stage", "probability", "farbe", "ausgeblendet"
             FROM "deal_stage_settings"
            WHERE "workspaceId" = $1 AND "pipelineId" IS NULL`,
          [user.workspaceId],
        )) as {
          stage: DealStage;
          probability: number | null;
          farbe: string | null;
          ausgeblendet: boolean | null;
        }[]
      ).map((zeile) => [zeile.stage, zeile]),
    );

    await this.phasen.update(
      user.workspaceId,
      Object.values(DealStage).map((stage) => ({
        stage,
        label: gewaehlt.phasen[stage],
        probability: eingestellt.get(stage)?.probability ?? null,
        farbe: eingestellt.get(stage)?.farbe ?? null,
        ausgeblendet: eingestellt.get(stage)?.ausgeblendet ?? null,
      })),
    );

    let neu = 0;

    for (const feld of anzulegen) {
      await this.felder.create(user.workspaceId, {
        entity: feld.entity.toLowerCase() as CustomFieldEntity,
        label: feld.label,
        type: feld.type.toLowerCase() as CustomFieldType,
        options: feld.options,
      });
      neu += 1;
    }

    return neu;
  }

  private async anlegen(
    manager: EntityManager,
    user: RequestUser,
  ): Promise<number> {
    const ws = user.workspaceId;
    const ich = user.userId;
    const firmen = new Map<string, string>();
    const kontakte: string[] = [];
    const geschaefte: string[] = [];

    for (const f of BEISPIEL_FIRMEN) {
      const [{ id }] = (await manager.query(
        `INSERT INTO "companies"
           ("workspaceId", "name", "industry", "domain", "street", "postalCode",
            "city", "country", "employeeCount", "ownerId", "herkunft")
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'Deutschland', $8, $9, $10)
         RETURNING "id"`,
        [
          ws,
          f.name,
          f.industry,
          f.domain,
          f.street,
          f.postalCode,
          f.city,
          f.employeeCount,
          ich,
          BEISPIEL_HERKUNFT,
        ],
      )) as { id: string }[];

      firmen.set(f.schluessel, id);
    }

    for (const k of BEISPIEL_KONTAKTE) {
      const domain = BEISPIEL_FIRMEN.find(
        (f) => f.schluessel === k.firma,
      )?.domain;
      const [{ id }] = (await manager.query(
        `INSERT INTO "contacts"
           ("workspaceId", "firstName", "lastName", "email", "jobTitle",
            "companyId", "ownerId", "herkunft")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING "id"`,
        [
          ws,
          k.vor,
          k.nach,
          `${k.vor.toLowerCase()}.${k.nach.toLowerCase()}@${domain ?? 'beispiel.example'}`,
          k.titel,
          firmen.get(k.firma),
          ich,
          BEISPIEL_HERKUNFT,
        ],
      )) as { id: string }[];

      kontakte.push(id);
    }

    for (const g of BEISPIEL_GESCHAEFTE) {
      const [{ id }] = (await manager.query(
        `INSERT INTO "deals"
           ("workspaceId", "name", "amount", "currency", "stage", "closeDate",
            "companyId", "primaryContactId", "ownerId", "herkunft")
         VALUES ($1, $2, $3, 'EUR', $4, $5, $6, $7, $8, $9)
         RETURNING "id"`,
        [
          ws,
          g.name,
          g.betrag,
          g.phase,
          datum(g.inTagen),
          firmen.get(g.firma),
          kontakte[g.kontakt],
          ich,
          BEISPIEL_HERKUNFT,
        ],
      )) as { id: string }[];

      geschaefte.push(id);
    }

    for (const a of BEISPIEL_AUFGABEN) {
      await manager.query(
        `INSERT INTO "tasks"
           ("workspaceId", "title", "dueDate", "assigneeId", "createdById", "dealId")
         VALUES ($1, $2, $3, $4, $4, $5)`,
        [ws, a.titel, datum(a.inTagen), ich, geschaefte[a.geschaeft]],
      );
    }

    await manager.query(
      `INSERT INTO "notes" ("workspaceId", "authorId", "body", "companyId")
       VALUES ($1, $2, $3, $4)`,
      [
        ws,
        ich,
        'Beispielnotiz: Erstgespräch war gut, Entscheidung fällt im nächsten Monat.',
        firmen.get('bau'),
      ],
    );

    return firmen.size + kontakte.length + geschaefte.length;
  }
}
