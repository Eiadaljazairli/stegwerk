import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, MoreThanOrEqual, Repository } from 'typeorm';

import { AuditAction, AuditLogEntity } from '../audit/audit-log.entity';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { BillingService } from '../billing/billing.service';
import { ContactsService } from '../crm/contacts.service';
import { type ContactEntity } from '../crm/entities/contact.entity';
import {
  CustomFieldEntity,
  CustomFieldFilterOperator,
} from '../custom-fields/custom-field.types';
import { normaliseAddress } from '../mailboxes/address-match';
import { MailSperreEntity } from '../mailboxes/mail-sperre.entity';
import { MailboxEntity } from '../mailboxes/mailbox.entity';
import {
  kopfzeilenSicher,
  MAX_BETREFF,
  neueKennung,
  pruefeEmpfaenger,
} from '../mailboxes/outbound-mail';
import { versandzugang } from '../mailboxes/postfach-anmeldung';
import { OAuthService } from '../oauth/oauth.service';
import {
  MAIL_SENDER,
  type MailSender,
  VersandFehlgeschlagen,
} from '../mailboxes/smtp-sender';
import { adresseGesperrt } from '../mailboxes/sperrliste';
import { SavedViewEntity } from '../saved-views/saved-view.entity';
import { UserEntity } from '../users/user.entity';
import { mitgliedsIds } from '../verteiler/verteiler.service';
import { abmeldeToken, type AbmeldeDaten } from './abmelde-token';
import { berlinDate, instantFromBerlin } from '../calendar/berlin-time';
import {
  AbmeldungEntity,
  KampagneEntity,
  KampagnenEmpfaengerEntity,
} from './serienmail.entities';

export const JE_MINUTE = 30;

export const JE_TAG = 500;

const HAENGT_NACH_MS = 10 * 60 * 1000;

export const MAX_EMPFAENGER = 5000;

export const ALLE_THEMEN = 'alle';

const PLATZHALTER =
  /\{\{\s*(vorname|nachname|firma)\s*(?:\|([^{}|]{0,80}))?\}\}/giu;

export type Empfaengerdaten = {
  vorname: string;
  nachname: string;
  firma: string;
};

export const fuelle = (vorlage: string, daten: Empfaengerdaten): string =>
  vorlage.replace(PLATZHALTER, (_ganz, name: string, ersatz?: string) => {
    const schluessel = name.toLowerCase() as keyof Empfaengerdaten;
    const wert = daten[schluessel];

    return wert.trim() !== '' ? wert : (ersatz?.trim() ?? '');
  });

export type Empfaengerzeile = {
  contactId: string | null;
  email: string | null;
  vorname: string;
  nachname: string;
  firma: string;
  status: 'geplant' | 'uebersprungen';
  grund: string | null;
};

export const ordneEmpfaenger = (
  kontakte: (Pick<
    ContactEntity,
    'id' | 'email' | 'firstName' | 'lastName' | 'unzustellbarSeit'
  > & {
    company?: { name: string } | null;
    weitereEmails?: { wert: string }[] | null;
  })[],
  abgemeldet: ReadonlySet<string>,
  sperren: ReadonlySet<string>,
): Empfaengerzeile[] => {
  const gesehen = new Set<string>();

  return kontakte.map((kontakt) => {
    const adresse =
      kontakt.email === null ? null : pruefeEmpfaenger(kontakt.email);
    const basis = {
      contactId: kontakt.id,
      email: adresse ?? kontakt.email,
      vorname: kontakt.firstName.slice(0, 100),
      nachname: kontakt.lastName.slice(0, 100),
      firma: (kontakt.company?.name ?? '').slice(0, 200),
    };
    const uebersprungen = (grund: string): Empfaengerzeile => ({
      ...basis,
      status: 'uebersprungen',
      grund,
    });

    if (kontakt.email === null || kontakt.email.trim() === '') {
      return uebersprungen('Keine E-Mail-Adresse');
    }

    if (adresse === null) {
      return uebersprungen('E-Mail-Adresse ist ungültig');
    }

    if (kontakt.unzustellbarSeit !== null) {
      return uebersprungen('Adresse ist als unzustellbar markiert');
    }

    if (
      abgemeldet.has(adresse) ||
      (kontakt.weitereEmails ?? []).some((weitere) =>
        abgemeldet.has(normaliseAddress(weitere.wert)),
      )
    ) {
      return uebersprungen('Hat sich abgemeldet');
    }

    if (adresseGesperrt(adresse, sperren)) {
      return uebersprungen('Steht auf der Sperrliste');
    }

    if (gesehen.has(adresse)) {
      return uebersprungen('Adresse kommt doppelt vor');
    }

    gesehen.add(adresse);

    return { ...basis, status: 'geplant', grund: null };
  });
};

