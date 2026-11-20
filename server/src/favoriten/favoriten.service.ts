import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource, type EntityTarget, In } from 'typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { Permission } from '../workspaces/permissions';
import { ART_DER_ENTITAET, istSichtbar } from '../workspaces/sichtbarkeit';
import { FavoritEntity } from './favorit.entity';
import { FavoritArt, type FavoritView } from './favoriten.dto';

type Datensatz = { id: string; workspaceId: string };

export const FAVORIT_ARTEN: Record<
  FavoritArt,
  {
    ziel: EntityTarget<Datensatz>;
    recht: Permission;
    titel: (zeile: Record<string, unknown>) => string;
  }
> = {
  [FavoritArt.FIRMA]: {
    ziel: CompanyEntity,
    recht: Permission.COMPANY_VIEW,
    titel: (z) => String(z.name),
  },
  [FavoritArt.KONTAKT]: {
    ziel: ContactEntity,
    recht: Permission.CONTACT_VIEW,
    titel: (z) => `${String(z.firstName)} ${String(z.lastName)}`.trim(),
  },
  [FavoritArt.GESCHAEFT]: {
    ziel: DealEntity,
    recht: Permission.DEAL_VIEW,
    titel: (z) => String(z.name),
  },
};

const HOECHSTENS = 1000;

@Injectable()
export class FavoritenService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private get repository() {
    return this.dataSource.getRepository(FavoritEntity);
  }

  async liste(
    userId: string,
    workspaceId: string,
    arten: FavoritArt[],
  ): Promise<FavoritView[]> {
    if (arten.length === 0) {
      return [];
    }

    const sterne = await this.repository.find({
      where: { userId, workspaceId, art: In(arten) },
      order: { createdAt: 'DESC' },
      take: HOECHSTENS,
    });

    const titel = new Map<string, string>();

    for (const art of arten) {
      const ids = sterne.filter((s) => s.art === art).map((s) => s.datensatzId);

      if (ids.length === 0) {
        continue;
      }

      const { ziel, titel: titelVon } = FAVORIT_ARTEN[art];
      const repo = this.dataSource.getRepository(ziel);
      const zeilen = await repo.find({ where: { workspaceId, id: In(ids) } });
      const sichtArt = ART_DER_ENTITAET[repo.metadata.name];

      for (const zeile of zeilen) {
        if (
          sichtArt !== undefined &&
          !(await istSichtbar(
            sichtArt,
            (zeile as { ownerId?: string | null }).ownerId,
            zeile.id,
          ))
        ) {
          continue;
        }

        titel.set(
          `${art}:${zeile.id}`,
          titelVon(zeile as unknown as Record<string, unknown>),
        );
      }
    }

    return sterne.flatMap((stern) => {
      const name = titel.get(`${stern.art}:${stern.datensatzId}`);

      return name === undefined
        ? []
        : [
            {
              art: stern.art as FavoritArt,
              datensatzId: stern.datensatzId,
              titel: name,
              createdAt: stern.createdAt,
            },
          ];
    });
  }

  async umschalten(
    userId: string,
    workspaceId: string,
    art: FavoritArt,
    datensatzId: string,
  ): Promise<boolean> {
    const vorhanden = await this.repository.findOne({
      where: { userId, workspaceId, art, datensatzId },
    });

    if (vorhanden !== null) {
      await this.repository.delete({ id: vorhanden.id });

      return false;
    }

    const gibtEs = await this.dataSource
      .getRepository(FAVORIT_ARTEN[art].ziel)
      .exists({ where: { workspaceId, id: datensatzId } });

    if (!gibtEs) {
      throw new NotFoundException('Diesen Datensatz gibt es nicht.');
    }

    await this.repository
      .createQueryBuilder()
      .insert()
      .values({ userId, workspaceId, art, datensatzId })
      .orIgnore()
      .execute();

    return true;
  }
}
