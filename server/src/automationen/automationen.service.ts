import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, MoreThan, Repository } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { AppointmentEntity } from '../calendar/appointment.entity';
import { berlinDate, instantFromBerlin } from '../calendar/berlin-time';
import { letzteAktivitaetSql } from '../crm/aktivitaet';
import { fehlendePflichtfelder } from '../crm/pflicht-ab-phase';
import { phasenFuer, standardPipeline } from '../crm/pipelines';
import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity, DealStage } from '../crm/entities/deal.entity';
import { NoteEntity } from '../crm/entities/note.entity';
import { TaskEntity } from '../crm/entities/task.entity';
import {
  filterFragment,
  type FilterFeld,
  operatorPasst,
} from '../custom-fields/custom-field-query';
import {
  CustomFieldEntity,
  CustomFieldFilterOperator,
} from '../custom-fields/custom-field.types';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { standardFeld } from '../custom-fields/standard-felder';
import { MailService } from '../mail/mail.service';
import { MailTemplateEntity } from '../mailboxes/mail-template.entity';
import { MailboxesService } from '../mailboxes/mailboxes.service';
import { entwurfAnlegen } from '../mailboxes/mail-entwuerfe.service';
import {
  mailSchluessel,
  open,
  type Schluesselbund,
  seal,
} from '../mailboxes/secret-box';
import { runWithRequestContext } from '../observability/request-context';
import { UserEntity } from '../users/user.entity';
import { hoereAuf, type Meldung } from '../webhooks/ereignisse';
import {
  internErlaubt,
  pruefeZielForm,
  sichereAnfrage,
  UngueltigesZiel,
} from '../webhooks/webhook-ziel';
import { webhookSignatur } from '../webhooks/webhooks.service';
import {
  eigenesSchluessel,
  type Feldrechte,
  feldrechteJetzt,
  STANDARD_FELDRECHTE,
  standardSchluessel,
} from '../workspaces/feldrechte';
import { MembershipEntity } from '../workspaces/membership.entity';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import {
  istSchreibbar,
  istSichtbar,
  nurUeberFreigabe,
  type Sichtfeld,
  sichtbarkeitsBedingung,
} from '../workspaces/sichtbarkeit';
import { zielSichtbar } from '../workspaces/ziel-sichtbarkeit';
import {
  AusfuehrungStatus,
  AutomationAusfuehrungEntity,
  type SchrittProtokoll,
} from './automation-ausfuehrung.entity';
import {
  AutomationAktion,
  type AutomationAktionDaten,
  type AutomationArt,
  AutomationAusloeser,
  AutomationEntity,
  type AutomationFilter,
  type AutomationHeader,
  AutomationMailAn,
  type AutomationSchritt,
  type AutomationZeitplan,
} from './automation.entity';
import { setzeEin, type Variablen } from './automation-variablen';
import {
  KANAL_NAME,
  type KanalDienst,
  kanalRumpf,
  kanalUrlAnzeige,
  MAX_KANAL_TEXT,
  pruefeKanalUrl,
} from './kanal-nachricht';
import { naechsterLauf, pruefeZeitplan } from './automation-zeitplan';
import { einplanen, ueberwacht } from '../ueberwachung/laeufe.service';

export type SchrittEingabe = {
  aktion: AutomationAktion;
  titel?: string | null;
  faelligInTagen?: number | null;
  zustaendigUserId?: string | null;
  reihumUserIds?: string[] | null;
  feldKey?: string | null;
  feldWert?: string | null;
  mailAn?: AutomationMailAn | null;
  mailText?: string | null;
  vorlageId?: string | null;
  mailAlsEntwurf?: boolean | null;
  zielSchritt?: number | null;
  suchArt?: AutomationArt | null;
  suchFeld?: string | null;
  suchVergleich?: string | null;
  suchWert?: string | null;
  upsertArt?: AutomationArt | null;
  upsertWerte?: { feld: string; wert: string }[] | null;
  terminInTagen?: number | null;
  terminUhrzeit?: string | null;
  terminDauer?: number | null;
  terminOrt?: string | null;
  httpMethode?: string | null;
  httpUrl?: string | null;
  httpHeader?: { name: string; wert?: string | null }[] | null;
  httpRumpf?: string | null;
  kanalDienst?: KanalDienst | null;
  kanalUrl?: string | null;
  kanalText?: string | null;
  kanalLink?: boolean | null;
};

export type AutomationEingabe = SchrittEingabe & {
  name: string;
  aktiv?: boolean;
  ausloeser: AutomationAusloeser;
  phase?: string | null;
  bedingungen?: AutomationFilter[] | null;
  ruhendTage?: number | null;
  verzoegerungTage?: number | null;
  art?: AutomationArt | null;
  zeitplan?: AutomationZeitplan | null;
  weitereSchritte?: SchrittEingabe[] | null;
};

type Ziel = {
  art: 'deal' | 'contact' | 'company';
  id: string;
};

type Ergebnis = { status: AusfuehrungStatus; grund: string | null };

const OK: Ergebnis = { status: AusfuehrungStatus.OK, grund: null };

const uebersprungen = (grund: string): Ergebnis => ({
  status: AusfuehrungStatus.UEBERSPRUNGEN,
  grund,
});

class Uebersprungen extends Error {}

const TABELLE = {
  deal: 'deals',
  contact: 'contacts',
  company: 'companies',
} as const;

const PFAD = {
  deal: '/geschaefte',
  contact: '/kontakte',
  company: '/firmen',
} as const;

const SPALTE = {
  deal: 'dealId',
  contact: 'contactId',
  company: 'companyId',
} as const;

const KLASSE = {
  deal: DealEntity,
  contact: ContactEntity,
  company: CompanyEntity,
} as const;

const FELDART = {
  deal: CustomFieldEntity.DEAL,
  contact: CustomFieldEntity.CONTACT,
  company: CustomFieldEntity.COMPANY,
} as const;

const ART_DES_AUSLOESERS: Record<AutomationAusloeser, Ziel['art'] | null> = {
  [AutomationAusloeser.GESCHAEFT_ANGELEGT]: 'deal',
  [AutomationAusloeser.GESCHAEFT_GEAENDERT]: 'deal',
  [AutomationAusloeser.PHASE_GEAENDERT]: 'deal',
  [AutomationAusloeser.GESCHAEFT_RUHEND]: 'deal',
  [AutomationAusloeser.KONTAKT_ANGELEGT]: 'contact',
  [AutomationAusloeser.KONTAKT_GEAENDERT]: 'contact',
  [AutomationAusloeser.FIRMA_ANGELEGT]: 'company',
  [AutomationAusloeser.FIRMA_GEAENDERT]: 'company',
  [AutomationAusloeser.WEBFORMULAR_EINGANG]: null,
  [AutomationAusloeser.MANUELL]: null,
  [AutomationAusloeser.ZEITPLAN]: null,
  [AutomationAusloeser.WEBHOOK_EINGANG]: null,
};

export const artDerRegel = (
  ausloeser: AutomationAusloeser,
  art: AutomationArt | null | undefined,
): Ziel['art'] | null =>
  ART_DES_AUSLOESERS[ausloeser] ??
  (ausloeser === AutomationAusloeser.MANUELL ||
  ausloeser === AutomationAusloeser.ZEITPLAN
    ? (art ?? null)
    : null);

const SETZBAR: Record<Ziel['art'], string[]> = {
  deal: ['std:stage', 'std:probability', 'std:ownerId'],
  contact: ['std:ownerId'],
  company: ['std:ownerId'],
};

const OHNE_WERT = [
  CustomFieldFilterOperator.IS_EMPTY,
  CustomFieldFilterOperator.IS_NOT_EMPTY,
] as string[];

const MAX_BEDINGUNGEN = 10;

const FAELLIGE_ALLE_MS = 5 * 60 * 1000;
const RUHENDE_ALLE_MS = 60 * 60 * 1000;

export const PROTOKOLL_LAENGE = 20;

export const MAX_SCHRITTE = 5;

export const MAX_LAEUFE_JE_MINUTE = 60;

export const MAX_TIEFE = 3;

export const TIEFE_KOPF = 'x-stegwerk-automation-tiefe';

export const MAX_ZEITPLAN_TREFFER = 200;

const MAX_SUCHTREFFER = 10;

const HTTP_ZEITLIMIT_MS = 10_000;
const HTTP_MAX_ANTWORT = 64 * 1024;
const HTTP_METHODEN = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const MAX_KOEPFE = 10;

export const MAX_EINGANG_BYTES = 64 * 1024;

const SIGNATUR_FENSTER_S = 300;

const ZEITPLAN_ALLE_MS = 5 * 60 * 1000;

const UPSERT_FELDER: Record<Ziel['art'], string[]> = {
  contact: ['firstName', 'lastName', 'email', 'phone', 'jobTitle'],
  company: ['name', 'domain', 'website', 'city', 'industry'],
  deal: ['name', 'amount'],
};

const LESBAR: Record<Ziel['art'], string[]> = {
  contact: [
    'firstName',
    'lastName',
    'email',
    'phone',
    'jobTitle',
    'companyId',
    'ownerId',
  ],
  company: [
    'name',
    'domain',
    'website',
    'industry',
    'city',
    'postalCode',
    'country',
    'ownerId',
  ],
  deal: [
    'name',
    'amount',
    'currency',
    'stage',
    'probability',
    'closeDate',
    'companyId',
    'primaryContactId',
    'ownerId',
  ],
};

const SCHREIBRECHT: Record<Ziel['art'], Permission> = {
  deal: Permission.DEAL_WRITE,
  contact: Permission.CONTACT_WRITE,
  company: Permission.COMPANY_WRITE,
};

const NICHT_IM_TEAM =
  'Wer die Regel angelegt hat, ist nicht mehr im Team; bitte die Regel neu speichern.';

const NICHT_SICHTBAR =
  'Der Datensatz ist für den Ersteller der Regel nicht sichtbar.';

const NUR_LESBAR =
  'Der Datensatz ist für den Ersteller der Regel nur zum Lesen freigegeben.';

const VERANTWORTUNG_UEBER_FREIGABE =
  'Den Verantwortlichen ändert eine Regel nur, wenn ihr Ersteller den Datensatz auch ohne Freigabe ändern dürfte.';

const VERBORGENE_BEDINGUNG =
  'Eine Bedingung prüft ein Feld, das für die Rolle des Erstellers verborgen ist.';

const feldrechtSchluessel = (art: Ziel['art'], key: string): string => {
  if (key.startsWith('std:firma.')) {
    return standardSchluessel('company', key.slice('std:firma.'.length));
  }

  if (!key.startsWith('std:')) {
    return eigenesSchluessel(art, key);
  }

  const spalte = key.slice(4);

  return (
    STANDARD_FELDRECHTE.find(
      (eintrag) =>
        eintrag.art === art &&
        (eintrag.feld === spalte || (eintrag.auch ?? []).includes(spalte)),
    )?.schluessel ?? standardSchluessel(art, spalte)
  );
};

export const betragAus = (roh: string): number => {
  const text = roh.replace(/\s/gu, '');
  const punkte = (text.match(/\./gu) ?? []).length;
  const kommas = (text.match(/,/gu) ?? []).length;
  const ohne = (zeichen: RegExp) => text.replace(zeichen, '');
  let zahl: string;

  if (punkte > 0 && kommas > 0) {
    zahl =
      text.lastIndexOf(',') > text.lastIndexOf('.')
        ? ohne(/\./gu).replace(',', '.')
        : ohne(/,/gu);
  } else if (kommas > 1 || punkte > 1) {
    zahl = ohne(/[.,]/gu);
  } else if (kommas === 1) {
    zahl = text.replace(',', '.');
  } else if (/^[+-]?[1-9]\d{0,2}\.\d{3}$/u.test(text)) {
    zahl = ohne(/\./gu);
  } else {
    zahl = text;
  }

  return Number(zahl);
};

const MAX_PROTOKOLL_ZEICHEN = 4000;

const kuerze = (wert: unknown): unknown => {
  const text = JSON.stringify(wert ?? null);

  return text.length <= MAX_PROTOKOLL_ZEICHEN
    ? wert
    : { gekuerzt: true, text: text.slice(0, MAX_PROTOKOLL_ZEICHEN) };
};

type Lauf = {
  test: boolean;
  tiefe: number;
  variablen: Variablen;
  ziele: (Ziel | null)[];
  protokoll: SchrittProtokoll[];
};

type LaufErgebnis = Ergebnis & { schritte: SchrittProtokoll[] };

type LaufOptionen = {
  test?: boolean;
  ausloeserDaten?: Record<string, unknown> | null;
  tiefe?: number;
  rechteVon?: RequestUser;
};

type Bearbeiter = { anrufer: RequestUser; felder: Feldrechte };

const tokenHash = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export const ausloeserFuer = (meldung: Meldung): AutomationAusloeser[] => {
  const ausWebformular = meldung.data.source === 'webform';

  switch (meldung.event) {
    case 'deal.created':
      return ausWebformular
        ? [
            AutomationAusloeser.GESCHAEFT_ANGELEGT,
            AutomationAusloeser.WEBFORMULAR_EINGANG,
          ]
        : [AutomationAusloeser.GESCHAEFT_ANGELEGT];
    case 'contact.created':
      return ausWebformular
        ? [
            AutomationAusloeser.KONTAKT_ANGELEGT,
            AutomationAusloeser.WEBFORMULAR_EINGANG,
          ]
        : [AutomationAusloeser.KONTAKT_ANGELEGT];
    case 'company.created':
      return [AutomationAusloeser.FIRMA_ANGELEGT];
    case 'deal.stage_changed':
      return [AutomationAusloeser.PHASE_GEAENDERT];
    case 'deal.updated':
      return [AutomationAusloeser.GESCHAEFT_GEAENDERT];
    case 'contact.updated':
      return [AutomationAusloeser.KONTAKT_GEAENDERT];
    case 'company.updated':
      return [AutomationAusloeser.FIRMA_GEAENDERT];
    default:
      return [];
  }
};