export type EmpfaengerAuswahl = {
  kontaktIds?: string[] | null;
  ansichtId?: string | null;
  verteilerId?: string | null;
};

type Gerendert = {
  betreff: string;
  text: string;
  abmeldeLink: string;
  einKlickLink: string;
};

@Injectable()
export class SerienmailsService {
  private readonly logger = new Logger(SerienmailsService.name);

  constructor(
    @InjectRepository(KampagneEntity)
    private readonly kampagnen: Repository<KampagneEntity>,
    @InjectRepository(KampagnenEmpfaengerEntity)
    private readonly empfaenger: Repository<KampagnenEmpfaengerEntity>,
    @InjectRepository(AbmeldungEntity)
    private readonly abmeldungen: Repository<AbmeldungEntity>,
    @InjectRepository(MailboxEntity)
    private readonly mailboxes: Repository<MailboxEntity>,
    @InjectRepository(MailSperreEntity)
    private readonly sperren: Repository<MailSperreEntity>,
    @InjectRepository(SavedViewEntity)
    private readonly ansichten: Repository<SavedViewEntity>,
    private readonly contacts: ContactsService,
    private readonly billing: BillingService,
    @Inject(MAIL_SENDER) private readonly sender: MailSender,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    @Optional() private readonly oauth?: OAuthService,
  ) {}

  async liste(workspaceId: string): Promise<KampagneEntity[]> {
    const liste = await this.kampagnen.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    return this.mitZahlen(liste);
  }

  async abmeldungsListe(
    workspaceId: string,
    suche?: string,
  ): Promise<AbmeldungEntity[]> {
    const abfrage = this.abmeldungen
      .createQueryBuilder('a')
      .where('a.workspaceId = :workspaceId', { workspaceId })
      .orderBy('a.zeitpunkt', 'DESC')
      .take(500);
    const text = suche?.trim().toLowerCase().slice(0, 200) ?? '';

    if (text !== '') {
      abfrage.andWhere("a.email LIKE :text ESCAPE '\\'", {
        text: `%${text.replace(/[\\%_]/g, (zeichen) => `\\${zeichen}`)}%`,
      });
    }

    return abfrage.getMany();
  }

  async themen(workspaceId: string): Promise<string[]> {
    const zeilen = (await this.kampagnen.query(
      `SELECT thema FROM kampagnen WHERE "workspaceId" = $1
       UNION SELECT thema FROM abmeldungen WHERE "workspaceId" = $1 AND thema <> $2
       ORDER BY 1 LIMIT 100`,
      [workspaceId, ALLE_THEMEN],
    )) as { thema: string }[];

    return zeilen.map((zeile) => zeile.thema);
  }

  async eine(workspaceId: string, id: string): Promise<KampagneEntity> {
    const kampagne = await this.kampagnen.findOne({
      where: { workspaceId, id },
    });

    if (kampagne === null) {
      throw new NotFoundException('Diese Serienmail gibt es nicht.');
    }

    return (await this.mitZahlen([kampagne]))[0];
  }

