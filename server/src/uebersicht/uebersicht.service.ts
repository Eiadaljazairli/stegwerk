import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  type DataSource,
  type EntityTarget,
  In,
  IsNull,
  type ObjectLiteral,
  type SelectQueryBuilder,
} from 'typeorm';

import {
  aufgabenBedingung,
  zielBedingung,
} from '../workspaces/ziel-sichtbarkeit';
import { BERLIN_HEUTE_SQL, berlinWandzeitSql } from '../calendar/berlin-time';
import { letzteAktivitaetSql, RUHEND_AB_TAGEN } from '../crm/aktivitaet';
import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import {
  DealEntity,
  DealStage,
  OPEN_DEAL_STAGES,
} from '../crm/entities/deal.entity';
import { TaskEntity } from '../crm/entities/task.entity';
import { InvoiceEntity } from '../invoices/invoice.entity';
import { InvoiceStatus } from '../invoices/invoice.types';
import { pipelineBedingung, phasenFuer } from '../crm/pipelines';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import {
  CustomFieldEntity,
  CustomFieldType,
} from '../custom-fields/custom-field.types';
import { abgeschlossenAm } from '../custom-fields/standard-felder';
import { UserEntity } from '../users/user.entity';
import { eigenesSchluessel, istVerborgen } from '../workspaces/feldrechte';
import { sichtbarkeitsBedingung } from '../workspaces/sichtbarkeit';
import {
  EIGENES_FELD_GRUPPE,
  istZeitraster,
  type Kachel,
  type KachelObjekt,
  pruefeKacheln,
  STANDARD_KACHELN,
} from './kacheln';
import { abschnitte, standardFenster, zeitAusdruck } from './zeitraster';
import { UebersichtEntity } from './uebersicht.entity';
import {
  type KachelBalken,
  type KachelEintrag,
  type KachelErgebnis,
} from './uebersicht.dto';

const ENTITAET: Record<KachelObjekt, EntityTarget<ObjectLiteral>> = {
  deal: DealEntity,
  company: CompanyEntity,
  contact: ContactEntity,
  task: TaskEntity,
  invoice: InvoiceEntity,
};

export const RECHNUNG_NETTO_SQL = `(SELECT COALESCE(SUM(round(l."quantity" * l."unitPriceCents" * (100 - l."discountPercent") / 100)), 0)
    FROM "invoice_lines" l WHERE l."invoiceId" = r."id") / 100.0`;

const betragSql = (objekt: KachelObjekt | null): string =>
  objekt === 'invoice' ? RECHNUNG_NETTO_SQL : 'r."amount"';

const MAX_BALKEN = 12;
const LISTE_LAENGE = 8;

const HERKUNFT_NAME: Record<string, string> = {
  manuell: 'Von Hand',
  import: 'Import',
  webformular: 'Webformular',
  api: 'Schnittstelle',
  mail: 'Mailvorschlag',
  automation: 'Automation',
  '': 'Unbekannt',
};

const STUFE_NAME = new Map(
  Object.entries(DealStage).map(([name, wert]) => [wert as string, name]),
);

export const leer = (teil: Partial<KachelErgebnis> = {}): KachelErgebnis => ({
  gesperrt: false,
  hinweis: null,
  betraegeVerborgen: false,
  anzahl: null,
  wert: null,
  balken: [],
  eintraege: [],
  ...teil,
});

const euro = (betrag: number | null, waehrung = 'EUR'): string | null => {
  if (betrag === null) {
    return null;
  }

  try {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: waehrung,
      maximumFractionDigits: 0,
    }).format(Number(betrag));
  } catch {
    return `${String(betrag)} ${waehrung}`;
  }
};

type Zeile = {
  schluessel: string | null;
  anzahl: number | string;
  summe?: string | null;
  schnitt?: string | null;
};

@Injectable()
export class UebersichtService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async laden(userId: string, workspaceId: string): Promise<Kachel[]> {
    const zeile = await this.dataSource
      .getRepository(UebersichtEntity)
      .findOne({ where: { userId, workspaceId } });

