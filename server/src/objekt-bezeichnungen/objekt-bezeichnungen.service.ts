import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { meldeSicherheit } from '../sicherheit/melden';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { type ObjektBezeichnungView } from './objekt-bezeichnungen.dto';
import {
  type Bezeichnung,
  BezeichnungUngueltig,
  type Genus,
  type GespeicherteBezeichnungen,
  mitBezeichnung,
  ObjektArt,
  ohneBezeichnung,
  STANDARD_BEZEICHNUNGEN,
  wirksameBezeichnung,
} from './objekt-bezeichnungen';

@Injectable()
export class ObjektBezeichnungenService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    private readonly permissions: PermissionsService,
  ) {}

  private async gespeichert(
    workspaceId: string,
  ): Promise<GespeicherteBezeichnungen> {
    const workspace = await this.workspaces.findOne({
      where: { id: workspaceId },
      select: ['id', 'objektBezeichnungen'],
    });

    if (workspace === null) {
      throw new NotFoundException('Diesen Arbeitsbereich gibt es nicht.');
    }

    return workspace.objektBezeichnungen ?? {};
  }

  private alsListe(gespeichert: GespeicherteBezeichnungen) {
    return Object.values(ObjektArt).map(
      (art): ObjektBezeichnungView => ({
        art,
        ...wirksameBezeichnung(gespeichert, art),
        istStandard: gespeichert[art] === undefined,
        standardEinzahl: STANDARD_BEZEICHNUNGEN[art].einzahl,
        standardMehrzahl: STANDARD_BEZEICHNUNGEN[art].mehrzahl,
      }),
    );
  }

  async liste(workspaceId: string): Promise<ObjektBezeichnungView[]> {
    return this.alsListe(await this.gespeichert(workspaceId));
  }

  async bezeichnung(workspaceId: string, art: ObjektArt): Promise<Bezeichnung> {
    return wirksameBezeichnung(await this.gespeichert(workspaceId), art);
  }

  private async aendere(
    caller: RequestUser,
    art: ObjektArt | null,
    berechne: (vorher: GespeicherteBezeichnungen) => GespeicherteBezeichnungen,
  ): Promise<ObjektBezeichnungView[]> {
    const { vorher, nachher } = await this.workspaces.manager.transaction(
      async (manager) => {
        const repo = manager.getRepository(WorkspaceEntity);
        const workspace = await repo
          .createQueryBuilder('w')
          .select(['w.id', 'w.objektBezeichnungen'])
          .where('w.id = :id', { id: caller.workspaceId })
          .setLock('pessimistic_write')
          .getOne();

        if (workspace === null) {
          throw new NotFoundException('Diesen Arbeitsbereich gibt es nicht.');
        }

        const alt = workspace.objektBezeichnungen ?? {};
        let neu: GespeicherteBezeichnungen;

        try {
          neu = berechne(alt);
        } catch (fehler) {
          if (fehler instanceof BezeichnungUngueltig) {
            throw new BadRequestException(fehler.message);
          }

          throw fehler;
        }

        await repo.update(
          { id: caller.workspaceId },
          { objektBezeichnungen: neu },
        );

        return { vorher: alt, nachher: neu };
      },
    );

    const alt = art === null ? null : wirksameBezeichnung(vorher, art);
    const neu = art === null ? null : wirksameBezeichnung(nachher, art);

    meldeSicherheit({
      art: 'objekt_bezeichnung',
      workspaceId: caller.workspaceId,
      actorId: caller.apiKey === undefined ? caller.userId : null,
      details: {
        objekt: art ?? 'alle',
        vorher: alt === null ? null : `${alt.einzahl} / ${alt.mehrzahl}`,
        nachher: neu === null ? 'Standard' : `${neu.einzahl} / ${neu.mehrzahl}`,
      },
    });

    return this.alsListe(nachher);
  }

  async setze(
    caller: RequestUser,
    eingabe: {
      art: ObjektArt;
      einzahl: string;
      mehrzahl: string;
      genus: Genus;
    },
  ): Promise<ObjektBezeichnungView[]> {
    await this.permissions.assert(
      caller,
      Permission.FIELD_MANAGE,
      'Objekte umzubenennen',
    );

    return this.aendere(caller, eingabe.art, (vorher) =>
      mitBezeichnung(vorher, eingabe.art, eingabe),
    );
  }

  async zuruecksetzen(
    caller: RequestUser,
    art: ObjektArt | null,
  ): Promise<ObjektBezeichnungView[]> {
    await this.permissions.assert(
      caller,
      Permission.FIELD_MANAGE,
      'Objekte umzubenennen',
    );

    return this.aendere(caller, art, (vorher) => ohneBezeichnung(vorher, art));
  }
}
