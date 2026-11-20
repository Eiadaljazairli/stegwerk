import { UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Args,
  Field,
  ID,
  InputType,
  Int,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { InjectDataSource } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { type DataSource } from 'typeorm';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { csvHeader, csvRow } from '../export/csv';
import { meldeSicherheit } from '../sicherheit/melden';
import { fristen } from '../ueberwachung/protokoll-aufbewahrung';
import { Permission, roleAllows } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { type AuditLogEntity } from './audit-log.entity';
import {
  aenderungenFuerLeser,
  LESERECHT,
  sichtbareEintraege,
} from './audit.resolver';

const SEITE_MAX = 200;
const CSV_MAX = 5000;
const VERSATZ_MAX = 5000;

const ZEIT_CSV = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'Europe/Berlin',
});

@InputType()
export class BereichsprotokollFilter {
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  personId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsIn(['aenderung', 'sicherheit'])
  quelle?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsIn(Object.keys(LESERECHT))
  objekt?: string;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  von?: Date;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  bis?: Date;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(SEITE_MAX)
  limit?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(VERSATZ_MAX)
  offset?: number;
}

@ObjectType()
export class BereichsprotokollEintrag {
  @Field(() => ID)
  id: string;

  @Field()
  quelle: string;

  @Field(() => Date)
  zeit: Date;

  @Field(() => String, { nullable: true })
  wer: string | null;

  @Field()
  art: string;

  @Field(() => String, { nullable: true })
  objekt: string | null;

  @Field(() => ID, { nullable: true })
  objektId: string | null;

  @Field(() => String, { nullable: true })
  zusammenfassung: string | null;

  @Field(() => String, { nullable: true })
  einzelheiten: string | null;

  @Field(() => String, { nullable: true })
  geraet: string | null;
}

@ObjectType()
export class Bereichsprotokoll {
  @Field(() => [BereichsprotokollEintrag])
  eintraege: BereichsprotokollEintrag[];

  @Field()
  weitere: boolean;

  @Field(() => Int)
  aenderungenMonate: number;

  @Field(() => Int)
  sicherheitMonate: number;
}

type Zeile = BereichsprotokollEintrag & { actorId: string | null };

