import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  In,
  IsNull,
  Not,
  Repository,
  type SelectQueryBuilder,
} from 'typeorm';

import { AttachmentBlobEntity } from '../attachments/attachment-blob.entity';
import { AttachmentEntity } from '../attachments/attachment.entity';
import { MAX_BYTES } from '../attachments/attachment-rules';
import {
  AttachmentsService,
  type AttachmentZiel,
  SPEICHER_JE_BEREICH,
} from '../attachments/attachments.service';
import {
  type ZielMitAkte,
  zielMitAkte,
} from '../attachments/attachment-rechte';
import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import {
  domainOf,
  isPublicDomain,
  type Matchable,
  matchMessage,
  normaliseAddress,
} from './address-match';
import {
  type DatensatzAenderung,
  hoereAufAenderungen,
} from '../crm/datensatz-ereignisse';
import {
  anhangSchluessel,
  type IncomingMessage,
  MAIL_READER,
  type MailboxCredentials,
  type MailReader,
  MailboxUnreachableError,
  type ReadResult,
} from './imap-reader';
import {
  type MailAnhangInfo,
  type MailAnhangView,
  MailMessageEntity,
} from './mail-message.entity';
import { MailSperreEntity } from './mail-sperre.entity';
import { nachErfolg, nachFehler } from './abruf-fehler';
import {
  normalisiereId,
  suchschluessel,
  verkettung,
  zuordnen,
} from './mail-threading';
import { neueKennung, pruefePost } from './outbound-mail';
import {
  MAIL_SENDER,
  type MailSender,
  type Versandanhang,
} from './smtp-sender';
import {
  type MailSichtbarkeit,
  MailboxEntity,
  type PostfachArt,
} from './mailbox.entity';
import { MailboxMitgliedEntity } from './mailbox-mitglied.entity';
import {
  INHALT_HOECHSTENS,
  snippetOf,
  subjectOf,
  teileText,
} from './message-shape';
import { mailSchluessel, seal } from './secret-box';
import { postfachAnmeldung, versandzugang } from './postfach-anmeldung';
import {
  type OAuthAnbieter,
  POSTFACH_SERVER,
  type PostfachVorgangArt,
} from '../oauth/oauth-anbieter';
import { OAuthService } from '../oauth/oauth.service';
import {
  MAX_SPERREN,
  nachrichtGesperrt,
  normalisiereSperre,
} from './sperrliste';
import { zustellfehler } from './zustellfehler';
import { zielBedingung, zielSichtbar } from '../workspaces/ziel-sichtbarkeit';
import { meldeKalenderAntwort } from '../calendar/termin-ereignisse';
import { MASCHINE } from './massenpost';
import {
  istAbmeldung,
  istEinladung,
  istIntern,
  istNurFreemail,
  istVonGruppenadresse,
  teamDomains,
} from './kundenpost';

export type ConnectInput = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  folder: string;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean;
  gesendetOrdner?: string | null;
};

export type KontaktVorschlag = {
  adresse: string;
  vorname: string;
  nachname: string;
  firmaId: string | null;
  firmaVorschlag: string | null;
  domain: string | null;
  anzahl: number;
  zuletzt: Date;
};

export type SyncResult = {
  stored: number;
  matched: number;
  unfiled: number;
};

export type MailInhalt = {
  id: string;
  inhalt: string | null;
  zitat: string | null;
  inhaltVerborgen: boolean;
  anhaenge: MailAnhangView[];
};

export type PostfachZiel = {
  mailboxId?: string | null;
  neu?: PostfachArt | null;
  bezeichnung?: string | null;
  darfGemeinsameVerwalten?: boolean;
};

export type PostfachRecht = 'nutzen' | 'abrufen' | 'verwalten';

export const POSTFACH_FILTER = ['offen', 'mir', 'erledigt', 'alle'] as const;

export type PostfachFilter = (typeof POSTFACH_FILTER)[number];

export type PostfachGespraech = {
  threadKey: string;
  nachrichtId: string;
  betreff: string | null;
  vonAdresse: string;
  vonName: string | null;
  ausschnitt: string | null;
  ausgehend: boolean;
  zuletzt: Date;
  anzahl: number;
  offen: boolean;
  zugewiesenAnId: string | null;
  contactId: string | null;
  companyId: string | null;
};

export const MAX_EIGENE_POSTFAECHER = 5;

export const MAX_GEMEINSAME_POSTFAECHER = 20;

export const MAX_POSTFACH_MITGLIEDER = 200;

export const eigenesPostfachSql = (parameter: string): string =>
  `((postfach."art" = 'persoenlich' AND postfach."userId" = :${parameter})
    OR EXISTS (SELECT 1 FROM "mailbox_mitglieder" mitglied
                WHERE mitglied."mailboxId" = postfach."id"
                  AND mitglied."userId" = :${parameter}))`;

export const istEigenesPostfach = (
  postfach: Pick<MailboxEntity, 'id' | 'art' | 'userId'>,
  betrachterId: string,
  mitgliedIn: ReadonlySet<string>,
): boolean =>
  postfach.art === 'gemeinsam'
    ? mitgliedIn.has(postfach.id)
    : postfach.userId === betrachterId;

export type PostfachEinstellungen = {
  bezeichnung?: string | null;
  ausschlussIntern?: boolean;
  ausschlussMassenpost?: boolean;
  ausschlussGruppen?: boolean;
  ausschlussFreemail?: boolean;
  ausschlussGmailKategorien?: boolean;
  aliase?: string[];
  anhaengeAutomatisch?: boolean;
  anhaengeBisMb?: number;
};

export const MAX_ALIASE = 10;

const EINFACHE_ADRESSE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/u;

const anhangViews = (anhaenge: MailAnhangInfo[]): MailAnhangView[] =>
  anhaenge.map((anhang, index) => ({
    index,
    name: anhang.name,
    mimeType: anhang.mimeType,
    groesse: anhang.groesse,
    gespeichertId: anhang.gespeichertId ?? null,
  }));

const PER_RUN = 200;

export const MAX_ANHANG_GESAMT = 18 * 1024 * 1024;

export const MAX_ANHAENGE = 10;

export const ANHAENGE_JE_LAUF = 100 * 1024 * 1024;

const VORGEMERKT_JE_LAUF = 200;

const nurSichtbarePost = async (
  abfrage: SelectQueryBuilder<MailMessageEntity>,
  ich: string,
): Promise<void> => {
  const bedingung = await zielBedingung('nachricht', undefined, [
    'companyId',
    'contactId',
  ]);

  if (bedingung !== null) {
    abfrage.andWhere(
      `(${eigenesPostfachSql('postIch')} OR ${bedingung.where})`,
      {
        ...bedingung.parameters,
        postIch: ich,
      },
    );
  }
};