  private async mitZahlen(liste: KampagneEntity[]): Promise<KampagneEntity[]> {
    if (liste.length === 0) {
      return liste;
    }

    const zeilen = await this.empfaenger
      .createQueryBuilder('e')
      .select('e.kampagneId', 'kampagneId')
      .addSelect('e.status', 'status')
      .addSelect('COUNT(*)::int', 'anzahl')
      .where('e.kampagneId IN (:...ids)', { ids: liste.map((k) => k.id) })
      .groupBy('e.kampagneId')
      .addGroupBy('e.status')
      .getRawMany<{ kampagneId: string; status: string; anzahl: number }>();

    for (const kampagne of liste) {
      const zahl = (status: string) =>
        zeilen
          .filter((z) => z.kampagneId === kampagne.id && z.status === status)
          .reduce((summe, z) => summe + Number(z.anzahl), 0);

      kampagne.geplant = zahl('geplant') + zahl('sendet');
      kampagne.gesendet = zahl('gesendet');
      kampagne.uebersprungen = zahl('uebersprungen');
      kampagne.fehler = zahl('fehler');
    }

    return liste;
  }

  private pruefeInhalt(eingabe: {
    name?: string;
    betreff?: string;
    text?: string;
    thema?: string;
  }): void {
    if (eingabe.betreff !== undefined) {
      if (
        !kopfzeilenSicher(eingabe.betreff) ||
        eingabe.betreff.trim().length > MAX_BETREFF
      ) {
        throw new BadRequestException(
          'Der Betreff darf keine Zeilenumbrüche enthalten und höchstens 200 Zeichen lang sein.',
        );
      }
    }

    if (eingabe.thema !== undefined && eingabe.thema.trim() === ALLE_THEMEN) {
      throw new BadRequestException(
        '„alle“ ist für Abmeldungen von allem vorbehalten; bitte ein anderes Thema wählen.',
      );
    }
  }

  async anlegen(
    caller: RequestUser,
    eingabe: { name: string; betreff: string; text: string; thema?: string },
  ): Promise<KampagneEntity> {
    this.pruefeInhalt(eingabe);

    const kampagne = await this.kampagnen.save(
      this.kampagnen.create({
        workspaceId: caller.workspaceId,
        name: eingabe.name.trim(),
        betreff: eingabe.betreff.trim(),
        text: eingabe.text,
        thema: eingabe.thema?.trim() || 'allgemein',
        status: 'entwurf',
        erstelltVon: caller.userId,
      }),
    );

    return this.eine(caller.workspaceId, kampagne.id);
  }

  async aendern(
    caller: RequestUser,
    id: string,
    eingabe: { name?: string; betreff?: string; text?: string; thema?: string },
  ): Promise<KampagneEntity> {
    const kampagne = await this.eine(caller.workspaceId, id);

    if (kampagne.status !== 'entwurf') {
      throw new BadRequestException(
        'Eine gestartete Serienmail lässt sich nicht mehr ändern.',
      );
    }

    this.pruefeInhalt(eingabe);

    await this.kampagnen.update(
      { id, workspaceId: caller.workspaceId },
      {
        ...(eingabe.name === undefined ? {} : { name: eingabe.name.trim() }),
        ...(eingabe.betreff === undefined
          ? {}
          : { betreff: eingabe.betreff.trim() }),
        ...(eingabe.text === undefined ? {} : { text: eingabe.text }),
        ...(eingabe.thema === undefined
          ? {}
          : { thema: eingabe.thema.trim() || 'allgemein' }),
      },
    );

    return this.eine(caller.workspaceId, id);
  }

  async loeschen(caller: RequestUser, id: string): Promise<boolean> {
    const kampagne = await this.eine(caller.workspaceId, id);

    if (kampagne.status === 'laeuft') {
      throw new BadRequestException(
        'Eine laufende Serienmail zuerst abbrechen.',
      );
    }

    await this.kampagnen.delete({ id, workspaceId: caller.workspaceId });

    return true;
  }