@Resolver()
@UseGuards(GqlAuthGuard)
export class BereichsprotokollResolver {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly permissions: PermissionsService,
    private readonly config: ConfigService,
  ) {}

  @Query(() => Bereichsprotokoll)
  async bereichsprotokoll(
    @CurrentUser() user: RequestUser,
    @Args('filter', { nullable: true }) filter?: BereichsprotokollFilter,
  ): Promise<Bereichsprotokoll> {
    await this.permissions.assert(
      user,
      Permission.AUDIT_VIEW,
      'das Protokoll des Bereichs zu sehen',
    );

    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;
    const zeilen = await this.laden(user, filter ?? {}, offset + limit + 1);
    const frist = fristen(
      this.config.get<{ aenderungenMonate: number; sicherheitMonate: number }>(
        'protokolle',
      ),
    );

    return {
      eintraege: zeilen.slice(offset, offset + limit),
      weitere: zeilen.length > offset + limit,
      aenderungenMonate: frist.aenderungen,
      sicherheitMonate: frist.sicherheit,
    };
  }

  @Query(() => String)
  async bereichsprotokollCsv(
    @CurrentUser() user: RequestUser,
    @Args('filter', { nullable: true }) filter?: BereichsprotokollFilter,
  ): Promise<string> {
    await this.permissions.assert(
      user,
      Permission.AUDIT_VIEW,
      'das Protokoll des Bereichs zu exportieren',
    );

    const zeilen = await this.laden(user, filter ?? {}, CSV_MAX);

    meldeSicherheit({
      art: 'export',
      workspaceId: user.workspaceId,
      actorId: user.apiKey === undefined ? user.userId : null,
      details: { liste: 'PROTOKOLL', zeilen: zeilen.length },
    });

    return (
      csvHeader([
        'Zeit',
        'Quelle',
        'Person',
        'Art',
        'Objekt',
        'Objekt-ID',
        'Zusammenfassung',
        'Einzelheiten',
        'Gerät',
      ]) +
      zeilen
        .map((z) =>
          csvRow([
            ZEIT_CSV.format(z.zeit),
            z.quelle === 'aenderung' ? 'Änderung' : 'Sicherheit',
            z.wer,
            z.art,
            z.objekt,
            z.objektId,
            z.zusammenfassung,
            z.einzelheiten,
            z.geraet,
          ]),
        )
        .join('')
    );
  }

  private async laden(
    user: RequestUser,
    filter: BereichsprotokollFilter,
    anzahl: number,
  ): Promise<Zeile[]> {
    const [aenderungen, sicherheit] = await Promise.all([
      filter.quelle === 'sicherheit'
        ? []
        : this.aenderungen(user, filter, anzahl),
      filter.quelle === 'aenderung' || filter.objekt !== undefined
        ? []
        : this.sicherheit(user, filter, anzahl),
    ]);
    const zeilen = [...aenderungen, ...sicherheit]
      .sort((a, b) => b.zeit.getTime() - a.zeit.getTime())
      .slice(0, anzahl);

    return this.mitNamen(user.workspaceId, zeilen);
  }

  private async aenderungen(
    user: RequestUser,
    filter: BereichsprotokollFilter,
    anzahl: number,
  ): Promise<Zeile[]> {
    const rolle = await this.permissions.permissionsOf(user);
    const arten = Object.entries(LESERECHT)
      .filter(([, rechte]) => rechte.every((recht) => roleAllows(rolle, recht)))
      .map(([typ]) => typ)
      .filter((typ) => filter.objekt === undefined || typ === filter.objekt);

    if (arten.length === 0) {
      return [];
    }

    const abfrage = this.dataSource
      .createQueryBuilder()
      .select('eintrag')
      .from('audit_log', 'eintrag')
      .where('eintrag."workspaceId" = :workspaceId', {
        workspaceId: user.workspaceId,
      })
      .andWhere('eintrag."entityType" IN (:...arten)', { arten })
      .orderBy('eintrag."createdAt"', 'DESC')
      .limit(anzahl);

    this.zeitUndPerson(abfrage, filter, 'eintrag', 'actorId');

    const sichtbar = await sichtbareEintraege('eintrag');

    if (sichtbar !== null) {
      abfrage.andWhere(sichtbar.where, sichtbar.parameters);
    }

    const roh = (await abfrage.getRawMany()) as Record<string, unknown>[];
    const eintraege = roh.map((zeile) => ({
      id: zeile.eintrag_id as string,
      actorId: zeile.eintrag_actorId as string | null,
      action: zeile.eintrag_action as string,
      entityType: zeile.eintrag_entityType as string,
      entityId: zeile.eintrag_entityId as string,
      summary: zeile.eintrag_summary as string | null,
      changes: zeile.eintrag_changes as AuditLogEntity['changes'],
      createdAt: zeile.eintrag_createdAt as Date,
    }));

    const kontaktSichtbar = roleAllows(rolle, Permission.CONTACT_VIEW)
      ? undefined
      : async () => false;

    return Promise.all(
      eintraege.map(async (e) => ({
        id: e.id,
        quelle: 'aenderung',
        zeit: new Date(e.createdAt),
        wer: null,
        actorId: e.actorId,
        art: e.action,
        objekt: e.entityType,
        objektId: e.entityId,
        zusammenfassung: e.summary,
        einzelheiten: await aenderungenFuerLeser(e, kontaktSichtbar),
        geraet: null,
      })),
    );
  }

  private async sicherheit(
    user: RequestUser,
    filter: BereichsprotokollFilter,
    anzahl: number,
  ): Promise<Zeile[]> {
    const abfrage = this.dataSource
      .createQueryBuilder()
      .select('ereignis')
      .from('sicherheits_ereignisse', 'ereignis')
      .where('ereignis."workspaceId" = :workspaceId', {
        workspaceId: user.workspaceId,
      })
      .orderBy('ereignis."createdAt"', 'DESC')
      .limit(anzahl);

    this.zeitUndPerson(abfrage, filter, 'ereignis', 'actorId', 'userId');

    const roh = (await abfrage.getRawMany()) as Record<string, unknown>[];

    return roh.map((z) => ({
      id: z.ereignis_id as string,
      quelle: 'sicherheit',
      zeit: new Date(z.ereignis_createdAt as Date),
      wer: null,
      actorId: (z.ereignis_actorId ?? z.ereignis_userId) as string | null,
      art: z.ereignis_art as string,
      objekt: null,
      objektId: null,
      zusammenfassung: null,
      einzelheiten:
        z.ereignis_details === null ? null : JSON.stringify(z.ereignis_details),
      geraet: (z.ereignis_geraet as string | null) ?? null,
    }));
  }

  private zeitUndPerson(
    abfrage: ReturnType<DataSource['createQueryBuilder']>,
    filter: BereichsprotokollFilter,
    alias: string,
    ...personSpalten: string[]
  ): void {
    if (filter.von !== undefined) {
      abfrage.andWhere(`${alias}."createdAt" >= :von`, { von: filter.von });
    }

    if (filter.bis !== undefined) {
      abfrage.andWhere(`${alias}."createdAt" <= :bis`, { bis: filter.bis });
    }

    if (filter.personId !== undefined) {
      abfrage.andWhere(
        `(${personSpalten.map((s) => `${alias}."${s}" = :personId`).join(' OR ')})`,
        { personId: filter.personId },
      );
    }
  }

  private async mitNamen(
    workspaceId: string,
    zeilen: Zeile[],
  ): Promise<Zeile[]> {
    const ids = [
      ...new Set(
        zeilen.map((z) => z.actorId).filter((id): id is string => id !== null),
      ),
    ];
    const namen = new Map<string, string>(
      ids.length === 0
        ? []
        : (
            (await this.dataSource.query(
              `SELECT "id", "firstName", "lastName", "email" FROM "users"
                WHERE "id" = ANY($1)`,
              [ids],
            )) as {
              id: string;
              firstName: string;
              lastName: string;
              email: string;
            }[]
          ).map((u) => [
            u.id,
            `${u.firstName} ${u.lastName}`.trim() || u.email,
          ]),
    );
    const offen = ids.filter((id) => !namen.has(id));

    if (offen.length > 0) {
      const schluessel = (await this.dataSource.query(
        `SELECT "id", "name" FROM "api_keys"
          WHERE "id" = ANY($1) AND "workspaceId" = $2`,
        [offen, workspaceId],
      )) as { id: string; name: string }[];

      for (const k of schluessel) {
        namen.set(k.id, `API-Schlüssel „${k.name}“`);
      }
    }

    return zeilen.map((z) => ({
      ...z,
      wer:
        z.actorId === null
          ? ohnePerson(z)
          : (namen.get(z.actorId) ?? 'Entfernte Person'),
    }));
  }
}

const ohnePerson = (z: Zeile): string => {
  if (z.quelle === 'sicherheit' && z.einzelheiten !== null) {
    try {
      const d = JSON.parse(z.einzelheiten) as Record<string, unknown>;

      if (typeof d.schluessel === 'string') {
        return `API-Schlüssel „${d.schluessel}“`;
      }
    } catch {}
  }

  return 'System';
};
