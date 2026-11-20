import { UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  Int,
  ObjectType,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import {
  getRequestContext,
  type RequestContext,
} from '../observability/request-context';
import { UserEntity } from '../users/user.entity';
import {
  type FeldArt,
  feldrechteJetzt,
  ohneVerborgeneEigene,
  STANDARD_FELDRECHTE,
} from '../workspaces/feldrechte';
import { Permission, roleAllows } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import {
  eingeschraenktAuf,
  istSichtbar,
  sichtbarkeitsBedingung,
} from '../workspaces/sichtbarkeit';
import {
  aufgabenBedingung,
  notizBedingung,
} from '../workspaces/ziel-sichtbarkeit';
import { AuditAction, AuditLogEntity } from './audit-log.entity';

export const sichtbareEintraege = async (
  alias: string,
): Promise<{ where: string; parameters: Record<string, unknown> } | null> => {
  const teile: string[] = [];
  const parameters: Record<string, unknown> = {};
  const arten: [
    string,
    string,
    () => Promise<{
      where: string;
      parameters: Record<string, unknown>;
    } | null>,
  ][] = [
    [
      'Company',
      'companies',
      () => sichtbarkeitsBedingung('company', 'v_company'),
    ],
    [
      'Contact',
      'contacts',
      () => sichtbarkeitsBedingung('contact', 'v_contact'),
    ],
    ['Deal', 'deals', () => sichtbarkeitsBedingung('deal', 'v_deal')],
    ['Task', 'tasks', () => aufgabenBedingung('v_task')],
    ['Note', 'notes', () => notizBedingung('v_note')],
  ];
  let eingeschraenkt = false;

  for (const [typ, tabelle, bedingung] of arten) {
    const b = await bedingung();
    const tabellenAlias = `v_${typ.toLowerCase()}`;

    if (b === null) {
      teile.push(`${alias}."entityType" = '${typ}'`);
    } else {
      eingeschraenkt = true;
      teile.push(
        `(${alias}."entityType" = '${typ}' AND EXISTS (SELECT 1 FROM "${tabelle}" ${tabellenAlias} WHERE ${tabellenAlias}."id" = ${alias}."entityId" AND ${b.where}))`,
      );
      Object.assign(parameters, b.parameters);
    }
  }

  return eingeschraenkt
    ? { where: `(${teile.join(' OR ')})`, parameters }
    : null;
};

export const LESERECHT: Record<string, readonly Permission[]> = {
  Company: [Permission.COMPANY_VIEW],
  Contact: [Permission.CONTACT_VIEW],
  Deal: [Permission.DEAL_VIEW],
  Task: [Permission.TASK_VIEW],
  Note: [
    Permission.COMPANY_VIEW,
    Permission.CONTACT_VIEW,
    Permission.DEAL_VIEW,
  ],
};

const FELDART_DES_EINTRAGS: Record<string, FeldArt | undefined> = {
  Company: 'company',
  Contact: 'contact',
  Deal: 'deal',
  Task: 'task',
};

export type KontaktSichtbar = (kontaktId: string | null) => Promise<boolean>;

const kontakteUneingeschraenkt: KontaktSichtbar = async () =>
  (await eingeschraenktAuf('contact')) === null;

const ohneFremdeBeteiligte = async (
  changes: Record<string, [unknown, unknown]>,
  kontaktSichtbar: KontaktSichtbar,
): Promise<Record<string, [unknown, unknown]>> => {
  if (!('beteiligte' in changes) && !('beteiligteKontaktId' in changes)) {
    return changes;
  }

  const { beteiligteKontaktId, ...rest } = changes;
  const kontaktId = (
    beteiligteKontaktId as [unknown, unknown] | undefined
  )?.[1];

  if (
    !('beteiligte' in rest) ||
    (await kontaktSichtbar(typeof kontaktId === 'string' ? kontaktId : null))
  ) {
    return rest;
  }

  const [vorher, nachher] = rest.beteiligte;

  return {
    ...rest,
    beteiligte: [
      vorher === null ? null : 'Nicht sichtbar',
      nachher === null ? null : 'Nicht sichtbar',
    ],
  };
};

export const aenderungenFuerLeser = async (
  entry: Pick<AuditLogEntity, 'changes' | 'entityType'>,
  kontaktSichtbar: KontaktSichtbar = kontakteUneingeschraenkt,
): Promise<string | null> => {
  if (entry.changes === null) {
    return null;
  }

  const changes = await ohneFremdeBeteiligte(entry.changes, kontaktSichtbar);
  const art = FELDART_DES_EINTRAGS[entry.entityType];
  const rechte = art === undefined ? {} : await feldrechteJetzt();

  if (art === undefined || Object.keys(rechte).length === 0) {
    return JSON.stringify(changes);
  }

  const verborgen = new Set(
    STANDARD_FELDRECHTE.filter(
      (eintrag) =>
        eintrag.art === art && rechte[eintrag.schluessel] === 'verborgen',
    ).flatMap((eintrag) => [eintrag.feld, ...(eintrag.auch ?? [])]),
  );
  const sichtbar = Object.fromEntries(
    Object.entries(changes)
      .filter(([feld]) => !verborgen.has(feld))
      .map(([feld, [vorher, nachher]]) =>
        feld === 'customFields'
          ? [
              feld,
              [
                ohneVerborgeneEigene(
                  rechte,
                  art,
                  vorher as Record<string, unknown> | null,
                ),
                ohneVerborgeneEigene(
                  rechte,
                  art,
                  nachher as Record<string, unknown> | null,
                ),
              ],
            ]
          : [feld, [vorher, nachher]],
      ),
  );

  return JSON.stringify(sichtbar);
};

@ObjectType()
export class Herkunft {
  @Field(() => String, { nullable: true })
  erstelltVon: string | null;

  @Field(() => Date, { nullable: true })
  erstelltAm: Date | null;

  @Field(() => String, { nullable: true })
  geaendertVon: string | null;

  @Field(() => Date, { nullable: true })
  geaendertAm: Date | null;

  @Field(() => String, { nullable: true })
  quelle?: string | null;
}

const TABELLE_MIT_HERKUNFT: Record<string, string> = {
  Company: 'companies',
  Contact: 'contacts',
  Deal: 'deals',
};

const darfKontakteJeAnfrage = new WeakMap<RequestContext, Promise<boolean>>();

@Resolver(() => AuditLogEntity)
@UseGuards(GqlAuthGuard)
export class AuditResolver {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly auditRepository: Repository<AuditLogEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly permissions: PermissionsService,
  ) {}

  @ResolveField(() => String)
  async actorName(@Parent() entry: AuditLogEntity): Promise<string> {
    if (entry.actorId === null) {
      return 'System';
    }

    const actor = await this.userRepository.findOne({
      where: { id: entry.actorId },
    });

    if (actor === null) {
      return 'Entfernter Benutzer';
    }

    return `${actor.firstName} ${actor.lastName}`;
  }

  @ResolveField(() => String, { nullable: true })
  changes(
    @CurrentUser() user: RequestUser,
    @Parent() entry: AuditLogEntity,
  ): Promise<string | null> {
    return aenderungenFuerLeser(entry, (kontaktId) =>
      this.kontaktSichtbar(user, kontaktId),
    );
  }

  @Query(() => [AuditLogEntity])
  async auditLog(
    @CurrentUser() user: RequestUser,
    @Args('entityId', { type: () => ID, nullable: true }) entityId?: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<AuditLogEntity[]> {
    const rolle = await this.permissions.permissionsOf(user);
    const sichtbar = Object.entries(LESERECHT)
      .filter(([, rechte]) => rechte.every((recht) => roleAllows(rolle, recht)))
      .map(([typ]) => typ);

    if (sichtbar.length === 0) {
      return [];
    }

    const abfrage = this.auditRepository
      .createQueryBuilder('eintrag')
      .where('eintrag."workspaceId" = :workspaceId', {
        workspaceId: user.workspaceId,
      })
      .andWhere('eintrag."entityType" IN (:...sichtbar)', { sichtbar })
      .orderBy('eintrag."createdAt"', 'DESC')
      .take(Math.min(limit ?? 50, 200));

    if (entityId !== undefined) {
      abfrage.andWhere('eintrag."entityId" = :entityId', { entityId });
    }

    const zeilen = await sichtbareEintraege('eintrag');

    if (zeilen !== null) {
      abfrage.andWhere(zeilen.where, zeilen.parameters);
    }

    return abfrage.getMany();
  }

  private async kontaktSichtbar(
    user: RequestUser,
    kontaktId: string | null,
  ): Promise<boolean> {
    if (!(await this.darfKontakte(user))) {
      return false;
    }

    if ((await eingeschraenktAuf('contact')) === null) {
      return true;
    }

    if (kontaktId === null) {
      return false;
    }

    const [kontakt] = (await this.auditRepository.query(
      `SELECT "ownerId" FROM "contacts" WHERE "id" = $1 AND "workspaceId" = $2`,
      [kontaktId, user.workspaceId],
    )) as { ownerId: string | null }[];

    return (
      kontakt !== undefined &&
      istSichtbar('contact', kontakt.ownerId, kontaktId)
    );
  }

  private darfKontakte(user: RequestUser): Promise<boolean> {
    const kontext = getRequestContext();
    const vorhanden =
      kontext === undefined ? undefined : darfKontakteJeAnfrage.get(kontext);

    if (vorhanden !== undefined) {
      return vorhanden;
    }

    const antwort = this.permissions.can(user, Permission.CONTACT_VIEW);

    if (kontext !== undefined) {
      darfKontakteJeAnfrage.set(kontext, antwort);
    }

    return antwort;
  }

  @Query(() => Herkunft)
  async herkunft(
    @CurrentUser() user: RequestUser,
    @Args('entityType') entityType: string,
    @Args('entityId', { type: () => ID }) entityId: string,
  ): Promise<Herkunft> {
    const rechte = LESERECHT[entityType] ?? [];
    const rolle = await this.permissions.permissionsOf(user);

    if (
      rechte.length === 0 ||
      !rechte.every((recht) => roleAllows(rolle, recht))
    ) {
      return {
        erstelltVon: null,
        erstelltAm: null,
        geaendertVon: null,
        geaendertAm: null,
      };
    }

    const zeilen = await sichtbareEintraege('eintrag');

    if (
      zeilen !== null &&
      (await this.auditRepository
        .createQueryBuilder('eintrag')
        .where('eintrag."workspaceId" = :workspaceId', {
          workspaceId: user.workspaceId,
        })
        .andWhere('eintrag."entityType" = :entityType', { entityType })
        .andWhere('eintrag."entityId" = :entityId', { entityId })
        .andWhere(zeilen.where, zeilen.parameters)
        .getCount()) === 0
    ) {
      return {
        erstelltVon: null,
        erstelltAm: null,
        geaendertVon: null,
        geaendertAm: null,
      };
    }

    const wo = { workspaceId: user.workspaceId, entityType, entityId };
    const [angelegt, geaendert] = await Promise.all([
      this.auditRepository.findOne({
        where: { ...wo, action: AuditAction.CREATED },
        order: { createdAt: 'ASC' },
      }),
      this.auditRepository.findOne({
        where: {
          ...wo,
          action: In([AuditAction.UPDATED, AuditAction.RESTORED]),
        },
        order: { createdAt: 'DESC' },
      }),
    ]);

    const tabelle = TABELLE_MIT_HERKUNFT[entityType];
    const [quelle] =
      tabelle === undefined
        ? []
        : ((await this.auditRepository.query(
            `SELECT "herkunft" FROM "${tabelle}" WHERE "id" = $1 AND "workspaceId" = $2`,
            [entityId, user.workspaceId],
          )) as { herkunft: string | null }[]);

    return {
      quelle: quelle?.herkunft ?? null,
      erstelltVon: angelegt === null ? null : await this.actorName(angelegt),
      erstelltAm: angelegt?.createdAt ?? null,
      geaendertVon: geaendert === null ? null : await this.actorName(geaendert),
      geaendertAm: geaendert?.createdAt ?? null,
    };
  }
}