  private async kontakteFuer(
    caller: RequestUser,
    auswahl: EmpfaengerAuswahl,
  ): Promise<ContactEntity[]> {
    const { workspaceId } = caller;

    if (auswahl.verteilerId !== undefined && auswahl.verteilerId !== null) {
      const ids = await mitgliedsIds(
        this.dataSource.manager,
        workspaceId,
        auswahl.verteilerId,
      );

      if (ids === null) {
        throw new NotFoundException('Diesen Verteiler gibt es nicht.');
      }

      return this.kontakteFuer(caller, { kontaktIds: ids });
    }

    if (auswahl.kontaktIds !== undefined && auswahl.kontaktIds !== null) {
      if (auswahl.kontaktIds.length > MAX_EMPFAENGER) {
        throw new BadRequestException(
          `Höchstens ${String(MAX_EMPFAENGER)} Empfänger je Serienmail.`,
        );
      }

      const gefunden: ContactEntity[] = [];

      for (const id of [...new Set(auswahl.kontaktIds)]) {
        try {
          gefunden.push(await this.contacts.findOne(workspaceId, id));
        } catch {}
      }

      return gefunden;
    }

    let args: Record<string, unknown> = {};
    let filter: Record<string, unknown> = {};

    if (auswahl.ansichtId !== undefined && auswahl.ansichtId !== null) {
      const ansicht = await this.ansichten.findOne({
        where: {
          id: auswahl.ansichtId,
          workspaceId,
          entity: CustomFieldEntity.CONTACT,
        },
      });

      if (ansicht === null) {
        throw new NotFoundException('Diese Kontaktansicht gibt es nicht.');
      }

      args = {
        search: ansicht.search ?? undefined,
        customFilters: (
          ansicht.customFilters as {
            key: string;
            operator: string;
            value?: string;
          }[]
        ).map((f) => ({
          ...f,
          operator:
            CustomFieldFilterOperator[
              f.operator as keyof typeof CustomFieldFilterOperator
            ] ?? f.operator,
        })),
      };

      const verantwortlich = ansicht.filters.verantwortlich;

      filter = {
        ...(typeof ansicht.filters.companyId === 'string' &&
        ansicht.filters.companyId !== ''
          ? { companyId: ansicht.filters.companyId }
          : {}),
        ...(verantwortlich === 'me'
          ? { ownerId: caller.userId }
          : typeof verantwortlich === 'string' && verantwortlich !== ''
            ? { ownerId: verantwortlich }
            : {}),
      };
    }

    return this.contacts.listAll(
      workspaceId,
      args as never,
      filter,
      MAX_EMPFAENGER,
    );
  }

  private async abgemeldet(
    workspaceId: string,
    thema: string,
    adressen: string[],
  ): Promise<Set<string>> {
    if (adressen.length === 0) {
      return new Set();
    }

    const zeilen = await this.abmeldungen.find({
      where: {
        workspaceId,
        email: In(adressen),
        thema: In([thema, ALLE_THEMEN]),
      },
      select: ['email'],
    });

    return new Set(zeilen.map((z) => z.email));
  }

  private async sperrliste(workspaceId: string): Promise<Set<string>> {
    const zeilen = await this.sperren.find({
      where: { workspaceId },
      select: ['eintrag'],
    });

    return new Set(zeilen.map((z) => z.eintrag));
  }

