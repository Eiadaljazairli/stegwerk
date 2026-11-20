import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { MembershipEntity, MembershipRole } from './membership.entity';
import { Permission, roleAllows } from './permissions';
import { RoleEntity } from './role.entity';
import {
  ALLES_SICHTBAR,
  type FreigabeStufe,
  type Freigabeliste,
  normalisiereSichtbarkeit,
  SICHTBARKEITS_ARTEN,
  type Sichtbarkeit,
  type SichtbarkeitsArt,
  type Sichtfeld,
} from './sichtbarkeit';
import {
  assertFeldrechteVergebbar,
  type Feldrechte,
  normalisiereFeldrechte,
  STANDARD_FELDRECHTE,
} from './feldrechte';

export const GANZ_VERBORGEN: Feldrechte = Object.fromEntries(
  STANDARD_FELDRECHTE.map((eintrag) => [eintrag.schluessel, 'verborgen']),
) as Feldrechte;

const SEHEN_RECHT: Record<SichtbarkeitsArt, Permission> = {
  company: Permission.COMPANY_VIEW,
  contact: Permission.CONTACT_VIEW,
  deal: Permission.DEAL_VIEW,
};

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(MembershipEntity)
    private readonly memberships: Repository<MembershipEntity>,
    @InjectRepository(RoleEntity)
    private readonly roles: Repository<RoleEntity>,
  ) {}

  private async roleFor(
    caller: RequestUser,
  ): Promise<{ everything: boolean; permissions: string[] } | null> {
    if (caller.apiKey !== undefined) {
      return { everything: false, permissions: caller.apiKey.permissions };
    }

    const { userId, workspaceId } = caller;

    const membership = await this.memberships.findOne({
      where: { userId, workspaceId },
      relations: { workspace: true, user: true },
    });

    if (membership === null) {
      return null;
    }

    if (
      membership.workspace.zweiFaktorPflicht &&
      membership.user.totpEnabledAt === null
    ) {
      return null;
    }

    if (membership.roleId !== null) {
      const role = await this.roles.findOne({
        where: { id: membership.roleId, workspaceId },
      });

      if (role !== null) {
        return { everything: role.everything, permissions: role.permissions };
      }
    }

    const fallback = await this.roles.findOne({
      where: { workspaceId: caller.workspaceId, templateKey: membership.role },
    });

    return fallback === null
      ? {
          everything: membership.role === MembershipRole.OWNER,
          permissions: [],
        }
      : {
          everything: fallback.everything,
          permissions: fallback.permissions,
        };
  }

  async can(caller: RequestUser, permission: Permission): Promise<boolean> {
    const role = await this.roleFor(caller);

    return role !== null && roleAllows(role, permission);
  }

  async assert(
    caller: RequestUser,
    permission: Permission,
    what: string,
  ): Promise<void> {
    await this.assertAny(caller, [permission], what);
  }

  async assertAny(
    caller: RequestUser,
    permissions: readonly Permission[],
    what: string,
  ): Promise<void> {
    const role = await this.roleFor(caller);

    if (
      role === null ||
      !permissions.some((permission) => roleAllows(role, permission))
    ) {
      throw new ForbiddenException(
        caller.apiKey === undefined
          ? `Ihnen fehlt die Berechtigung, ${what}. Wenden Sie sich an eine Person mit Administratorrechten.`
          : `Dem Schlüssel "${caller.apiKey.name}" fehlt die Berechtigung, ${what}. Nötig ist eines von: ${permissions.join(', ')}.`,
      );
    }
  }

  async assertGrantable(
    caller: RequestUser,
    role: { everything: boolean; permissions: readonly string[] },
    what: string,
  ): Promise<void> {
    const eigene = await this.roleFor(caller);

    if (eigene?.everything === true) {
      return;
    }

    const mehr =
      eigene === null ||
      role.everything ||
      role.permissions.some(
        (permission) => !eigene.permissions.includes(permission),
      );

    if (mehr) {
      throw new ForbiddenException(
        `Sie können ${what} nur mit Rechten, die Sie selbst haben. Die Inhaber-Rolle vergibt nur ein Inhaber.`,
      );
    }
  }

  async holdsEverything(userId: string, workspaceId: string): Promise<boolean> {
    const role = await this.roleFor({ userId, workspaceId, email: '' });

    return role?.everything === true;
  }

  async sichtfeldFuer(caller: RequestUser): Promise<Sichtfeld> {
    const feld = await this.zeilenUndFelder(caller);
    const role = await this.roleFor(caller);

    return {
      ...feld,
      ohneRecht: SICHTBARKEITS_ARTEN.filter(
        (art) => role === null || !roleAllows(role, SEHEN_RECHT[art]),
      ),
    };
  }

  private async zeilenUndFelder(caller: RequestUser): Promise<Sichtfeld> {
    let ich: string | null = caller.userId;

    if (caller.apiKey !== undefined) {
      const [schluessel] = (await this.memberships.query(
        `SELECT "createdById" FROM "api_keys" WHERE "id" = $1 AND "workspaceId" = $2`,
        [caller.apiKey.id, caller.workspaceId],
      )) as { createdById: string | null }[];

      ich = schluessel?.createdById ?? null;

      if (ich === null) {
        return {
          ich: null,
          arten: { company: 'eigene', contact: 'eigene', deal: 'eigene' },
          felder: GANZ_VERBORGEN,
        };
      }
    }

    const membership = await this.memberships.findOne({
      where: { userId: ich, workspaceId: caller.workspaceId },
    });

    if (membership === null) {
      return caller.apiKey === undefined
        ? { ich, arten: ALLES_SICHTBAR, felder: {} }
        : {
            ich: null,
            arten: { company: 'eigene', contact: 'eigene', deal: 'eigene' },
            felder: GANZ_VERBORGEN,
          };
    }

    const rolle =
      (membership.roleId === null
        ? null
        : await this.roles.findOne({
            where: { id: membership.roleId, workspaceId: caller.workspaceId },
          })) ??
      (await this.roles.findOne({
        where: {
          workspaceId: caller.workspaceId,
          templateKey: membership.role,
        },
      }));

    if (rolle === null || rolle.everything) {
      return { ich, arten: ALLES_SICHTBAR, felder: {} };
    }

    const arten = normalisiereSichtbarkeit(rolle.sichtbarkeit);

    return {
      ich,
      arten,
      felder: normalisiereFeldrechte(rolle.feldrechte),
      freigaben: await this.freigabenFuer(ich, caller.workspaceId, arten),
    };
  }

  private async freigabenFuer(
    userId: string,
    workspaceId: string,
    arten: Sichtbarkeit,
  ): Promise<Freigabeliste> {
    const eingeschraenkt = SICHTBARKEITS_ARTEN.filter(
      (art) => arten[art] === 'eigene',
    );

    if (eingeschraenkt.length === 0) {
      return {};
    }

    const zeilen = (await this.memberships.query(
      `SELECT "art", "datensatzId", "stufe" FROM "freigaben"
        WHERE "workspaceId" = $1 AND "userId" = $2 AND "art" = ANY($3::text[])`,
      [workspaceId, userId, eingeschraenkt],
    )) as {
      art: SichtbarkeitsArt;
      datensatzId: string;
      stufe: FreigabeStufe;
    }[];
    const liste: Partial<Record<SichtbarkeitsArt, Map<string, FreigabeStufe>>> =
      {};

    for (const zeile of zeilen) {
      (liste[zeile.art] ??= new Map()).set(zeile.datensatzId, zeile.stufe);
    }

    return liste;
  }

  async assertSichtbarkeitVergebbar(
    caller: RequestUser,
    gewuenscht: Partial<Sichtbarkeit>,
  ): Promise<void> {
    const eigenes = await this.sichtfeldFuer(caller);

    for (const art of SICHTBARKEITS_ARTEN) {
      if (gewuenscht[art] === 'alle' && eigenes.arten[art] === 'eigene') {
        throw new ForbiddenException(
          'Sie können einer Rolle nur so viele Datensätze zeigen, wie Sie selbst sehen.',
        );
      }
    }
  }

  async assertFeldrechteVergebbar(
    caller: RequestUser,
    gewuenscht: Feldrechte,
  ): Promise<void> {
    assertFeldrechteVergebbar(
      (await this.sichtfeldFuer(caller)).felder,
      gewuenscht,
    );
  }

  async permissionsOf(
    caller: RequestUser,
  ): Promise<{ everything: boolean; permissions: string[] }> {
    return (
      (await this.roleFor(caller)) ?? {
        everything: false,
        permissions: [],
      }
    );
  }
}
