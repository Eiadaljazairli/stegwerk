import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource, QueryFailedError } from 'typeorm';

import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { DashboardEntity } from './dashboard.entity';
import { type Kachel, pruefeKacheln } from './kacheln';
import { UebersichtService } from './uebersicht.service';

export const MAX_GETEILTE_DASHBOARDS = 30;
export const MAX_PRIVATE_DASHBOARDS = 20;

export type DashboardMitRecht = DashboardEntity & { darfAendern: boolean };

@Injectable()
export class DashboardsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly uebersicht: UebersichtService,
  ) {}

  private get repo() {
    return this.dataSource.getRepository(DashboardEntity);
  }

  private async istVerwaltung(
    workspaceId: string,
    userId: string,
  ): Promise<boolean> {
    const mitgliedschaft = await this.dataSource
      .getRepository(MembershipEntity)
      .findOne({ where: { workspaceId, userId } });

    return (
      mitgliedschaft !== null &&
      [MembershipRole.OWNER, MembershipRole.ADMIN].includes(mitgliedschaft.role)
    );
  }

  private mitRecht(
    dashboard: DashboardEntity,
    userId: string,
    verwaltung: boolean,
  ): DashboardMitRecht {
    return Object.assign(dashboard, {
      darfAendern:
        dashboard.createdById === userId || (!dashboard.privat && verwaltung),
    });
  }

  async liste(
    workspaceId: string,
    userId: string,
  ): Promise<DashboardMitRecht[]> {
    const verwaltung = await this.istVerwaltung(workspaceId, userId);
    const alle = await this.repo
      .createQueryBuilder('d')
      .where('d."workspaceId" = :workspaceId', { workspaceId })
      .andWhere('(d."privat" = false OR d."createdById" = :userId)', {
        userId,
      })
      .orderBy('lower(d."name")', 'ASC')
      .getMany();

    return alle.map((dashboard) =>
      this.mitRecht(dashboard, userId, verwaltung),
    );
  }

  async holen(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<DashboardMitRecht> {
    const dashboard = await this.repo.findOne({ where: { id, workspaceId } });

    if (
      dashboard === null ||
      (dashboard.privat && dashboard.createdById !== userId)
    ) {
      throw new NotFoundException('Dieses Dashboard gibt es nicht.');
    }

    return this.mitRecht(
      dashboard,
      userId,
      await this.istVerwaltung(workspaceId, userId),
    );
  }

  private async aenderbar(
    workspaceId: string,
    userId: string,
    id: string,
    was: string,
  ): Promise<DashboardMitRecht> {
    const dashboard = await this.holen(workspaceId, userId, id);

    if (!dashboard.darfAendern) {
      throw new ForbiddenException(
        `Nur wer dieses Dashboard angelegt hat, und Administratoren, dürfen es ${was}.`,
      );
    }

    return dashboard;
  }

  private pruefeName(roh: string): string {
    const name = roh.trim();

    if (name === '') {
      throw new BadRequestException('Ein Dashboard braucht einen Namen.');
    }

    if (name.length > 60) {
      throw new BadRequestException('Der Name ist länger als 60 Zeichen.');
    }

    return name;
  }

  private async speichern(dashboard: DashboardEntity): Promise<void> {
    try {
      await this.repo.save(dashboard);
    } catch (fehler) {
      if (
        fehler instanceof QueryFailedError &&
        (fehler as QueryFailedError & { code?: string }).code === '23505'
      ) {
        throw new BadRequestException(
          dashboard.privat
            ? 'Sie haben schon ein Dashboard mit diesem Namen.'
            : 'Es gibt schon ein Dashboard mit diesem Namen.',
        );
      }

      throw fehler;
    }
  }

  private async pruefeGrenze(
    workspaceId: string,
    userId: string,
    privat: boolean,
  ): Promise<void> {
    const anzahl = await this.repo.count({
      where: privat
        ? { workspaceId, privat: true, createdById: userId }
        : { workspaceId, privat: false },
    });
    const grenze = privat ? MAX_PRIVATE_DASHBOARDS : MAX_GETEILTE_DASHBOARDS;

    if (anzahl >= grenze) {
      throw new BadRequestException(
        privat
          ? `Höchstens ${String(grenze)} eigene Dashboards je Person.`
          : `Höchstens ${String(grenze)} geteilte Dashboards je Bereich.`,
      );
    }
  }

  async anlegen(
    workspaceId: string,
    userId: string,
    eingabe: { name: string; privat: boolean; vonUebersicht: boolean },
  ): Promise<DashboardMitRecht> {
    const name = this.pruefeName(eingabe.name);

    await this.pruefeGrenze(workspaceId, userId, eingabe.privat);

    const kacheln: Kachel[] = eingabe.vonUebersicht
      ? await this.uebersicht.laden(userId, workspaceId)
      : [];
    const dashboard = this.repo.create({
      workspaceId,
      name,
      privat: eingabe.privat,
      createdById: userId,
      kacheln,
    });

    await this.speichern(dashboard);

    return this.mitRecht(dashboard, userId, false);
  }

  async aendern(
    workspaceId: string,
    userId: string,
    id: string,
    eingabe: { name?: string | null; privat?: boolean | null },
  ): Promise<DashboardMitRecht> {
    const dashboard = await this.aenderbar(workspaceId, userId, id, 'ändern');

    if (
      eingabe.privat !== undefined &&
      eingabe.privat !== null &&
      eingabe.privat !== dashboard.privat &&
      dashboard.createdById !== userId
    ) {
      throw new ForbiddenException(
        'Ob ein Dashboard privat ist, entscheidet nur, wer es angelegt hat.',
      );
    }

    if (eingabe.name !== undefined && eingabe.name !== null) {
      dashboard.name = this.pruefeName(eingabe.name);
    }

    if (
      eingabe.privat !== undefined &&
      eingabe.privat !== null &&
      eingabe.privat !== dashboard.privat
    ) {
      await this.pruefeGrenze(workspaceId, userId, eingabe.privat);
      dashboard.privat = eingabe.privat;
    }

    await this.speichern(dashboard);

    return dashboard;
  }

  async kachelnSpeichern(
    workspaceId: string,
    userId: string,
    id: string,
    roh: Record<string, unknown>[],
  ): Promise<DashboardMitRecht> {
    const dashboard = await this.aenderbar(workspaceId, userId, id, 'ändern');

    dashboard.kacheln = pruefeKacheln(roh);
    await this.speichern(dashboard);

    return dashboard;
  }

  async loeschen(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<boolean> {
    const dashboard = await this.aenderbar(workspaceId, userId, id, 'löschen');

    await this.repo.delete({ id: dashboard.id, workspaceId });

    return true;
  }
}
