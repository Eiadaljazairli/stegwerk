import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource, In } from 'typeorm';

import { type RequestUser } from '../../auth/decorators/current-user.decorator';
import { MembershipEntity } from '../../workspaces/membership.entity';
import { Permission, roleAllows } from '../../workspaces/permissions';
import { PermissionsService } from '../../workspaces/permissions.service';
import { RoleEntity } from '../../workspaces/role.entity';
import {
  type FreigabeStufe,
  type SichtbarkeitsArt,
} from '../../workspaces/sichtbarkeit';
import { CompaniesService } from '../companies.service';
import { ContactsService } from '../contacts.service';
import { DealsService } from '../deals.service';
import { FreigabeEntity } from './freigabe.entity';
import {
  type FreigabeEintrag,
  type FreigabeStand,
  type ZugriffZeile,
} from './freigaben.dto';

const RECHTE: Record<
  SichtbarkeitsArt,
  { sehen: Permission; aendern: Permission; mehrzahl: string }
> = {
  company: {
    sehen: Permission.COMPANY_VIEW,
    aendern: Permission.COMPANY_WRITE,
    mehrzahl: 'Firmen',
  },
  contact: {
    sehen: Permission.CONTACT_VIEW,
    aendern: Permission.CONTACT_WRITE,
    mehrzahl: 'Kontakte',
  },
  deal: {
    sehen: Permission.DEAL_VIEW,
    aendern: Permission.DEAL_WRITE,
    mehrzahl: 'Geschäfte',
  },
};

const name = (user: { firstName: string; lastName: string } | null) =>
  user === null ? 'Unbekannt' : `${user.firstName} ${user.lastName}`.trim();