  async empfaengerFestlegen(
    caller: RequestUser,
    id: string,
    auswahl: EmpfaengerAuswahl,
  ): Promise<KampagneEntity> {
    const kampagne = await this.eine(caller.workspaceId, id);

    if (kampagne.status !== 'entwurf') {
      throw new BadRequestException(
        'Die Empfänger stehen fest, sobald die Serienmail gestartet ist.',
      );
    }

    const kontakte = await this.kontakteFuer(caller, auswahl);
    const adressen = kontakte
      .flatMap((k) => [
        k.email === null ? null : normaliseAddress(k.email),
        ...(k.weitereEmails ?? []).map((w) => normaliseAddress(w.wert)),
      ])
      .filter((a): a is string => a !== null && a !== '');
    const zeilen = ordneEmpfaenger(
      kontakte,
      await this.abgemeldet(caller.workspaceId, kampagne.thema, adressen),
      await this.sperrliste(caller.workspaceId),
    );

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(KampagnenEmpfaengerEntity, { kampagneId: id });

      for (let i = 0; i < zeilen.length; i += 500) {
        await manager.insert(
          KampagnenEmpfaengerEntity,
          zeilen.slice(i, i + 500).map((zeile) => ({
            ...zeile,
            kampagneId: id,
            workspaceId: caller.workspaceId,
          })),
        );
      }
    });

    return this.eine(caller.workspaceId, id);
  }

  async empfaengerListe(
    workspaceId: string,
    id: string,
    status: string | null,
  ): Promise<KampagnenEmpfaengerEntity[]> {
    await this.eine(workspaceId, id);

    return this.empfaenger.find({
      where: {
        kampagneId: id,
        workspaceId,
        ...(status === null ? {} : { status: status as never }),
      },
      order: { nachname: 'ASC', vorname: 'ASC' },
      take: 500,
    });
  }

  private geheimnis(): string {
    return this.config.getOrThrow<string>('jwtSecret');
  }

  private oeffentlich(): string {
    return this.config.getOrThrow<string>('webOrigin').replace(/\/+$/u, '');
  }

  rendern(
    kampagne: Pick<
      KampagneEntity,
      'betreff' | 'text' | 'thema' | 'workspaceId'
    >,
    empfaenger: Empfaengerdaten & { email: string },
    absender: string,
  ): Gerendert {
    const daten: AbmeldeDaten = {
      workspaceId: kampagne.workspaceId,
      email: empfaenger.email,
      thema: kampagne.thema,
    };
    const token = abmeldeToken(daten, this.geheimnis());
    const abmeldeLink = `${this.oeffentlich()}/abmelden/${token}`;
    const einKlickLink = `${this.oeffentlich()}/public/abmelden/${token}`;

    return {
      betreff: fuelle(kampagne.betreff, empfaenger).replace(/[\r\n]+/gu, ' '),
      text:
        `${fuelle(kampagne.text, empfaenger).trimEnd()}\n\n-- \n` +
        `Diese Nachricht kommt von ${absender}. ` +
        `Wenn Sie solche Nachrichten nicht mehr erhalten möchten:\n${abmeldeLink}\n`,
      abmeldeLink,
      einKlickLink,
    };
  }

  private async postfachVon(
    workspaceId: string,
    userId: string,
  ): Promise<MailboxEntity> {
    const postfach = await this.mailboxes.findOne({
      where: { workspaceId, userId, haupt: true },
    });

    if (postfach === null || postfach.getrenntAm !== null) {
      throw new BadRequestException('Für Sie ist kein Postfach verbunden.');
    }

    if (postfach.smtpHost === null || postfach.smtpHost.trim() === '') {
      throw new BadRequestException(
        'Für Ihr Postfach ist kein Postausgang (SMTP) eingerichtet.',
      );
    }

    return postfach;
  }

  private async sende(
    postfach: MailboxEntity,
    an: string,
    gerendert: Gerendert,
  ): Promise<void> {
    await this.sender.send(
      await versandzugang(postfach, this.config, this.oauth),
      {
        von: postfach.username,
        vonName: null,
        an: [an],
        betreff: gerendert.betreff,
        rumpf: gerendert.text,
        kennung: neueKennung(postfach.username),
        inReplyTo: null,
        references: null,
        kopfzeilen: {
          'List-Unsubscribe': `<${gerendert.einKlickLink}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      },
    );
  }

  async vorschau(
    caller: RequestUser,
    id: string,
  ): Promise<{ an: string; betreff: string; text: string }> {
    const kampagne = await this.eine(caller.workspaceId, id);
    const erster = await this.empfaenger.findOne({
      where: { kampagneId: id, status: 'geplant' },
      order: { nachname: 'ASC' },
    });
    const beispiel = erster ?? {
      email: 'erika.muster@example.de',
      vorname: 'Erika',
      nachname: 'Muster',
      firma: 'Muster GmbH',
    };
    const postfach = await this.mailboxes.findOne({
      where: { workspaceId: caller.workspaceId, userId: caller.userId },
    });
    const gerendert = this.rendern(
      kampagne,
      { ...beispiel, email: beispiel.email ?? 'erika.muster@example.de' },
      postfach?.username ?? caller.email,
    );

    return {
      an: beispiel.email ?? '',
      betreff: gerendert.betreff,
      text: gerendert.text,
    };
  }

  async testmail(caller: RequestUser, id: string): Promise<string> {
    await this.billing.assertCanWrite(caller.workspaceId);

    const kampagne = await this.eine(caller.workspaceId, id);
    const postfach = await this.postfachVon(caller.workspaceId, caller.userId);
    const erster = await this.empfaenger.findOne({
      where: { kampagneId: id, status: 'geplant' },
      order: { nachname: 'ASC' },
    });
    const gerendert = this.rendern(
      kampagne,
      {
        vorname: erster?.vorname ?? 'Erika',
        nachname: erster?.nachname ?? 'Muster',
        firma: erster?.firma ?? 'Muster GmbH',
        email: postfach.username,
      },
      postfach.username,
    );

    try {
      await this.sende(postfach, postfach.username, {
        ...gerendert,
        betreff: `[Test] ${gerendert.betreff}`,
      });
    } catch (fehler) {
      throw new BadRequestException(
        fehler instanceof VersandFehlgeschlagen
          ? fehler.message
          : 'Die Testmail konnte nicht versendet werden.',
      );
    }

    return postfach.username;
  }

  async starten(caller: RequestUser, id: string): Promise<KampagneEntity> {
    await this.billing.assertCanWrite(caller.workspaceId);

    const kampagne = await this.eine(caller.workspaceId, id);

    if (kampagne.status !== 'entwurf') {
      throw new BadRequestException('Diese Serienmail läuft schon.');
    }

    if (kampagne.geplant === 0) {
      throw new BadRequestException(
        'Es gibt keinen Empfänger, an den die Serienmail gehen könnte.',
      );
    }

    if (kampagne.betreff.trim() === '' || kampagne.text.trim() === '') {
      throw new BadRequestException('Betreff und Text dürfen nicht leer sein.');
    }

    await this.postfachVon(caller.workspaceId, caller.userId);

    await this.kampagnen.update(
      { id, workspaceId: caller.workspaceId, status: 'entwurf' },
      { status: 'laeuft', absenderId: caller.userId, gestartetAm: new Date() },
    );

    return this.eine(caller.workspaceId, id);
  }

  async abbrechen(caller: RequestUser, id: string): Promise<KampagneEntity> {
    const kampagne = await this.eine(caller.workspaceId, id);

    if (kampagne.status !== 'laeuft') {
      throw new BadRequestException('Diese Serienmail läuft nicht.');
    }

    await this.kampagnen.update(
      { id, workspaceId: caller.workspaceId },
      { status: 'abgebrochen', beendetAm: new Date() },
    );
    await this.empfaenger.update(
      { kampagneId: id, status: 'geplant' },
      { status: 'uebersprungen', grund: 'Serienmail abgebrochen' },
    );

    return this.eine(caller.workspaceId, id);
  }

  async abmelden(daten: AbmeldeDaten, alles: boolean): Promise<void> {
    const email = normaliseAddress(daten.email);
    const thema = alles ? ALLE_THEMEN : daten.thema;

    await this.abmeldungen
      .createQueryBuilder()
      .insert()
      .values({ workspaceId: daten.workspaceId, email, thema })
      .orIgnore()
      .execute();

    await this.empfaenger
      .createQueryBuilder()
      .update()
      .set({ status: 'uebersprungen', grund: 'Hat sich abgemeldet' })
      .where('"workspaceId" = :ws', { ws: daten.workspaceId })
      .andWhere('lower(email) = :email', { email })
      .andWhere("status = 'geplant'")
      .andWhere(
        alles
          ? 'TRUE'
          : '"kampagneId" IN (SELECT id FROM kampagnen WHERE thema = :thema)',
        { thema },
      )
      .execute();
  }

  async runde(jetzt = new Date()): Promise<number> {
    const laufend = await this.kampagnen.find({
      where: { status: 'laeuft' },
      order: { gestartetAm: 'ASC' },
    });
    const tagesbeginn = instantFromBerlin(berlinDate(jetzt), '00:00');

    await this.haengendeAufloesen(jetzt);

    const proBereich = new Map<string, number>();
    let gesendet = 0;

    for (const kampagne of laufend) {
      try {
        await this.billing.assertCanWrite(kampagne.workspaceId);
      } catch {
        continue;
      }

      const heute = await this.empfaenger.count({
        where: {
          workspaceId: kampagne.workspaceId,
          gesendetAm: MoreThanOrEqual(tagesbeginn),
        },
      });
      const schonDieseRunde = proBereich.get(kampagne.workspaceId) ?? 0;
      const frei = Math.min(
        JE_MINUTE - schonDieseRunde,
        JE_TAG - heute - schonDieseRunde,
      );

      if (frei <= 0) {
        continue;
      }

      const n = await this.paket(kampagne, frei, jetzt);

      proBereich.set(kampagne.workspaceId, schonDieseRunde + n);
      gesendet += n;
    }

    return gesendet;
  }

  async haengendeAufloesen(
    jetzt = new Date(),
    beimStart = false,
  ): Promise<void> {
    if (beimStart) {
      await this.empfaenger.update(
        { status: 'sendet', gesendetAm: IsNull() },
        { status: 'geplant' },
      );
    }

    await this.empfaenger
      .createQueryBuilder()
      .update()
      .set({
        status: 'fehler',
        grund:
          'Versand unterbrochen – ob die Mail ankam, ist unklar; nicht erneut gesendet.',
      })
      .where("status = 'sendet'")
      .andWhere('"gesendetAm" < :grenze', {
        grenze: new Date(jetzt.getTime() - HAENGT_NACH_MS),
      })
      .execute();
  }

  private async paket(
    kampagne: KampagneEntity,
    anzahl: number,
    jetzt: Date,
  ): Promise<number> {
    const [rohe] = (await this.dataSource.query(
      `UPDATE kampagnen_empfaenger SET status = 'sendet'
        WHERE id IN (
          SELECT id FROM kampagnen_empfaenger
           WHERE "kampagneId" = $1 AND status = 'geplant'
           ORDER BY nachname, vorname
           LIMIT $2
           FOR UPDATE SKIP LOCKED)
        RETURNING *`,
      [kampagne.id, anzahl],
    )) as [KampagnenEmpfaengerEntity[], number];
    const zeilen = rohe ?? [];

    if (zeilen.length === 0) {
      const offen = await this.empfaenger.count({
        where: { kampagneId: kampagne.id, status: In(['geplant', 'sendet']) },
      });

      if (offen === 0) {
        await this.kampagnen.update(
          { id: kampagne.id, status: 'laeuft' },
          { status: 'fertig', beendetAm: jetzt },
        );
      }

      return 0;
    }

    let postfach: MailboxEntity | null = null;

    try {
      postfach = await this.postfachVon(
        kampagne.workspaceId,
        kampagne.absenderId ?? kampagne.erstelltVon,
      );
    } catch (fehler) {
      await this.empfaenger.update(
        { id: In(zeilen.map((z) => z.id)) },
        { status: 'geplant' },
      );
      await this.kampagnen.update(
        { id: kampagne.id },
        { status: 'abgebrochen', beendetAm: jetzt },
      );
      this.logger.warn(
        `Serienmail ${kampagne.id} angehalten: ${
          fehler instanceof Error ? fehler.message : String(fehler)
        }`,
      );

      return 0;
    }

    const adressen = zeilen
      .map((z) => z.email)
      .filter((a): a is string => a !== null);
    const abgemeldet = await this.abgemeldet(
      kampagne.workspaceId,
      kampagne.thema,
      adressen,
    );
    const sperren = await this.sperrliste(kampagne.workspaceId);
    const absender = await this.dataSource.manager.findOne(UserEntity, {
      where: { id: postfach.userId },
    });
    const absenderName =
      absender === null
        ? postfach.username
        : `${absender.firstName} ${absender.lastName} <${postfach.username}>`;

    for (const [stelle, zeile] of zeilen.entries()) {
      if (zeile.email === null) {
        await this.empfaenger.update(zeile.id, {
          status: 'uebersprungen',
          grund: 'Keine E-Mail-Adresse',
        });
        continue;
      }

      if (abgemeldet.has(zeile.email)) {
        await this.empfaenger.update(zeile.id, {
          status: 'uebersprungen',
          grund: 'Hat sich abgemeldet',
        });
        continue;
      }

      if (adresseGesperrt(zeile.email, sperren)) {
        await this.empfaenger.update(zeile.id, {
          status: 'uebersprungen',
          grund: 'Steht auf der Sperrliste',
        });
        continue;
      }

      const versuch = await this.empfaenger
        .createQueryBuilder()
        .update()
        .set({ gesendetAm: jetzt })
        .where('id = :id', { id: zeile.id })
        .andWhere("status = 'sendet'")
        .andWhere('"gesendetAm" IS NULL')
        .execute();

      if ((versuch.affected ?? 0) === 0) {
        continue;
      }

      try {
        await this.sende(
          postfach,
          zeile.email,
          this.rendern(
            kampagne,
            { ...zeile, email: zeile.email },
            absenderName,
          ),
        );
        await this.empfaenger.update(zeile.id, {
          status: 'gesendet',
          gesendetAm: jetzt,
          grund: null,
        });
        await this.imVerlauf(kampagne, zeile, postfach.userId);
      } catch (fehler) {
        const grund = (
          fehler instanceof VersandFehlgeschlagen
            ? fehler.message
            : 'Versand fehlgeschlagen'
        ).slice(0, 300);

        if (fehler instanceof VersandFehlgeschlagen && fehler.amPostfach) {
          await this.empfaenger.update(
            { id: In(zeilen.slice(stelle).map((z) => z.id)), status: 'sendet' },
            {
              status: 'geplant',
              gesendetAm: null,
              grund: `Wartet: ${grund}`.slice(0, 300),
            },
          );
          this.logger.warn(`Serienmail ${kampagne.id} wartet: ${grund}`);

          return stelle;
        }

        await this.empfaenger.update(zeile.id, {
          status: 'fehler',
          gesendetAm: null,
          grund,
        });
      }
    }

    return zeilen.length;
  }

  private async imVerlauf(
    kampagne: KampagneEntity,
    zeile: KampagnenEmpfaengerEntity,
    actorId: string,
  ): Promise<void> {
    if (zeile.contactId === null) {
      return;
    }

    try {
      await this.dataSource.manager.save(AuditLogEntity, {
        workspaceId: kampagne.workspaceId,
        actorId,
        action: AuditAction.UPDATED,
        entityType: 'Contact',
        entityId: zeile.contactId,
        summary: `Serienmail „${kampagne.name}“`.slice(0, 300),
        changes: { serienmail: [null, kampagne.name] },
        requestId: null,
      });
    } catch (fehler) {
      this.logger.warn(
        `Verlaufseintrag für ${zeile.contactId} fehlgeschlagen: ${String(fehler)}`,
      );
    }
  }
}
