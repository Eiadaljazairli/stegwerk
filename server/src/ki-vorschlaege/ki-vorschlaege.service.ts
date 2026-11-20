import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { BillingService } from '../billing/billing.service';
import { fuehreAus } from '../mcp/graphql-ausfuehren';
import {
  type VorschlagZiel,
  type Werkzeug,
  WERKZEUGE,
  ZIEL_LESEN,
  zielName,
} from '../mcp/mcp-werkzeuge';
import { meldeSicherheit } from '../sicherheit/melden';
import { Permission, roleAllows } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import {
  irgendwoEingeschraenkt,
  nurSichtbareZeilen,
} from '../workspaces/ziel-sichtbarkeit';
import { KiVorschlagEntity, type VorschlagStatus } from './ki-vorschlag.entity';

export const MAX_OFFENE = 500;

const GRENZE_JE_STATUS: Record<VorschlagStatus, number> = {
  offen: MAX_OFFENE * 2,
  angenommen: 200,
  verworfen: 200,
};

const BLOCK = 200;

const LESERECHT: Record<VorschlagZiel['art'], Permission> = {
  company: Permission.COMPANY_VIEW,
  contact: Permission.CONTACT_VIEW,
  deal: Permission.DEAL_VIEW,
  quote: Permission.QUOTE_VIEW,
};

export class VorschlagAbgelehnt extends Error {}

export type AnnahmeErgebnis = {
  vorschlag: KiVorschlagEntity;
  veraltet: boolean;
  aktuell: Record<string, unknown> | null;
};

export const gleicherStand = (
  a: Record<string, unknown> | null,
  b: Record<string, unknown> | null,
): boolean => {
  const sortiert = (wert: Record<string, unknown> | null) =>
    wert === null
      ? 'null'
      : JSON.stringify(
          Object.keys(wert)
            .sort()
            .map((schluessel) => [schluessel, wert[schluessel] ?? null]),
        );

  return sortiert(a) === sortiert(b);
};

