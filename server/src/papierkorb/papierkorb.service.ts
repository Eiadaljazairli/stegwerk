import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource, type EntityTarget, In, Not, IsNull } from 'typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { TaskEntity } from '../crm/entities/task.entity';
import {
  mehrfachZieleLoesen,
  mitWiederherstellen,
} from '../crm/papierkorb-folgen';
import { CustomFieldEntity } from '../custom-fields/custom-field.types';
import { verweiseEntfernen } from '../custom-fields/verknuepfung';
import { webhookDaten } from '../crm/workspace-scoped.service';
import { melde, type WebhookObjekt } from '../webhooks/ereignisse';
import { UserEntity } from '../users/user.entity';
import { Permission } from '../workspaces/permissions';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import {
  ART_DER_ENTITAET,
  istSchreibbar,
  istSichtbar,
  NUR_LESEN,
} from '../workspaces/sichtbarkeit';
import { PAPIERKORB_TAGE } from './frist';
import { PapierkorbArt, PapierkorbEintrag } from './papierkorb.dto';

const OBJEKT: Record<PapierkorbArt, WebhookObjekt> = {
  [PapierkorbArt.FIRMA]: 'company',
  [PapierkorbArt.KONTAKT]: 'contact',
  [PapierkorbArt.GESCHAEFT]: 'deal',
  [PapierkorbArt.AUFGABE]: 'task',
};

export {
  PAPIERKORB_TAGE,
  PAPIERKORB_TAGE_MAX,
  PAPIERKORB_TAGE_MIN,
} from './frist';

const TAG = 86_400_000;

const FELD_ART: Record<PapierkorbArt, CustomFieldEntity> = {
  [PapierkorbArt.FIRMA]: CustomFieldEntity.COMPANY,
  [PapierkorbArt.KONTAKT]: CustomFieldEntity.CONTACT,
  [PapierkorbArt.GESCHAEFT]: CustomFieldEntity.DEAL,
  [PapierkorbArt.AUFGABE]: CustomFieldEntity.TASK,
};

type Geloescht = {
  id: string;
  workspaceId: string;
  deletedAt: Date | null;
  deletedById: string | null;
};

export const ARTEN: Record<
  PapierkorbArt,
  {
    ziel: EntityTarget<Geloescht>;
    recht: Permission;
    name: (zeile: Record<string, unknown>) => string;
  }
> = {
  [PapierkorbArt.FIRMA]: {
    ziel: CompanyEntity,
    recht: Permission.COMPANY_DELETE,
    name: (z) => String(z.name),
  },
  [PapierkorbArt.KONTAKT]: {
    ziel: ContactEntity,
    recht: Permission.CONTACT_DELETE,
    name: (z) => `${String(z.firstName)} ${String(z.lastName)}`.trim(),
  },
  [PapierkorbArt.GESCHAEFT]: {
    ziel: DealEntity,
    recht: Permission.DEAL_DELETE,
    name: (z) => String(z.name),
  },
  [PapierkorbArt.AUFGABE]: {
    ziel: TaskEntity,
    recht: Permission.TASK_WRITE,
    name: (z) => String(z.title),
  },
};