const zielVon = (meldung: Meldung): Ziel | null => {
  const id = meldung.data.id;

  if (typeof id !== 'string') {
    return null;
  }

  const art = meldung.event.split('.')[0];

  return art === 'deal' || art === 'contact' || art === 'company'
    ? { art, id }
    : null;
};

const fuelleVorlage = (
  text: string,
  werte: Record<string, string | null | undefined>,
): string =>
  text
    .replace(
      /\{\{\s*([a-z_]+)\s*(?:\|([^{}|]{0,80}))?\}\}/gu,
      (_ganz, key: string, ersatz?: string) => {
        const wert = werte[key];

        return typeof wert === 'string' && wert.trim() !== ''
          ? wert.trim()
          : (ersatz?.trim() ?? '');
      },
    )
    .replace(/[ \t]{2,}/gu, ' ')
    .replace(/ +([,.!?])/gu, '$1');

export const ursprungVon = (url: string): string | null => {
  const treffer = /^(https?:\/\/[^/?#]*)/iu.exec(url.trim());

  if (treffer === null || treffer[1].includes('{{')) {
    return null;
  }

  return treffer[1].toLowerCase();
};

const fehlertext = (fehler: unknown): string =>
  (fehler instanceof Error ? fehler.message : String(fehler)).slice(0, 300);

@Injectable()
export class AutomationenService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationenService.name);
  private readonly laeuft = new AsyncLocalStorage<true>();
  private abmelden: (() => void) | undefined;
  private uhren: NodeJS.Timeout[] = [];

  constructor(
    @InjectRepository(AutomationEntity)
    private readonly automationen: Repository<AutomationEntity>,
    @InjectRepository(AutomationAusfuehrungEntity)
    private readonly ausfuehrungen: Repository<AutomationAusfuehrungEntity>,
    private readonly customFields: CustomFieldsService,
    private readonly mail: MailService,
    private readonly postfach: MailboxesService,
    private readonly permissions: PermissionsService,
    private readonly config: ConfigService,
  ) {}

  private get schluessel(): Schluesselbund {
    return mailSchluessel(this.config);
  }

  onModuleInit(): void {
    this.abmelden = hoereAuf((meldung) => {
      void this.verarbeite(meldung);
    });

    einplanen('automationen-faellige', FAELLIGE_ALLE_MS);
    einplanen('automationen-ruhende', RUHENDE_ALLE_MS);
    const faellige = setInterval(
      () =>
        void ueberwacht('automationen-faellige', FAELLIGE_ALLE_MS, () =>
          this.fuehreFaelligeAus(),
        ).catch((f) => this.protokolliere(f)),
      FAELLIGE_ALLE_MS,
    );
    const ruhende = setInterval(
      () =>
        void ueberwacht('automationen-ruhende', RUHENDE_ALLE_MS, () =>
          this.pruefeRuhende(),
        ).catch((f) => this.protokolliere(f)),
      RUHENDE_ALLE_MS,
    );

    einplanen('automationen-zeitplan', ZEITPLAN_ALLE_MS);
    const zeitplan = setInterval(
      () =>
        void ueberwacht('automationen-zeitplan', ZEITPLAN_ALLE_MS, () =>
          this.pruefeZeitplaene(),
        ).catch((f) => this.protokolliere(f)),
      ZEITPLAN_ALLE_MS,
    );

    faellige.unref();
    ruhende.unref();
    zeitplan.unref();
    this.uhren = [faellige, ruhende, zeitplan];
  }

  onModuleDestroy(): void {
    this.abmelden?.();

    for (const uhr of this.uhren) {
      clearInterval(uhr);
    }
  }

  list(workspaceId: string): Promise<AutomationEntity[]> {
    return this.automationen.find({
      where: { workspaceId },
      order: { createdAt: 'ASC' },
    });
  }

  async protokoll(
    workspaceId: string,
    automationId: string,
  ): Promise<AutomationAusfuehrungEntity[]> {
    await this.finde(workspaceId, automationId);

    return this.ausfuehrungen.find({
      where: { workspaceId, automationId },
      order: { createdAt: 'DESC' },
      take: PROTOKOLL_LAENGE,
    });
  }

  async create(
    workspaceId: string,
    vonUserId: string,
    eingabe: AutomationEingabe,
  ): Promise<AutomationEntity> {
    const geprueft = await this.pruefe(
      workspaceId,
      eingabe,
      await this.bearbeiter(workspaceId, vonUserId),
    );

    return this.automationen.save(
      this.automationen.create({
        ...geprueft,
        workspaceId,
        erstelltVon: vonUserId,
      }),
    );
  }

  async update(
    workspaceId: string,
    id: string,
    eingabe: AutomationEingabe,
    vonUserId: string,
  ): Promise<AutomationEntity> {
    const automation = await this.finde(workspaceId, id);
    const geprueft = await this.pruefe(
      workspaceId,
      eingabe,
      await this.bearbeiter(workspaceId, vonUserId),
      automation,
    );

    Object.assign(automation, geprueft);
    automation.erstelltVon = vonUserId;

    automation.reihumZeiger = 0;

    return this.automationen.save(automation);
  }

  async setAktiv(
    workspaceId: string,
    id: string,
    aktiv: boolean,
  ): Promise<AutomationEntity> {
    const automation = await this.finde(workspaceId, id);

    automation.aktiv = aktiv;

    if (aktiv && automation.bedingung.zeitplan != null) {
      automation.naechsterLauf = naechsterLauf(
        automation.bedingung.zeitplan,
        new Date(),
      );
    }

    return this.automationen.save(automation);
  }

  async nameVon(workspaceId: string, id: string): Promise<string | null> {
    const regel = await this.automationen.findOne({
      where: { id, workspaceId },
      select: { id: true, name: true },
    });

    return regel?.name ?? null;
  }

  private erstellerVon(automation: AutomationEntity): RequestUser {
    return {
      userId: automation.erstelltVon,
      workspaceId: automation.workspaceId,
      email: '',
    } as RequestUser;
  }

  private async bearbeiter(
    workspaceId: string,
    userId: string,
  ): Promise<Bearbeiter> {
    const anrufer = { userId, workspaceId, email: '' } as RequestUser;

    return {
      anrufer,
      felder: (await this.permissions.sichtfeldFuer(anrufer)).felder,
    };
  }

  private async alsErsteller<T>(
    automation: AutomationEntity,
    arbeit: () => Promise<T>,
    rechteVon?: RequestUser,
  ): Promise<T> {
    const mitglied = await this.automationen.manager.count(MembershipEntity, {
      where: {
        userId: automation.erstelltVon,
        workspaceId: automation.workspaceId,
      },
    });

    if (mitglied === 0) {
      throw new Uebersprungen(NICHT_IM_TEAM);
    }

    const anrufer = rechteVon ?? this.erstellerVon(automation);
    let sichtfeld: Promise<Sichtfeld> | undefined;

    return runWithRequestContext(
      {
        requestId: `automation-${automation.id}`,
        automationId: automation.id,
        userId: automation.erstelltVon,
        workspaceId: automation.workspaceId,
        sichtfeld: () => {
          sichtfeld ??= this.permissions.sichtfeldFuer(anrufer);

          return sichtfeld;
        },
      },
      arbeit,
    );
  }

  private sichtbarFuerErsteller(
    automation: AutomationEntity,
    ziel: Ziel,
  ): Promise<boolean> {
    return this.alsErsteller(automation, () =>
      zielSichtbar(this.automationen.manager, { [SPALTE[ziel.art]]: ziel.id }),
    );
  }

  private async schreibbarPruefen(
    automation: AutomationEntity,
    ziel: Ziel,
    neuerVerantwortlicher?: string | null,
  ): Promise<void> {
    const ownerId = await this.verantwortlicher(automation, ziel);

    if (!(await istSchreibbar(ziel.art, ownerId, ziel.id))) {
      throw new Uebersprungen(NUR_LESBAR);
    }

    if (
      neuerVerantwortlicher !== undefined &&
      neuerVerantwortlicher !== ownerId &&
      (await nurUeberFreigabe(ziel.art, ownerId))
    ) {
      throw new Uebersprungen(VERANTWORTUNG_UEBER_FREIGABE);
    }
  }

  async schreibbarFuerAnrufer(
    workspaceId: string,
    art: Ziel['art'],
    id: string,
  ): Promise<boolean> {
    const zeilen = (await this.automationen.query(
      `SELECT "ownerId" FROM "${TABELLE[art]}" WHERE "id" = $1 AND "workspaceId" = $2`,
      [id, workspaceId],
    )) as { ownerId: string | null }[];

    return istSchreibbar(art, zeilen[0]?.ownerId ?? null, id);
  }

  private async bedingungenSichtbar(
    art: Ziel['art'],
    filter: AutomationFilter[],
  ): Promise<void> {
    const rechte = await feldrechteJetzt();

    if (
      filter.some(
        (eintrag) =>
          rechte[feldrechtSchluessel(art, eintrag.key)] === 'verborgen',
      )
    ) {
      throw new Uebersprungen(VERBORGENE_BEDINGUNG);
    }
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    const ergebnis = await this.automationen.delete({ id, workspaceId });

    return (ergebnis.affected ?? 0) > 0;
  }

  async verarbeite(meldung: Meldung): Promise<void> {
    if (this.laeuft.getStore() === true) {
      return;
    }

    const ausloeser = ausloeserFuer(meldung);
    const ziel = zielVon(meldung);

    if (ausloeser.length === 0 || ziel === null) {
      return;
    }

    await this.laeuft.run(true, async () => {
      try {
        const passende = (
          await this.automationen.find({
            where: {
              workspaceId: meldung.workspaceId,
              aktiv: true,
              ausloeser: In(ausloeser),
            },
            order: { createdAt: 'ASC' },
          })
        ).filter((automation) => this.phasePasst(automation, meldung));

        const rang = (a: AutomationEntity): number =>
          a.aktion === AutomationAktion.VERANTWORTLICH_REIHUM
            ? 0
            : a.aktion === AutomationAktion.FELD_SETZEN
              ? 1
              : 2;

        passende.sort((a, b) => rang(a) - rang(b));

        const gesehen = new Set<string>();

        for (const automation of passende) {
          if (gesehen.has(automation.id)) {
            continue;
          }

          gesehen.add(automation.id);
          await this.ausloesen(automation, ziel);
        }
      } catch (error) {
        this.protokolliere(error);
      }
    });
  }

  async fuehreFaelligeAus(jetzt: Date = new Date()): Promise<number> {
    const faellig = await this.ausfuehrungen.find({
      where: {
        status: AusfuehrungStatus.GEPLANT,
        faelligAm: LessThanOrEqual(jetzt),
      },
      order: { faelligAm: 'ASC' },
      take: 200,
    });

    let erledigt = 0;

    for (const eintrag of faellig) {
      const uebernommen = await this.ausfuehrungen.update(
        { id: eintrag.id, status: AusfuehrungStatus.GEPLANT },
        { status: AusfuehrungStatus.LAEUFT },
      );

      if ((uebernommen.affected ?? 0) === 0) {
        continue;
      }

      const automation = await this.automationen.findOne({
        where: { id: eintrag.automationId },
      });
      const ziel =
        eintrag.zielId === null
          ? null
          : ({ art: eintrag.zielArt, id: eintrag.zielId } as Ziel);

      const ergebnis: LaufErgebnis =
        automation === null || !automation.aktiv
          ? { ...uebersprungen('Die Regel ist abgeschaltet.'), schritte: [] }
          : await this.laeuft.run(true, () =>
              this.pruefenUndAusfuehren(
                automation,
                ziel,
                eintrag.ausloeserDaten,
              ),
            );

      await this.ausfuehrungen.update({ id: eintrag.id }, {
        ...ergebnis,
        erledigtAm: new Date(),
      } as never);
      erledigt += 1;
    }

    return erledigt;
  }

  async pruefeRuhende(jetzt: Date = new Date()): Promise<number> {
    const regeln = await this.automationen.find({
      where: { aktiv: true, ausloeser: AutomationAusloeser.GESCHAEFT_RUHEND },
    });
    const letzte = letzteAktivitaetSql('d');
    let gemeldet = 0;

    for (const automation of regeln) {
      const tage = automation.bedingung.ruhendTage ?? 14;
      const zeilen = (await this.automationen.query(
        `SELECT d."id", ${letzte} AS "letzte"
           FROM "deals" d
          WHERE d."workspaceId" = $1
            AND d."deletedAt" IS NULL
            AND d."stage" NOT IN ('won', 'lost')
            AND ${letzte} < $2::timestamptz - make_interval(days => $3)
            AND NOT EXISTS (
              SELECT 1 FROM "automation_ruhend" r
               WHERE r."automationId" = $4
                 AND r."dealId" = d."id"
                 AND r."letzteAktivitaet" >= ${letzte})
          LIMIT 500`,
        [automation.workspaceId, jetzt.toISOString(), tage, automation.id],
      )) as { id: string }[];

      for (const zeile of zeilen) {
        await this.automationen.query(
          `INSERT INTO "automation_ruhend" ("automationId", "dealId", "letzteAktivitaet")
           SELECT $1, d."id", ${letzte} FROM "deals" d WHERE d."id" = $2
           ON CONFLICT ("automationId", "dealId")
           DO UPDATE SET "letzteAktivitaet" = EXCLUDED."letzteAktivitaet"`,
          [automation.id, zeile.id],
        );

        await this.laeuft.run(true, () =>
          this.ausloesen(automation, { art: 'deal', id: zeile.id }, jetzt),
        );
        gemeldet += 1;
      }
    }

    return gemeldet;
  }

  private protokolliere(fehler: unknown): void {
    this.logger.error(
      'Automationen nicht ausgeführt',
      fehler instanceof Error ? fehler.stack : String(fehler),
    );
  }

  private phasePasst(automation: AutomationEntity, meldung: Meldung): boolean {
    if (automation.ausloeser !== AutomationAusloeser.PHASE_GEAENDERT) {
      return true;
    }

    const phase = automation.bedingung.phase;

    return phase == null || phase === '' || meldung.data.stage === phase;
  }

  private async ausloesen(
    automation: AutomationEntity,
    ziel: Ziel | null,
    jetzt: Date = new Date(),
    ausloeserDaten: Record<string, unknown> | null = null,
    tiefe = 0,
  ): Promise<AutomationAusfuehrungEntity | null> {
    try {
      if (ziel !== null) {
        let passt: boolean;

        try {
          passt =
            (await this.sichtbarFuerErsteller(automation, ziel)) &&
            (await this.bedingungenErfuellt(automation, ziel));
        } catch (fehler) {
          if (!(fehler instanceof Uebersprungen)) {
            throw fehler;
          }

          return await this.ausfuehrungen.save(
            this.ausfuehrungen.create({
              workspaceId: automation.workspaceId,
              automationId: automation.id,
              zielArt: ziel.art,
              zielId: ziel.id,
              ausloeserDaten,
              ...uebersprungen(fehler.message),
              faelligAm: jetzt,
              erledigtAm: new Date(),
            }),
          );
        }

        if (!passt) {
          return null;
        }
      }

      if (
        automation.ausloeser === AutomationAusloeser.WEBHOOK_EINGANG &&
        (await this.zuVieleLaeufe(automation))
      ) {
        this.logger.warn(
          `Automation ${automation.id}: mehr als ${String(MAX_LAEUFE_JE_MINUTE)} Läufe in einer Minute, angehalten`,
        );

        return null;
      }

      if (automation.verzoegerungTage > 0) {
        return await this.ausfuehrungen.save(
          this.ausfuehrungen.create({
            workspaceId: automation.workspaceId,
            automationId: automation.id,
            zielArt: ziel?.art ?? 'keins',
            zielId: ziel?.id ?? null,
            ausloeserDaten,
            status: AusfuehrungStatus.GEPLANT,
            faelligAm: new Date(
              jetzt.getTime() + automation.verzoegerungTage * 86_400_000,
            ),
          }),
        );
      }

      const ergebnis = await this.ausfuehrenMitErgebnis(automation, ziel, {
        ausloeserDaten,
        tiefe,
      });

      return await this.ausfuehrungen.save(
        this.ausfuehrungen.create({
          workspaceId: automation.workspaceId,
          automationId: automation.id,
          zielArt: ziel?.art ?? 'keins',
          zielId: ziel?.id ?? null,
          ausloeserDaten,
          ...ergebnis,
          faelligAm: jetzt,
          erledigtAm: new Date(),
        }),
      );
    } catch (error) {
      this.logger.error(
        `Automation ${automation.id} fehlgeschlagen`,
        error instanceof Error ? error.stack : String(error),
      );

      return null;
    }
  }

  private async zuVieleLaeufe(automation: AutomationEntity): Promise<boolean> {
    const zahl = await this.ausfuehrungen.count({
      where: {
        automationId: automation.id,
        testlauf: false,
        createdAt: MoreThan(new Date(Date.now() - 60_000)),
      },
    });

    return zahl >= MAX_LAEUFE_JE_MINUTE;
  }

  private async pruefenUndAusfuehren(
    automation: AutomationEntity,
    ziel: Ziel | null,
    ausloeserDaten: Record<string, unknown> | null = null,
  ): Promise<LaufErgebnis> {
    try {
      if (
        ziel !== null &&
        !(await this.zielVorhanden(automation.workspaceId, ziel))
      ) {
        return {
          ...uebersprungen(
            'Der Eintrag liegt im Papierkorb oder ist gelöscht.',
          ),
          schritte: [],
        };
      }

      if (
        ziel !== null &&
        !(await this.sichtbarFuerErsteller(automation, ziel))
      ) {
        return { ...uebersprungen(NICHT_SICHTBAR), schritte: [] };
      }

      if (
        ziel !== null &&
        !(await this.bedingungenErfuellt(automation, ziel))
      ) {
        return {
          ...uebersprungen('Die Bedingungen treffen nicht mehr zu.'),
          schritte: [],
        };
      }
    } catch (fehler) {
      return {
        status:
          fehler instanceof Uebersprungen
            ? AusfuehrungStatus.UEBERSPRUNGEN
            : AusfuehrungStatus.FEHLER,
        grund: fehlertext(fehler),
        schritte: [],
      };
    }

    return this.ausfuehrenMitErgebnis(automation, ziel, { ausloeserDaten });
  }

  private alleSchritte(automation: AutomationEntity): AutomationSchritt[] {
    return [
      { aktion: automation.aktion, daten: automation.aktionDaten },
      ...(automation.schritte ?? []),
    ].slice(0, MAX_SCHRITTE);
  }

  private async ausfuehrenMitErgebnis(
    automation: AutomationEntity,
    ziel: Ziel | null,
    optionen: LaufOptionen = {},
  ): Promise<LaufErgebnis> {
    try {
      return await this.alsErsteller(
        automation,
        () => this.schritteAusfuehren(automation, ziel, optionen),
        optionen.rechteVon,
      );
    } catch (fehler) {
      if (fehler instanceof Uebersprungen) {
        return { ...uebersprungen(fehler.message), schritte: [] };
      }

      throw fehler;
    }
  }

  private async schritteAusfuehren(
    automation: AutomationEntity,
    ziel: Ziel | null,
    optionen: LaufOptionen,
  ): Promise<LaufErgebnis> {
    const schritte = this.alleSchritte(automation);
    const lauf: Lauf = {
      test: optionen.test === true,
      tiefe: optionen.tiefe ?? 0,
      variablen: {},
      ziele: [ziel],
      protokoll: [],
    };

    try {
      lauf.variablen.ausloeser =
        ziel === null
          ? (optionen.ausloeserDaten ?? {})
          : await this.datensatzWerte(automation.workspaceId, ziel);
    } catch (fehler) {
      return {
        status:
          fehler instanceof Uebersprungen
            ? AusfuehrungStatus.UEBERSPRUNGEN
            : AusfuehrungStatus.FEHLER,
        grund: fehlertext(fehler),
        schritte: [],
      };
    }

    const mitNummer = (nr: number, grund: string): string =>
      (schritte.length > 1 ? `Schritt ${String(nr)}: ${grund}` : grund).slice(
        0,
        300,
      );

    for (const [index, schritt] of schritte.entries()) {
      const nr = index + 1;
      const zielSchritt = schritt.daten.zielSchritt ?? null;
      const schrittZiel =
        zielSchritt === null ? ziel : (lauf.ziele[zielSchritt] ?? null);
      const eintrag: SchrittProtokoll = {
        nr,
        aktion: schritt.aktion,
        status: AusfuehrungStatus.OK,
        grund: null,
        eingabe: {},
        ausgabe: null,
      };

      lauf.protokoll.push(eintrag);

      try {
        const daten = this.mitVariablen(schritt.daten, lauf.variablen);

        eintrag.eingabe = kuerze(this.ohneGeheimnisse(daten)) as Record<
          string,
          unknown
        >;

        if (zielSchritt !== null && schrittZiel === null) {
          const quelle = lauf.protokoll[zielSchritt - 1]?.ausgabe as
            | { angelegt?: boolean; simuliert?: boolean }
            | null
            | undefined;

          throw new Uebersprungen(
            quelle?.simuliert === true && quelle.angelegt === true
              ? `Schritt ${String(zielSchritt)} hätte den Datensatz erst angelegt; im Probelauf endet der Lauf hier.`
              : `Schritt ${String(zielSchritt)} hat keinen Datensatz ergeben.`,
          );
        }

        const ausgabe = await this.schrittAusfuehren(
          automation,
          schritt.aktion,
          daten,
          schrittZiel,
          lauf,
          schritt.daten,
        );

        lauf.variablen[`schritt${String(nr)}`] = ausgabe.werte;
        lauf.ziele[nr] = ausgabe.ziel ?? null;
        eintrag.ausgabe = kuerze(ausgabe.werte);
      } catch (fehler) {
        if (fehler instanceof Uebersprungen) {
          eintrag.status = AusfuehrungStatus.UEBERSPRUNGEN;
          eintrag.grund = fehler.message;

          return {
            ...uebersprungen(mitNummer(nr, fehler.message)),
            schritte: lauf.protokoll,
          };
        }

        this.logger.error(
          `Automation ${automation.id} fehlgeschlagen`,
          fehler instanceof Error ? fehler.stack : String(fehler),
        );
        eintrag.status = AusfuehrungStatus.FEHLER;
        eintrag.grund = fehlertext(fehler);

        return {
          status: AusfuehrungStatus.FEHLER,
          grund: mitNummer(nr, fehlertext(fehler)),
          schritte: lauf.protokoll,
        };
      }
    }

    return { ...OK, schritte: lauf.protokoll };
  }

  private mitVariablen(
    daten: AutomationAktionDaten,
    variablen: Variablen,
  ): AutomationAktionDaten {
    const text = (wert: string | null | undefined) =>
      wert == null ? wert : setzeEin(wert, variablen);

    return {
      ...daten,
      titel: text(daten.titel),
      mailText: text(daten.mailText),
      feldWert: text(daten.feldWert),
      suchWert: text(daten.suchWert),
      terminOrt: text(daten.terminOrt),
      httpUrl: text(daten.httpUrl),
      httpRumpf: text(daten.httpRumpf),
      kanalText: text(daten.kanalText),
      ...(daten.upsertWerte === undefined
        ? {}
        : {
            upsertWerte: Object.fromEntries(
              Object.entries(daten.upsertWerte).map(([feld, wert]) => [
                feld,
                setzeEin(wert, variablen),
              ]),
            ),
          }),
    };
  }

  private ohneGeheimnisse(
    daten: AutomationAktionDaten,
  ): Record<string, unknown> {
    const { httpHeader, kanalUrlSealed: _adresse, ...rest } = daten;

    return {
      ...Object.fromEntries(
        Object.entries(rest).filter(
          ([, wert]) => wert !== null && wert !== undefined,
        ),
      ),
      ...(httpHeader === undefined || httpHeader.length === 0
        ? {}
        : { httpHeader: httpHeader.map((kopf) => `${kopf.name}: ***`) }),
    };
  }

  private async datensatzWerte(
    workspaceId: string,
    ziel: Ziel,
  ): Promise<Record<string, unknown>> {
    const zeile = (await this.automationen.manager.findOne(KLASSE[ziel.art], {
      where: { id: ziel.id, workspaceId },
    })) as unknown as Record<string, unknown> | null;

    if (zeile === null) {
      throw new Uebersprungen('Den Eintrag gibt es nicht mehr.');
    }

    if (
      !(await istSichtbar(ziel.art, zeile.ownerId as string | null, ziel.id))
    ) {
      throw new Uebersprungen(NICHT_SICHTBAR);
    }

    const rechte = await feldrechteJetzt();
    const werte: Record<string, unknown> = { id: ziel.id, art: ziel.art };

    for (const feld of LESBAR[ziel.art]) {
      if (rechte[standardSchluessel(ziel.art, feld)] !== 'verborgen') {
        werte[feld] = zeile[feld] ?? null;
      }
    }

    if (ziel.art === 'contact') {
      werte.name =
        `${String(zeile.firstName ?? '')} ${String(zeile.lastName ?? '')}`.trim();
    }

    const eigene = (zeile.customFields ?? {}) as Record<string, unknown>;

    werte.felder = Object.fromEntries(
      Object.entries(eigene).filter(
        ([key]) => rechte[eigenesSchluessel(ziel.art, key)] !== 'verborgen',
      ),
    );

    return werte;
  }

  private async schrittAusfuehren(
    automation: AutomationEntity,
    aktion: AutomationAktion,
    daten: AutomationAktionDaten,
    ziel: Ziel | null,
    lauf: Lauf,
    vorlage: AutomationAktionDaten,
  ): Promise<{ werte: Record<string, unknown>; ziel?: Ziel | null }> {
    const brauchtZiel = (): Ziel => {
      if (ziel === null) {
        throw new Uebersprungen(
          'Dieser Schritt braucht einen Datensatz; bitte einen aus einem früheren Schritt wählen.',
        );
      }

      return ziel;
    };

    switch (aktion) {
      case AutomationAktion.VERANTWORTLICH_REIHUM: {
        const z = brauchtZiel();

        return {
          werte: {
            verantwortlich: await this.reihum(automation, daten, z, lauf),
          },
          ziel: z,
        };
      }
      case AutomationAktion.AUFGABE_ANLEGEN: {
        const z = brauchtZiel();
        const tage = daten.faelligInTagen ?? 0;
        const faellig = berlinDate(new Date(Date.now() + tage * 86_400_000));
        const titel = (daten.titel ?? automation.name).slice(0, 200);
        const zustaendig = await this.zustaendig(automation, daten, z);

        await this.schreibbarPruefen(automation, z);

        if (lauf.test) {
          return {
            werte: { simuliert: true, titel, faellig, zustaendig },
            ziel: z,
          };
        }

        const aufgabe = await this.automationen.manager.save(
          this.automationen.manager.create(TaskEntity, {
            workspaceId: automation.workspaceId,
            title: titel,
            dueDate: faellig,
            assigneeId: zustaendig,
            createdById: automation.erstelltVon,
            [SPALTE[z.art]]: z.id,
            customFields: await this.customFields.standardwerte(
              automation.workspaceId,
              CustomFieldEntity.TASK,
              this.automationen.manager,
            ),
          }),
        );

        return {
          werte: { id: aufgabe.id, titel, faellig, zustaendig },
          ziel: z,
        };
      }
      case AutomationAktion.NOTIZ_ANLEGEN: {
        const z = brauchtZiel();
        const text = (daten.titel ?? automation.name).slice(0, 10000);

        await this.schreibbarPruefen(automation, z);

        if (lauf.test) {
          return { werte: { simuliert: true, text }, ziel: z };
        }

        const notiz = await this.automationen.manager.save(
          this.automationen.manager.create(NoteEntity, {
            workspaceId: automation.workspaceId,
            body: text,
            authorId: automation.erstelltVon,
            [SPALTE[z.art]]: z.id,
          }),
        );

        return { werte: { id: notiz.id, text }, ziel: z };
      }
      case AutomationAktion.FELD_SETZEN: {
        const z = brauchtZiel();

        await this.feldSetzen(automation, daten, z, lauf);

        return {
          werte: {
            feld: daten.feldKey ?? null,
            wert: daten.feldWert ?? null,
            ...(lauf.test ? { simuliert: true } : {}),
          },
          ziel: z,
        };
      }
      case AutomationAktion.MAIL_SENDEN: {
        const z = brauchtZiel();

        return {
          werte: await this.mailSenden(automation, daten, z, lauf),
          ziel: z,
        };
      }
      case AutomationAktion.DATENSAETZE_SUCHEN:
        return this.suchen(automation, daten);
      case AutomationAktion.ANLEGEN_ODER_AKTUALISIEREN:
        return this.anlegenOderAktualisieren(automation, daten, lauf);
      case AutomationAktion.TERMIN_ANLEGEN: {
        const z = brauchtZiel();

        return {
          werte: await this.terminAnlegen(automation, daten, z, lauf),
          ziel: z,
        };
      }
      case AutomationAktion.HTTP_ANFRAGE:
        return {
          werte: await this.httpAnfrage(daten, lauf, vorlage.httpUrl ?? ''),
          ziel,
        };
      case AutomationAktion.KANAL_NACHRICHT:
        return {
          werte: await this.kanalNachricht(automation, daten, ziel, lauf),
          ziel,
        };
    }
  }

  private async kanalNachricht(
    automation: AutomationEntity,
    daten: AutomationAktionDaten,
    ziel: Ziel | null,
    lauf: Lauf,
  ): Promise<Record<string, unknown>> {
    const dienst = daten.kanalDienst;

    if ((dienst !== 'slack' && dienst !== 'teams') || !daten.kanalUrlSealed) {
      throw new Uebersprungen('Für diesen Schritt fehlt die Kanaladresse.');
    }

    const geprueft = pruefeKanalUrl(
      dienst,
      open(daten.kanalUrlSealed, this.schluessel),
      internErlaubt(),
    );

    if (!geprueft.ok) {
      throw new Uebersprungen(geprueft.grund);
    }

    const text = (daten.kanalText ?? automation.name).slice(0, 8000);
    const link =
      daten.kanalLink === true && ziel !== null
        ? {
            url: `${this.webOrigin()}${PFAD[ziel.art]}/${ziel.id}`,
            titel: await this.zielName(automation.workspaceId, ziel),
          }
        : null;
    const rumpf = kanalRumpf(dienst, text, link);

    if (lauf.test) {
      return { simuliert: true, dienst, rumpf: JSON.parse(rumpf) as unknown };
    }

    let antwort;

    try {
      antwort = await sichereAnfrage(
        geprueft.url,
        'POST',
        {
          'user-agent': 'Stegwerk-Automation/1.0',
          'content-type': 'application/json',
        },
        rumpf,
        HTTP_ZEITLIMIT_MS,
        HTTP_MAX_ANTWORT,
        internErlaubt(),
      );
    } catch (fehler) {
      if (fehler instanceof UngueltigesZiel) {
        throw new Uebersprungen(fehler.message);
      }

      throw new Error(`Die Nachricht ging nicht durch: ${fehlertext(fehler)}`);
    }

    if (antwort.status >= 400) {
      throw new Error(
        `${KANAL_NAME[dienst]} antwortete mit ${String(antwort.status)}.`,
      );
    }

    return { dienst, status: antwort.status };
  }

  private webOrigin(): string {
    return (this.config.get<string>('webOrigin') ?? '').replace(/\/$/u, '');
  }

  private async suchen(
    automation: AutomationEntity,
    daten: AutomationAktionDaten,
  ): Promise<{ werte: Record<string, unknown>; ziel: Ziel | null }> {
    const art = daten.suchArt as Ziel['art'];
    const key = daten.suchFeld ?? '';
    const feld = await this.feld(automation.workspaceId, art, key);

    if (feld === undefined) {
      throw new Uebersprungen(`Das Feld "${key}" gibt es nicht mehr.`);
    }

    const rechte = await feldrechteJetzt();
    const schluessel = key.startsWith('std:')
      ? standardSchluessel(art, key.slice(4))
      : eigenesSchluessel(art, key);

    if (rechte[schluessel] === 'verborgen') {
      throw new Uebersprungen(
        'Dieses Feld ist für die Rolle des Erstellers verborgen.',
      );
    }

    const operator = (daten.suchVergleich ??
      CustomFieldFilterOperator.EQUALS) as CustomFieldFilterOperator;
    const ohneWert = OHNE_WERT.includes(operator);
    const wert = (daten.suchWert ?? '').trim();

    if (!ohneWert && wert === '') {
      return { werte: { anzahl: 0, treffer: [], erster: null }, ziel: null };
    }

    const fragment = filterFragment(
      'record',
      feld,
      operator,
      ohneWert ? undefined : wert,
      0,
    );
    const abfrage = this.automationen.manager
      .createQueryBuilder()
      .select('record."id"', 'id')
      .from(TABELLE[art], 'record')
      .where('record."workspaceId" = :bereich AND record."deletedAt" IS NULL', {
        bereich: automation.workspaceId,
      })
      .andWhere(fragment.where, fragment.parameters)
      .orderBy('record."createdAt"', 'DESC')
      .limit(MAX_SUCHTREFFER);
    const sichtbar = await sichtbarkeitsBedingung(art, 'record');

    if (sichtbar !== null) {
      abfrage.andWhere(sichtbar.where, sichtbar.parameters);
    }

    const ids = ((await abfrage.getRawMany()) as { id: string }[]).map(
      (zeile) => zeile.id,
    );
    const treffer: Record<string, unknown>[] = [];

    for (const id of ids) {
      treffer.push(
        await this.datensatzWerte(automation.workspaceId, { art, id }),
      );
    }

    return {
      werte: { anzahl: treffer.length, treffer, erster: treffer[0] ?? null },
      ziel: ids.length === 0 ? null : { art, id: ids[0] },
    };
  }

  private async anlegenOderAktualisieren(
    automation: AutomationEntity,
    daten: AutomationAktionDaten,
    lauf: Lauf,
  ): Promise<{ werte: Record<string, unknown>; ziel: Ziel | null }> {
    const art = daten.upsertArt as Ziel['art'];
    const ersteller = {
      userId: automation.erstelltVon,
      workspaceId: automation.workspaceId,
      email: '',
    } as RequestUser;

    if (!(await this.permissions.can(ersteller, SCHREIBRECHT[art]))) {
      throw new Uebersprungen(
        'Wer die Regel angelegt hat, darf diese Art Datensatz nicht anlegen oder ändern.',
      );
    }

    const rechte = await feldrechteJetzt();
    const werte: Record<string, string | number> = {};

    for (const [feld, roh] of Object.entries(daten.upsertWerte ?? {})) {
      if (!UPSERT_FELDER[art].includes(feld)) {
        continue;
      }

      if (rechte[standardSchluessel(art, feld)] !== undefined) {
        throw new Uebersprungen(
          `Das Feld „${feld}“ darf die Rolle des Erstellers nicht schreiben.`,
        );
      }

      const wert = roh.trim();

      if (wert === '') {
        continue;
      }

      if (feld === 'amount') {
        const zahl = betragAus(wert);

        if (!Number.isFinite(zahl) || zahl < 0 || zahl >= 1e12) {
          throw new Uebersprungen(`„${wert.slice(0, 40)}“ ist kein Betrag.`);
        }

        werte.amount = Math.round(zahl * 100) / 100;
      } else if (feld === 'email') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(wert)) {
          throw new Uebersprungen(
            `„${wert.slice(0, 80)}“ ist keine E-Mail-Adresse.`,
          );
        }

        werte.email = wert.toLowerCase().slice(0, 254);
      } else if (feld === 'domain') {
        werte.domain = wert
          .toLowerCase()
          .replace(/^https?:\/\//u, '')
          .replace(/^www\./u, '')
          .replace(/\/.*$/u, '')
          .slice(0, 200);
      } else {
        werte[feld] = wert.slice(0, feld === 'website' ? 300 : 100);
      }
    }

    const manager = this.automationen.manager;
    const tabelle = TABELLE[art];
    let vorhanden: { id: string } | undefined;

    const finde = async (bedingung: string, wert: unknown) =>
      (
        (await manager.query(
          `SELECT "id" FROM "${tabelle}"
            WHERE "workspaceId" = $1 AND "deletedAt" IS NULL AND ${bedingung}
            ORDER BY "createdAt" ASC LIMIT 1`,
          [automation.workspaceId, wert],
        )) as { id: string }[]
      )[0];

    if (art === 'contact') {
      if (werte.email === undefined) {
        throw new Uebersprungen(
          'Ohne E-Mail-Adresse lässt sich kein Kontakt zuordnen.',
        );
      }

      vorhanden = await finde('lower("email") = $2', werte.email);
    } else if (art === 'company') {
      if (werte.domain !== undefined) {
        vorhanden = await finde('lower("domain") = $2', werte.domain);
      }

      if (vorhanden === undefined && werte.name !== undefined) {
        vorhanden = await finde('lower("name") = lower($2)', werte.name);
      }

      if (vorhanden === undefined && werte.name === undefined) {
        throw new Uebersprungen('Eine Firma braucht mindestens einen Namen.');
      }
    } else {
      if (werte.name === undefined) {
        throw new Uebersprungen('Ein Geschäft braucht einen Namen.');
      }

      vorhanden = await finde(
        `lower("name") = lower($2) AND "stage" NOT IN ('won', 'lost')`,
        werte.name,
      );
    }

    if (vorhanden !== undefined) {
      const sichtbar = await sichtbarkeitsBedingung(art, 'record');

      if (sichtbar !== null) {
        const erlaubt = (await manager
          .createQueryBuilder()
          .select('1')
          .from(tabelle, 'record')
          .where('record."id" = :id', { id: vorhanden.id })
          .andWhere(sichtbar.where, sichtbar.parameters)
          .getRawOne()) as unknown;

        if (erlaubt === undefined) {
          throw new Uebersprungen(
            'Der passende Datensatz ist für den Ersteller der Regel nicht sichtbar.',
          );
        }
      }

      await this.schreibbarPruefen(automation, { art, id: vorhanden.id });

      if (!lauf.test && Object.keys(werte).length > 0) {
        await manager.update(KLASSE[art], { id: vorhanden.id }, werte);
      }

      return {
        werte: {
          id: vorhanden.id,
          angelegt: false,
          ...werte,
          ...(lauf.test ? { simuliert: true } : {}),
        },
        ziel: { art, id: vorhanden.id },
      };
    }

    if (
      art === 'contact' &&
      werte.lastName === undefined &&
      werte.firstName === undefined
    ) {
      werte.lastName = String(werte.email).split('@')[0].slice(0, 100);
    }

    if (lauf.test) {
      return {
        werte: { id: null, angelegt: true, simuliert: true, ...werte },
        ziel: null,
      };
    }

    const neu = (await manager.save(
      manager.create(KLASSE[art], {
        ...werte,
        ...(art === 'contact'
          ? {
              firstName: werte.firstName ?? '',
              lastName: werte.lastName ?? '',
            }
          : {}),
        ...(art === 'deal'
          ? {
              pipelineId: (
                await standardPipeline(manager, automation.workspaceId)
              ).id,
            }
          : {}),
        workspaceId: automation.workspaceId,
        herkunft: 'automation',
        customFields: await this.customFields.standardwerte(
          automation.workspaceId,
          FELDART[art],
          manager,
        ),
      } as never),
    )) as unknown as { id: string };

    return {
      werte: { id: neu.id, angelegt: true, ...werte },
      ziel: { art, id: neu.id },
    };
  }

  private async terminAnlegen(
    automation: AutomationEntity,
    daten: AutomationAktionDaten,
    ziel: Ziel,
    lauf: Lauf,
  ): Promise<Record<string, unknown>> {
    const tag = berlinDate(
      new Date(Date.now() + (daten.terminInTagen ?? 1) * 86_400_000),
    );
    const beginn = instantFromBerlin(tag, daten.terminUhrzeit ?? '09:00');
    const ende = new Date(
      beginn.getTime() + (daten.terminDauer ?? 30) * 60_000,
    );
    const besitzer =
      (await this.verantwortlicher(automation, ziel)) ?? automation.erstelltVon;
    const titel = (daten.titel ?? automation.name).slice(0, 200);

    await this.schreibbarPruefen(automation, ziel);

    if (lauf.test) {
      return {
        simuliert: true,
        titel,
        beginn: beginn.toISOString(),
        besitzer,
      };
    }

    const termin = await this.automationen.manager.save(
      this.automationen.manager.create(AppointmentEntity, {
        workspaceId: automation.workspaceId,
        title: titel,
        location:
          daten.terminOrt == null || daten.terminOrt.trim() === ''
            ? null
            : daten.terminOrt.slice(0, 300),
        startsAt: beginn,
        endsAt: ende,
        allDay: false,
        ownerId: besitzer,
        createdById: automation.erstelltVon,
        [SPALTE[ziel.art]]: ziel.id,
      }),
    );

    return { id: termin.id, titel, beginn: beginn.toISOString(), besitzer };
  }

  private async httpAnfrage(
    daten: AutomationAktionDaten,
    lauf: Lauf,
    vorlage: string,
  ): Promise<Record<string, unknown>> {
    const methode = (daten.httpMethode ?? 'POST').toUpperCase();
    let url: URL;

    try {
      url = pruefeZielForm(
        daten.httpUrl ?? '',
        internErlaubt(),
        internErlaubt(),
      );
    } catch (fehler) {
      throw new Uebersprungen(fehlertext(fehler));
    }

    let ursprung: string | null = null;

    try {
      const fest = ursprungVon(vorlage);

      ursprung = fest === null ? null : new URL(fest).origin;
    } catch {
      ursprung = null;
    }

    if (ursprung === null || ursprung !== url.origin) {
      throw new Uebersprungen(
        'Die eingesetzten Werte ändern die Gegenstelle der Anfrage; sie geht nicht hinaus.',
      );
    }

    if (lauf.test) {
      return { simuliert: true, methode, url: url.toString(), status: null };
    }

    const koepfe: Record<string, string> = {
      'user-agent': 'Stegwerk-Automation/1.0',
      [TIEFE_KOPF]: String(lauf.tiefe + 1),
    };

    for (const kopf of daten.httpHeader ?? []) {
      koepfe[kopf.name.toLowerCase()] = setzeEin(
        open(kopf.wertSealed, this.schluessel),
        lauf.variablen,
      ).replace(/[\r\n]/gu, ' ');
    }

    const rumpf =
      methode === 'GET' || methode === 'DELETE'
        ? null
        : (daten.httpRumpf ?? '');

    if (rumpf !== null && koepfe['content-type'] === undefined) {
      koepfe['content-type'] = 'application/json';
    }

    let antwort;

    try {
      antwort = await sichereAnfrage(
        url,
        methode,
        koepfe,
        rumpf,
        HTTP_ZEITLIMIT_MS,
        HTTP_MAX_ANTWORT,
        internErlaubt(),
      );
    } catch (fehler) {
      if (fehler instanceof UngueltigesZiel) {
        throw new Uebersprungen(fehler.message);
      }

      throw new Error(`Die Anfrage ging nicht durch: ${fehlertext(fehler)}`);
    }

    if (antwort.status >= 400) {
      throw new Error(`Der Dienst antwortete mit ${String(antwort.status)}.`);
    }

    let json: unknown = null;

    if ((antwort.typ ?? '').includes('json') && !antwort.gekuerzt) {
      try {
        json = JSON.parse(antwort.rumpf) as unknown;
      } catch {
        json = null;
      }
    }

    return {
      status: antwort.status,
      rumpf: antwort.rumpf.slice(0, 8000),
      json,
    };
  }

  private async zielVorhanden(
    workspaceId: string,
    ziel: Ziel,
  ): Promise<boolean> {
    const zeilen = (await this.automationen.query(
      `SELECT 1 FROM "${TABELLE[ziel.art]}" WHERE "id" = $1 AND "workspaceId" = $2 AND "deletedAt" IS NULL`,
      [ziel.id, workspaceId],
    )) as unknown[];

    return zeilen.length > 0;
  }

  private async bedingungenErfuellt(
    automation: AutomationEntity,
    ziel: Ziel,
  ): Promise<boolean> {
    const filter = automation.bedingung.filter ?? [];

    if (filter.length === 0) {
      return true;
    }

    return this.alsErsteller(automation, async () => {
      await this.bedingungenSichtbar(ziel.art, filter);

      const eigene = await this.felderFuer(automation.workspaceId, ziel.art);
      const abfrage = this.automationen.manager
        .createQueryBuilder()
        .select('1')
        .from(TABELLE[ziel.art], 'record')
        .where('record."id" = :zielId AND record."workspaceId" = :bereich', {
          zielId: ziel.id,
          bereich: automation.workspaceId,
        });

      filter.forEach((eintrag, index) => {
        const feld =
          eigene.get(eintrag.key) ??
          standardFeld(FELDART[ziel.art], eintrag.key);

        if (feld === undefined) {
          throw new Error(`Das Feld "${eintrag.key}" gibt es nicht mehr.`);
        }

        const fragment = filterFragment(
          'record',
          feld,
          eintrag.operator as CustomFieldFilterOperator,
          eintrag.value ?? undefined,
          index,
        );

        abfrage.andWhere(fragment.where, fragment.parameters);
      });

      return (await abfrage.getRawOne()) !== undefined;
    });
  }

  private async felderFuer(
    workspaceId: string,
    art: Ziel['art'],
  ): Promise<Map<string, FilterFeld>> {
    const eigene = await this.customFields.list(workspaceId, FELDART[art]);

    return new Map<string, FilterFeld>(eigene.map((f) => [f.key, f]));
  }

  private async feld(
    workspaceId: string,
    art: Ziel['art'],
    key: string,
  ): Promise<FilterFeld | undefined> {
    return (
      (await this.felderFuer(workspaceId, art)).get(key) ??
      standardFeld(FELDART[art], key)
    );
  }

  private async feldSetzen(
    automation: AutomationEntity,
    daten: AutomationAktionDaten,
    ziel: Ziel,
    lauf: Lauf,
  ): Promise<void> {
    const { feldKey, feldWert } = daten;
    const manager = this.automationen.manager;
    const eintrag = (await manager.findOne(KLASSE[ziel.art], {
      where: { id: ziel.id, workspaceId: automation.workspaceId },
    })) as (DealEntity | ContactEntity | CompanyEntity) | null;

    if (eintrag === null || feldKey == null) {
      throw new Uebersprungen('Den Eintrag gibt es nicht mehr.');
    }

    if (
      !(await this.permissions.can(
        this.erstellerVon(automation),
        SCHREIBRECHT[ziel.art],
      ))
    ) {
      throw new Uebersprungen(
        'Wer die Regel angelegt hat, darf diese Art Datensatz nicht ändern.',
      );
    }

    if (
      (await feldrechteJetzt())[feldrechtSchluessel(ziel.art, feldKey)] !==
      undefined
    ) {
      throw new Uebersprungen(
        'Dieses Feld darf die Rolle des Erstellers nicht ändern.',
      );
    }

    const wert = feldWert == null || feldWert === '' ? null : feldWert;

    await this.schreibbarPruefen(
      automation,
      ziel,
      feldKey === 'std:ownerId' ? wert : undefined,
    );

    if (feldKey.startsWith('std:')) {
      const spalte = feldKey.slice(4);

      if (spalte === 'ownerId') {
        const [mitglied] =
          wert === null
            ? [null]
            : await this.mitglieder(automation.workspaceId, [wert]);

        if (mitglied === undefined) {
          throw new Uebersprungen('Diese Person ist nicht mehr im Team.');
        }

        (eintrag as { ownerId: string | null }).ownerId = mitglied;
        delete (eintrag as { owner?: unknown }).owner;
      } else if (spalte === 'stage') {
        await this.pruefePhase(
          automation.workspaceId,
          eintrag as DealEntity,
          wert as DealStage,
        );
        (eintrag as DealEntity).stage = wert as DealStage;
      } else if (spalte === 'probability') {
        (eintrag as DealEntity).probability =
          wert === null ? null : Number(wert);
      }
    } else {
      eintrag.customFields = await this.customFields.validate(
        automation.workspaceId,
        FELDART[ziel.art],
        { [feldKey]: wert },
        eintrag.customFields,
        { ausserId: eintrag.id },
      );
    }

    if (!lauf.test) {
      await manager.save(eintrag);
    }
  }

  private async pruefePhase(
    workspaceId: string,
    deal: DealEntity,
    phase: DealStage,
  ): Promise<void> {
    if (deal.stage === phase) {
      return;
    }

    const manager = this.automationen.manager;
    const eintrag = (
      await phasenFuer(manager, workspaceId, deal.pipelineId)
    ).find((p) => p.stage === phase);

    if (eintrag?.ausgeblendet === true) {
      throw new Uebersprungen(
        `Die Phase „${eintrag.label}“ ist in der Pipeline dieses Geschäfts ausgeblendet.`,
      );
    }

    const fehlend = fehlendePflichtfelder(
      await this.customFields.list(workspaceId, CustomFieldEntity.DEAL),
      phase,
      deal.customFields,
    );

    if (fehlend.length > 0) {
      throw new Uebersprungen(
        `Für diese Phase fehlt noch: ${fehlend.join(', ')}.`,
      );
    }
  }

  private async mailSenden(
    automation: AutomationEntity,
    daten: AutomationAktionDaten,
    ziel: Ziel,
    lauf: Lauf,
  ): Promise<Record<string, unknown>> {
    const manager = this.automationen.manager;
    const ownerId = await this.verantwortlicher(automation, ziel);

    if (daten.mailAn === AutomationMailAn.HAUPTKONTAKT) {
      if (ownerId === null) {
        throw new Uebersprungen(
          'Der Eintrag hat keinen Verantwortlichen, aus dessen Postfach geschrieben werden könnte.',
        );
      }

      const kontaktId =
        ziel.art === 'contact'
          ? ziel.id
          : ziel.art === 'deal'
            ? ((
                await manager.findOne(DealEntity, {
                  where: { id: ziel.id, workspaceId: automation.workspaceId },
                })
              )?.primaryContactId ?? null)
            : null;
      const kontakt =
        kontaktId === null
          ? null
          : await manager.findOne(ContactEntity, {
              where: { id: kontaktId, workspaceId: automation.workspaceId },
              relations: { company: true },
            });

      if (kontakt === null || kontakt.email == null || kontakt.email === '') {
        throw new Uebersprungen('Der Kontakt hat keine E-Mail-Adresse.');
      }

      const vorlage =
        daten.vorlageId == null
          ? null
          : await manager.findOne(MailTemplateEntity, {
              where: {
                id: daten.vorlageId,
                workspaceId: automation.workspaceId,
              },
            });

      if (vorlage === null) {
        throw new Uebersprungen('Die Mailvorlage gibt es nicht mehr.');
      }

      const ich = await manager.findOne(UserEntity, { where: { id: ownerId } });
      const werte = {
        vorname: kontakt.firstName,
        nachname: kontakt.lastName,
        firma: kontakt.company?.name ?? null,
        mein_vorname: ich?.firstName ?? null,
        mein_name: ich === null ? null : `${ich.firstName} ${ich.lastName}`,
      };

      const betreff = fuelleVorlage(vorlage.subject ?? automation.name, werte);

      if (lauf.test) {
        return {
          simuliert: true,
          an: kontakt.email,
          betreff,
          ...(daten.mailAlsEntwurf === true ? { entwurf: true } : {}),
        };
      }

      if (daten.mailAlsEntwurf === true) {
        const entwurf = await entwurfAnlegen(manager, {
          workspaceId: automation.workspaceId,
          ownerId,
          an: [kontakt.email],
          betreff,
          rumpf: fuelleVorlage(vorlage.body, werte),
          ziel: { [SPALTE[ziel.art]]: ziel.id },
          quelle: 'automation',
          automationId: automation.id,
          vonId: null,
        });

        return { entwurfId: entwurf.id, an: kontakt.email, betreff };
      }

      try {
        await this.postfach.senden(automation.workspaceId, ownerId, {
          an: [kontakt.email],
          betreff,
          rumpf: fuelleVorlage(vorlage.body, werte),
        });
      } catch (fehler) {
        if (fehler instanceof HttpException && fehler.getStatus() === 400) {
          throw new Uebersprungen(fehler.message);
        }

        throw fehler;
      }

      return { an: kontakt.email, betreff };
    }

    const empfaenger =
      ownerId === null
        ? null
        : await manager.findOne(UserEntity, { where: { id: ownerId } });

    if (empfaenger === null) {
      throw new Uebersprungen('Der Eintrag hat keinen Verantwortlichen.');
    }

    const name = await this.zielName(automation.workspaceId, ziel);
    const betreff = (daten.titel ?? automation.name).slice(0, 200);

    if (lauf.test) {
      return { simuliert: true, an: empfaenger.email, betreff };
    }

    const zugestellt = await this.mail.send({
      to: empfaenger.email,
      subject: betreff,
      text: [
        daten.mailText ?? '',
        '',
        `Betrifft: ${name}`,
        `Automation: ${automation.name}`,
      ]
        .join('\n')
        .trim(),
    });

    if (!zugestellt) {
      throw new Uebersprungen('Die Mail konnte nicht zugestellt werden.');
    }

    return { an: empfaenger.email, betreff };
  }

  private async zielName(workspaceId: string, ziel: Ziel): Promise<string> {
    const spalten =
      ziel.art === 'contact' ? `"firstName" || ' ' || "lastName"` : `"name"`;
    const zeilen = (await this.automationen.query(
      `SELECT ${spalten} AS "name" FROM "${TABELLE[ziel.art]}" WHERE "id" = $1 AND "workspaceId" = $2`,
      [ziel.id, workspaceId],
    )) as { name: string }[];

    return zeilen[0]?.name ?? 'ein Eintrag';
  }

  private async reihum(
    automation: AutomationEntity,
    daten: AutomationAktionDaten,
    ziel: Ziel,
    lauf: Lauf,
  ): Promise<string> {
    const reihe = await this.mitglieder(
      automation.workspaceId,
      daten.reihumUserIds ?? [],
    );

    if (reihe.length === 0) {
      throw new Uebersprungen('Niemand aus der Reihe ist noch im Team.');
    }

    if (lauf.test) {
      const dran = reihe[automation.reihumZeiger % reihe.length];

      await this.schreibbarPruefen(automation, ziel, dran);

      return dran;
    }

    await this.schreibbarPruefen(automation, ziel);

    const ergebnis: unknown = await this.automationen.query(
      `UPDATE "automationen" SET "reihumZeiger" = "reihumZeiger" + 1 WHERE "id" = $1 RETURNING "reihumZeiger"`,
      [automation.id],
    );
    const zeilen = (
      Array.isArray(ergebnis) && Array.isArray(ergebnis[0])
        ? ergebnis[0]
        : ergebnis
    ) as { reihumZeiger: number }[];

    const zeiger = (zeilen[0]?.reihumZeiger ?? 1) - 1;
    const naechster = reihe[zeiger % reihe.length];

    await this.schreibbarPruefen(automation, ziel, naechster);

    await this.automationen.query(
      `UPDATE "${TABELLE[ziel.art]}" SET "ownerId" = $1 WHERE "id" = $2 AND "workspaceId" = $3`,
      [naechster, ziel.id, automation.workspaceId],
    );

    return naechster;
  }

  private async mitglieder(
    workspaceId: string,
    userIds: string[],
  ): Promise<string[]> {
    if (userIds.length === 0) {
      return [];
    }

    const vorhanden = new Set(
      (
        await this.automationen.manager.find(MembershipEntity, {
          where: { workspaceId, userId: In(userIds) },
          select: ['userId'],
        })
      ).map((mitglied) => mitglied.userId),
    );

    return userIds.filter((id) => vorhanden.has(id));
  }

  private async verantwortlicher(
    automation: AutomationEntity,
    ziel: Ziel,
  ): Promise<string | null> {
    const zeilen = (await this.automationen.query(
      `SELECT "ownerId" FROM "${TABELLE[ziel.art]}" WHERE "id" = $1 AND "workspaceId" = $2`,
      [ziel.id, automation.workspaceId],
    )) as { ownerId: string | null }[];

    return zeilen[0]?.ownerId ?? null;
  }

  private async zustaendig(
    automation: AutomationEntity,
    daten: AutomationAktionDaten,
    ziel: Ziel,
  ): Promise<string> {
    const fest = daten.zustaendigUserId;

    if (fest != null) {
      const [mitglied] = await this.mitglieder(automation.workspaceId, [fest]);

      if (mitglied !== undefined) {
        return mitglied;
      }
    }

    return (
      (await this.verantwortlicher(automation, ziel)) ?? automation.erstelltVon
    );
  }

  private async finde(
    workspaceId: string,
    id: string,
  ): Promise<AutomationEntity> {
    const automation = await this.automationen.findOne({
      where: { id, workspaceId },
    });

    if (automation === null) {
      throw new NotFoundException('Diese Automation gibt es nicht.');
    }

    return automation;
  }

  private async pruefeBedingungen(
    workspaceId: string,
    art: Ziel['art'] | null,
    bedingungen: AutomationFilter[],
    wer: Bearbeiter,
  ): Promise<AutomationFilter[]> {
    if (bedingungen.length === 0) {
      return [];
    }

    if (art === null) {
      throw new BadRequestException(
        'Beim Webformular gibt es keine Bedingungen: es legt Kontakte und Geschäfte an.',
      );
    }

    if (bedingungen.length > MAX_BEDINGUNGEN) {
      throw new BadRequestException(
        `Höchstens ${String(MAX_BEDINGUNGEN)} Bedingungen je Regel.`,
      );
    }

    const geprueft: AutomationFilter[] = [];

    for (const eintrag of bedingungen) {
      const feld = await this.feld(workspaceId, art, eintrag.key);

      if (feld === undefined) {
        throw new BadRequestException(`Unbekanntes Feld "${eintrag.key}".`);
      }

      if (wer.felder[feldrechtSchluessel(art, eintrag.key)] === 'verborgen') {
        throw new BadRequestException(
          `Nach „${feld.label}“ kann Ihre Rolle nicht filtern.`,
        );
      }

      const operator = eintrag.operator as CustomFieldFilterOperator;

      if (!operatorPasst(feld.type, operator)) {
        throw new BadRequestException(
          `Dieser Vergleich passt nicht zu "${feld.label}".`,
        );
      }

      const ohneWert = OHNE_WERT.includes(operator);
      const wert = (eintrag.value ?? '').trim();

      if (!ohneWert && wert === '') {
        throw new BadRequestException(
          `Für die Bedingung auf "${feld.label}" fehlt ein Wert.`,
        );
      }

      filterFragment('record', feld, operator, ohneWert ? undefined : wert, 0);

      geprueft.push({
        key: eintrag.key,
        operator,
        ...(ohneWert ? {} : { value: wert.slice(0, 200) }),
      });
    }

    return geprueft;
  }

  private async pruefeFeldSetzen(
    workspaceId: string,
    art: Ziel['art'] | null,
    feldKey: string | null | undefined,
    feldWert: string | null | undefined,
    wer: Bearbeiter,
  ): Promise<Pick<AutomationAktionDaten, 'feldKey' | 'feldWert'>> {
    if (art === null) {
      throw new BadRequestException(
        'Beim Webformular weiß die Regel nicht, ob ein Kontakt oder ein Geschäft gemeint ist.',
      );
    }

    if (feldKey == null || feldKey === '') {
      throw new BadRequestException('Bitte das Feld wählen, das gesetzt wird.');
    }

    if (
      !(await this.permissions.can(wer.anrufer, SCHREIBRECHT[art])) ||
      wer.felder[feldrechtSchluessel(art, feldKey)] !== undefined
    ) {
      throw new BadRequestException(
        'Dieses Feld dürfen Sie nicht ändern, also auch keine Regel dafür anlegen.',
      );
    }

    const wert = (feldWert ?? '').trim();

    if (feldKey.startsWith('std:')) {
      if (!SETZBAR[art].includes(feldKey)) {
        throw new BadRequestException(
          'Dieses Feld kann eine Automation nicht setzen.',
        );
      }

      if (
        feldKey === 'std:stage' &&
        !(Object.values(DealStage) as string[]).includes(wert)
      ) {
        throw new BadRequestException('Diese Phase gibt es nicht.');
      }

      if (feldKey === 'std:probability' && wert !== '') {
        const zahl = Number(wert);

        if (!Number.isInteger(zahl) || zahl < 0 || zahl > 100) {
          throw new BadRequestException(
            'Die Wahrscheinlichkeit liegt zwischen 0 und 100.',
          );
        }
      }

      if (feldKey === 'std:ownerId' && wert !== '') {
        const [mitglied] = await this.mitglieder(workspaceId, [wert]);

        if (mitglied === undefined) {
          throw new BadRequestException(
            'Verantwortlich kann nur ein Mitglied dieses Arbeitsbereichs sein.',
          );
        }
      }

      return { feldKey, feldWert: wert === '' ? null : wert };
    }

    const definition = (
      await this.customFields.list(workspaceId, FELDART[art])
    ).find((f) => f.key === feldKey);

    if (definition === undefined) {
      throw new BadRequestException(`Unbekanntes Feld "${feldKey}".`);
    }

    if (definition.eindeutig) {
      throw new BadRequestException(
        `"${definition.label}" ist eindeutig und kann nicht von einer Regel gesetzt werden.`,
      );
    }

    await this.customFields.validate(workspaceId, FELDART[art], {
      [feldKey]: wert === '' ? null : wert,
    });

    return { feldKey, feldWert: wert === '' ? null : wert };
  }

  private async pruefeSchritt(
    workspaceId: string,
    ausloeser: AutomationAusloeser,
    ausloeserArt: Ziel['art'] | null,
    eingabe: SchrittEingabe,
    nr: number,
    vorher: AutomationSchritt[],
    alt: AutomationAktionDaten | undefined,
    wer: Bearbeiter,
  ): Promise<AutomationAktionDaten> {
    const alteKoepfe: AutomationHeader[] = alt?.httpHeader ?? [];
    const aktionDaten: AutomationAktionDaten = {};
    const zielSchritt = eingabe.zielSchritt ?? null;
    let art = ausloeserArt;

    if (zielSchritt !== null) {
      const quelle = vorher[zielSchritt - 1] as AutomationSchritt | undefined;

      if (
        !Number.isInteger(zielSchritt) ||
        zielSchritt < 1 ||
        zielSchritt >= nr ||
        quelle === undefined
      ) {
        throw new BadRequestException(
          `Schritt ${String(nr)}: als Datensatz nur einen früheren Schritt wählen.`,
        );
      }

      const quellArt =
        quelle.aktion === AutomationAktion.DATENSAETZE_SUCHEN
          ? quelle.daten.suchArt
          : quelle.aktion === AutomationAktion.ANLEGEN_ODER_AKTUALISIEREN
            ? quelle.daten.upsertArt
            : (quelle.daten.zielSchritt ?? null) === null
              ? ausloeserArt
              : null;

      if (quellArt == null) {
        throw new BadRequestException(
          `Schritt ${String(nr)}: Schritt ${String(zielSchritt)} ergibt keinen Datensatz.`,
        );
      }

      art = quellArt;
      aktionDaten.zielSchritt = zielSchritt;
    }

    const text = (wert: string | null | undefined, max: number): string =>
      (wert ?? '').trim().slice(0, max);

    switch (eingabe.aktion) {
      case AutomationAktion.VERANTWORTLICH_REIHUM: {
        if (
          ausloeser === AutomationAusloeser.ZEITPLAN ||
          ausloeser === AutomationAusloeser.GESCHAEFT_GEAENDERT ||
          ausloeser === AutomationAusloeser.KONTAKT_GEAENDERT ||
          ausloeser === AutomationAusloeser.FIRMA_GEAENDERT ||
          ausloeser === AutomationAusloeser.PHASE_GEAENDERT ||
          ausloeser === AutomationAusloeser.GESCHAEFT_RUHEND
        ) {
          throw new BadRequestException(
            'Reihum verteilt nur, was neu hereinkommt — nicht bei einer Änderung.',
          );
        }

        if (
          art === null &&
          ausloeser !== AutomationAusloeser.WEBFORMULAR_EINGANG
        ) {
          throw new BadRequestException(
            `Schritt ${String(nr)}: Reihum braucht einen Datensatz.`,
          );
        }

        const reihe = [...new Set(eingabe.reihumUserIds ?? [])];
        const gueltig = await this.mitglieder(workspaceId, reihe);

        if (gueltig.length < reihe.length || gueltig.length === 0) {
          throw new BadRequestException(
            'Bitte nur Mitglieder dieses Arbeitsbereichs wählen, mindestens eines.',
          );
        }

        aktionDaten.reihumUserIds = gueltig;
        break;
      }
      case AutomationAktion.FELD_SETZEN:
        Object.assign(
          aktionDaten,
          await this.pruefeFeldSetzen(
            workspaceId,
            art,
            eingabe.feldKey,
            eingabe.feldWert,
            wer,
          ),
        );
        break;
      case AutomationAktion.MAIL_SENDEN: {
        const mailAn = eingabe.mailAn ?? AutomationMailAn.VERANTWORTLICH;

        aktionDaten.mailAn = mailAn;

        if (mailAn === AutomationMailAn.HAUPTKONTAKT) {
          if (art !== 'deal' && art !== 'contact') {
            throw new BadRequestException(
              'An den Kontakt schreibt eine Regel nur bei Geschäften und Kontakten.',
            );
          }

          const vorlage =
            eingabe.vorlageId == null
              ? null
              : await this.automationen.manager.findOne(MailTemplateEntity, {
                  where: { id: eingabe.vorlageId, workspaceId },
                });

          if (vorlage === null) {
            throw new BadRequestException('Bitte eine Mailvorlage wählen.');
          }

          aktionDaten.vorlageId = vorlage.id;
          aktionDaten.mailAlsEntwurf = eingabe.mailAlsEntwurf === true;
        } else {
          const betreff = text(eingabe.titel, 200);

          if (betreff === '') {
            throw new BadRequestException('Bitte einen Betreff angeben.');
          }

          if (
            art === null &&
            ausloeser !== AutomationAusloeser.WEBFORMULAR_EINGANG
          ) {
            throw new BadRequestException(
              `Schritt ${String(nr)}: eine Mail an den Verantwortlichen braucht einen Datensatz.`,
            );
          }

          aktionDaten.titel = betreff;
          aktionDaten.mailText = text(eingabe.mailText, 2000);
        }

        break;
      }
      case AutomationAktion.DATENSAETZE_SUCHEN: {
        const suchArt = eingabe.suchArt;

        if (
          suchArt !== 'deal' &&
          suchArt !== 'contact' &&
          suchArt !== 'company'
        ) {
          throw new BadRequestException('Bitte wählen, wonach gesucht wird.');
        }

        const feld = await this.feld(
          workspaceId,
          suchArt,
          eingabe.suchFeld ?? '',
        );

        if (feld === undefined) {
          throw new BadRequestException(
            `Unbekanntes Feld "${String(eingabe.suchFeld)}".`,
          );
        }

        const vergleich = (eingabe.suchVergleich ??
          CustomFieldFilterOperator.EQUALS) as CustomFieldFilterOperator;

        if (!operatorPasst(feld.type, vergleich)) {
          throw new BadRequestException(
            `Dieser Vergleich passt nicht zu "${feld.label}".`,
          );
        }

        aktionDaten.suchArt = suchArt;
        aktionDaten.suchFeld = eingabe.suchFeld ?? null;
        aktionDaten.suchVergleich = vergleich;
        aktionDaten.suchWert = text(eingabe.suchWert, 500);
        break;
      }
      case AutomationAktion.ANLEGEN_ODER_AKTUALISIEREN: {
        const upsertArt = eingabe.upsertArt;

        if (
          upsertArt !== 'deal' &&
          upsertArt !== 'contact' &&
          upsertArt !== 'company'
        ) {
          throw new BadRequestException('Bitte wählen, was angelegt wird.');
        }

        const werte: Record<string, string> = {};

        for (const eintrag of eingabe.upsertWerte ?? []) {
          if (!UPSERT_FELDER[upsertArt].includes(eintrag.feld)) {
            throw new BadRequestException(
              `Das Feld „${eintrag.feld}“ setzt dieser Schritt nicht.`,
            );
          }

          const wert = text(eintrag.wert, 500);

          if (wert !== '') {
            werte[eintrag.feld] = wert;
          }
        }

        const merkmal =
          upsertArt === 'contact'
            ? werte.email
            : upsertArt === 'company'
              ? (werte.domain ?? werte.name)
              : werte.name;

        if (merkmal === undefined) {
          throw new BadRequestException(
            upsertArt === 'contact'
              ? 'Ein Kontakt wird über die E-Mail-Adresse erkannt; bitte sie angeben.'
              : upsertArt === 'company'
                ? 'Eine Firma wird über Domain oder Namen erkannt; bitte eins angeben.'
                : 'Ein Geschäft wird über den Namen erkannt; bitte ihn angeben.',
          );
        }

        aktionDaten.upsertArt = upsertArt;
        aktionDaten.upsertWerte = werte;
        break;
      }
      case AutomationAktion.TERMIN_ANLEGEN: {
        const titel = text(eingabe.titel, 200);
        const tage = eingabe.terminInTagen ?? 1;
        const uhrzeit = eingabe.terminUhrzeit ?? '09:00';
        const dauer = eingabe.terminDauer ?? 30;

        if (titel === '') {
          throw new BadRequestException('Bitte den Titel des Termins angeben.');
        }

        if (!Number.isInteger(tage) || tage < 0 || tage > 365) {
          throw new BadRequestException('Termin in 0 bis 365 Tagen.');
        }

        if (!/^([01]\d|2[0-3]):[0-5]\d$/u.test(uhrzeit)) {
          throw new BadRequestException('Die Uhrzeit bitte als HH:MM.');
        }

        if (!Number.isInteger(dauer) || dauer < 5 || dauer > 24 * 60) {
          throw new BadRequestException('Dauer 5 Minuten bis 24 Stunden.');
        }

        aktionDaten.titel = titel;
        aktionDaten.terminInTagen = tage;
        aktionDaten.terminUhrzeit = uhrzeit;
        aktionDaten.terminDauer = dauer;
        aktionDaten.terminOrt = text(eingabe.terminOrt, 300) || null;
        break;
      }
      case AutomationAktion.KANAL_NACHRICHT: {
        const dienst = eingabe.kanalDienst;

        if (dienst !== 'slack' && dienst !== 'teams') {
          throw new BadRequestException('Bitte Slack oder Teams wählen.');
        }

        const neu = text(eingabe.kanalUrl, 2000);
        const bisher =
          alt?.kanalDienst === dienst ? (alt.kanalUrlSealed ?? null) : null;

        if (neu === '') {
          if (bisher === null) {
            throw new BadRequestException(
              `Bitte die Webhook-Adresse aus ${KANAL_NAME[dienst]} eintragen.`,
            );
          }

          aktionDaten.kanalUrlSealed = bisher;
          aktionDaten.kanalUrlAnzeige = alt?.kanalUrlAnzeige ?? null;
        } else {
          const geprueft = pruefeKanalUrl(dienst, neu, internErlaubt());

          if (!geprueft.ok) {
            throw new BadRequestException(geprueft.grund);
          }

          try {
            pruefeZielForm(
              geprueft.url.toString(),
              internErlaubt(),
              internErlaubt(),
            );
          } catch (fehler) {
            throw new BadRequestException(fehlertext(fehler));
          }

          aktionDaten.kanalUrlSealed = seal(
            geprueft.url.toString(),
            this.schluessel,
          );
          aktionDaten.kanalUrlAnzeige = kanalUrlAnzeige(
            geprueft.url.toString(),
          );
        }

        const nachricht = text(eingabe.kanalText, MAX_KANAL_TEXT);

        if (nachricht === '') {
          throw new BadRequestException(
            'Bitte den Text der Nachricht angeben.',
          );
        }

        aktionDaten.kanalDienst = dienst;
        aktionDaten.kanalText = nachricht;
        aktionDaten.kanalLink = eingabe.kanalLink === true && art !== null;
        break;
      }
      case AutomationAktion.HTTP_ANFRAGE: {
        const methode = (eingabe.httpMethode ?? 'POST').toUpperCase();

        if (!HTTP_METHODEN.includes(methode)) {
          throw new BadRequestException('Diese Methode gibt es hier nicht.');
        }

        const url = text(eingabe.httpUrl, 2000);

        if (!url.includes('{{')) {
          try {
            pruefeZielForm(url, internErlaubt(), internErlaubt());
          } catch (fehler) {
            throw new BadRequestException(fehlertext(fehler));
          }
        } else if (!/^https?:\/\/[^{}/?#]+[/?#]/u.test(url)) {
          throw new BadRequestException(
            'Der Anfang der Adresse (https://name/) muss feststehen.',
          );
        }

        const koepfe = eingabe.httpHeader ?? [];
        const altUrl = alt?.httpUrl ?? null;

        if (koepfe.length > MAX_KOEPFE) {
          throw new BadRequestException(
            `Höchstens ${String(MAX_KOEPFE)} Köpfe je Anfrage.`,
          );
        }

        aktionDaten.httpHeader = koepfe.map((kopf) => {
          const name = kopf.name.trim();

          if (
            !/^[A-Za-z0-9-]{1,60}$/u.test(name) ||
            /^(host|content-length|x-stegwerk-automation-tiefe)$/iu.test(name)
          ) {
            throw new BadRequestException(
              `Den Kopf „${name}“ gibt es hier nicht.`,
            );
          }

          const wert = kopf.wert ?? '';
          const alt = alteKoepfe.find(
            (k) => k.name.toLowerCase() === name.toLowerCase(),
          );

          if (wert === '' && alt !== undefined) {
            const bisher = ursprungVon(altUrl ?? '');

            if (bisher === null || bisher !== ursprungVon(url)) {
              throw new BadRequestException(
                `Die Adresse hat sich geändert: bitte den Wert von „${name}“ neu eingeben.`,
              );
            }

            return { name, wertSealed: alt.wertSealed };
          }

          if (wert === '') {
            throw new BadRequestException(
              `Bitte einen Wert für den Kopf „${name}“ angeben.`,
            );
          }

          if (/[\r\n]/u.test(wert) || wert.length > 2000) {
            throw new BadRequestException(
              `Der Wert von „${name}“ ist ungültig.`,
            );
          }

          return { name, wertSealed: seal(wert, this.schluessel) };
        });
        aktionDaten.httpMethode = methode;
        aktionDaten.httpUrl = url;
        aktionDaten.httpRumpf =
          methode === 'GET' || methode === 'DELETE'
            ? null
            : text(eingabe.httpRumpf, 10_000);
        break;
      }
      default: {
        const titel = text(eingabe.titel, 200);

        if (titel === '') {
          throw new BadRequestException(
            eingabe.aktion === AutomationAktion.NOTIZ_ANLEGEN
              ? 'Bitte den Text der Notiz angeben.'
              : 'Bitte den Titel der Aufgabe angeben.',
          );
        }

        aktionDaten.titel = titel;

        if (eingabe.aktion === AutomationAktion.AUFGABE_ANLEGEN) {
          const tage = eingabe.faelligInTagen ?? 0;

          if (!Number.isInteger(tage) || tage < 0 || tage > 365) {
            throw new BadRequestException(
              'Fällig in 0 bis 365 Tagen, in ganzen Tagen.',
            );
          }

          aktionDaten.faelligInTagen = tage;

          if (eingabe.zustaendigUserId != null) {
            const [mitglied] = await this.mitglieder(workspaceId, [
              eingabe.zustaendigUserId,
            ]);

            if (mitglied === undefined) {
              throw new BadRequestException(
                'Zuständig kann nur ein Mitglied dieses Arbeitsbereichs sein.',
              );
            }

            aktionDaten.zustaendigUserId = mitglied;
          }
        }
      }
    }

    return aktionDaten;
  }

  private async pruefe(
    workspaceId: string,
    eingabe: AutomationEingabe,
    wer: Bearbeiter,
    vorher: AutomationEntity | null = null,
  ): Promise<
    Pick<
      AutomationEntity,
      | 'name'
      | 'aktiv'
      | 'ausloeser'
      | 'bedingung'
      | 'aktion'
      | 'aktionDaten'
      | 'verzoegerungTage'
      | 'schritte'
      | 'naechsterLauf'
    >
  > {
    const name = eingabe.name.trim();

    if (name === '') {
      throw new BadRequestException('Eine Automation braucht einen Namen.');
    }

    const regelArt =
      eingabe.ausloeser === AutomationAusloeser.MANUELL ||
      eingabe.ausloeser === AutomationAusloeser.ZEITPLAN
        ? (eingabe.art ?? null)
        : null;

    if (
      regelArt !== null &&
      regelArt !== 'deal' &&
      regelArt !== 'contact' &&
      regelArt !== 'company'
    ) {
      throw new BadRequestException('Diese Art Datensatz gibt es nicht.');
    }

    if (
      eingabe.ausloeser === AutomationAusloeser.MANUELL &&
      regelArt === null
    ) {
      throw new BadRequestException(
        'Bitte wählen, an welcher Art Datensatz der Knopf erscheint.',
      );
    }

    const art = artDerRegel(eingabe.ausloeser, regelArt);

    const phase =
      eingabe.ausloeser === AutomationAusloeser.PHASE_GEAENDERT &&
      eingabe.phase != null &&
      eingabe.phase !== ''
        ? eingabe.phase
        : null;

    if (
      phase !== null &&
      !(Object.values(DealStage) as string[]).includes(phase)
    ) {
      throw new BadRequestException('Diese Phase gibt es nicht.');
    }

    let ruhendTage: number | null = null;

    if (eingabe.ausloeser === AutomationAusloeser.GESCHAEFT_RUHEND) {
      ruhendTage = eingabe.ruhendTage ?? 14;

      if (!Number.isInteger(ruhendTage) || ruhendTage < 1 || ruhendTage > 365) {
        throw new BadRequestException(
          'Ruhend ab 1 bis 365 Tagen, in ganzen Tagen.',
        );
      }
    }

    let zeitplan: AutomationZeitplan | null = null;

    if (eingabe.ausloeser === AutomationAusloeser.ZEITPLAN) {
      if (eingabe.zeitplan == null) {
        throw new BadRequestException('Bitte angeben, wann die Regel läuft.');
      }

      zeitplan = {
        rhythmus: eingabe.zeitplan.rhythmus,
        uhrzeit: eingabe.zeitplan.uhrzeit,
        wochentag: eingabe.zeitplan.wochentag ?? null,
        monatstag: eingabe.zeitplan.monatstag ?? null,
      };

      const fehler = pruefeZeitplan(zeitplan);

      if (fehler !== null) {
        throw new BadRequestException(fehler);
      }
    }

    const verzoegerungTage = eingabe.verzoegerungTage ?? 0;

    if (
      !Number.isInteger(verzoegerungTage) ||
      verzoegerungTage < 0 ||
      verzoegerungTage > 365
    ) {
      throw new BadRequestException(
        'Verzögerung 0 bis 365 Tage, in ganzen Tagen.',
      );
    }

    if (
      eingabe.ausloeser === AutomationAusloeser.MANUELL &&
      verzoegerungTage > 0
    ) {
      throw new BadRequestException(
        'Ein Knopf am Datensatz läuft sofort, ohne Verzögerung.',
      );
    }

    const filter = await this.pruefeBedingungen(
      workspaceId,
      art,
      eingabe.bedingungen ?? [],
      wer,
    );

    const eingaben = [eingabe, ...(eingabe.weitereSchritte ?? [])];

    if (eingaben.length > MAX_SCHRITTE) {
      throw new BadRequestException(
        `Höchstens ${String(MAX_SCHRITTE)} Schritte je Regel.`,
      );
    }

    const alteSchritte = vorher === null ? [] : this.alleSchritte(vorher);
    const schritte: AutomationSchritt[] = [];

    for (const [index, schritt] of eingaben.entries()) {
      const daten = await this.pruefeSchritt(
        workspaceId,
        eingabe.ausloeser,
        art,
        schritt,
        index + 1,
        schritte,
        alteSchritte[index]?.daten,
        wer,
      );

      schritte.push({ aktion: schritt.aktion, daten });
    }

    const aktiv = eingabe.aktiv ?? true;

    return {
      name: name.slice(0, 120),
      aktiv,
      ausloeser: eingabe.ausloeser,
      bedingung: { phase, filter, ruhendTage, art: regelArt, zeitplan },
      aktion: schritte[0].aktion,
      aktionDaten: schritte[0].daten,
      schritte: schritte.slice(1),
      verzoegerungTage,
      naechsterLauf:
        zeitplan === null ? null : naechsterLauf(zeitplan, new Date()),
    };
  }

  async sichtbarFuerAnrufer(art: Ziel['art'], id: string): Promise<boolean> {
    return zielSichtbar(this.automationen.manager, { [SPALTE[art]]: id });
  }

  async manuelleFuer(
    workspaceId: string,
    art: Ziel['art'],
  ): Promise<AutomationEntity[]> {
    return (
      await this.automationen.find({
        where: {
          workspaceId,
          aktiv: true,
          ausloeser: AutomationAusloeser.MANUELL,
        },
        order: { name: 'ASC' },
      })
    ).filter((automation) => automation.bedingung.art === art);
  }

  async manuellStarten(
    workspaceId: string,
    id: string,
    zielId: string,
  ): Promise<AutomationAusfuehrungEntity> {
    const automation = await this.finde(workspaceId, id);
    const art = automation.bedingung.art ?? null;

    if (
      automation.ausloeser !== AutomationAusloeser.MANUELL ||
      !automation.aktiv ||
      art === null
    ) {
      throw new BadRequestException('Diese Regel hat keinen Knopf.');
    }

    const ziel: Ziel = { art, id: zielId };

    if (!(await this.zielVorhanden(workspaceId, ziel))) {
      throw new NotFoundException('Den Datensatz gibt es nicht.');
    }

    let grund: string | null = null;

    try {
      if (!(await this.sichtbarFuerErsteller(automation, ziel))) {
        grund = NICHT_SICHTBAR;
      } else if (!(await this.bedingungenErfuellt(automation, ziel))) {
        grund = 'Die Bedingungen der Regel treffen nicht zu.';
      }
    } catch (fehler) {
      if (!(fehler instanceof Uebersprungen)) {
        throw fehler;
      }

      grund = fehler.message;
    }

    if (grund !== null) {
      return this.ausfuehrungen.save(
        this.ausfuehrungen.create({
          workspaceId,
          automationId: automation.id,
          zielArt: art,
          zielId,
          ...uebersprungen(grund),
          faelligAm: new Date(),
          erledigtAm: new Date(),
        }),
      );
    }

    if (await this.zuVieleLaeufe(automation)) {
      throw new BadRequestException(
        'Diese Regel lief gerade sehr oft; bitte kurz warten.',
      );
    }

    const ergebnis = await this.laeuft.run(true, () =>
      this.ausfuehrenMitErgebnis(automation, ziel),
    );

    return this.ausfuehrungen.save(
      this.ausfuehrungen.create({
        workspaceId,
        automationId: automation.id,
        zielArt: art,
        zielId,
        ...ergebnis,
        faelligAm: new Date(),
        erledigtAm: new Date(),
      }),
    );
  }

  async testen(
    workspaceId: string,
    id: string,
    zielId: string | null,
    beispiel: Record<string, unknown> | null,
    aufrufer: RequestUser,
  ): Promise<AutomationAusfuehrungEntity> {
    const automation = await this.finde(workspaceId, id);
    const art = artDerRegel(
      automation.ausloeser,
      automation.bedingung.art ?? null,
    );
    let ziel: Ziel | null = null;
    let ausloeserDaten: Record<string, unknown> | null = null;

    if (art !== null) {
      const neuester = async (): Promise<{ id: string } | undefined> => {
        const abfrage = this.automationen.manager
          .createQueryBuilder()
          .select('record."id"', 'id')
          .from(TABELLE[art], 'record')
          .where(
            'record."workspaceId" = :bereich AND record."deletedAt" IS NULL',
            { bereich: workspaceId },
          )
          .orderBy('record."createdAt"', 'DESC')
          .limit(1);
        const sichtbar = await sichtbarkeitsBedingung(art, 'record');

        if (sichtbar !== null) {
          abfrage.andWhere(sichtbar.where, sichtbar.parameters);
        }

        return abfrage.getRawOne<{ id: string }>();
      };
      const zeile =
        zielId !== null
          ? { id: zielId }
          : await runWithRequestContext(
              {
                requestId: `automation-${automation.id}`,
                automationId: automation.id,
                sichtfeld: () => this.permissions.sichtfeldFuer(aufrufer),
              },
              neuester,
            );

      if (
        zeile === undefined ||
        !(await this.zielVorhanden(workspaceId, { art, id: zeile.id }))
      ) {
        throw new BadRequestException(
          'Für den Probelauf gibt es noch keinen passenden Datensatz.',
        );
      }

      ziel = { art, id: zeile.id };
    } else if (automation.ausloeser === AutomationAusloeser.WEBHOOK_EINGANG) {
      ausloeserDaten =
        beispiel ??
        (
          await this.ausfuehrungen.findOne({
            where: { automationId: automation.id, testlauf: false },
            order: { createdAt: 'DESC' },
          })
        )?.ausloeserDaten ??
        {};
    }

    const ergebnis = await this.laeuft.run(true, () =>
      this.ausfuehrenMitErgebnis(automation, ziel, {
        test: true,
        ausloeserDaten,
        rechteVon: aufrufer,
      }),
    );

    return this.ausfuehrungen.save(
      this.ausfuehrungen.create({
        workspaceId,
        automationId: automation.id,
        zielArt: ziel?.art ?? 'keins',
        zielId: ziel?.id ?? null,
        testlauf: true,
        ausloeserDaten,
        ...ergebnis,
        faelligAm: new Date(),
        erledigtAm: new Date(),
      }),
    );
  }

  async wiederholen(
    workspaceId: string,
    ausfuehrungId: string,
  ): Promise<AutomationAusfuehrungEntity> {
    const alt = await this.ausfuehrungen.findOne({
      where: { id: ausfuehrungId, workspaceId },
    });

    if (alt === null) {
      throw new NotFoundException('Diesen Lauf gibt es nicht.');
    }

    if (
      alt.testlauf ||
      ![
        AusfuehrungStatus.FEHLER,
        AusfuehrungStatus.UEBERSPRUNGEN,
        AusfuehrungStatus.ABGEBROCHEN,
      ].includes(alt.status)
    ) {
      throw new BadRequestException(
        'Wiederholen lässt sich nur ein Lauf, der nicht durchging.',
      );
    }

    const automation = await this.finde(workspaceId, alt.automationId);

    if (!automation.aktiv) {
      throw new BadRequestException('Die Regel ist abgeschaltet.');
    }

    const ziel =
      alt.zielId === null
        ? null
        : ({ art: alt.zielArt, id: alt.zielId } as Ziel);
    const ergebnis = await this.laeuft.run(true, () =>
      this.pruefenUndAusfuehren(automation, ziel, alt.ausloeserDaten),
    );

    return this.ausfuehrungen.save(
      this.ausfuehrungen.create({
        workspaceId,
        automationId: automation.id,
        zielArt: alt.zielArt,
        zielId: alt.zielId,
        ausloeserDaten: alt.ausloeserDaten,
        ...ergebnis,
        faelligAm: new Date(),
        erledigtAm: new Date(),
      }),
    );
  }

  async abbrechen(
    workspaceId: string,
    ausfuehrungId: string,
  ): Promise<boolean> {
    const ergebnis = await this.ausfuehrungen.update(
      { id: ausfuehrungId, workspaceId, status: AusfuehrungStatus.GEPLANT },
      {
        status: AusfuehrungStatus.ABGEBROCHEN,
        grund: 'Von Hand abgebrochen.',
        erledigtAm: new Date(),
      },
    );

    if ((ergebnis.affected ?? 0) === 0) {
      throw new BadRequestException(
        'Abbrechen lässt sich nur ein Lauf, der noch wartet.',
      );
    }

    return true;
  }

  async eingangErneuern(
    workspaceId: string,
    id: string,
    mitSignatur: boolean,
  ): Promise<{ url: string; geheimnis: string | null }> {
    const automation = await this.finde(workspaceId, id);

    if (automation.ausloeser !== AutomationAusloeser.WEBHOOK_EINGANG) {
      throw new BadRequestException('Diese Regel hat keinen Eingang.');
    }

    const token = randomBytes(32).toString('base64url');
    const geheimnis = mitSignatur ? randomBytes(32).toString('hex') : null;

    automation.eingangTokenHash = tokenHash(token);
    automation.eingangGeheimnisSealed =
      geheimnis === null ? null : seal(geheimnis, this.schluessel);
    await this.automationen.save(automation);

    const basis = (
      this.config.get<string>('oauth.apiOrigin') ??
      this.config.get<string>('webOrigin') ??
      ''
    ).replace(/\/$/u, '');

    return { url: `${basis}/public/automationen/${token}`, geheimnis };
  }

  async eingang(
    token: string,
    rumpf: Buffer | undefined,
    koepfe: Record<string, string | string[] | undefined>,
  ): Promise<{
    automation: AutomationEntity;
    lauf: () => Promise<string | null>;
  }> {
    const nichtGefunden = new NotFoundException(
      'Diesen Eingang gibt es nicht.',
    );

    if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) {
      throw nichtGefunden;
    }

    const automation = await this.automationen.findOne({
      where: {
        eingangTokenHash: tokenHash(token),
        ausloeser: AutomationAusloeser.WEBHOOK_EINGANG,
        aktiv: true,
      },
    });

    if (automation === null) {
      throw nichtGefunden;
    }

    const roh = rumpf ?? Buffer.alloc(0);

    if (roh.length > MAX_EINGANG_BYTES) {
      throw new BadRequestException('Der Inhalt ist zu groß.');
    }

    const kopf = (name: string): string | undefined => {
      const wert = koepfe[name];

      return Array.isArray(wert) ? wert[0] : wert;
    };

    if (automation.eingangGeheimnisSealed !== null) {
      const zeitstempel = kopf('x-stegwerk-zeitstempel') ?? '';
      const signatur = kopf('x-stegwerk-signatur') ?? '';
      const sekunden = Number(zeitstempel);
      const erwartet = webhookSignatur(
        open(automation.eingangGeheimnisSealed, this.schluessel),
        zeitstempel,
        roh.toString('utf8'),
      );

      if (
        !/^\d{9,11}$/u.test(zeitstempel) ||
        Math.abs(Date.now() / 1000 - sekunden) > SIGNATUR_FENSTER_S ||
        !/^sha256=[0-9a-f]{64}$/u.test(signatur) ||
        signatur.length !== erwartet.length ||
        !timingSafeEqual(Buffer.from(signatur), Buffer.from(erwartet))
      ) {
        throw nichtGefunden;
      }
    }

    const tiefe = Number(kopf(TIEFE_KOPF) ?? '0');

    if (!Number.isInteger(tiefe) || tiefe < 0 || tiefe >= MAX_TIEFE) {
      throw new BadRequestException(
        'Zu viele Automationen rufen sich hier gegenseitig auf.',
      );
    }

    let daten: Record<string, unknown> = {};

    if (roh.length > 0) {
      let gelesen: unknown;

      try {
        gelesen = JSON.parse(roh.toString('utf8')) as unknown;
      } catch {
        throw new BadRequestException('Erwartet wird JSON.');
      }

      if (
        gelesen === null ||
        typeof gelesen !== 'object' ||
        Array.isArray(gelesen)
      ) {
        throw new BadRequestException('Erwartet wird ein JSON-Objekt.');
      }

      daten = gelesen as Record<string, unknown>;
    }

    return {
      automation,
      lauf: async () => {
        const ausfuehrung = await this.laeuft.run(true, () =>
          this.ausloesen(automation, null, new Date(), daten, tiefe),
        );

        return ausfuehrung?.id ?? null;
      },
    };
  }

  async pruefeZeitplaene(jetzt: Date = new Date()): Promise<number> {
    const faellig = await this.automationen.find({
      where: {
        aktiv: true,
        ausloeser: AutomationAusloeser.ZEITPLAN,
        naechsterLauf: LessThanOrEqual(jetzt),
      },
    });
    let gelaufen = 0;

    for (const automation of faellig) {
      const plan = automation.bedingung.zeitplan;

      if (plan == null || automation.naechsterLauf === null) {
        continue;
      }

      const uebernommen = await this.automationen.update(
        { id: automation.id, naechsterLauf: automation.naechsterLauf },
        { naechsterLauf: naechsterLauf(plan, jetzt) },
      );

      if ((uebernommen.affected ?? 0) === 0) {
        continue;
      }

      const art = automation.bedingung.art ?? null;

      if (art === null) {
        await this.laeuft.run(true, () =>
          this.ausloesen(automation, null, jetzt),
        );
        gelaufen += 1;
        continue;
      }

      let treffer: string[];

      try {
        treffer = await this.zeitplanTreffer(automation, art);
      } catch (fehler) {
        if (!(fehler instanceof Uebersprungen)) {
          throw fehler;
        }

        await this.ausfuehrungen.save(
          this.ausfuehrungen.create({
            workspaceId: automation.workspaceId,
            automationId: automation.id,
            zielArt: art,
            zielId: null,
            ...uebersprungen(fehler.message),
            faelligAm: jetzt,
            erledigtAm: new Date(),
          }),
        );
        continue;
      }

      for (const id of treffer) {
        await this.laeuft.run(true, () =>
          this.ausloesen(automation, { art, id }, jetzt),
        );
        gelaufen += 1;
      }
    }

    return gelaufen;
  }

  private async zeitplanTreffer(
    automation: AutomationEntity,
    art: Ziel['art'],
  ): Promise<string[]> {
    return this.alsErsteller(automation, async () => {
      await this.bedingungenSichtbar(art, automation.bedingung.filter ?? []);

      const eigene = await this.felderFuer(automation.workspaceId, art);
      const abfrage = this.automationen.manager
        .createQueryBuilder()
        .select('record."id"', 'id')
        .from(TABELLE[art], 'record')
        .where(
          'record."workspaceId" = :bereich AND record."deletedAt" IS NULL',
          { bereich: automation.workspaceId },
        )
        .orderBy('record."createdAt"', 'ASC')
        .limit(MAX_ZEITPLAN_TREFFER);

      (automation.bedingung.filter ?? []).forEach((eintrag, index) => {
        const feld =
          eigene.get(eintrag.key) ?? standardFeld(FELDART[art], eintrag.key);

        if (feld === undefined) {
          throw new Error(`Das Feld "${eintrag.key}" gibt es nicht mehr.`);
        }

        const fragment = filterFragment(
          'record',
          feld,
          eintrag.operator as CustomFieldFilterOperator,
          eintrag.value ?? undefined,
          index,
        );

        abfrage.andWhere(fragment.where, fragment.parameters);
      });

      const sichtbar = await sichtbarkeitsBedingung(art, 'record');

      if (sichtbar !== null) {
        abfrage.andWhere(sichtbar.where, sichtbar.parameters);
      }

      return ((await abfrage.getRawMany()) as { id: string }[]).map(
        (zeile) => zeile.id,
      );
    });
  }
}