@Injectable()
export class FreigabenService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly permissions: PermissionsService,
    private readonly companies: CompaniesService,
    private readonly contacts: ContactsService,
    private readonly deals: DealsService,
  ) {}

  private async akte(
    user: RequestUser,
    art: SichtbarkeitsArt,
    id: string,
  ): Promise<{ id: string; ownerId: string | null }> {
    await this.permissions.assert(
      user,
      RECHTE[art].sehen,
      `${RECHTE[art].mehrzahl} zu sehen`,
    );

    const dienst =
      art === 'company'
        ? this.companies
        : art === 'contact'
          ? this.contacts
          : this.deals;

    return dienst.findOne(user.workspaceId, id);
  }

  private async darfVerwalten(
    user: RequestUser,
    art: SichtbarkeitsArt,
    akte: { ownerId: string | null },
  ): Promise<boolean> {
    if (!(await this.permissions.can(user, RECHTE[art].aendern))) {
      return false;
    }

    const feld = await this.permissions.sichtfeldFuer(user);

    return (
      feld.arten[art] === 'alle' ||
      (feld.ich !== null && akte.ownerId === feld.ich)
    );
  }

  private async eintraege(
    workspaceId: string,
    art: SichtbarkeitsArt,
    datensatzId: string,
  ): Promise<FreigabeEintrag[]> {
    const zeilen = await this.dataSource.getRepository(FreigabeEntity).find({
      where: { workspaceId, art, datensatzId },
      relations: { user: true, erteiltVon: true },
      order: { createdAt: 'ASC' },
    });

    return zeilen
      .map((zeile) => ({
        id: zeile.id,
        userId: zeile.userId,
        name: name(zeile.user),
        stufe: zeile.stufe,
        erteiltVon: zeile.erteiltVon === null ? null : name(zeile.erteiltVon),
        createdAt: zeile.createdAt,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  async stand(
    user: RequestUser,
    art: SichtbarkeitsArt,
    datensatzId: string,
  ): Promise<FreigabeStand> {
    const akte = await this.akte(user, art, datensatzId);

    return {
      freigaben: await this.eintraege(user.workspaceId, art, datensatzId),
      darfVerwalten: await this.darfVerwalten(user, art, akte),
      verantwortlichId: akte.ownerId,
    };
  }

  async freigeben(
    user: RequestUser,
    art: SichtbarkeitsArt,
    datensatzId: string,
    fuerUserId: string,
    stufe: FreigabeStufe,
  ): Promise<FreigabeStand> {
    const akte = await this.akte(user, art, datensatzId);

    if (!(await this.darfVerwalten(user, art, akte))) {
      throw new ForbiddenException(
        'Freigeben kann, wer den Datensatz verantwortet oder alle dieser Art sieht und ihn ändern darf.',
      );
    }

    const mitglied = await this.dataSource
      .getRepository(MembershipEntity)
      .findOne({
        where: { userId: fuerUserId, workspaceId: user.workspaceId },
      });

    if (mitglied === null) {
      throw new NotFoundException(
        'Diese Person gehört nicht zu diesem Arbeitsbereich.',
      );
    }

    if (fuerUserId === akte.ownerId) {
      throw new BadRequestException(
        'Diese Person verantwortet den Datensatz und sieht ihn ohnehin.',
      );
    }

    const feld = await this.permissions.sichtfeldFuer(user);

    if (fuerUserId === feld.ich) {
      throw new BadRequestException('Sich selbst gibt man nichts frei.');
    }

    await this.dataSource.query(
      `INSERT INTO "freigaben" ("workspaceId", "art", "datensatzId", "userId", "stufe", "erteiltVonId")
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ("workspaceId", "art", "datensatzId", "userId")
       DO UPDATE SET "stufe" = EXCLUDED."stufe", "erteiltVonId" = EXCLUDED."erteiltVonId"`,
      [user.workspaceId, art, datensatzId, fuerUserId, stufe, feld.ich],
    );

    return this.stand(user, art, datensatzId);
  }

  async entziehen(user: RequestUser, id: string): Promise<boolean> {
    const freigabe = await this.dataSource
      .getRepository(FreigabeEntity)
      .findOne({ where: { id, workspaceId: user.workspaceId } });

    if (freigabe === null) {
      throw new NotFoundException('Diese Freigabe gibt es nicht.');
    }

    const eigene = user.apiKey === undefined && freigabe.userId === user.userId;

    if (!eigene) {
      const akte = await this.akte(user, freigabe.art, freigabe.datensatzId);

      if (!(await this.darfVerwalten(user, freigabe.art, akte))) {
        throw new ForbiddenException(
          'Entziehen kann, wer den Datensatz verantwortet oder alle dieser Art sieht und ihn ändern darf.',
        );
      }
    }

    await this.dataSource
      .getRepository(FreigabeEntity)
      .delete({ id, workspaceId: user.workspaceId });

    return true;
  }

  async werSiehtDas(
    user: RequestUser,
    art: SichtbarkeitsArt,
    datensatzId: string,
  ): Promise<ZugriffZeile[]> {
    await this.permissions.assertAny(
      user,
      [Permission.MEMBER_MANAGE, Permission.ROLE_MANAGE],
      'zu sehen, wer welche Datensätze sieht',
    );

    const akte = await this.akte(user, art, datensatzId);
    const mitglieder = await this.dataSource
      .getRepository(MembershipEntity)
      .find({
        where: { workspaceId: user.workspaceId },
        relations: { user: true },
      });
    const rollen = new Map(
      (
        await this.dataSource.getRepository(RoleEntity).find({
          where: { workspaceId: user.workspaceId },
        })
      ).map((rolle) => [rolle.id, rolle]),
    );
    const freigaben = new Map(
      (
        await this.dataSource.getRepository(FreigabeEntity).find({
          where: {
            workspaceId: user.workspaceId,
            art,
            datensatzId,
            userId: In(mitglieder.map((m) => m.userId)),
          },
        })
      ).map((freigabe) => [freigabe.userId, freigabe.stufe]),
    );

    const zeilen: ZugriffZeile[] = [];

    for (const mitglied of mitglieder) {
      const wer: RequestUser = {
        userId: mitglied.userId,
        workspaceId: user.workspaceId,
        email: mitglied.user.email,
      };
      const rolle = await this.permissions.permissionsOf(wer);
      const feld = await this.permissions.sichtfeldFuer(wer);
      const rollenName =
        (mitglied.roleId === null ? undefined : rollen.get(mitglied.roleId))
          ?.name ??
        [...rollen.values()].find((r) => r.templateKey === mitglied.role)
          ?.name ??
        '—';
      const freigabe = freigaben.get(mitglied.userId) ?? null;

      zeilen.push({
        userId: mitglied.userId,
        name: name(mitglied.user),
        rolle: rollenName,
        ...zugriff(
          art,
          akte,
          mitglied.userId,
          rolle,
          feld.arten[art],
          freigabe,
        ),
      });
    }

    return zeilen.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }
}

export const zugriff = (
  art: SichtbarkeitsArt,
  akte: { ownerId: string | null },
  userId: string,
  rolle: { everything: boolean; permissions: string[] },
  weite: 'alle' | 'eigene',
  freigabe: FreigabeStufe | null,
): { sieht: boolean; bearbeitet: boolean; grund: string } => {
  const rechte = RECHTE[art];
  const darfSehen = roleAllows(rolle, rechte.sehen);
  const darfAendern = roleAllows(rolle, rechte.aendern);

  if (!darfSehen) {
    return {
      sieht: false,
      bearbeitet: false,
      grund: `Die Rolle zeigt keine ${rechte.mehrzahl}.`,
    };
  }

  const ohneFreigabe =
    rolle.everything ||
    weite === 'alle' ||
    akte.ownerId === null ||
    akte.ownerId === userId;

  const grund = rolle.everything
    ? 'Inhaber: sieht alles.'
    : weite === 'alle'
      ? `Die Rolle zeigt alle ${rechte.mehrzahl}.`
      : akte.ownerId === userId
        ? 'Verantwortlich.'
        : akte.ownerId === null
          ? 'Niemand verantwortlich: für alle sichtbar.'
          : freigabe === 'bearbeiten'
            ? 'Freigegeben zum Bearbeiten.'
            : freigabe === 'lesen'
              ? 'Freigegeben zum Lesen.'
              : `Die Rolle zeigt nur eigene ${rechte.mehrzahl}.`;

  const sieht = ohneFreigabe || freigabe !== null;

  return {
    sieht,
    bearbeitet:
      sieht && darfAendern && (ohneFreigabe || freigabe === 'bearbeiten'),
    grund:
      sieht && !darfAendern ? `${grund} Die Rolle erlaubt kein Ändern.` : grund,
  };
};