@Injectable()
export class PapierkorbService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async liste(
    workspaceId: string,
    arten: PapierkorbArt[],
  ): Promise<PapierkorbEintrag[]> {
    const eintraege: PapierkorbEintrag[] = [];
    const tage = await this.frist(workspaceId);

    for (const art of arten) {
      const { ziel, name } = ARTEN[art];
      const zeilen = await this.dataSource.getRepository(ziel).find({
        where: { workspaceId, deletedAt: Not(IsNull()) },
        withDeleted: true,
        order: { deletedAt: 'DESC' },
        take: 200,
      });

      const sichtArt =
        ART_DER_ENTITAET[this.dataSource.getRepository(ziel).metadata.name];

      for (const zeile of zeilen) {
        if (
          sichtArt !== undefined &&
          !(await istSchreibbar(
            sichtArt,
            (zeile as { ownerId?: string | null }).ownerId,
            zeile.id,
          ))
        ) {
          continue;
        }

        eintraege.push({
          art,
          id: zeile.id,
          name: name(zeile as unknown as Record<string, unknown>),
          geloeschtAm: zeile.deletedAt as Date,
          endgueltigAm: new Date(
            (zeile.deletedAt as Date).getTime() + tage * TAG,
          ),
          geloeschtVon: zeile.deletedById,
        });
      }
    }

    const ids = [
      ...new Set(
        eintraege
          .map((e) => e.geloeschtVon)
          .filter((id): id is string => id !== null),
      ),
    ];
    const namen = new Map(
      (ids.length === 0
        ? []
        : await this.dataSource
            .getRepository(UserEntity)
            .findBy({ id: In(ids) })
      ).map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]),
    );

    return eintraege
      .map((e) => ({
        ...e,
        geloeschtVon:
          e.geloeschtVon === null ? null : (namen.get(e.geloeschtVon) ?? null),
      }))
      .sort((a, b) => b.geloeschtAm.getTime() - a.geloeschtAm.getTime());
  }

  private async geloescht(
    workspaceId: string,
    art: PapierkorbArt,
    id: string,
  ): Promise<Geloescht> {
    const zeile = await this.dataSource.getRepository(ARTEN[art].ziel).findOne({
      where: { id, workspaceId, deletedAt: Not(IsNull()) },
      withDeleted: true,
    });

    const sichtArt =
      ART_DER_ENTITAET[
        this.dataSource.getRepository(ARTEN[art].ziel).metadata.name
      ];

    if (
      zeile === null ||
      (sichtArt !== undefined &&
        !(await istSichtbar(
          sichtArt,
          (zeile as { ownerId?: string | null }).ownerId,
          zeile.id,
        )))
    ) {
      throw new NotFoundException('Das liegt nicht im Papierkorb.');
    }

    if (
      sichtArt !== undefined &&
      !(await istSchreibbar(
        sichtArt,
        (zeile as { ownerId?: string | null }).ownerId,
        zeile.id,
      ))
    ) {
      throw new ForbiddenException(NUR_LESEN);
    }

    return zeile;
  }

  async wiederherstellen(
    workspaceId: string,
    art: PapierkorbArt,
    id: string,
  ): Promise<boolean> {
    const zeile = await this.geloescht(workspaceId, art, id);
    const repository = this.dataSource.getRepository(ARTEN[art].ziel);

    await mitWiederherstellen(
      this.dataSource.manager,
      repository.metadata.name,
      workspaceId,
      id,
      zeile.deletedAt as Date,
    );
    await repository.update({ id, workspaceId }, { deletedById: null });
    const zurueck = await repository.recover(zeile);

    melde({
      workspaceId,
      event: `${OBJEKT[art]}.restored`,
      data: webhookDaten({ ...zurueck, deletedAt: null, deletedById: null }),
    });

    return true;
  }

  async endgueltig(
    workspaceId: string,
    art: PapierkorbArt,
    id: string,
  ): Promise<boolean> {
    await this.geloescht(workspaceId, art, id);

    const tabelle = this.dataSource.getRepository(ARTEN[art].ziel).metadata
      .tableName;

    if (art !== PapierkorbArt.AUFGABE) {
      await mehrfachZieleLoesen(
        this.dataSource.manager,
        tabelle as 'companies' | 'contacts' | 'deals',
        'weg."id" = $1 AND weg."workspaceId" = $2',
        [id, workspaceId],
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(ARTEN[art].ziel).delete({ id, workspaceId });
      await verweiseEntfernen(manager, workspaceId, FELD_ART[art], [id]);
    });

    return true;
  }

  async frist(workspaceId: string): Promise<number> {
    const bereich = await this.dataSource
      .getRepository(WorkspaceEntity)
      .findOne({
        where: { id: workspaceId },
        select: ['id', 'papierkorbTage'],
      });

    return bereich?.papierkorbTage ?? PAPIERKORB_TAGE;
  }

  async aufraeumen(jetzt = new Date()): Promise<number> {
    let weg = 0;

    for (const art of [
      PapierkorbArt.GESCHAEFT,
      PapierkorbArt.KONTAKT,
      PapierkorbArt.FIRMA,
      PapierkorbArt.AUFGABE,
    ]) {
      const tabelle = this.dataSource.getRepository(ARTEN[art].ziel).metadata
        .tableName;

      if (art !== PapierkorbArt.AUFGABE) {
        await mehrfachZieleLoesen(
          this.dataSource.manager,
          tabelle as 'companies' | 'contacts' | 'deals',
          `weg."deletedAt" IS NOT NULL AND weg."deletedAt" < $1::timestamptz - make_interval(days => (SELECT bereich."papierkorbTage" FROM "workspaces" bereich WHERE bereich."id" = weg."workspaceId"))`,
          [jetzt.toISOString()],
        );
      }

      const [zeilen, anzahl] = (await this.dataSource.query(
        `DELETE FROM "${tabelle}" zeile
          USING "workspaces" bereich
          WHERE bereich."id" = zeile."workspaceId"
            AND zeile."deletedAt" IS NOT NULL
            AND zeile."deletedAt" < $1::timestamptz - make_interval(days => bereich."papierkorbTage")
          RETURNING zeile."id", zeile."workspaceId"`,
        [jetzt.toISOString()],
      )) as [{ id: string; workspaceId: string }[], number];

      weg += anzahl ?? 0;

      const jeBereich = new Map<string, string[]>();

      for (const zeile of zeilen ?? []) {
        jeBereich.set(zeile.workspaceId, [
          ...(jeBereich.get(zeile.workspaceId) ?? []),
          zeile.id,
        ]);
      }

      for (const [bereich, ids] of jeBereich) {
        await verweiseEntfernen(
          this.dataSource.manager,
          bereich,
          FELD_ART[art],
          ids,
        );
      }
    }

    return weg;
  }
}
