import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { istLeerlaufStufe } from '../auth/leerlauf';
import { PAPIERKORB_TAGE_MAX, PAPIERKORB_TAGE_MIN } from '../papierkorb/frist';
import { meldeSicherheit } from '../sicherheit/melden';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from './workspace.entity';
import { WorkspaceRolesService } from './workspace-roles.service';
import { normalisiereDomains } from './einladungs-domains';

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly repository: Repository<WorkspaceEntity>,
    private readonly rolesService: WorkspaceRolesService,
  ) {}

  async setBaseInterestRate(
    caller: RequestUser,
    percent: number | null,
  ): Promise<WorkspaceEntity> {
    const { workspaceId } = caller;

    await this.rolesService.assertCanAdminister(
      caller,
      'den Basiszinssatz festzulegen',
    );

    if (percent !== null && (percent < -10 || percent > 25)) {
      throw new BadRequestException(
        'Der Basiszinssatz liegt üblicherweise zwischen -1 und 4 Prozent. Bitte prüfen Sie die Eingabe.',
      );
    }

    const workspace = await this.repository.findOne({
      where: { id: workspaceId },
    });

    if (workspace === null) {
      throw new NotFoundException('Diesen Arbeitsbereich gibt es nicht.');
    }

    workspace.baseInterestRatePercent = percent;

    return this.repository.save(workspace);
  }

  async setZweiFaktorPflicht(
    caller: RequestUser,
    an: boolean,
  ): Promise<WorkspaceEntity> {
    const { workspaceId } = caller;

    await this.rolesService.assertCanAdminister(
      caller,
      'die Zwei-Faktor-Pflicht zu ändern',
    );

    if (an) {
      const selbst = await this.repository.manager.findOne(UserEntity, {
        where: { id: caller.userId },
        select: ['id', 'totpEnabledAt'],
      });

      if (selbst?.totpEnabledAt == null) {
        throw new BadRequestException(
          'Richten Sie zuerst für Ihr eigenes Konto die Zwei-Faktor-Anmeldung ein.',
        );
      }
    }

    const workspace = await this.repository.findOne({
      where: { id: workspaceId },
    });

    if (workspace === null) {
      throw new NotFoundException('Diesen Arbeitsbereich gibt es nicht.');
    }

    workspace.zweiFaktorPflicht = an;

    const saved = await this.repository.save(workspace);

    meldeSicherheit({
      art: 'zwei_faktor_pflicht',
      workspaceId,
      actorId: caller.userId,
      details: { an },
    });

    return saved;
  }

  async setLeerlauf(
    caller: RequestUser,
    minuten: number | null,
  ): Promise<WorkspaceEntity> {
    const { workspaceId } = caller;

    await this.rolesService.assertCanAdminister(
      caller,
      'das Abmelden nach Leerlauf einzustellen',
    );

    if (!istLeerlaufStufe(minuten)) {
      throw new BadRequestException(
        'Erlaubt sind 30 Minuten, 1, 4 oder 8 Stunden – oder aus.',
      );
    }

    const workspace = await this.repository.findOne({
      where: { id: workspaceId },
    });

    if (workspace === null) {
      throw new NotFoundException('Diesen Arbeitsbereich gibt es nicht.');
    }

    const vorher = workspace.leerlaufMinuten;

    workspace.leerlaufMinuten = minuten;

    const saved = await this.repository.save(workspace);

    meldeSicherheit({
      art: 'leerlauf_abmeldung',
      workspaceId,
      actorId: caller.userId,
      details: { vorher, nachher: minuten },
    });

    return saved;
  }

  async setEinladungsDomains(
    caller: RequestUser,
    eingabe: string[],
  ): Promise<WorkspaceEntity> {
    const { workspaceId } = caller;

    await this.rolesService.assertCanManageMembers(
      caller,
      'die erlaubten Domains für Einladungen festzulegen',
    );

    const domains = normalisiereDomains(eingabe);
    const workspace = await this.repository.findOne({
      where: { id: workspaceId },
    });

    if (workspace === null) {
      throw new NotFoundException('Diesen Arbeitsbereich gibt es nicht.');
    }

    const vorher = workspace.einladungsDomains.join(', ');

    workspace.einladungsDomains = domains;

    const saved = await this.repository.save(workspace);

    meldeSicherheit({
      art: 'einladungs_domains',
      workspaceId,
      actorId: caller.userId,
      details: { vorher, nachher: domains.join(', ') },
    });

    return saved;
  }

  async setPapierkorbTage(
    caller: RequestUser,
    tage: number,
  ): Promise<WorkspaceEntity> {
    const { workspaceId } = caller;

    await this.rolesService.assertCanAdminister(
      caller,
      'die Frist des Papierkorbs zu ändern',
    );

    if (
      !Number.isInteger(tage) ||
      tage < PAPIERKORB_TAGE_MIN ||
      tage > PAPIERKORB_TAGE_MAX
    ) {
      throw new BadRequestException(
        `Die Frist liegt zwischen ${String(PAPIERKORB_TAGE_MIN)} und ${String(PAPIERKORB_TAGE_MAX)} Tagen.`,
      );
    }

    const workspace = await this.repository.findOne({
      where: { id: workspaceId },
    });

    if (workspace === null) {
      throw new NotFoundException('Diesen Arbeitsbereich gibt es nicht.');
    }

    const vorher = workspace.papierkorbTage;

    if (vorher === tage) {
      return workspace;
    }

    workspace.papierkorbTage = tage;

    const saved = await this.repository.save(workspace);

    meldeSicherheit({
      art: 'papierkorb_frist',
      workspaceId,
      actorId: caller.userId,
      details: { vorher, tage },
    });

    return saved;
  }

  async rename(caller: RequestUser, name: string): Promise<WorkspaceEntity> {
    const { workspaceId } = caller;

    await this.rolesService.assertCanAdminister(
      caller,
      'den Arbeitsbereich umzubenennen',
    );

    const trimmed = name.trim();

    if (trimmed === '') {
      throw new BadRequestException('Ein Arbeitsbereich braucht einen Namen.');
    }

    const workspace = await this.repository.findOne({
      where: { id: workspaceId },
    });

    if (workspace === null) {
      throw new NotFoundException('Diesen Arbeitsbereich gibt es nicht.');
    }

    const previous = workspace.name;

    workspace.name = trimmed;

    const saved = await this.repository.save(workspace);

    this.logger.log(
      `Workspace ${workspaceId} renamed from "${previous}" to "${trimmed}" by ${caller.apiKey === undefined ? `user ${caller.userId}` : `key ${caller.apiKey.name}`}`,
    );

    return saved;
  }
}
