import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import {
  cleanPermissions,
  Permission,
  roleAllows,
  withImpliedViews,
} from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { ApiKeyEntity } from './api-key.entity';
import { neuerSchluessel, passt, zerlege } from './api-key';
import { meldeSicherheit } from '../sicherheit/melden';
import { type Schreibmodus, wirksameRechte } from './schreibmodus';

const BENUTZT_ABSTAND_MS = 60 * 1000;

export const HOECHSTZAHL = 25;

export type Angelegt = {
  schluessel: ApiKeyEntity;
  token: string;
};

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKeyEntity)
    private readonly schluessel: Repository<ApiKeyEntity>,
    private readonly permissions: PermissionsService,
  ) {}

  list(workspaceId: string): Promise<ApiKeyEntity[]> {
    return this.schluessel
      .createQueryBuilder('schluessel')
      .where('schluessel."workspaceId" = :workspaceId', { workspaceId })
      .orderBy('schluessel."revokedAt"', 'ASC', 'NULLS FIRST')
      .addOrderBy('schluessel."createdAt"', 'DESC')
      .getMany();
  }

  async anlegen(
    anrufer: RequestUser,
    eingabe: {
      name: string;
      permissions: string[];
      expiresAt?: Date | null;
      schreibmodus?: Schreibmodus;
    },
  ): Promise<Angelegt> {
    if (anrufer.apiKey !== undefined) {
      throw new ForbiddenException(
        'Ein Schlüssel kann keine weiteren Schlüssel anlegen.',
      );
    }

    const name = eingabe.name.trim();

    if (name === '') {
      throw new BadRequestException('Ein Schlüssel braucht einen Namen.');
    }

    const offen = await this.schluessel.countBy({
      workspaceId: anrufer.workspaceId,
      revokedAt: IsNull(),
    });

    if (offen >= HOECHSTZAHL) {
      throw new BadRequestException(
        `Mehr als ${HOECHSTZAHL} gültige Schlüssel sind nicht vorgesehen. Widerrufen Sie zuerst einen, den niemand mehr benutzt.`,
      );
    }

    const gewuenscht = withImpliedViews(
      cleanPermissions(eingabe.permissions),
    ).filter((recht) => recht !== Permission.KI_APPROVE);

    if (gewuenscht.length === 0) {
      throw new BadRequestException(
        'Ein Schlüssel ohne Rechte kann nichts, auch nicht lesen. Wählen Sie mindestens eines.',
      );
    }

    await this.nurWasDerAnruferDarf(anrufer, gewuenscht);

    if (
      eingabe.expiresAt !== undefined &&
      eingabe.expiresAt !== null &&
      eingabe.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        'Eine Frist in der Vergangenheit ergibt einen Schlüssel, der nie gilt.',
      );
    }

    const neu = neuerSchluessel();

    const gespeichert = await this.schluessel.save(
      this.schluessel.create({
        workspaceId: anrufer.workspaceId,
        name,
        kennung: neu.kennung,
        hash: neu.hash,
        permissions: gewuenscht,
        schreibmodus: eingabe.schreibmodus ?? 'direkt',
        expiresAt: eingabe.expiresAt ?? null,
        createdById: anrufer.userId,
      }),
    );

    meldeSicherheit({
      art: 'schluessel_angelegt',
      workspaceId: gespeichert.workspaceId,
      actorId: anrufer.userId,
      details: { name: gespeichert.name, modus: gespeichert.schreibmodus },
    });

    return { schluessel: gespeichert, token: neu.token };
  }

  async schreibmodusSetzen(
    anrufer: RequestUser,
    id: string,
    schreibmodus: Schreibmodus,
  ): Promise<ApiKeyEntity> {
    if (anrufer.apiKey !== undefined) {
      throw new ForbiddenException(
        'Ein Schlüssel kann keinen Schlüssel umstellen.',
      );
    }

    const vorhanden = await this.schluessel.findOne({
      where: { id, workspaceId: anrufer.workspaceId },
    });

    if (vorhanden === null) {
      throw new NotFoundException('Diesen Schlüssel gibt es nicht.');
    }

    if (vorhanden.schreibmodus === schreibmodus) {
      return vorhanden;
    }

    vorhanden.schreibmodus = schreibmodus;
    meldeSicherheit({
      art: 'schluessel_modus',
      workspaceId: anrufer.workspaceId,
      actorId: anrufer.userId,
      details: { name: vorhanden.name, modus: schreibmodus },
    });

    return this.schluessel.save(vorhanden);
  }

  private async nurWasDerAnruferDarf(
    anrufer: RequestUser,
    gewuenscht: readonly Permission[],
  ): Promise<void> {
    const eigene = await this.permissions.permissionsOf(anrufer);
    const fehlend = gewuenscht.filter((recht) => !roleAllows(eigene, recht));

    if (fehlend.length > 0) {
      throw new ForbiddenException(
        `Ein Schlüssel kann nicht mehr als Sie selbst. Ihnen fehlt: ${fehlend.join(', ')}.`,
      );
    }
  }

  async widerrufen(workspaceId: string, id: string): Promise<ApiKeyEntity> {
    const vorhanden = await this.schluessel.findOne({
      where: { id, workspaceId },
    });

    if (vorhanden === null) {
      throw new NotFoundException('Diesen Schlüssel gibt es nicht.');
    }

    if (vorhanden.revokedAt !== null) {
      return vorhanden;
    }

    vorhanden.revokedAt = new Date();
    meldeSicherheit({
      art: 'schluessel_widerrufen',
      workspaceId,
      details: { name: vorhanden.name },
    });

    return this.schluessel.save(vorhanden);
  }

  async anrufer(token: string): Promise<RequestUser | null> {
    const zerlegt = zerlege(token);

    if (zerlegt === null) {
      return null;
    }

    const gefunden = await this.schluessel.findOne({
      where: { kennung: zerlegt.kennung },
    });

    if (gefunden === null) {
      return null;
    }

    if (!passt(zerlegt.geheimnis, gefunden.hash)) {
      return null;
    }

    if (gefunden.revokedAt !== null) {
      return null;
    }

    if (
      gefunden.expiresAt !== null &&
      gefunden.expiresAt.getTime() <= Date.now()
    ) {
      return null;
    }

    await this.benutztVermerken(gefunden);

    return {
      userId: gefunden.id,
      workspaceId: gefunden.workspaceId,
      email: `${gefunden.name} (Schlüssel)`,
      apiKey: {
        id: gefunden.id,
        name: gefunden.name,
        permissions: wirksameRechte(
          gefunden.permissions,
          gefunden.schreibmodus ?? 'direkt',
        ),
        schreibmodus: gefunden.schreibmodus ?? 'direkt',
      },
    };
  }

  private async benutztVermerken(schluessel: ApiKeyEntity): Promise<void> {
    const jetzt = Date.now();

    if (
      schluessel.lastUsedAt !== null &&
      jetzt - schluessel.lastUsedAt.getTime() < BENUTZT_ABSTAND_MS
    ) {
      return;
    }

    await this.schluessel.update(schluessel.id, {
      lastUsedAt: new Date(jetzt),
    });
  }
}