    return zeile?.kacheln ?? STANDARD_KACHELN;
  }

  async speichern(
    userId: string,
    workspaceId: string,
    roh: Record<string, unknown>[],
  ): Promise<Kachel[]> {
    const kacheln = pruefeKacheln(roh);

    await this.dataSource
      .getRepository(UebersichtEntity)
      .upsert({ userId, workspaceId, kacheln }, ['userId', 'workspaceId']);

    return kacheln;
  }

  async zuruecksetzen(userId: string, workspaceId: string): Promise<Kachel[]> {
    await this.dataSource
      .getRepository(UebersichtEntity)
      .delete({ userId, workspaceId });

    return STANDARD_KACHELN;
  }

  async werte(
    workspaceId: string,
    userId: string,
    kachel: Kachel,
  ): Promise<KachelErgebnis> {
    switch (kachel.typ) {
      case 'kennzahl':
        return this.kennzahl(workspaceId, userId, kachel);
      case 'balken':
        return this.balken(workspaceId, userId, kachel);
      case 'liste':
        return this.liste(workspaceId, userId, kachel);
      default:
        return leer();
    }
  }

  private async betragsMass(
    kachel: Kachel,
  ): Promise<{ mitBetrag: boolean; verborgen: boolean }> {
    if (kachel.mass === 'anzahl' || kachel.mass === null) {
      return { mitBetrag: false, verborgen: false };
    }

    if (kachel.objekt === 'invoice') {
      return { mitBetrag: true, verborgen: false };
    }

    if (kachel.objekt !== 'deal') {
      return { mitBetrag: false, verborgen: false };
    }

    const verborgen = await istVerborgen('deal.amount');

    return { mitBetrag: !verborgen, verborgen };
  }

  private async basis(
    workspaceId: string,
    userId: string,
    kachel: Kachel,
  ): Promise<{ abfrage: SelectQueryBuilder<ObjectLiteral>; datum: string }> {
    const objekt = kachel.objekt as KachelObjekt;
    const abfrage = this.dataSource
      .getRepository(ENTITAET[objekt])
      .createQueryBuilder('r')
      .where('r."workspaceId" = :workspaceId', { workspaceId });

    const sicht =
      objekt === 'task'
        ? await aufgabenBedingung('r')
        : objekt === 'invoice'
          ? await zielBedingung('r')
          : await sichtbarkeitsBedingung(objekt, 'r');

    if (sicht !== null) {
      abfrage.andWhere(sicht.where, sicht.parameters);
    }

    let datum = berlinWandzeitSql('r."createdAt"');
    const status = kachel.status;

    if (objekt === 'deal' && status !== null && status !== 'alle') {
      if (status === 'offen' || status === 'ruhend') {
        abfrage.andWhere('r."stage" IN (:...offen)', {
          offen: OPEN_DEAL_STAGES,
        });
      } else if (status === 'gewonnen' || status === 'verloren') {
        abfrage.andWhere('r."stage" = :abschluss', {
          abschluss: status === 'gewonnen' ? DealStage.WON : DealStage.LOST,
        });
        datum = `(${abgeschlossenAm('r')})::timestamp`;
      } else {
        abfrage.andWhere('r."stage" = :phase', { phase: status });
      }

      if (status === 'ruhend') {
        abfrage.andWhere(
          `${letzteAktivitaetSql('r')} < now() - make_interval(days => :ruhendTage)`,
          { ruhendTage: RUHEND_AB_TAGEN },
        );
      }
    }

    if (objekt === 'task' && status !== null && status !== 'alle') {
      if (status === 'erledigt') {
        abfrage.andWhere('r."completedAt" IS NOT NULL');
        datum = berlinWandzeitSql('r."completedAt"');
      } else {
        abfrage.andWhere('r."completedAt" IS NULL');
      }

      if (status === 'ueberfaellig') {
        abfrage.andWhere(`r."dueDate" < ${BERLIN_HEUTE_SQL}`);
      }
    }

    if (objekt === 'invoice') {
      if (status === 'offen') {
        abfrage.andWhere(
          'r."status" = :gestellt AND r."correctsInvoiceId" IS NULL',
          { gestellt: InvoiceStatus.ISSUED },
        );
      } else if (status === 'bezahlt') {
        abfrage.andWhere(
          'r."status" = :bezahlt AND r."correctsInvoiceId" IS NULL',
          { bezahlt: InvoiceStatus.PAID },
        );
      } else {
        abfrage.andWhere('r."status" <> :entwurf', {
          entwurf: InvoiceStatus.DRAFT,
        });
      }

      datum = 'r."issuedOn"::timestamp';
    }

    if (objekt === 'deal' && kachel.pipelineId !== null) {
      abfrage.andWhere(pipelineBedingung('r', ':pipelineId'), {
        pipelineId: kachel.pipelineId,
      });
    }

    if (kachel.nurMeine) {
      abfrage.andWhere(
        objekt === 'task' ? 'r."assigneeId" = :ich' : 'r."ownerId" = :ich',
        { ich: userId },
      );
    }

    switch (kachel.zeitraum) {
      case '30':
      case '90':
      case '365':
        abfrage.andWhere(
          `(${datum})::date >= ${BERLIN_HEUTE_SQL} - CAST(:tage AS integer) AND (${datum})::date <= ${BERLIN_HEUTE_SQL}`,
          { tage: Number(kachel.zeitraum) },
        );
        break;
      case 'jahr':
        abfrage.andWhere(
          `(${datum})::date >= date_trunc('year', ${BERLIN_HEUTE_SQL})::date`,
        );
        break;
      default:
        break;
    }

    return { abfrage, datum };
  }

  private async kennzahl(
    workspaceId: string,
    userId: string,
    kachel: Kachel,
  ): Promise<KachelErgebnis> {
    const { mitBetrag, verborgen } = await this.betragsMass(kachel);
    const { abfrage } = await this.basis(workspaceId, userId, kachel);

    abfrage.select('COUNT(*)::int', 'anzahl');

    if (mitBetrag) {
      const betrag = betragSql(kachel.objekt);

      abfrage
        .addSelect(`COALESCE(SUM(${betrag}), 0)`, 'summe')
        .addSelect(`AVG(${betrag})`, 'schnitt');
    }

    const zeile = await abfrage.getRawOne<Zeile>();
    const anzahl = Number(zeile?.anzahl ?? 0);

    return leer({
      anzahl,
      betraegeVerborgen: verborgen,
      wert: mitBetrag ? this.wertAus(kachel, zeile) : null,
    });
  }

  private wertAus(kachel: Kachel, zeile: Zeile | undefined): number | null {
    const roh = kachel.mass === 'summe' ? zeile?.summe : zeile?.schnitt;

    if (roh === undefined && kachel.mass === 'summe') {
      return 0;
    }

    return roh === null || roh === undefined ? null : Number(roh);
  }

  private async balken(
    workspaceId: string,
    userId: string,
    kachel: Kachel,
  ): Promise<KachelErgebnis> {
    const objekt = kachel.objekt as KachelObjekt;
    const gruppe = kachel.gruppe as string;
    const feld = EIGENES_FELD_GRUPPE.exec(gruppe)?.[1];
    let definition: CustomFieldDefinition | null = null;

    if (feld !== undefined) {
      definition = await this.dataSource
        .getRepository(CustomFieldDefinition)
        .findOne({
          where: {
            workspaceId,
            entity: objekt as CustomFieldEntity,
            key: feld,
            type: CustomFieldType.SELECT,
            archivedAt: IsNull(),
          },
        });

      if (definition === null) {
        throw new BadRequestException(
          'Nach diesem Feld lässt sich nicht gruppieren.',
        );
      }

      if (
        await istVerborgen(
          eigenesSchluessel(objekt as Exclude<KachelObjekt, 'invoice'>, feld),
        )
      ) {
        return leer({
          gesperrt: true,
          hinweis: 'Dieses Feld ist für Ihre Rolle verborgen.',
        });
      }
    }

    const fuerAbfrage: Kachel =
      gruppe === 'verlustgrund' &&
      (kachel.status === null || kachel.status === 'alle')
        ? { ...kachel, status: 'verloren' }
        : kachel;
    const { mitBetrag, verborgen } = await this.betragsMass(kachel);
    const { abfrage, datum } = await this.basis(
      workspaceId,
      userId,
      fuerAbfrage,
    );

    let ausdruck: string;

    switch (gruppe) {
      case 'phase':
        ausdruck = 'r."stage"::text';
        break;
      case 'verantwortlich':
        ausdruck =
          objekt === 'task' ? 'r."assigneeId"::text' : 'r."ownerId"::text';
        break;
      case 'woche':
      case 'monat':
      case 'quartal':
      case 'jahr':
        ausdruck = zeitAusdruck(gruppe, datum);
        if (kachel.zeitraum === null || kachel.zeitraum === 'alle') {
          abfrage.andWhere(standardFenster(gruppe, datum));
        }
        break;
      case 'kunde':
        ausdruck = 'r."companyId"::text';
        break;
      case 'herkunft':
        if (objekt !== 'invoice') {
          ausdruck = `COALESCE(r."herkunft", '')`;
          break;
        }

        await this.firmaDazu(abfrage);
        ausdruck = `COALESCE(f."herkunft", '')`;
        break;
      case 'branche': {
        if (objekt === 'company') {
          ausdruck = `COALESCE(NULLIF(trim(r."industry"), ''), '')`;
          break;
        }

        await this.firmaDazu(abfrage);
        ausdruck = `COALESCE(NULLIF(trim(f."industry"), ''), '')`;
        break;
      }
      case 'verlustgrund':
        ausdruck = `COALESCE(NULLIF(trim(r."lostReason"), ''), '')`;
        break;
      default:
        ausdruck = `r."customFields" ->> :feldSchluessel`;
        abfrage.setParameter('feldSchluessel', feld);
    }

    abfrage.select(ausdruck, 'schluessel').addSelect('COUNT(*)::int', 'anzahl');

    if (mitBetrag) {
      const betrag = betragSql(objekt);

      abfrage
        .addSelect(`COALESCE(SUM(${betrag}), 0)`, 'summe')
        .addSelect(`AVG(${betrag})`, 'schnitt');
    }

    const zeilen = await abfrage.groupBy('1').getRawMany<Zeile>();
    const balken = (zeile: Zeile, schluessel: string, label: string) => ({
      schluessel,
      label,
      farbe: null as string | null,
      anzahl: Number(zeile.anzahl),
      wert: mitBetrag ? this.wertAus(kachel, zeile) : null,
    });

    let ergebnis: KachelBalken[];

    switch (gruppe) {
      case 'phase':
        ergebnis = await this.nachPhase(
          workspaceId,
          fuerAbfrage,
          zeilen,
          balken,
        );
        break;
      case 'verantwortlich':
        ergebnis = this.kappen(kachel, await this.nachPerson(zeilen, balken));
        break;
      case 'kunde':
        ergebnis = this.kappen(
          kachel,
          await this.nachFirma(workspaceId, zeilen, balken),
        );
        break;
      case 'woche':
      case 'monat':
      case 'quartal':
      case 'jahr':
        ergebnis = this.nachZeit(kachel, zeilen, balken);
        break;
      case 'herkunft':
        ergebnis = this.kappen(
          kachel,
          zeilen.map((zeile) =>
            balken(
              zeile,
              zeile.schluessel ?? '',
              HERKUNFT_NAME[zeile.schluessel ?? ''] ??
                zeile.schluessel ??
                'Unbekannt',
            ),
          ),
        );
        break;
      case 'branche':
        ergebnis = this.kappen(
          kachel,
          zeilen.map((zeile) =>
            balken(
              zeile,
              zeile.schluessel ?? '',
              zeile.schluessel === null || zeile.schluessel === ''
                ? 'Ohne Branche'
                : zeile.schluessel,
            ),
          ),
        );
        break;
      case 'verlustgrund':
        ergebnis = this.kappen(
          kachel,
          zeilen.map((zeile) =>
            balken(
              zeile,
              zeile.schluessel ?? '',
              zeile.schluessel === null || zeile.schluessel === ''
                ? 'Ohne Grund'
                : zeile.schluessel,
            ),
          ),
        );
        break;
      default:
        ergebnis = this.nachOption(
          definition as CustomFieldDefinition,
          zeilen,
          balken,
        );
    }

    return leer({
      betraegeVerborgen: verborgen,
      anzahl: ergebnis.reduce((summe, eintrag) => summe + eintrag.anzahl, 0),
      balken: ergebnis,
    });
  }

  private async nachPhase(
    workspaceId: string,
    kachel: Kachel,
    zeilen: Zeile[],
    balken: (zeile: Zeile, schluessel: string, label: string) => KachelBalken,
  ): Promise<KachelBalken[]> {
    const phasen = await phasenFuer(
      this.dataSource.manager,
      workspaceId,
      kachel.pipelineId,
    );
    const jeStufe = new Map(zeilen.map((zeile) => [zeile.schluessel, zeile]));
    const status = kachel.status;
    const passt = (stufe: DealStage): boolean => {
      if (status === null || status === 'alle') {
        return true;
      }

      if (status === 'offen' || status === 'ruhend') {
        return OPEN_DEAL_STAGES.includes(stufe);
      }

      if (status === 'gewonnen') {
        return stufe === DealStage.WON;
      }

      if (status === 'verloren') {
        return stufe === DealStage.LOST;
      }

      return stufe === status;
    };

    return phasen
      .filter(
        (phase) =>
          jeStufe.has(phase.stage) ||
          (!phase.ausgeblendet && passt(phase.stage)),
      )
      .map((phase) => ({
        ...balken(
          jeStufe.get(phase.stage) ?? { schluessel: phase.stage, anzahl: 0 },
          STUFE_NAME.get(phase.stage) ?? phase.stage,
          phase.label,
        ),
        farbe: phase.farbe,
      }));
  }

  private async firmaDazu(
    abfrage: SelectQueryBuilder<ObjectLiteral>,
  ): Promise<void> {
    const firmenSicht = await sichtbarkeitsBedingung('company', 'f');

    abfrage.leftJoin(
      CompanyEntity,
      'f',
      `f."id" = r."companyId" AND f."deletedAt" IS NULL${
        firmenSicht === null ? '' : ` AND ${firmenSicht.where}`
      }`,
      firmenSicht?.parameters ?? {},
    );
  }

  private async nachFirma(
    workspaceId: string,
    zeilen: Zeile[],
    balken: (zeile: Zeile, schluessel: string, label: string) => KachelBalken,
  ): Promise<KachelBalken[]> {
    const ids = zeilen
      .map((zeile) => zeile.schluessel)
      .filter((id): id is string => id !== null);
    const firmen = ids.length
      ? await this.dataSource.getRepository(CompanyEntity).find({
          where: { id: In(ids), workspaceId },
          select: ['id', 'name'],
          withDeleted: true,
        })
      : [];
    const name = new Map(firmen.map((firma) => [firma.id, firma.name]));

    return zeilen.map((zeile) =>
      balken(
        zeile,
        zeile.schluessel ?? '',
        zeile.schluessel === null
          ? 'Ohne Firma'
          : (name.get(zeile.schluessel) ?? 'Gelöschte Firma'),
      ),
    );
  }

  private async nachPerson(
    zeilen: Zeile[],
    balken: (zeile: Zeile, schluessel: string, label: string) => KachelBalken,
  ): Promise<KachelBalken[]> {
    const ids = zeilen
      .map((zeile) => zeile.schluessel)
      .filter((id): id is string => id !== null);
    const leute = ids.length
      ? await this.dataSource.getRepository(UserEntity).find({
          where: { id: In(ids) },
          select: ['id', 'firstName', 'lastName'],
        })
      : [];
    const name = new Map(
      leute.map((person) => [
        person.id,
        `${person.firstName} ${person.lastName}`.trim(),
      ]),
    );

    return zeilen.map((zeile) =>
      balken(
        zeile,
        zeile.schluessel ?? '',
        zeile.schluessel === null
          ? 'Niemand'
          : (name.get(zeile.schluessel) ?? 'Ehemaliges Mitglied'),
      ),
    );
  }

  private nachZeit(
    kachel: Kachel,
    zeilen: Zeile[],
    balken: (zeile: Zeile, schluessel: string, label: string) => KachelBalken,
  ): KachelBalken[] {
    const raster = kachel.gruppe;

    if (!istZeitraster(raster)) {
      return [];
    }

    const jeAbschnitt = new Map(
      zeilen.map((zeile) => [zeile.schluessel, zeile]),
    );

    return abschnitte(raster, kachel.zeitraum).map(({ schluessel, label }) =>
      balken(
        jeAbschnitt.get(schluessel) ?? { schluessel, anzahl: 0 },
        schluessel,
        label,
      ),
    );
  }

  private nachOption(
    definition: CustomFieldDefinition,
    zeilen: Zeile[],
    balken: (zeile: Zeile, schluessel: string, label: string) => KachelBalken,
  ): KachelBalken[] {
    const jeWert = new Map(
      zeilen.map((zeile) => [zeile.schluessel ?? '', zeile]),
    );
    const farben = definition.optionFarben ?? {};
    const ergebnis: KachelBalken[] = definition.options.map((option) => ({
      ...balken(
        jeWert.get(option) ?? { schluessel: option, anzahl: 0 },
        option,
        option,
      ),
      farbe: (farben as Record<string, string>)[option] ?? null,
    }));

    for (const [wert, zeile] of jeWert) {
      if (!definition.options.includes(wert)) {
        ergebnis.push({
          ...balken(zeile, wert, wert === '' ? 'Ohne Angabe' : wert),
          farbe: null,
        });
      }
    }

    return ergebnis;
  }

  private kappen(kachel: Kachel, balken: KachelBalken[]): KachelBalken[] {
    const mass = (eintrag: KachelBalken) => eintrag.wert ?? eintrag.anzahl;
    const sortiert = [...balken].sort((a, b) => mass(b) - mass(a));

    if (sortiert.length <= MAX_BALKEN) {
      return sortiert;
    }

    const rest = sortiert.slice(MAX_BALKEN - 1);

    return [
      ...sortiert.slice(0, MAX_BALKEN - 1),
      {
        schluessel: '__andere',
        label: `Andere (${String(rest.length)})`,
        farbe: null,
        anzahl: rest.reduce((summe, eintrag) => summe + eintrag.anzahl, 0),
        wert:
          kachel.mass === 'summe' && rest[0].wert !== null
            ? rest.reduce((summe, eintrag) => summe + (eintrag.wert ?? 0), 0)
            : null,
      },
    ];
  }

  private async liste(
    workspaceId: string,
    userId: string,
    kachel: Kachel,
  ): Promise<KachelErgebnis> {
    const liste = kachel.liste;
    const meine = kachel.nurMeine;

    if (liste === 'neueFirmen' || liste === 'neueKontakte') {
      const objekt = liste === 'neueFirmen' ? 'company' : 'contact';
      const { abfrage } = await this.basis(workspaceId, userId, {
        ...kachel,
        objekt,
        status: null,
        zeitraum: null,
        pipelineId: null,
        nurMeine: meine,
      });
      const zeilen = await abfrage
        .orderBy('r."createdAt"', 'DESC')
        .limit(LISTE_LAENGE)
        .getMany();

      return leer({
        eintraege: zeilen.map((zeile): KachelEintrag => {
          if (objekt === 'company') {
            const firma = zeile as CompanyEntity;

            return {
              id: firma.id,
              titel: firma.name,
              zusatz: firma.city,
              link: `/firmen/${firma.id}`,
            };
          }

          const kontakt = zeile as ContactEntity;

          return {
            id: kontakt.id,
            titel: `${kontakt.firstName} ${kontakt.lastName}`.trim(),
            zusatz: kontakt.jobTitle,
            link: `/kontakte/${kontakt.id}`,
          };
        }),
      });
    }

    const status =
      liste === 'ruhend' ? 'ruhend' : liste === 'gewonnen' ? 'gewonnen' : null;
    const { abfrage } = await this.basis(workspaceId, userId, {
      ...kachel,
      objekt: 'deal',
      status,
      zeitraum: null,
      nurMeine: meine,
    });

    if (liste === 'ruhend') {
      abfrage.orderBy(letzteAktivitaetSql('r'), 'ASC');
    } else if (liste === 'gewonnen') {
      abfrage.orderBy('r."closeDate"', 'DESC', 'NULLS LAST');
    } else {
      abfrage.orderBy('r."createdAt"', 'DESC');
    }

    const geschaefte = (await abfrage
      .limit(LISTE_LAENGE)
      .getMany()) as DealEntity[];
    const verborgen = await istVerborgen('deal.amount');

    return leer({
      betraegeVerborgen: verborgen,
      eintraege: geschaefte.map((geschaeft) => ({
        id: geschaeft.id,
        titel: geschaeft.name,
        zusatz: verborgen
          ? null
          : euro(
              geschaeft.amount === null ? null : Number(geschaeft.amount),
              geschaeft.currency,
            ),
        link: `/geschaefte/${geschaeft.id}`,
      })),
    });
  }
}