@Injectable()
export class MailboxesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailboxesService.name);

  private abmelden: (() => void) | null = null;

  private readonly zuordnungen = new Set<Promise<unknown>>();
  private readonly laufend = new Set<string>();

  constructor(
    @InjectRepository(MailboxEntity)
    private readonly mailboxes: Repository<MailboxEntity>,
    @InjectRepository(MailMessageEntity)
    private readonly messages: Repository<MailMessageEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(CompanyEntity)
    private readonly companies: Repository<CompanyEntity>,
    @Inject(MAIL_READER) private readonly reader: MailReader,
    @Inject(MAIL_SENDER) private readonly sender: MailSender,
    private readonly config: ConfigService,
    @InjectRepository(MailSperreEntity)
    private readonly sperren: Repository<MailSperreEntity>,
    private readonly dataSource: DataSource,
    @Optional() private readonly oauth?: OAuthService,
  ) {}

  onModuleInit(): void {
    this.abmelden = hoereAufAenderungen((aenderung) => {
      const arbeit = this.aufAenderung(aenderung).catch((error: unknown) => {
        this.logger.warn(
          `Nachträgliche Zuordnung fehlgeschlagen: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

      this.zuordnungen.add(arbeit);
      void arbeit.finally(() => this.zuordnungen.delete(arbeit));
    });
  }

  onModuleDestroy(): void {
    this.abmelden?.();
  }

  async warteAufZuordnungen(): Promise<void> {
    await Promise.all([...this.zuordnungen]);
  }

  private async aufAenderung(aenderung: DatensatzAenderung): Promise<void> {
    if (
      aenderung.entitaet === 'ContactEntity' &&
      (aenderung.felder.includes('email') ||
        aenderung.felder.includes('weitereEmails'))
    ) {
      if (!aenderung.neu && aenderung.felder.includes('email')) {
        await this.contacts.update(
          { id: aenderung.id, workspaceId: aenderung.workspaceId },
          { unzustellbarSeit: null, unzustellbarGrund: null },
        );
      }

      await this.nachtraeglichZuordnen(aenderung.workspaceId, {
        contactId: aenderung.id,
      });
    }

    if (
      aenderung.entitaet === 'CompanyEntity' &&
      (aenderung.felder.includes('domain') ||
        aenderung.felder.includes('zweitdomains'))
    ) {
      await this.nachtraeglichZuordnen(aenderung.workspaceId, {
        companyId: aenderung.id,
      });
    }
  }

  find(workspaceId: string, userId: string): Promise<MailboxEntity | null> {
    return this.mailboxes.findOne({
      where: { workspaceId, userId, haupt: true },
    });
  }

  verbunden(
    workspaceId: string,
    userId: string,
  ): Promise<MailboxEntity | null> {
    return this.mailboxes.findOne({
      where: { workspaceId, userId, haupt: true, getrenntAm: IsNull() },
    });
  }

  async mitgliedIn(workspaceId: string, userId: string): Promise<Set<string>> {
    const zeilen = await this.dataSource
      .getRepository(MailboxMitgliedEntity)
      .find({ where: { workspaceId, userId }, select: { mailboxId: true } });

    return new Set(zeilen.map((zeile) => zeile.mailboxId));
  }

  async postfachFuer(
    workspaceId: string,
    userId: string,
    mailboxId: string | null | undefined,
    recht: PostfachRecht,
    darfGemeinsameVerwalten = false,
  ): Promise<MailboxEntity | null> {
    if (mailboxId === null || mailboxId === undefined) {
      return this.find(workspaceId, userId);
    }

    const postfach = await this.mailboxes.findOne({
      where: { id: mailboxId, workspaceId },
    });

    if (postfach === null) {
      throw new NotFoundException('Postfach nicht gefunden.');
    }

    if (postfach.art === 'persoenlich') {
      if (postfach.userId !== userId) {
        throw new NotFoundException('Postfach nicht gefunden.');
      }

      return postfach;
    }

    if (recht !== 'nutzen' && darfGemeinsameVerwalten) {
      return postfach;
    }

    if (
      recht !== 'verwalten' &&
      (await this.mitgliedIn(workspaceId, userId)).has(postfach.id)
    ) {
      return postfach;
    }

    if (darfGemeinsameVerwalten) {
      throw new ForbiddenException(
        'Lesen und schreiben dürfen nur die Mitglieder dieses Postfachs. Tragen Sie sich unter Postfach als Mitglied ein.',
      );
    }

    throw new NotFoundException('Postfach nicht gefunden.');
  }

  async postfaecher(
    workspaceId: string,
    userId: string,
    darfGemeinsameVerwalten: boolean,
  ): Promise<MailboxEntity[]> {
    const eigene = await this.mailboxes.find({
      where: {
        workspaceId,
        userId,
        art: 'persoenlich',
        getrenntAm: IsNull(),
      },
      order: { haupt: 'DESC', createdAt: 'ASC' },
    });
    const abfrage = this.mailboxes
      .createQueryBuilder('postfach')
      .where('postfach."workspaceId" = :workspaceId', { workspaceId })
      .andWhere(`postfach."art" = 'gemeinsam'`);

    if (!darfGemeinsameVerwalten) {
      abfrage.andWhere(eigenesPostfachSql('ich'), { ich: userId });
    }

    const gemeinsame = await abfrage
      .orderBy('lower(COALESCE(postfach.bezeichnung, postfach.username))')
      .getMany();

    return [...eigene, ...gemeinsame];
  }

  async mitglieder(mailboxId: string): Promise<string[]> {
    const zeilen = await this.dataSource
      .getRepository(MailboxMitgliedEntity)
      .find({
        where: { mailboxId },
        select: { userId: true },
        order: { createdAt: 'ASC' },
      });

    return zeilen.map((zeile) => zeile.userId);
  }

  async mitgliederSetzen(
    workspaceId: string,
    userId: string,
    mailboxId: string,
    userIds: string[],
    darfGemeinsameVerwalten: boolean,
  ): Promise<MailboxEntity> {
    const postfach = await this.postfachFuer(
      workspaceId,
      userId,
      mailboxId,
      'verwalten',
      darfGemeinsameVerwalten,
    );

    if (postfach === null || postfach.art !== 'gemeinsam') {
      throw new BadRequestException(
        'Mitglieder gibt es nur bei gemeinsamen Postfächern.',
      );
    }

    const gewuenscht = [...new Set(userIds)];

    if (gewuenscht.length > MAX_POSTFACH_MITGLIEDER) {
      throw new BadRequestException(
        `Höchstens ${String(MAX_POSTFACH_MITGLIEDER)} Mitglieder je Postfach.`,
      );
    }

    if (gewuenscht.length > 0) {
      const imBereich = (await this.dataSource.query(
        `SELECT "userId" FROM "memberships"
          WHERE "workspaceId" = $1 AND "userId" = ANY($2::uuid[])`,
        [workspaceId, gewuenscht],
      )) as { userId: string }[];

      if (imBereich.length !== gewuenscht.length) {
        throw new BadRequestException(
          'Mitglied eines Postfachs kann nur werden, wer zum Team gehört.',
        );
      }
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `DELETE FROM "mailbox_mitglieder"
          WHERE "mailboxId" = $1 AND NOT ("userId" = ANY($2::uuid[]))`,
        [postfach.id, gewuenscht],
      );
      await manager.query(
        `UPDATE "mail_messages" SET "zugewiesenAnId" = NULL
          WHERE "mailboxId" = $1 AND "zugewiesenAnId" IS NOT NULL
            AND NOT ("zugewiesenAnId" = ANY($2::uuid[]))`,
        [postfach.id, gewuenscht],
      );

      for (const mitglied of gewuenscht) {
        await manager.query(
          `INSERT INTO "mailbox_mitglieder" ("workspaceId", "mailboxId", "userId")
           VALUES ($1, $2, $3) ON CONFLICT ("mailboxId", "userId") DO NOTHING`,
          [workspaceId, postfach.id, mitglied],
        );
      }
    });

    return postfach;
  }

  async hauptSetzen(
    workspaceId: string,
    userId: string,
    mailboxId: string,
  ): Promise<MailboxEntity> {
    const postfach = await this.postfachFuer(
      workspaceId,
      userId,
      mailboxId,
      'verwalten',
    );

    if (
      postfach === null ||
      postfach.art !== 'persoenlich' ||
      postfach.getrenntAm !== null
    ) {
      throw new BadRequestException(
        'Hauptpostfach kann nur ein verbundenes eigenes Postfach sein.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        MailboxEntity,
        { workspaceId, userId, haupt: true },
        { haupt: false },
      );
      await manager.update(MailboxEntity, postfach.id, { haupt: true });
    });

    return this.byId(workspaceId, postfach.id);
  }

  private async hauptWeitergeben(
    workspaceId: string,
    userId: string,
    vonId: string,
  ): Promise<void> {
    const nachfolger = await this.mailboxes.findOne({
      where: {
        workspaceId,
        userId,
        art: 'persoenlich',
        haupt: false,
        getrenntAm: IsNull(),
        id: Not(vonId),
      },
      order: { createdAt: 'ASC' },
    });

    if (nachfolger === null) {
      return;
    }

    await this.mailboxes.update({ id: vonId, workspaceId }, { haupt: false });
    await this.mailboxes.update(nachfolger.id, { haupt: true });
  }

  private async zugangFreigeben(
    zugangId: string | null,
    mailboxId: string,
  ): Promise<void> {
    if (zugangId === null || zugangId === undefined) {
      return;
    }

    const anderswo = await this.mailboxes.exists({
      where: { oauthZugangId: zugangId, id: Not(mailboxId) },
    });

    if (!anderswo) {
      await this.oauth?.entfernen(zugangId);
    }
  }

  private async hauptFalls(postfach: MailboxEntity): Promise<{ haupt?: true }> {
    return postfach.art === 'persoenlich' &&
      !postfach.haupt &&
      (await this.verbunden(postfach.workspaceId, postfach.userId)) === null &&
      (await this.find(postfach.workspaceId, postfach.userId)) === null
      ? { haupt: true }
      : {};
  }

  private kontoVerbunden(
    workspaceId: string,
    userId: string,
    art: PostfachArt,
    host: string,
    username: string,
    ausser: string | null,
  ): Promise<MailboxEntity | null> {
    const abfrage = this.mailboxes
      .createQueryBuilder('postfach')
      .where('postfach."workspaceId" = :workspaceId', { workspaceId })
      .andWhere('postfach."art" = :art', { art })
      .andWhere('postfach."host" = :host', { host })
      .andWhere('lower(postfach."username") = lower(:username)', { username });

    if (art === 'persoenlich') {
      abfrage.andWhere('postfach."userId" = :userId', { userId });
    }

    if (ausser !== null) {
      abfrage.andWhere('postfach."id" <> :ausser', { ausser });
    }

    return abfrage.getOne();
  }

  private async grenzePruefen(
    workspaceId: string,
    userId: string,
    art: PostfachArt,
  ): Promise<void> {
    if (art === 'gemeinsam') {
      if (
        (await this.mailboxes.countBy({ workspaceId, art: 'gemeinsam' })) >=
        MAX_GEMEINSAME_POSTFAECHER
      ) {
        throw new BadRequestException(
          `Höchstens ${String(MAX_GEMEINSAME_POSTFAECHER)} gemeinsame Postfächer je Arbeitsbereich.`,
        );
      }

      return;
    }

    if (
      (await this.mailboxes.countBy({
        workspaceId,
        userId,
        art: 'persoenlich',
      })) >= MAX_EIGENE_POSTFAECHER
    ) {
      throw new BadRequestException(
        `Höchstens ${String(MAX_EIGENE_POSTFAECHER)} eigene Postfächer je Person.`,
      );
    }
  }

  private async verbindeZiel(
    workspaceId: string,
    userId: string,
    ziel: PostfachZiel,
    konto: { host: string; username: string },
  ): Promise<{ vorhanden: MailboxEntity | null; art: PostfachArt }> {
    const darf = ziel.darfGemeinsameVerwalten === true;
    let vorhanden: MailboxEntity | null;

    if (ziel.mailboxId !== null && ziel.mailboxId !== undefined) {
      vorhanden = await this.postfachFuer(
        workspaceId,
        userId,
        ziel.mailboxId,
        'verwalten',
        darf,
      );
    } else if (ziel.neu === 'gemeinsam' || ziel.neu === 'persoenlich') {
      if (ziel.neu === 'gemeinsam' && !darf) {
        throw new ForbiddenException(
          'Gemeinsame Postfächer richtet ein, wer das Recht dazu hat (Gemeinsame Postfächer einrichten).',
        );
      }

      vorhanden = null;
    } else {
      vorhanden = await this.find(workspaceId, userId);
    }

    const art: PostfachArt = vorhanden?.art ?? ziel.neu ?? 'persoenlich';
    const gleich = await this.kontoVerbunden(
      workspaceId,
      userId,
      art,
      konto.host,
      konto.username,
      vorhanden?.id ?? null,
    );

    if (gleich !== null) {
      if (vorhanden === null && gleich.getrenntAm !== null) {
        return { vorhanden: gleich, art };
      }

      throw new BadRequestException(
        art === 'gemeinsam'
          ? 'Dieses Postfach ist im Arbeitsbereich schon als gemeinsames verbunden.'
          : 'Dieses Postfach haben Sie schon verbunden.',
      );
    }

    if (vorhanden === null) {
      await this.grenzePruefen(workspaceId, userId, art);
    }

    return { vorhanden, art };
  }

  private async anlegen(
    workspaceId: string,
    userId: string,
    art: PostfachArt,
    bezeichnung: string | null,
    werte: Partial<MailboxEntity>,
  ): Promise<MailboxEntity> {
    const haupt =
      art === 'persoenlich' && (await this.find(workspaceId, userId)) === null;
    const saved = await this.mailboxes.save(
      this.mailboxes.create({
        workspaceId,
        userId,
        art,
        haupt,
        bezeichnung,
        ...(art === 'gemeinsam' ? { sichtbarkeit: 'privat' as const } : {}),
        ...werte,
      }),
    );

    if (art === 'gemeinsam') {
      await this.dataSource
        .getRepository(MailboxMitgliedEntity)
        .save({ workspaceId, mailboxId: saved.id, userId });
    }

    return this.byId(workspaceId, saved.id);
  }

  async connect(
    workspaceId: string,
    userId: string,
    input: ConnectInput,
    ziel: PostfachZiel = {},
  ): Promise<MailboxEntity> {
    const key = mailSchluessel(this.config);

    await this.reader.check({
      host: input.host,
      port: input.port,
      secure: input.secure,
      username: input.username,
      password: input.password,
      folder: input.folder,
    });

    const gesendetOrdner =
      input.gesendetOrdner === undefined ||
      input.gesendetOrdner === null ||
      input.gesendetOrdner.trim() === ''
        ? null
        : input.gesendetOrdner.trim();

    if (gesendetOrdner !== null) {
      await this.reader.check({
        host: input.host,
        port: input.port,
        secure: input.secure,
        username: input.username,
        password: input.password,
        folder: gesendetOrdner,
      });
    }

    const { vorhanden: existing, art } = await this.verbindeZiel(
      workspaceId,
      userId,
      ziel,
      { host: input.host, username: input.username },
    );
    const bezeichnung = bezeichnungAus(ziel.bezeichnung);

    if (existing !== null) {
      const moved =
        existing.host !== input.host ||
        existing.username !== input.username ||
        existing.folder !== input.folder;

      await this.zugangFreigeben(existing.oauthZugangId, existing.id);

      await this.mailboxes.update(existing.id, {
        ...(bezeichnung === undefined ? {} : { bezeichnung }),
        host: input.host,
        port: input.port,
        secure: input.secure,
        username: input.username,
        passwordSealed: seal(input.password, key),
        oauthZugangId: null,
        oauthAnbieter: null,
        folder: input.folder,
        active: true,
        lastError: null,
        smtpHost: input.smtpHost ?? null,
        smtpPort: input.smtpPort ?? null,
        smtpSecure: input.smtpSecure ?? false,
        gesendetOrdner,
        getrenntAm: null,
        ...(await this.hauptFalls(existing)),
        ...(moved ? { uidValidity: '0' } : {}),
        ...(moved || existing.gesendetOrdner !== gesendetOrdner
          ? { gesendetUidValidity: '0', gesendetGelesenBis: '0' }
          : {}),
      });

      return this.byId(workspaceId, existing.id);
    }

    return this.anlegen(workspaceId, userId, art, bezeichnung ?? null, {
      host: input.host,
      port: input.port,
      secure: input.secure,
      username: input.username,
      passwordSealed: seal(input.password, key),
      folder: input.folder,
      active: true,
      smtpHost: input.smtpHost ?? null,
      smtpPort: input.smtpPort ?? null,
      smtpSecure: input.smtpSecure ?? false,
      gesendetOrdner,
    });
  }

  async oauthVerbinden(
    workspaceId: string,
    userId: string,
    eingabe: {
      anbieter: OAuthAnbieter;
      zugangId: string;
      konto: string;
      zugriff: string;
      postfachArt?: PostfachVorgangArt | null;
    },
  ): Promise<MailboxEntity> {
    const server = POSTFACH_SERVER[eingabe.anbieter];

    await this.reader.check({
      host: server.imap.host,
      port: server.imap.port,
      secure: server.imap.secure,
      username: eingabe.konto,
      password: '',
      accessToken: eingabe.zugriff,
      folder: 'INBOX',
    });

    const werte = {
      host: server.imap.host,
      port: server.imap.port,
      secure: server.imap.secure,
      username: eingabe.konto,
      passwordSealed: '',
      oauthZugangId: eingabe.zugangId,
      oauthAnbieter: eingabe.anbieter,
      folder: 'INBOX',
      active: true,
      lastError: null,
      smtpHost: server.smtp.host,
      smtpPort: server.smtp.port,
      smtpSecure: server.smtp.secure,
      getrenntAm: null,
    };
    const neu: PostfachArt | null =
      eingabe.postfachArt === 'gemeinsam'
        ? 'gemeinsam'
        : eingabe.postfachArt === 'weiteres'
          ? 'persoenlich'
          : null;
    const schonDa =
      neu === null
        ? null
        : await this.kontoVerbunden(
            workspaceId,
            userId,
            neu,
            werte.host,
            werte.username,
            null,
          );
    const { vorhanden: existing, art } =
      schonDa !== null
        ? { vorhanden: schonDa, art: schonDa.art }
        : await this.verbindeZiel(
            workspaceId,
            userId,
            { neu, darfGemeinsameVerwalten: true },
            { host: werte.host, username: werte.username },
          );

    if (existing !== null) {
      const moved =
        existing.host !== werte.host || existing.username !== werte.username;

      if (existing.oauthZugangId !== eingabe.zugangId) {
        await this.zugangFreigeben(existing.oauthZugangId, existing.id);
      }

      await this.mailboxes.update(existing.id, {
        ...werte,
        ...(await this.hauptFalls(existing)),
        ...(moved
          ? {
              uidValidity: '0',
              gesendetOrdner: null,
              gesendetUidValidity: '0',
              gesendetGelesenBis: '0',
            }
          : {}),
      });

      return this.byId(workspaceId, existing.id);
    }

    return this.anlegen(workspaceId, userId, art, null, werte);
  }

  async disconnect(
    workspaceId: string,
    userId: string,
    behalten = false,
    mailboxId: string | null = null,
    darfGemeinsameVerwalten = false,
  ): Promise<boolean> {
    const mailbox = await this.postfachFuer(
      workspaceId,
      userId,
      mailboxId,
      'verwalten',
      darfGemeinsameVerwalten,
    );

    if (mailbox === null) {
      return false;
    }

    await this.zugangFreigeben(mailbox.oauthZugangId, mailbox.id);

    if (behalten) {
      await this.mailboxes.update(mailbox.id, {
        active: false,
        passwordSealed: '',
        oauthZugangId: null,
        smtpHost: null,
        smtpPort: null,
        lastError: null,
        getrenntAm: new Date(),
      });

      if (mailbox.haupt) {
        await this.hauptWeitergeben(workspaceId, mailbox.userId, mailbox.id);
      }

      return true;
    }

    await this.mailboxes.delete(mailbox.id);

    if (mailbox.haupt) {
      await this.hauptWeitergeben(workspaceId, mailbox.userId, mailbox.id);
    }

    return true;
  }

  async sync(
    workspaceId: string,
    userId: string,
    mailboxId: string | null = null,
    darfGemeinsameVerwalten = false,
  ): Promise<SyncResult> {
    const mailbox = await this.postfachFuer(
      workspaceId,
      userId,
      mailboxId,
      'abrufen',
      darfGemeinsameVerwalten,
    );

    if (mailbox === null) {
      throw new NotFoundException('Es ist kein Postfach verbunden.');
    }

    return this.syncPostfach(mailbox);
  }

  async syncPostfach(mailbox: MailboxEntity): Promise<SyncResult> {
    const workspaceId = mailbox.workspaceId;

    if (mailbox.getrenntAm !== null) {
      throw new NotFoundException('Es ist kein Postfach verbunden.');
    }

    if (this.laufend.has(mailbox.id)) {
      throw new BadRequestException(
        'Das Postfach wird gerade abgerufen. Bitte gleich noch einmal.',
      );
    }

    this.laufend.add(mailbox.id);

    try {
      return await this.abrufen(workspaceId, mailbox);
    } finally {
      this.laufend.delete(mailbox.id);
    }
  }

  private async abrufen(
    workspaceId: string,
    mailbox: MailboxEntity,
  ): Promise<SyncResult> {
    let result: ReadResult;
    let neuNummeriert: boolean;
    let credentials: MailboxCredentials;

    try {
      credentials = {
        host: mailbox.host,
        port: mailbox.port,
        secure: mailbox.secure,
        username: mailbox.username,
        folder: mailbox.folder,
        ohneGmailKategorien: mailbox.ausschlussGmailKategorien,
        ...(await postfachAnmeldung(mailbox, this.config, this.oauth)),
      };
      ({ result, neuNummeriert } = await this.leseOrdner(
        credentials,
        Number(mailbox.uidValidity),
        await this.watermark(mailbox, 'eingang'),
      ));
    } catch (error) {
      const reason =
        error instanceof MailboxUnreachableError
          ? error.message
          : 'Unbekannter Fehler beim Abruf.';

      await this.mailboxes.update(mailbox.id, {
        lastError: reason.slice(0, 300),
        lastSyncedAt: new Date(),
        ...nachFehler(mailbox, reason, new Date()),
      });

      throw new BadRequestException(reason);
    }

    await this.nachtraeglichZuordnen(workspaceId);

    const known = await this.knownRecords(workspaceId);
    const ownAddress = normaliseAddress(mailbox.username);
    const gesperrt = await this.sperrSet(workspaceId);
    const hausDomains = await this.hausDomains(workspaceId);
    let stored = 0;
    let matched = 0;
    const neu: MailMessageEntity[] = [];

    const ablegen = async (
      nachrichten: IncomingMessage[],
      ordner: 'eingang' | 'gesendet',
    ): Promise<void> => {
      for (const message of nachrichten) {
        const wrote = await this.store(
          workspaceId,
          mailbox,
          message,
          known,
          ownAddress,
          gesperrt,
          ordner,
          hausDomains,
        );

        if (wrote === null) {
          continue;
        }

        stored += 1;
        neu.push(wrote);

        if (wrote.contactId !== null || wrote.companyId !== null) {
          matched += 1;
        }
      }
    };

    await ablegen(result.messages, 'eingang');

    const gelesenBis = Math.max(
      neuNummeriert ? 0 : Number(mailbox.gelesenBis),
      ...result.messages.map((eintrag) => eintrag.uid),
      result.hoechsteUid ?? 0,
    );

    let gesendetFehler: string | null = null;
    let gesendet: Partial<MailboxEntity> = {};

    if (mailbox.gesendetOrdner !== null && mailbox.gesendetOrdner !== '') {
      try {
        const lauf = await this.leseOrdner(
          { ...credentials, folder: mailbox.gesendetOrdner },
          Number(mailbox.gesendetUidValidity),
          await this.watermark(mailbox, 'gesendet'),
        );

        await ablegen(lauf.result.messages, 'gesendet');

        gesendet = {
          gesendetUidValidity: String(lauf.result.uidValidity),
          gesendetGelesenBis: String(
            Math.max(
              lauf.neuNummeriert ? 0 : Number(mailbox.gesendetGelesenBis),
              ...lauf.result.messages.map((eintrag) => eintrag.uid),
            ),
          ),
        };
      } catch (error) {
        gesendetFehler = `Ordner „${mailbox.gesendetOrdner}“: ${
          error instanceof MailboxUnreachableError
            ? error.message
            : 'Unbekannter Fehler beim Abruf.'
        }`.slice(0, 300);
      }
    }

    try {
      await this.anhaengeAutomatischUebernehmen(
        workspaceId,
        mailbox,
        credentials,
        neu,
      );
    } catch (error) {
      this.logger.warn(
        `Anhänge aus Postfach ${mailbox.id} nicht übernommen: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    await this.mailboxes.update(mailbox.id, {
      lastSyncedAt: new Date(),
      lastError: gesendetFehler,
      ...nachErfolg(),
      uidValidity: String(result.uidValidity),
      gelesenBis: String(gelesenBis),
      ...gesendet,
      messageCount: await this.messages.countBy({ mailboxId: mailbox.id }),
    });

    return { stored, matched, unfiled: stored - matched };
  }

  private async leseOrdner(
    credentials: MailboxCredentials,
    gemerkteGeneration: number,
    nachUid: number,
  ): Promise<{ result: ReadResult; neuNummeriert: boolean }> {
    const result = await this.reader.read(credentials, {
      afterUid: nachUid,
      limit: PER_RUN,
    });

    if (
      gemerkteGeneration !== 0 &&
      result.uidValidity !== 0 &&
      result.uidValidity !== gemerkteGeneration
    ) {
      this.logger.warn(
        `Postfach ${credentials.username}, Ordner ${credentials.folder}, hat neu nummeriert (${String(gemerkteGeneration)} zu ${String(result.uidValidity)}). Es wird von vorn gelesen.`,
      );

      return {
        result: await this.reader.read(credentials, {
          afterUid: 0,
          limit: PER_RUN,
        }),
        neuNummeriert: true,
      };
    }

    return { result, neuNummeriert: false };
  }

  forContact(
    workspaceId: string,
    contactId: string,
    betrachterId: string,
  ): Promise<MailMessageEntity[]> {
    return this.sichtbareNachrichten(workspaceId, betrachterId, {
      contactId,
    });
  }

  forCompany(
    workspaceId: string,
    companyId: string,
    betrachterId: string,
  ): Promise<MailMessageEntity[]> {
    return this.sichtbareNachrichten(workspaceId, betrachterId, {
      companyId,
      kontakteDerFirma: true,
    });
  }

  async forDeal(
    workspaceId: string,
    dealId: string,
    betrachterId: string,
  ): Promise<MailMessageEntity[]> {
    const deal = await this.dataSource.manager.findOne(DealEntity, {
      where: { id: dealId, workspaceId },
      select: { id: true, primaryContactId: true, companyId: true },
    });

    if (
      deal === null ||
      !(await zielSichtbar(this.dataSource.manager, { dealId: deal.id }))
    ) {
      throw new NotFoundException('Geschäft nicht gefunden.');
    }

    const weitere = (
      (await this.dataSource.manager.query(
        `SELECT "contactId" FROM "deal_kontakte" WHERE "dealId" = $1 AND "workspaceId" = $2`,
        [deal.id, workspaceId],
      )) as { contactId: string }[]
    ).map((zeile) => zeile.contactId);

    return this.sichtbareNachrichten(workspaceId, betrachterId, {
      contactId: deal.primaryContactId,
      companyId: deal.companyId,
      weitereKontakte: weitere,
    });
  }

  private async sichtbareNachrichten(
    workspaceId: string,
    betrachterId: string,
    ziel: {
      contactId?: string | null;
      companyId?: string | null;
      kontakteDerFirma?: boolean;
      weitereKontakte?: string[];
    },
  ): Promise<MailMessageEntity[]> {
    const bedingungen: string[] = [];

    if (ziel.kontakteDerFirma === true && ziel.companyId != null) {
      bedingungen.push(
        `nachricht."contactId" IN (SELECT kontakt."id" FROM "contacts" kontakt
           WHERE kontakt."workspaceId" = :workspaceId
             AND kontakt."companyId" = :companyId
             AND kontakt."deletedAt" IS NULL)`,
      );
    }

    if (ziel.weitereKontakte !== undefined && ziel.weitereKontakte.length > 0) {
      bedingungen.push('nachricht."contactId" = ANY(:weitereKontakte)');
    }

    if (ziel.contactId !== undefined && ziel.contactId !== null) {
      bedingungen.push('nachricht."contactId" = :contactId');
    }

    if (ziel.companyId !== undefined && ziel.companyId !== null) {
      bedingungen.push('nachricht."companyId" = :companyId');
    }

    if (bedingungen.length === 0) {
      return [];
    }

    const abfrage = this.messages
      .createQueryBuilder('nachricht')
      .innerJoin('nachricht.mailbox', 'postfach')
      .addSelect([
        'postfach.id',
        'postfach.userId',
        'postfach.art',
        'postfach.sichtbarkeit',
      ])
      .where('nachricht."workspaceId" = :workspaceId', { workspaceId })
      .andWhere(`(${bedingungen.join(' OR ')})`, {
        contactId: ziel.contactId,
        companyId: ziel.companyId,
        weitereKontakte: ziel.weitereKontakte,
      })
      .andWhere(
        `(postfach.sichtbarkeit <> :privat OR ${eigenesPostfachSql('ich')})`,
        { privat: 'privat', ich: betrachterId },
      );

    await nurSichtbarePost(abfrage, betrachterId);

    const zeilen = await abfrage
      .orderBy('nachricht.sentAt', 'DESC')
      .take(50)
      .getMany();
    const mitgliedIn = await this.mitgliedIn(workspaceId, betrachterId);

    return zeilen.map((zeile) => {
      const fremd = !istEigenesPostfach(
        zeile.mailbox,
        betrachterId,
        mitgliedIn,
      );
      const verborgen = fremd && zeile.mailbox.sichtbarkeit === 'kopf';

      return Object.assign(zeile, {
        snippet: verborgen ? null : zeile.snippet,
        inhaltVerborgen: verborgen,
        anhangAnzahl: verborgen ? 0 : zeile.anhaenge.length,
      });
    });
  }

  async mailInhalte(
    workspaceId: string,
    betrachterId: string,
    ids: string[],
  ): Promise<MailInhalt[]> {
    const eindeutig = [...new Set(ids)].slice(0, 100);

    if (eindeutig.length === 0) {
      return [];
    }

    const zeilen = await this.sichtbareZeilen(
      workspaceId,
      betrachterId,
      eindeutig,
    );
    const mitgliedIn = await this.mitgliedIn(workspaceId, betrachterId);

    return zeilen.map((zeile) => {
      const verborgen =
        !istEigenesPostfach(zeile.mailbox, betrachterId, mitgliedIn) &&
        zeile.mailbox.sichtbarkeit === 'kopf';

      return {
        id: zeile.id,
        inhalt: verborgen ? null : (zeile.inhalt ?? zeile.snippet),
        zitat: verborgen ? null : zeile.zitat,
        inhaltVerborgen: verborgen,
        anhaenge: verborgen ? [] : anhangViews(zeile.anhaenge),
      };
    });
  }

  private async sichtbareZeilen(
    workspaceId: string,
    betrachterId: string,
    ids: string[],
  ): Promise<MailMessageEntity[]> {
    const abfrage = this.messages
      .createQueryBuilder('nachricht')
      .innerJoinAndSelect('nachricht.mailbox', 'postfach')
      .where('nachricht."workspaceId" = :workspaceId', { workspaceId })
      .andWhere('nachricht.id IN (:...ids)', { ids })
      .andWhere(
        `(postfach.sichtbarkeit <> :privat OR ${eigenesPostfachSql('ich')})`,
        { privat: 'privat', ich: betrachterId },
      );

    await nurSichtbarePost(abfrage, betrachterId);

    return abfrage.getMany();
  }

  async anhangZielFuer(
    workspaceId: string,
    betrachterId: string,
    nachrichtId: string,
  ): Promise<AttachmentZiel> {
    const [zeile] = await this.sichtbareZeilen(workspaceId, betrachterId, [
      nachrichtId,
    ]);

    if (zeile === undefined) {
      throw new NotFoundException('Diese Nachricht gibt es nicht.');
    }

    if (zeile.contactId !== null) {
      return { contactId: zeile.contactId };
    }

    if (zeile.companyId !== null) {
      return { companyId: zeile.companyId };
    }

    throw new BadRequestException(
      'Die Nachricht gehört zu keinem Kontakt und keiner Firma. Ordnen Sie zuerst die Adresse einem Kontakt zu.',
    );
  }

  async anhangAnAkte(
    workspaceId: string,
    betrachterId: string,
    nachrichtId: string,
    index: number,
  ): Promise<MailInhalt> {
    const [zeile] = await this.sichtbareZeilen(workspaceId, betrachterId, [
      nachrichtId,
    ]);

    if (zeile === undefined) {
      throw new NotFoundException('Diese Nachricht gibt es nicht.');
    }

    if (
      !istEigenesPostfach(
        zeile.mailbox,
        betrachterId,
        await this.mitgliedIn(workspaceId, betrachterId),
      ) &&
      zeile.mailbox.sichtbarkeit === 'kopf'
    ) {
      throw new BadRequestException(
        'Die Anhänge dieser Nachricht bleiben im Postfach der Kollegin oder des Kollegen.',
      );
    }

    const anhang = zeile.anhaenge[index];

    if (anhang === undefined) {
      throw new NotFoundException('Diesen Anhang gibt es nicht.');
    }

    if (
      anhang.gespeichertId !== null &&
      anhang.gespeichertId !== undefined &&
      (await this.dataSource.manager.exists(AttachmentEntity, {
        where: { id: anhang.gespeichertId, workspaceId },
      }))
    ) {
      return (await this.mailInhalte(workspaceId, betrachterId, [zeile.id]))[0];
    }

    if (anhang.groesse > MAX_BYTES) {
      throw new BadRequestException(
        `Der Anhang ist größer als ${String(MAX_BYTES / 1024 / 1024)} MB und bleibt im Postfach.`,
      );
    }

    const vorhanden = await this.vorhandenerAnhang(
      workspaceId,
      zeile.messageId,
      anhang.teil,
    );

    if (vorhanden !== null) {
      await this.anhangVermerken(zeile, index, vorhanden);

      return (await this.mailInhalte(workspaceId, betrachterId, [zeile.id]))[0];
    }

    const ziel = await this.anhangZielFuer(
      workspaceId,
      betrachterId,
      nachrichtId,
    );
    const mailbox = zeile.mailbox;

    if (mailbox.getrenntAm !== null) {
      throw new BadRequestException(
        'Das Postfach, aus dem die Nachricht kam, ist getrennt. Der Anhang lässt sich nicht mehr abrufen.',
      );
    }

    const geladen = await this.anhaengeHolen(mailbox, zeile.ordner, [
      { messageId: zeile.messageId, uid: zeile.uid, teil: anhang.teil },
    ]);
    const bytes = geladen.get(anhangSchluessel(zeile.messageId, anhang.teil));

    if (bytes === undefined) {
      throw new BadRequestException(
        'Der Anhang ist im Postfach nicht mehr zu finden oder zu groß.',
      );
    }

    const gespeichert = await this.anhangDienst().create({
      workspaceId,
      userId: betrachterId,
      name: anhang.name,
      mimeType: anhang.mimeType,
      bytes,
      ziel,
    });

    await this.anhangVermerken(zeile, index, gespeichert.id);

    return (await this.mailInhalte(workspaceId, betrachterId, [zeile.id]))[0];
  }

  private anhangDienst(): AttachmentsService {
    return new AttachmentsService(
      this.dataSource.getRepository(AttachmentEntity),
      this.dataSource,
    );
  }

  private async anhangVermerken(
    zeile: MailMessageEntity,
    index: number,
    attachmentId: string,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE "mail_messages"
          SET "anhaenge" = jsonb_set("anhaenge", $2::text[], to_jsonb($3::text))
                           #- $4::text[]
        WHERE "id" = $1`,
      [
        zeile.id,
        [String(index), 'gespeichertId'],
        attachmentId,
        [String(index), 'ausstehend'],
      ],
    );
  }

  private async anhangVormerken(
    zeile: MailMessageEntity,
    index: number,
    ausstehend: boolean,
  ): Promise<void> {
    await this.dataSource.query(
      ausstehend
        ? `UPDATE "mail_messages"
              SET "anhaenge" = jsonb_set("anhaenge", $2::text[], 'true'::jsonb)
            WHERE "id" = $1`
        : `UPDATE "mail_messages"
              SET "anhaenge" = "anhaenge" #- $2::text[]
            WHERE "id" = $1`,
      [zeile.id, [String(index), 'ausstehend']],
    );
  }

  private async vorhandenerAnhang(
    workspaceId: string,
    messageId: string,
    teil: string,
  ): Promise<string | null> {
    const [treffer] = (await this.dataSource.query(
      `SELECT datei."id"
         FROM "mail_messages" nachricht
        CROSS JOIN LATERAL jsonb_array_elements(nachricht."anhaenge") eintrag
         JOIN "attachments" datei
           ON datei."id"::text = eintrag->>'gespeichertId'
          AND datei."workspaceId" = $1
        WHERE nachricht."workspaceId" = $1
          AND nachricht."messageId" = $2
          AND eintrag->>'teil' = $3
        LIMIT 1`,
      [workspaceId, messageId, teil],
    )) as { id: string }[];

    return treffer?.id ?? null;
  }

  private async anhaengeHolen(
    mailbox: MailboxEntity,
    ordner: 'eingang' | 'gesendet',
    auftraege: { messageId: string; uid?: number; teil: string }[],
    hoechstens: number = MAX_BYTES,
  ): Promise<Map<string, Buffer>> {
    if (this.reader.anhaengeLaden === undefined) {
      throw new BadRequestException(
        'Anhänge lassen sich hier nicht aus dem Postfach laden.',
      );
    }

    const folder =
      ordner === 'gesendet' && mailbox.gesendetOrdner !== null
        ? mailbox.gesendetOrdner
        : mailbox.folder;

    try {
      return await this.reader.anhaengeLaden(
        {
          host: mailbox.host,
          port: mailbox.port,
          secure: mailbox.secure,
          username: mailbox.username,
          folder,
          ...(await postfachAnmeldung(mailbox, this.config, this.oauth)),
        },
        auftraege,
        hoechstens,
      );
    } catch (error) {
      throw new BadRequestException(
        error instanceof MailboxUnreachableError
          ? error.message
          : 'Das Postfach war nicht erreichbar.',
      );
    }
  }

  private async anhaengeAutomatischUebernehmen(
    workspaceId: string,
    mailbox: MailboxEntity,
    credentials: MailboxCredentials,
    neu: MailMessageEntity[],
  ): Promise<void> {
    if (!mailbox.anhaengeAutomatisch || mailbox.sichtbarkeit !== 'alles') {
      return;
    }

    if (this.reader.anhaengeLaden === undefined) {
      return;
    }

    const grenze = Math.min(mailbox.anhaengeBisMb, 20) * 1024 * 1024;
    const vorgemerkt = await this.messages
      .createQueryBuilder('nachricht')
      .where('nachricht."mailboxId" = :mailboxId', { mailboxId: mailbox.id })
      .andWhere(`nachricht."anhaenge" @> '[{"ausstehend": true}]'::jsonb`)
      .orderBy('nachricht."createdAt"', 'ASC')
      .take(VORGEMERKT_JE_LAUF)
      .getMany();
    const kandidaten = [
      ...vorgemerkt,
      ...neu.filter(
        (zeile) => !vorgemerkt.some((frueher) => frueher.id === zeile.id),
      ),
    ];

    if (kandidaten.length === 0) {
      return;
    }

    const belegt = await this.dataSource.manager
      .createQueryBuilder(AttachmentEntity, 'a')
      .select('COALESCE(SUM(a."sizeBytes"), 0)', 'summe')
      .where('a."workspaceId" = :workspaceId', { workspaceId })
      .getRawOne<{ summe: string }>();
    let frei = SPEICHER_JE_BEREICH - Number(belegt?.summe ?? 0);
    let rahmen = ANHAENGE_JE_LAUF;

    for (const ordner of ['eingang', 'gesendet'] as const) {
      const auftraege: { messageId: string; uid?: number; teil: string }[] = [];
      const wohin = new Map<
        string,
        { zeile: MailMessageEntity; index: number; anhang: MailAnhangInfo }
      >();

      for (const zeile of kandidaten) {
        if (zeile.ordner !== ordner) {
          continue;
        }

        const ohneAkte = zeile.contactId === null && zeile.companyId === null;

        for (const [index, anhang] of zeile.anhaenge.entries()) {
          if (
            anhang.gespeichertId !== null &&
            anhang.gespeichertId !== undefined
          ) {
            continue;
          }

          if (ohneAkte || anhang.groesse > grenze) {
            if (anhang.ausstehend === true) {
              await this.anhangVormerken(zeile, index, false);
            }

            continue;
          }

          const vorhanden = await this.vorhandenerAnhang(
            workspaceId,
            zeile.messageId,
            anhang.teil,
          );

          if (vorhanden !== null) {
            await this.anhangVermerken(zeile, index, vorhanden);
            continue;
          }

          if (anhang.groesse > frei) {
            if (anhang.ausstehend === true) {
              await this.anhangVormerken(zeile, index, false);
            }

            continue;
          }

          if (anhang.groesse > rahmen) {
            if (anhang.ausstehend !== true) {
              await this.anhangVormerken(zeile, index, true);
            }

            continue;
          }

          rahmen -= anhang.groesse;
          frei -= anhang.groesse;

          auftraege.push({
            messageId: zeile.messageId,
            uid: zeile.uid,
            teil: anhang.teil,
          });
          wohin.set(anhangSchluessel(zeile.messageId, anhang.teil), {
            zeile,
            index,
            anhang,
          });
        }
      }

      if (auftraege.length === 0) {
        continue;
      }

      const folder =
        ordner === 'gesendet' && mailbox.gesendetOrdner !== null
          ? mailbox.gesendetOrdner
          : mailbox.folder;

      const versucht = new Set<string>();
      const erledigt = new Set<string>();

      try {
        await this.reader.anhaengeLaden(
          { ...credentials, folder },
          auftraege,
          grenze,
          async (schluessel, bytes) => {
            const eintrag = wohin.get(schluessel);

            if (eintrag === undefined) {
              return;
            }

            versucht.add(schluessel);

            const { zeile, index, anhang } = eintrag;
            const ziel: AttachmentZiel =
              zeile.contactId !== null
                ? { contactId: zeile.contactId }
                : { companyId: zeile.companyId };

            try {
              const gespeichert = await this.anhangDienst().create({
                workspaceId,
                userId: mailbox.userId,
                name: anhang.name,
                mimeType: anhang.mimeType,
                bytes,
                ziel,
              });

              await this.anhangVermerken(zeile, index, gespeichert.id);
              erledigt.add(schluessel);
            } catch (error) {
              this.logger.warn(
                `Anhang ${anhang.name} nicht übernommen: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            }
          },
        );
      } catch (error) {
        this.logger.warn(
          `Anhänge aus Postfach ${mailbox.id} nicht geladen: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );

        for (const [schluessel, { zeile, index, anhang }] of wohin) {
          const nochOffen = !versucht.has(schluessel);

          if (nochOffen !== (anhang.ausstehend === true)) {
            await this.anhangVormerken(zeile, index, nochOffen);
          }
        }

        continue;
      }

      for (const [schluessel, { zeile, index, anhang }] of wohin) {
        if (anhang.ausstehend === true && !erledigt.has(schluessel)) {
          await this.anhangVormerken(zeile, index, false);
        }
      }
    }
  }

  async einstellungenSetzen(
    workspaceId: string,
    userId: string,
    eingabe: PostfachEinstellungen,
    mailboxId: string | null = null,
    darfGemeinsameVerwalten = false,
  ): Promise<MailboxEntity> {
    const mailbox = await this.postfachFuer(
      workspaceId,
      userId,
      mailboxId,
      'verwalten',
      darfGemeinsameVerwalten,
    );

    if (mailbox === null || mailbox.getrenntAm !== null) {
      throw new NotFoundException('Es ist kein Postfach verbunden.');
    }

    const aenderung: Partial<MailboxEntity> = {};
    const bezeichnung = bezeichnungAus(eingabe.bezeichnung);

    if (bezeichnung !== undefined) {
      aenderung.bezeichnung = bezeichnung;
    }

    for (const schalter of [
      'ausschlussIntern',
      'ausschlussMassenpost',
      'ausschlussGruppen',
      'ausschlussFreemail',
      'ausschlussGmailKategorien',
      'anhaengeAutomatisch',
    ] as const) {
      if (eingabe[schalter] !== undefined) {
        aenderung[schalter] = eingabe[schalter];
      }
    }

    if (eingabe.anhaengeBisMb !== undefined) {
      if (
        !Number.isInteger(eingabe.anhaengeBisMb) ||
        eingabe.anhaengeBisMb < 1 ||
        eingabe.anhaengeBisMb > 20
      ) {
        throw new BadRequestException(
          'Die Grenze für Anhänge liegt zwischen 1 und 20 MB.',
        );
      }

      aenderung.anhaengeBisMb = eingabe.anhaengeBisMb;
    }

    if (eingabe.aliase !== undefined) {
      aenderung.aliase = pruefeAliase(eingabe.aliase, mailbox.username);
    }

    await this.mailboxes.update(mailbox.id, aenderung);

    return { ...mailbox, ...aenderung };
  }

  async suche(
    workspaceId: string,
    betrachterId: string,
    text: string,
    limit = 5,
  ): Promise<MailMessageEntity[]> {
    const muster = `%${text.replace(/[\\%_]/g, '\\$&')}%`;
    const abfrage = this.messages
      .createQueryBuilder('nachricht')
      .innerJoin('nachricht.mailbox', 'postfach')
      .addSelect([
        'postfach.id',
        'postfach.userId',
        'postfach.art',
        'postfach.sichtbarkeit',
      ])
      .where('nachricht."workspaceId" = :workspaceId', { workspaceId })
      .andWhere(
        `(postfach.sichtbarkeit <> :privat OR ${eigenesPostfachSql('ich')})`,
        { privat: 'privat', ich: betrachterId },
      )
      .andWhere(
        `(nachricht.subject ILIKE :muster OR nachricht."fromAddress" ILIKE :muster
          OR nachricht."fromName" ILIKE :muster
          OR ((postfach.sichtbarkeit = 'alles' OR ${eigenesPostfachSql('ich')})
              AND nachricht.snippet ILIKE :muster))`,
        { muster },
      );

    await nurSichtbarePost(abfrage, betrachterId);

    const zeilen = await abfrage
      .orderBy('nachricht.sentAt', 'DESC')
      .take(Math.min(limit, 20))
      .getMany();
    const mitgliedIn = await this.mitgliedIn(workspaceId, betrachterId);

    return zeilen.map((zeile) => {
      const verborgen =
        !istEigenesPostfach(zeile.mailbox, betrachterId, mitgliedIn) &&
        zeile.mailbox.sichtbarkeit === 'kopf';

      return Object.assign(zeile, {
        snippet: verborgen ? null : zeile.snippet,
        inhaltVerborgen: verborgen,
      });
    });
  }

  async sichtbarkeitSetzen(
    workspaceId: string,
    userId: string,
    sichtbarkeit: MailSichtbarkeit,
    mailboxId: string | null = null,
    darfGemeinsameVerwalten = false,
  ): Promise<MailboxEntity> {
    const mailbox = await this.postfachFuer(
      workspaceId,
      userId,
      mailboxId,
      'verwalten',
      darfGemeinsameVerwalten,
    );

    if (mailbox === null) {
      throw new NotFoundException('Es ist kein Postfach verbunden.');
    }

    await this.mailboxes.update(mailbox.id, { sichtbarkeit });

    return this.byId(workspaceId, mailbox.id);
  }

  async nachtraeglichZuordnen(
    workspaceId: string,
    nur: { contactId?: string; companyId?: string } = {},
  ): Promise<number> {
    if (nur.companyId !== undefined) {
      return this.perDomainZuordnen(workspaceId, nur.companyId);
    }

    const kontakt = nur.contactId === undefined ? '' : 'AND kontakt.id = $2';
    const parameter =
      nur.contactId === undefined
        ? [workspaceId]
        : [workspaceId, nur.contactId];
    const inEmpfaengern = `lower(nachricht."toAddresses") ~ ('(^|[^a-z0-9._%+-])' || regexp_replace(adresse.wert, '([.+*?^$()\\[\\]{}|\\\\-])', '\\\\\\1', 'g') || '($|[^a-z0-9.-])')`;
    let summe = 0;

    for (const treffer of [
      'nachricht."fromAddress" = adresse.wert',
      inEmpfaengern,
    ]) {
      const [, anzahl] = (await this.dataSource.query(
        `UPDATE mail_messages nachricht
            SET "contactId" = kontakt.id,
                "companyId" = COALESCE(kontakt."companyId", nachricht."companyId")
           FROM contacts kontakt,
                LATERAL (
                  SELECT lower(kontakt.email) AS wert, 0 AS rang
                  UNION ALL
                  SELECT lower(weitere->>'wert'), 1
                    FROM jsonb_array_elements(kontakt."weitereEmails") AS weitere
                ) adresse
          WHERE nachricht."workspaceId" = $1
            AND nachricht."contactId" IS NULL
            AND kontakt."workspaceId" = $1
            AND kontakt."deletedAt" IS NULL
            AND adresse.wert IS NOT NULL
            AND adresse.wert <> ''
            -- Wie beim Abruf: eine Hauptadresse geht vor.
            AND (adresse.rang = 0 OR NOT EXISTS (
                  SELECT 1 FROM contacts andere
                   WHERE andere."workspaceId" = $1
                     AND andere."deletedAt" IS NULL
                     AND lower(andere.email) = adresse.wert))
            ${kontakt}
            AND ${treffer}`,
        parameter,
      )) as [unknown, number];

      summe += anzahl;
    }

    return nur.contactId === undefined
      ? summe + (await this.perDomainZuordnen(workspaceId))
      : summe;
  }

  private async perDomainZuordnen(
    workspaceId: string,
    companyId?: string,
  ): Promise<number> {
    const firmen = await this.companies.find({
      where: {
        workspaceId,
        ...(companyId === undefined ? {} : { id: companyId }),
      },
      select: { id: true, domain: true, zweitdomains: true },
    });
    let summe = 0;
    const domainVon = (eintrag: string | null): string =>
      domainOf(`x@${eintrag ?? ''}`).trim();

    const hauptdomains = new Set(
      (companyId === undefined
        ? firmen
        : await this.companies.find({
            where: { workspaceId },
            select: { id: true, domain: true },
          })
      )
        .map((firma) => domainVon(firma.domain))
        .filter((domain) => domain !== ''),
    );
    const paare = [
      ...firmen.map((firma) => ({ firma, domain: domainVon(firma.domain) })),
      ...firmen.flatMap((firma) =>
        (firma.zweitdomains ?? [])
          .map((eintrag) => ({ firma, domain: domainVon(eintrag) }))
          .filter(({ domain }) => !hauptdomains.has(domain)),
      ),
    ];

    for (const { firma, domain } of paare) {
      if (domain === '' || isPublicDomain(domain)) {
        continue;
      }

      const [, anzahl] = (await this.dataSource.query(
        `UPDATE mail_messages nachricht
            SET "companyId" = $2
          WHERE nachricht."workspaceId" = $1
            AND nachricht."contactId" IS NULL
            AND nachricht."companyId" IS NULL
            AND (split_part(nachricht."fromAddress", '@', 2) = $3
                 OR lower(nachricht."toAddresses") ~ ('@' || $4 || '($|[^a-z0-9.-])'))`,
        [
          workspaceId,
          firma.id,
          domain,
          domain.replace(/[.+*?^$()[\]{}|\\-]/gu, '\\$&'),
        ],
      )) as [unknown, number];

      summe += anzahl;
    }

    return summe;
  }

  private async markiereUnzustellbar(
    workspaceId: string,
    adressen: string[],
    grund: string,
  ): Promise<void> {
    if (adressen.length === 0) {
      return;
    }

    await this.contacts
      .createQueryBuilder()
      .update()
      .set({ unzustellbarSeit: () => 'now()', unzustellbarGrund: grund })
      .where('"workspaceId" = :workspaceId', { workspaceId })
      .andWhere('lower(email) IN (:...adressen)', { adressen })
      .execute();

    await this.weitereVermerken(workspaceId, adressen, new Date());
  }

  private async weitereVermerken(
    workspaceId: string,
    adressen: string[],
    seit: Date | null,
  ): Promise<void> {
    const betroffen = await this.contacts
      .createQueryBuilder('k')
      .select(['k.id', 'k.weitereEmails'])
      .where('k.workspaceId = :workspaceId', { workspaceId })
      .andWhere(
        `EXISTS (SELECT 1 FROM jsonb_array_elements(k."weitereEmails") AS weitere WHERE weitere->>'wert' IN (:...adressen))`,
        { adressen },
      )
      .getMany();

    for (const kontakt of betroffen) {
      const liste = kontakt.weitereEmails.map((eintrag) =>
        adressen.includes(eintrag.wert)
          ? seit === null
            ? { art: eintrag.art, wert: eintrag.wert }
            : { ...eintrag, unzustellbarSeit: eintrag.unzustellbarSeit ?? seit }
          : eintrag,
      );

      await this.contacts.update(kontakt.id, { weitereEmails: liste });
    }
  }

  async unzustellbar(
    workspaceId: string,
    adressen: string[],
  ): Promise<string[]> {
    const gesucht = [
      ...new Set(
        adressen.map((adresse) => normaliseAddress(adresse)).filter(Boolean),
      ),
    ].slice(0, 50);

    if (gesucht.length === 0) {
      return [];
    }

    const zeilen = await this.contacts
      .createQueryBuilder('kontakt')
      .select('DISTINCT lower(kontakt.email)', 'adresse')
      .where('kontakt."workspaceId" = :workspaceId', { workspaceId })
      .andWhere('lower(kontakt.email) IN (:...gesucht)', { gesucht })
      .andWhere('kontakt."unzustellbarSeit" IS NOT NULL')
      .getRawMany<{ adresse: string }>();
    const weitere = (await this.dataSource.query(
      `SELECT DISTINCT weitere->>'wert' AS adresse
         FROM contacts kontakt,
              jsonb_array_elements(kontakt."weitereEmails") AS weitere
        WHERE kontakt."workspaceId" = $1
          AND kontakt."deletedAt" IS NULL
          AND weitere->>'wert' = ANY($2::text[])
          AND weitere->>'unzustellbarSeit' IS NOT NULL`,
      [workspaceId, gesucht],
    )) as { adresse: string }[];

    return [...new Set([...zeilen, ...weitere].map((zeile) => zeile.adresse))];
  }

  async kontaktVorschlaege(
    workspaceId: string,
    userId: string,
  ): Promise<KontaktVorschlag[]> {
    const eigene = await this.mailboxes.find({
      where: { workspaceId, userId, art: 'persoenlich' },
      select: { id: true, username: true },
    });

    if (eigene.length === 0) {
      return [];
    }

    const eigeneDomains = new Set(
      eigene.map((postfach) => domainOf(normaliseAddress(postfach.username))),
    );
    const zeilen = await this.messages
      .createQueryBuilder('nachricht')
      .select('nachricht."fromAddress"', 'adresse')
      .addSelect('MAX(nachricht."fromName")', 'name')
      .addSelect('MAX(nachricht."companyId"::text)', 'firmaId')
      .addSelect('COUNT(*)', 'anzahl')
      .addSelect('MAX(nachricht."sentAt")', 'zuletzt')
      .where('nachricht."mailboxId" IN (:...ids)', {
        ids: eigene.map((postfach) => postfach.id),
      })
      .andWhere('nachricht.outgoing = false')
      .andWhere('nachricht."contactId" IS NULL')
      .andWhere('nachricht."sentAt" > now() - interval \'30 days\'')
      .andWhere('nachricht."fromAddress" LIKE \'%@%\'')
      .groupBy('nachricht."fromAddress"')
      .orderBy('MAX(nachricht."sentAt")', 'DESC')
      .limit(60)
      .getRawMany<{
        adresse: string;
        name: string | null;
        firmaId: string | null;
        anzahl: string;
        zuletzt: Date;
      }>();

    return zeilen
      .filter(
        (zeile) =>
          !MASCHINE.test(zeile.adresse) &&
          !eigeneDomains.has(domainOf(zeile.adresse)),
      )
      .slice(0, 20)
      .map((zeile) => {
        const domain = domainOf(zeile.adresse);
        const teile = (zeile.name ?? '')
          .replace(/["']/gu, '')
          .trim()
          .split(/\s+/u)
          .filter(Boolean);
        const mitKomma = (zeile.name ?? '').includes(',');
        const lokal = zeile.adresse.split('@')[0] ?? '';
        const ausAdresse = lokal.split(/[._-]/u).filter(Boolean);
        const gross = (wort: string) =>
          wort === '' ? '' : wort[0].toUpperCase() + wort.slice(1);

        let vorname = '';
        let nachname = '';

        if (teile.length >= 2) {
          [vorname, nachname] = mitKomma
            ? [teile.slice(1).join(' '), teile[0].replace(/,$/u, '')]
            : [teile.slice(0, -1).join(' '), teile[teile.length - 1]];
        } else if (ausAdresse.length >= 2) {
          vorname = gross(ausAdresse[0]);
          nachname = gross(ausAdresse.slice(1).join(' '));
        } else {
          nachname = teile[0] ?? gross(lokal);
        }

        return {
          adresse: zeile.adresse,
          vorname,
          nachname,
          firmaId: zeile.firmaId,
          firmaVorschlag:
            zeile.firmaId === null && !isPublicDomain(domain)
              ? gross(domain.split('.').slice(-2, -1)[0] ?? domain)
              : null,
          domain: isPublicDomain(domain) ? null : domain,
          anzahl: Number(zeile.anzahl),
          zuletzt: zeile.zuletzt,
        };
      });
  }

  listSperren(workspaceId: string): Promise<MailSperreEntity[]> {
    return this.sperren.find({
      where: { workspaceId },
      order: { eintrag: 'ASC' },
    });
  }

  async sperreHinzufuegen(
    workspaceId: string,
    userId: string,
    roh: string,
  ): Promise<MailSperreEntity> {
    const eintrag = normalisiereSperre(roh);

    if (eintrag === null) {
      throw new BadRequestException(
        'Bitte eine Adresse (name@firma.de) oder eine Domain mit @ davor (@firma.de) angeben.',
      );
    }

    const vorhanden = await this.sperren.findOne({
      where: { workspaceId, eintrag },
    });

    if (vorhanden !== null) {
      return vorhanden;
    }

    if ((await this.sperren.countBy({ workspaceId })) >= MAX_SPERREN) {
      throw new BadRequestException(
        `Höchstens ${String(MAX_SPERREN)} Einträge auf der Sperrliste.`,
      );
    }

    return this.sperren.save(
      this.sperren.create({ workspaceId, eintrag, createdById: userId }),
    );
  }

  async sperreEntfernen(workspaceId: string, id: string): Promise<boolean> {
    const ergebnis = await this.sperren.delete({ id, workspaceId });

    return (ergebnis.affected ?? 0) > 0;
  }

  private async hausDomains(workspaceId: string): Promise<Set<string>> {
    const zeilen: { adresse: string }[] = await this.dataSource.query(
      `SELECT u.email AS adresse
         FROM memberships m JOIN users u ON u.id = m."userId"
        WHERE m."workspaceId" = $1
       UNION
       SELECT username AS adresse FROM mailboxes WHERE "workspaceId" = $1`,
      [workspaceId],
    );

    return teamDomains(zeilen.map((zeile) => zeile.adresse));
  }

  private async sperrSet(workspaceId: string): Promise<Set<string>> {
    const zeilen = await this.sperren.find({
      where: { workspaceId },
      select: { eintrag: true },
    });

    return new Set(zeilen.map((zeile) => zeile.eintrag));
  }

  async anhangZiele(
    workspaceId: string,
    ids: string[],
  ): Promise<ZielMitAkte[]> {
    const zeilen = await this.anhangZeilen(workspaceId, ids);

    return Promise.all(
      zeilen.map((zeile) =>
        zielMitAkte(this.dataSource.manager, workspaceId, {
          companyId: zeile.companyId,
          contactId: zeile.contactId,
          dealId: zeile.dealId,
          quoteId: zeile.quoteId,
          invoiceId: zeile.invoiceId,
          taskId: zeile.taskId,
          noteId: zeile.noteId,
        }),
      ),
    );
  }

  private async anhangZeilen(
    workspaceId: string,
    ids: string[],
  ): Promise<AttachmentEntity[]> {
    const eindeutig = [...new Set(ids)];

    if (eindeutig.length === 0) {
      return [];
    }

    if (eindeutig.length > MAX_ANHAENGE) {
      throw new BadRequestException(
        `Höchstens ${String(MAX_ANHAENGE)} Dateien je Nachricht.`,
      );
    }

    const zeilen = await this.dataSource.manager.find(AttachmentEntity, {
      where: { workspaceId, id: In(eindeutig) },
    });

    if (zeilen.length !== eindeutig.length) {
      throw new BadRequestException('Eine der Dateien gibt es nicht.');
    }

    return zeilen;
  }

  private async anhaengeLaden(
    workspaceId: string,
    ids: string[],
  ): Promise<Versandanhang[]> {
    const zeilen = await this.anhangZeilen(workspaceId, ids);

    if (zeilen.length === 0) {
      return [];
    }

    const gesamt = zeilen.reduce((summe, zeile) => summe + zeile.sizeBytes, 0);

    if (gesamt > MAX_ANHANG_GESAMT) {
      throw new BadRequestException(
        `Die Anhänge sind zusammen größer als ${String(MAX_ANHANG_GESAMT / 1024 / 1024)} MB.`,
      );
    }

    const inhalte = await this.dataSource.manager.find(AttachmentBlobEntity, {
      where: { attachmentId: In(zeilen.map((zeile) => zeile.id)) },
    });
    const nachId = new Map(
      inhalte.map((inhalt) => [inhalt.attachmentId, inhalt.bytes]),
    );

    return [...new Set(ids)].map((id) => {
      const zeile = zeilen.find((eintrag) => eintrag.id === id);
      const bytes = nachId.get(id);

      if (zeile === undefined || bytes === undefined) {
        throw new BadRequestException('Eine der Dateien ist unvollständig.');
      }

      return { name: zeile.name, mimeType: zeile.mimeType, bytes };
    });
  }

  private async byId(workspaceId: string, id: string): Promise<MailboxEntity> {
    const mailbox = await this.mailboxes.findOne({
      where: { id, workspaceId },
    });

    if (mailbox === null) {
      throw new NotFoundException('Postfach nicht gefunden.');
    }

    return mailbox;
  }

  private async watermark(
    mailbox: MailboxEntity,
    ordner: 'eingang' | 'gesendet',
  ): Promise<number> {
    const row = await this.messages
      .createQueryBuilder('message')
      .select('MAX(message.uid)', 'high')
      .where('message."mailboxId" = :id', { id: mailbox.id })
      .andWhere('message.ordner = :ordner', { ordner })
      .getRawOne<{ high: string | null }>();

    return Math.max(
      Number(row?.high ?? 0),
      Number(
        ordner === 'eingang' ? mailbox.gelesenBis : mailbox.gesendetGelesenBis,
      ),
    );
  }

  private async knownRecords(workspaceId: string): Promise<Matchable> {
    const contacts = await this.contacts.find({
      where: { workspaceId },
      select: { id: true, email: true, companyId: true, weitereEmails: true },
    });

    const companies = await this.companies.find({
      where: { workspaceId },
      select: { id: true, domain: true, zweitdomains: true },
    });

    const contactsByEmail = new Map<
      string,
      { id: string; companyId: string | null }
    >();

    for (const contact of contacts) {
      const address = normaliseAddress(contact.email ?? '');

      if (address !== '') {
        contactsByEmail.set(address, {
          id: contact.id,
          companyId: contact.companyId,
        });
      }
    }

    for (const contact of contacts) {
      for (const weitere of contact.weitereEmails ?? []) {
        const address = normaliseAddress(weitere.wert);

        if (address !== '' && !contactsByEmail.has(address)) {
          contactsByEmail.set(address, {
            id: contact.id,
            companyId: contact.companyId,
          });
        }
      }
    }

    const companiesByDomain = new Map<string, string>();

    for (const company of companies) {
      const domain = domainOf(`x@${company.domain ?? ''}`);

      if (domain !== '') {
        companiesByDomain.set(domain, company.id);
      }
    }

    for (const company of companies) {
      for (const weitere of company.zweitdomains ?? []) {
        const domain = domainOf(`x@${weitere}`);

        if (domain !== '' && !companiesByDomain.has(domain)) {
          companiesByDomain.set(domain, company.id);
        }
      }
    }

    return { contactsByEmail, companiesByDomain };
  }

  private async store(
    workspaceId: string,
    mailbox: MailboxEntity,
    message: IncomingMessage,
    known: Matchable,
    ownAddress: string,
    gesperrt: ReadonlySet<string>,
    ordner: 'eingang' | 'gesendet' = 'eingang',
    hausDomains: ReadonlySet<string> = new Set(),
  ): Promise<MailMessageEntity | null> {
    const kennung = normalisiereId(message.messageId);

    if (kennung === null) {
      return null;
    }

    const already = await this.messages.findOne({
      where: { mailboxId: mailbox.id, messageId: kennung },
      select: { id: true },
    });

    if (already !== null) {
      return null;
    }

    if (nachrichtGesperrt(message, gesperrt, ownAddress)) {
      return null;
    }

    const match = matchMessage(
      { from: message.from, to: message.to, cc: message.cc },
      known,
    );

    const fromAddress = normaliseAddress(message.from ?? '');
    const fehler = zustellfehler(message, ownAddress);

    if (
      message.kalender !== undefined &&
      message.kalender !== null &&
      /METHOD:REPLY/i.test(message.kalender) &&
      fromAddress !== ''
    ) {
      meldeKalenderAntwort({
        workspaceId,
        von: fromAddress,
        ics: message.kalender,
      });
    }

    if (fehler !== null) {
      await this.markiereUnzustellbar(
        workspaceId,
        fehler.adressen,
        fehler.grund,
      );
    } else if (fromAddress !== '' && fromAddress !== ownAddress) {
      await this.contacts
        .createQueryBuilder()
        .update()
        .set({ unzustellbarSeit: null, unzustellbarGrund: null })
        .where('"workspaceId" = :workspaceId', { workspaceId })
        .andWhere('lower(email) = :adresse', { adresse: fromAddress })
        .andWhere('"unzustellbarSeit" IS NOT NULL')
        .execute();
      await this.weitereVermerken(workspaceId, [fromAddress], null);
    }

    const eigeneAdressen = new Set([ownAddress, ...(mailbox.aliase ?? [])]);
    const eigene = fromAddress !== '' && eigeneAdressen.has(fromAddress);

    if (
      fehler !== null ||
      istEinladung(message.kalender) ||
      istAbmeldung(message, ownAddress) ||
      (mailbox.ausschlussIntern !== false && istIntern(message, hausDomains)) ||
      (mailbox.ausschlussMassenpost !== false &&
        message.massenpost === true &&
        !eigene) ||
      (mailbox.ausschlussGruppen === true &&
        istVonGruppenadresse(message, eigeneAdressen)) ||
      (mailbox.ausschlussFreemail === true &&
        istNurFreemail(message, eigeneAdressen))
    ) {
      return null;
    }

    const geteilt =
      message.zitat !== undefined && message.zitat !== null
        ? { eigen: message.text, rest: message.zitat }
        : teileText(message.text);
    const faden = await this.fadenFuer(workspaceId, message);

    const row = this.messages.create({
      workspaceId,
      mailboxId: mailbox.id,
      messageId: kennung,
      uid: message.uid,
      ordner,
      outgoing: eigene,
      fromAddress: fromAddress === '' ? 'unbekannt' : fromAddress,
      fromName: displayNameOf(message.from),
      toAddresses: (message.to ?? '').slice(0, 2000),
      subject: subjectOf(message.subject),
      snippet: snippetOf(message.text),
      inhalt:
        geteilt.eigen === '' ? null : geteilt.eigen.slice(0, INHALT_HOECHSTENS),
      zitat:
        geteilt.rest === '' ? null : geteilt.rest.slice(0, INHALT_HOECHSTENS),
      anhaenge: (message.anhaenge ?? []).map((anhang) => ({
        ...anhang,
        gespeichertId: null,
      })),
      sentAt: message.sentAt,
      inReplyTo: message.inReplyTo,
      references: message.references,
      threadKey: faden,
      contactId: match.contactId,
      companyId: match.companyId,
      zugewiesenAnId:
        mailbox.art === 'gemeinsam'
          ? await this.zuweisungImFaden(mailbox.id, faden)
          : null,
    });

    try {
      return await this.messages.save(row);
    } catch (error) {
      this.logger.warn(
        `Nachricht ${message.messageId} nicht gespeichert: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return null;
    }
  }

  async absenderAdresse(
    workspaceId: string,
    userId: string,
  ): Promise<string | null> {
    const mailbox = await this.find(workspaceId, userId);

    return mailbox === null ||
      mailbox.getrenntAm !== null ||
      mailbox.smtpHost === null ||
      mailbox.smtpHost.trim() === ''
      ? null
      : normaliseAddress(mailbox.username);
  }

  async kalenderSenden(
    workspaceId: string,
    userId: string,
    post: {
      an: string[];
      betreff: string;
      rumpf: string;
      methode: 'REQUEST' | 'CANCEL';
      ics: string;
    },
  ): Promise<void> {
    const mailbox = await this.find(workspaceId, userId);

    if (
      mailbox === null ||
      mailbox.getrenntAm !== null ||
      mailbox.smtpHost === null ||
      mailbox.smtpHost.trim() === ''
    ) {
      throw new BadRequestException(
        'Für Einladungen braucht es ein verbundenes Postfach mit Postausgang (SMTP).',
      );
    }

    const an = [
      ...new Set(
        post.an
          .map((adresse) => normaliseAddress(adresse))
          .filter((adresse) => adresse.includes('@')),
      ),
    ].slice(0, 20);

    if (an.length === 0) {
      throw new BadRequestException('Niemand hat eine E-Mail-Adresse.');
    }

    await this.sender.send(
      await versandzugang(mailbox, this.config, this.oauth),
      {
        von: mailbox.username,
        vonName: null,
        an,
        betreff: post.betreff.replace(/[\r\n]+/g, ' ').slice(0, 200),
        rumpf: post.rumpf,
        kennung: neueKennung(mailbox.username),
        inReplyTo: null,
        references: null,
        kalender: { methode: post.methode, inhalt: post.ics },
      },
    );
  }

  async senden(
    workspaceId: string,
    userId: string,
    eingabe: {
      an: string[];
      cc?: string[];
      bcc?: string[];
      betreff: string;
      rumpf: string;
      antwortAuf?: string | null;
      anhangIds?: string[];
      absender?: string | null;
      postfachId?: string | null;
    },
    optionen: {
      abgeschickt?: () => void;
    } = {},
  ): Promise<MailMessageEntity> {
    const mailbox = await this.postfachFuer(
      workspaceId,
      userId,
      eingabe.postfachId,
      'nutzen',
    );

    if (mailbox === null || mailbox.getrenntAm !== null) {
      throw new BadRequestException('Für Sie ist kein Postfach verbunden.');
    }

    const gewuenscht = normaliseAddress(eingabe.absender ?? '');
    const von =
      gewuenscht === '' || gewuenscht === normaliseAddress(mailbox.username)
        ? mailbox.username
        : (mailbox.aliase ?? []).includes(gewuenscht)
          ? gewuenscht
          : null;

    if (von === null) {
      throw new BadRequestException(
        'Diese Absenderadresse ist an Ihrem Postfach nicht eingetragen.',
      );
    }

    if (mailbox.smtpHost === null || mailbox.smtpHost.trim() === '') {
      throw new BadRequestException(
        'Für dieses Postfach ist kein Postausgang eingerichtet. ' +
          'Ohne SMTP-Server kann von hier nichts verschickt werden.',
      );
    }

    const eltern =
      eingabe.antwortAuf === undefined || eingabe.antwortAuf === null
        ? null
        : await this.messages.findOne({
            where: { workspaceId, id: eingabe.antwortAuf },
            relations: { mailbox: true },
          });

    const unsichtbar =
      eltern !== null &&
      eltern.mailbox.sichtbarkeit === 'privat' &&
      !istEigenesPostfach(
        eltern.mailbox,
        userId,
        await this.mitgliedIn(workspaceId, userId),
      );

    if (
      eingabe.antwortAuf !== undefined &&
      eingabe.antwortAuf !== null &&
      (eltern === null || unsichtbar)
    ) {
      throw new BadRequestException(
        'Die Nachricht, auf die geantwortet werden soll, gibt es nicht.',
      );
    }

    const geprueft = pruefePost(
      {
        an: eingabe.an,
        cc: eingabe.cc ?? [],
        bcc: eingabe.bcc ?? [],
        betreff: eingabe.betreff,
        rumpf: eingabe.rumpf,
        absender: von,
      },
      eltern === null
        ? null
        : { messageId: eltern.messageId, references: eltern.references },
    );

    if (!geprueft.ok) {
      throw new BadRequestException(geprueft.grund);
    }

    const { post } = geprueft;
    const anhaenge = await this.anhaengeLaden(
      workspaceId,
      eingabe.anhangIds ?? [],
    );

    await this.sender.send(
      await versandzugang(mailbox, this.config, this.oauth),
      {
        von,
        vonName: null,
        an: post.an,
        cc: post.cc,
        bcc: post.bcc,
        anhaenge,
        betreff: post.betreff,
        rumpf: post.rumpf,
        kennung: post.kennung,
        inReplyTo: post.inReplyTo,
        references: post.references,
      },
    );

    optionen.abgeschickt?.();

    const kopien = [...post.cc, ...post.bcc];
    const match = matchMessage(
      {
        from: mailbox.username,
        to: post.an.join(', '),
        cc: kopien.length === 0 ? null : kopien.join(', '),
      },
      await this.knownRecords(workspaceId),
    );

    const faden = await this.fadenFuer(workspaceId, {
      uid: 0,
      messageId: post.kennung,
      from: mailbox.username,
      to: post.an.join(', '),
      cc: null,
      subject: post.betreff,
      sentAt: new Date(),
      inReplyTo: post.inReplyTo,
      references: post.references,
      text: post.rumpf,
    });
    const zeile = this.messages.create({
      workspaceId,
      mailboxId: mailbox.id,
      messageId: post.kennung,
      uid: 0,
      outgoing: true,
      fromAddress: von,
      fromName: null,
      toAddresses: post.an.join(', ').slice(0, 2000),
      subject: post.betreff,
      snippet: snippetOf(post.rumpf),
      inhalt: post.rumpf.slice(0, INHALT_HOECHSTENS),
      zitat: null,
      anhaenge: [],
      sentAt: new Date(),
      inReplyTo: post.inReplyTo,
      references: post.references,
      threadKey: faden,
      contactId: match.contactId,
      companyId: match.companyId,
      zugewiesenAnId:
        mailbox.art === 'gemeinsam'
          ? await this.zuweisungImFaden(mailbox.id, faden)
          : null,
    });
    const gespeichert = await this.messages.save(zeile);

    if (mailbox.art === 'gemeinsam' && gespeichert.zugewiesenAnId === null) {
      await this.messages.update(
        { workspaceId, mailboxId: mailbox.id, threadKey: faden },
        { zugewiesenAnId: userId },
      );
      gespeichert.zugewiesenAnId = userId;
    }

    return gespeichert;
  }

  private async zuweisungImFaden(
    mailboxId: string,
    threadKey: string,
  ): Promise<string | null> {
    const zeile = await this.messages.findOne({
      where: { mailboxId, threadKey, zugewiesenAnId: Not(IsNull()) },
      select: { id: true, zugewiesenAnId: true },
      order: { sentAt: 'DESC' },
    });

    return zeile?.zugewiesenAnId ?? null;
  }

  async gespraeche(
    workspaceId: string,
    userId: string,
    mailboxId: string,
    filter: PostfachFilter,
    limit = 50,
  ): Promise<PostfachGespraech[]> {
    const postfach = await this.postfachFuer(
      workspaceId,
      userId,
      mailboxId,
      'nutzen',
    );

    if (postfach === null) {
      return [];
    }

    const bedingung: Record<PostfachFilter, string> = {
      offen: 'faden.offen',
      mir: 'faden.offen AND faden."zugewiesenAnId" = $3',
      erledigt: 'NOT faden.offen',
      alle: 'true',
    };
    const zeilen = (await this.dataSource.query(
      `WITH faden AS (
         SELECT m."threadKey",
                max(m."sentAt") AS zuletzt,
                count(*)::int AS anzahl,
                bool_or(NOT m."outgoing" AND m."erledigtAm" IS NULL) AS offen,
                max(m."zugewiesenAnId"::text) AS "zugewiesenAnId"
           FROM "mail_messages" m
          WHERE m."mailboxId" = $1 AND m."workspaceId" = $2
          GROUP BY m."threadKey"
       )
       SELECT faden."threadKey", faden.zuletzt, faden.anzahl, faden.offen,
              faden."zugewiesenAnId", letzte."id", letzte."subject",
              letzte."fromAddress", letzte."fromName", letzte."snippet",
              letzte."outgoing", letzte."contactId", letzte."companyId"
         FROM faden
         CROSS JOIN LATERAL (
           SELECT n."id", n."subject", n."fromAddress", n."fromName",
                  n."snippet", n."outgoing", n."contactId", n."companyId"
             FROM "mail_messages" n
            WHERE n."mailboxId" = $1 AND n."threadKey" = faden."threadKey"
            ORDER BY n."sentAt" DESC
            LIMIT 1
         ) letzte
        WHERE ${bedingung[filter]}
        ORDER BY faden.zuletzt DESC
        LIMIT ${String(Math.min(Math.max(limit, 1), 200))}`,
      filter === 'mir'
        ? [postfach.id, workspaceId, userId]
        : [postfach.id, workspaceId],
    )) as {
      threadKey: string;
      zuletzt: Date;
      anzahl: number;
      offen: boolean;
      zugewiesenAnId: string | null;
      id: string;
      subject: string | null;
      fromAddress: string;
      fromName: string | null;
      snippet: string | null;
      outgoing: boolean;
      contactId: string | null;
      companyId: string | null;
    }[];

    return zeilen.map((zeile) => ({
      threadKey: zeile.threadKey,
      nachrichtId: zeile.id,
      betreff: zeile.subject,
      vonAdresse: zeile.fromAddress,
      vonName: zeile.fromName,
      ausschnitt: zeile.snippet,
      ausgehend: zeile.outgoing,
      zuletzt: new Date(zeile.zuletzt),
      anzahl: zeile.anzahl,
      offen: zeile.offen,
      zugewiesenAnId: zeile.zugewiesenAnId,
      contactId: zeile.contactId,
      companyId: zeile.companyId,
    }));
  }

  async gespraechNachrichten(
    workspaceId: string,
    userId: string,
    mailboxId: string,
    threadKey: string,
  ): Promise<MailMessageEntity[]> {
    const postfach = await this.postfachFuer(
      workspaceId,
      userId,
      mailboxId,
      'nutzen',
    );

    if (postfach === null) {
      return [];
    }

    const zeilen = await this.messages.find({
      where: { workspaceId, mailboxId: postfach.id, threadKey },
      order: { sentAt: 'ASC' },
      take: 100,
    });

    return zeilen.map((zeile) =>
      Object.assign(zeile, {
        inhaltVerborgen: false,
        anhangAnzahl: zeile.anhaenge.length,
      }),
    );
  }

  async zuweisen(
    workspaceId: string,
    userId: string,
    mailboxId: string,
    threadKey: string,
    anId: string | null,
  ): Promise<boolean> {
    const postfach = await this.postfachFuer(
      workspaceId,
      userId,
      mailboxId,
      'nutzen',
    );

    if (postfach === null) {
      throw new NotFoundException('Postfach nicht gefunden.');
    }

    if (anId !== null) {
      const darfLesen =
        postfach.art === 'persoenlich'
          ? anId === postfach.userId
          : (await this.mitglieder(postfach.id)).includes(anId);

      if (!darfLesen) {
        throw new BadRequestException(
          'Zuweisen lässt sich nur an Mitglieder dieses Postfachs.',
        );
      }
    }

    const ergebnis = await this.messages.update(
      { workspaceId, mailboxId: postfach.id, threadKey },
      { zugewiesenAnId: anId },
    );

    if ((ergebnis.affected ?? 0) === 0) {
      throw new NotFoundException('Dieses Gespräch gibt es nicht.');
    }

    return true;
  }

  async erledigen(
    workspaceId: string,
    userId: string,
    mailboxId: string,
    threadKey: string,
    erledigt: boolean,
  ): Promise<boolean> {
    const postfach = await this.postfachFuer(
      workspaceId,
      userId,
      mailboxId,
      'nutzen',
    );

    if (postfach === null) {
      throw new NotFoundException('Postfach nicht gefunden.');
    }

    if (
      !(await this.messages.exists({
        where: { workspaceId, mailboxId: postfach.id, threadKey },
      }))
    ) {
      throw new NotFoundException('Dieses Gespräch gibt es nicht.');
    }

    await this.messages.update(
      {
        workspaceId,
        mailboxId: postfach.id,
        threadKey,
        ...(erledigt ? { erledigtAm: IsNull() } : {}),
      },
      { erledigtAm: erledigt ? new Date() : null },
    );

    return true;
  }

  private async fadenFuer(
    workspaceId: string,
    message: IncomingMessage,
  ): Promise<string> {
    const kette = verkettung(message);

    if (kette === null) {
      return message.messageId.slice(0, 500);
    }

    const verwandte = await this.messages.find({
      where: suchschluessel(kette).map((id) => ({
        workspaceId,
        messageId: id,
      })),
      select: { id: true, threadKey: true },
    });

    const { schluessel, zusammenfuehren } = zuordnen(
      kette,
      verwandte.map((n) => n.threadKey),
    );

    if (zusammenfuehren.length > 0) {
      await this.messages.update(
        { workspaceId, threadKey: In(zusammenfuehren) },
        { threadKey: schluessel },
      );
    }

    return schluessel;
  }
}

const displayNameOf = (raw: string | null): string | null => {
  if (raw === null) {
    return null;
  }

  const angled = raw.indexOf('<');

  if (angled === -1) {
    return null;
  }

  const name = raw.slice(0, angled).trim().replace(/^"|"$/gu, '').trim();

  return name === '' ? null : name.slice(0, 200);
};

export const bezeichnungAus = (
  roh: string | null | undefined,
): string | null | undefined => {
  if (roh === undefined) {
    return undefined;
  }

  const wert = (roh ?? '').replace(/\s+/gu, ' ').trim().slice(0, 100);

  return wert === '' ? null : wert;
};

export const pruefeAliase = (roh: string[], hauptadresse: string): string[] => {
  const haupt = normaliseAddress(hauptadresse);
  const aliase = [
    ...new Set(
      roh
        .map((adresse) => adresse.trim().toLowerCase())
        .filter((adresse) => adresse !== '' && adresse !== haupt),
    ),
  ];

  if (aliase.length > MAX_ALIASE) {
    throw new BadRequestException(
      `Höchstens ${String(MAX_ALIASE)} weitere Absenderadressen.`,
    );
  }

  for (const adresse of aliase) {
    if (adresse.length > 254 || !EINFACHE_ADRESSE.test(adresse)) {
      throw new BadRequestException(
        `„${adresse.slice(0, 80)}“ ist keine gültige E-Mail-Adresse.`,
      );
    }
  }

  return aliase;
};