@Injectable()
export class KiVorschlaegeService {
  constructor(
    @InjectRepository(KiVorschlagEntity)
    private readonly vorschlaege: Repository<KiVorschlagEntity>,
    private readonly permissions: PermissionsService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private schema() {
    return this.moduleRef.get(GraphQLSchemaHost, { strict: false }).schema;
  }

  private async lesen(
    req: unknown,
    ziel: VorschlagZiel,
  ): Promise<{ datensatz: Record<string, unknown> | null; meldung: string }> {
    const { ergebnis, meldungen } = await fuehreAus(
      this.schema(),
      [
        {
          schluessel: 'ziel',
          query: ZIEL_LESEN[ziel.art],
          variables: { id: ziel.id },
        },
      ],
      { req },
    );
    const datensatz = ergebnis.ziel as Record<string, unknown> | undefined;

    return {
      datensatz: datensatz ?? null,
      meldung: meldungen.join(' ') || 'Diesen Datensatz gibt es nicht.',
    };
  }

  async vorschlagen(
    req: { user?: RequestUser },
    werkzeug: Werkzeug,
    eingabe: Record<string, unknown>,
    quelle?: string,
  ): Promise<KiVorschlagEntity> {
    const user = req.user as RequestUser;
    const name = user.apiKey?.name ?? quelle;

    if (werkzeug.vorschlag === undefined || name === undefined) {
      throw new VorschlagAbgelehnt(
        'Dieses Werkzeug lässt sich nicht vorschlagen.',
      );
    }

    try {
      await this.moduleRef
        .get(BillingService, { strict: false })
        .assertCanWrite(user.workspaceId);
    } catch (problem) {
      if (problem instanceof HttpException) {
        throw new VorschlagAbgelehnt(problem.message);
      }

      throw problem;
    }

    const offen = await this.vorschlaege.countBy({
      workspaceId: user.workspaceId,
      status: 'offen',
    });

    if (offen >= MAX_OFFENE) {
      throw new VorschlagAbgelehnt(
        `Es warten schon ${String(MAX_OFFENE)} Vorschläge auf Freigabe. Bitte erst diese entscheiden lassen.`,
      );
    }

    const plan = werkzeug.vorschlag(eingabe);
    let datensatz: Record<string, unknown> | null = null;

    if (plan.ziel !== null) {
      const gelesen = await this.lesen(req, plan.ziel);

      if (gelesen.datensatz === null) {
        throw new VorschlagAbgelehnt(gelesen.meldung);
      }

      datensatz = gelesen.datensatz;

      const grund = plan.pruefe?.(datensatz) ?? null;

      if (grund !== null) {
        throw new VorschlagAbgelehnt(grund);
      }
    }

    const vorher =
      plan.vorher !== undefined && datensatz !== null
        ? plan.vorher(datensatz)
        : null;

    if (vorher !== null && gleicherStand(vorher, plan.nachher)) {
      throw new VorschlagAbgelehnt(
        'Das ist schon so; es gibt nichts vorzuschlagen.',
      );
    }

    const ziel = plan.ziel;
    const akte = (spalte: 'companyId' | 'contactId' | 'dealId') => {
      if (ziel === null || datensatz === null) {
        return null;
      }

      if (ziel.art === 'quote') {
        return (datensatz[spalte] as string | null | undefined) ?? null;
      }

      return `${ziel.art}Id` === spalte ? ziel.id : null;
    };

    const gespeichert = await this.vorschlaege.save(
      this.vorschlaege.create({
        workspaceId: user.workspaceId,
        apiKeyId: user.apiKey?.id ?? null,
        schluesselName: name.slice(0, 120),
        werkzeug: werkzeug.name,
        zusammenfassung: plan.zusammenfassung.slice(0, 300),
        eingabe,
        vorher,
        nachher: plan.nachher,
        zielArt: ziel?.art ?? null,
        zielId: ziel?.id ?? null,
        zielName:
          ziel === null || datensatz === null
            ? null
            : zielName(ziel.art, datensatz).slice(0, 300) || null,
        companyId: akte('companyId'),
        contactId: akte('contactId'),
        dealId: akte('dealId'),
        status: 'offen',
      }),
    );

    meldeSicherheit({
      art: 'mcp_vorschlag',
      workspaceId: user.workspaceId,
      actorId: user.apiKey === undefined ? user.userId : null,
      details: { werkzeug: werkzeug.name, schluessel: name },
    });

    return gespeichert;
  }

  async liste(
    user: RequestUser,
    status: VorschlagStatus[],
    ziel?: { art: VorschlagZiel['art']; id: string },
  ): Promise<KiVorschlagEntity[]> {
    const zeilen: KiVorschlagEntity[] = [];

    for (const eintrag of new Set(status)) {
      zeilen.push(
        ...(await this.sichtbareMitStatus(
          user,
          eintrag,
          GRENZE_JE_STATUS[eintrag],
          ziel,
        )),
      );
    }

    return zeilen.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  private async sichtbareMitStatus(
    user: RequestUser,
    status: VorschlagStatus,
    grenze: number,
    ziel?: { art: VorschlagZiel['art']; id: string },
  ): Promise<KiVorschlagEntity[]> {
    const sichtbar: KiVorschlagEntity[] = [];

    for (let ab = 0; sichtbar.length < grenze && ab < grenze * 5; ab += BLOCK) {
      const block = await this.vorschlaege.find({
        where: {
          workspaceId: user.workspaceId,
          status,
          ...(ziel === undefined ? {} : { zielArt: ziel.art, zielId: ziel.id }),
        },
        order: { createdAt: 'DESC', id: 'DESC' },
        skip: ab,
        take: BLOCK,
        relations: { entschiedenVon: true },
      });

      sichtbar.push(...(await this.nurSichtbare(user, block)));

      if (block.length < BLOCK) {
        break;
      }
    }

    return sichtbar.slice(0, grenze);
  }

  async anzahlOffen(user: RequestUser): Promise<number> {
    const rolle = await this.permissions.permissionsOf(user);
    const alleArten =
      rolle !== null &&
      Object.values(LESERECHT).every((recht) => roleAllows(rolle, recht));

    if (alleArten && !(await irgendwoEingeschraenkt())) {
      return this.vorschlaege.countBy({
        workspaceId: user.workspaceId,
        status: 'offen',
      });
    }

    return (await this.liste(user, ['offen'])).length;
  }

  private async nurSichtbare(
    user: RequestUser,
    zeilen: KiVorschlagEntity[],
  ): Promise<KiVorschlagEntity[]> {
    const rolle = await this.permissions.permissionsOf(user);
    const nachArt = zeilen.filter(
      (zeile) =>
        zeile.zielArt === null ||
        (rolle !== null && roleAllows(rolle, LESERECHT[zeile.zielArt])),
    );

    return nurSichtbareZeilen(
      this.vorschlaege.manager,
      'ki_vorschlaege',
      nachArt,
    );
  }

  private async sichtbarer(
    user: RequestUser,
    id: string,
  ): Promise<KiVorschlagEntity> {
    const zeile = await this.vorschlaege.findOne({
      where: { id, workspaceId: user.workspaceId },
      relations: { entschiedenVon: true },
    });
    const [sichtbar] =
      zeile === null ? [] : await this.nurSichtbare(user, [zeile]);

    if (sichtbar === undefined) {
      throw new NotFoundException('Diesen Vorschlag gibt es nicht.');
    }

    return sichtbar;
  }

  async annehmen(
    user: RequestUser,
    req: unknown,
    id: string,
    trotzdem: boolean,
  ): Promise<AnnahmeErgebnis> {
    const vorschlag = await this.sichtbarer(user, id);

    if (vorschlag.status !== 'offen') {
      throw new BadRequestException('Über diesen Vorschlag ist entschieden.');
    }

    const werkzeug = WERKZEUGE.find((w) => w.name === vorschlag.werkzeug);

    if (werkzeug?.vorschlag === undefined) {
      throw new BadRequestException(
        'Dieses Werkzeug gibt es nicht mehr; bitte den Vorschlag verwerfen.',
      );
    }

    const plan = werkzeug.vorschlag(vorschlag.eingabe);

    if (plan.ziel !== null) {
      const gelesen = await this.lesen(req, plan.ziel);

      if (gelesen.datensatz === null) {
        throw new BadRequestException(gelesen.meldung);
      }

      const grund = plan.pruefe?.(gelesen.datensatz) ?? null;

      if (grund !== null) {
        throw new BadRequestException(grund);
      }

      if (vorschlag.vorher !== null && plan.vorher !== undefined) {
        const aktuell = plan.vorher(gelesen.datensatz);

        if (!gleicherStand(aktuell, vorschlag.vorher) && !trotzdem) {
          return { vorschlag, veraltet: true, aktuell };
        }
      }
    }

    const beansprucht = await this.vorschlaege.update(
      { id, workspaceId: user.workspaceId, status: 'offen' },
      {
        status: 'angenommen',
        entschiedenVonId: user.userId,
        entschiedenAm: new Date(),
        fehler: null,
      },
    );

    if ((beansprucht.affected ?? 0) === 0) {
      throw new BadRequestException(
        'Über diesen Vorschlag hat gerade jemand anderes entschieden.',
      );
    }

    const { ergebnis, meldungen } = await fuehreAus(
      this.schema(),
      werkzeug.abfragen(vorschlag.eingabe),
      { req, kiVorschlagId: vorschlag.id },
    );

    if (Object.keys(ergebnis).length === 0) {
      const grund = meldungen.join(' ') || 'Das ging nicht durch.';

      await this.vorschlaege.update(
        { id, workspaceId: user.workspaceId },
        {
          status: 'offen',
          entschiedenVonId: null,
          entschiedenAm: null,
          fehler: grund.slice(0, 2000),
        },
      );

      throw new BadRequestException(grund);
    }

    await this.vorschlaege.update(
      { id, workspaceId: user.workspaceId },
      { ergebnis: ergebnis as never },
    );

    meldeSicherheit({
      art: 'ki_vorschlag_angenommen',
      workspaceId: user.workspaceId,
      actorId: user.userId,
      details: {
        werkzeug: vorschlag.werkzeug,
        schluessel: vorschlag.schluesselName,
      },
    });

    return {
      vorschlag: await this.sichtbarer(user, id),
      veraltet: false,
      aktuell: null,
    };
  }

  async verwerfen(
    user: RequestUser,
    id: string,
    grund: string | null,
  ): Promise<KiVorschlagEntity> {
    await this.sichtbarer(user, id);

    const ergebnis = await this.vorschlaege.update(
      { id, workspaceId: user.workspaceId, status: 'offen' },
      {
        status: 'verworfen',
        entschiedenVonId: user.userId,
        entschiedenAm: new Date(),
        grund:
          grund === null || grund.trim() === ''
            ? null
            : grund.trim().slice(0, 500),
      },
    );

    if ((ergebnis.affected ?? 0) === 0) {
      throw new BadRequestException('Über diesen Vorschlag ist entschieden.');
    }

    meldeSicherheit({
      art: 'ki_vorschlag_verworfen',
      workspaceId: user.workspaceId,
      actorId: user.userId,
    });

    return this.sichtbarer(user, id);
  }
}
