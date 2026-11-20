import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Not, Repository } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { AppointmentAttendeeEntity } from '../calendar/appointment-attendee.entity';
import { AppointmentEntity } from '../calendar/appointment.entity';
import { AttendeeStatus, attendeeIdentity } from '../calendar/attendees';
import { berlinDate, berlinTime } from '../calendar/berlin-time';
import { buildIcs } from '../calendar/ics';
import { asEvent, serieAlsEvents } from '../calendar/ics-export.service';
import { videoLinkOderNull } from '../calendar/video-link';
import {
  type GeleseneDatei,
  type GelesenerTermin,
  liesIcs,
} from '../calendar/ics-lesen';
import { formatRule, parseRule } from '../calendar/recurrence';
import { teilnehmerZuordnen } from '../calendar/teilnehmer-zuordnung';
import { belegtFesthalten } from '../calendar/termin-sichtbarkeit';
import {
  hoereKalenderAntwort,
  hoereTermin,
  imKalenderabgleich,
  type KalenderAntwort,
  type TerminEreignis,
} from '../calendar/termin-ereignisse';
import { ContactEntity } from '../crm/entities/contact.entity';
import { MailService } from '../mail/mail.service';
import { abrufStehtMail } from '../mail/templates';
import {
  mailFaellig,
  nachErfolg,
  nachFehler,
  wiederFaellig,
} from '../mailboxes/abruf-fehler';
import { MailboxesService } from '../mailboxes/mailboxes.service';
import {
  mailSchluessel,
  open,
  type Schluesselbund,
  seal,
} from '../mailboxes/secret-box';
import { UserEntity } from '../users/user.entity';
import { internErlaubt, UngueltigesZiel } from '../webhooks/webhook-ziel';
import { type OAuthAnbieter } from '../oauth/oauth-anbieter';
import { OAuthFehler, OAuthService } from '../oauth/oauth.service';
import {
  CalDavClient,
  type GefundenerKalender,
  KalenderFehler,
  type KalenderKlient,
  pruefeKalenderUrl,
  type Transport,
} from './caldav-client';
import { GOOGLE_CALDAV, GoogleKalenderClient } from './google-kalender';
import { ETAG_ZUSATZ, GRAPH, GraphKalenderClient } from './graph-kalender';
import { KalenderEintragEntity } from './kalender-eintrag.entity';
import {
  KALENDER_SICHTBARKEITEN,
  type KalenderSichtbarkeit,
  KalenderVerbindungEntity,
} from './kalender-verbindung.entity';
import { emailInSql } from '../crm/kontaktwege';
import { einplanen, ueberwacht } from '../ueberwachung/laeufe.service';

export const KALENDER_TRANSPORT = Symbol('KALENDER_TRANSPORT');

const MINUTE_MS = 60_000;
const ALLE_MS = 10 * MINUTE_MS;
const TAG_MS = 86_400_000;
const ZURUECK_TAGE = 30;
const VORAUS_TAGE = 180;
const NACHREICHEN_JE_RUNDE = 200;

const PARTSTAT: Record<string, AttendeeStatus> = {
  ACCEPTED: AttendeeStatus.ACCEPTED,
  DECLINED: AttendeeStatus.DECLINED,
  TENTATIVE: AttendeeStatus.TENTATIVE,
  'NEEDS-ACTION': AttendeeStatus.NEEDS_ACTION,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Abgleichsergebnis = {
  neu: number;
  geaendert: number;
  geloescht: number;
  hochgeladen: number;
};

const grundFuer = (fehler: unknown): string =>
  fehler instanceof KalenderFehler ||
  fehler instanceof UngueltigesZiel ||
  fehler instanceof OAuthFehler
    ? fehler.message
    : 'Der Kalenderserver war nicht erreichbar.';

@Injectable()
export class KalenderSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KalenderSyncService.name);
  private timer: NodeJS.Timeout | undefined;
  private laeuft = false;
  private readonly ausstehend = new Map<string, NodeJS.Timeout>();
  private abmelden: (() => void)[] = [];

  constructor(
    @InjectRepository(KalenderVerbindungEntity)
    private readonly verbindungen: Repository<KalenderVerbindungEntity>,
    @InjectRepository(KalenderEintragEntity)
    private readonly eintraege: Repository<KalenderEintragEntity>,
    @InjectRepository(AppointmentEntity)
    private readonly termine: Repository<AppointmentEntity>,
    @InjectRepository(AppointmentAttendeeEntity)
    private readonly teilnehmer: Repository<AppointmentAttendeeEntity>,
    @InjectRepository(ContactEntity)
    private readonly kontakte: Repository<ContactEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly mailboxes: MailboxesService,
    private readonly config: ConfigService,
    @Inject(KALENDER_TRANSPORT) private readonly transport: Transport,
    @Optional() private readonly oauth?: OAuthService,
    @Optional() private readonly mail?: MailService,
  ) {}

  onModuleInit(): void {
    this.abmelden = [
      hoereTermin((ereignis) => this.vormerken(ereignis)),
      hoereKalenderAntwort(
        (antwort) =>
          void this.antwortVerarbeiten(antwort).catch((fehler: unknown) =>
            this.logger.warn(
              `Kalenderantwort nicht verarbeitet: ${String(fehler)}`,
            ),
          ),
      ),
    ];
    einplanen('kalender-abgleich', ALLE_MS);
    this.timer = setInterval(
      () => void ueberwacht('kalender-abgleich', ALLE_MS, () => this.runde()),
      ALLE_MS,
    );
    this.timer.unref();
  }

  onModuleDestroy(): void {
    for (const ab of this.abmelden) {
      ab();
    }

    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }

    for (const zeitgeber of this.ausstehend.values()) {
      clearTimeout(zeitgeber);
    }
  }

  private schluessel(): Schluesselbund {
    return mailSchluessel(this.config);
  }

  private host(): string {
    try {
      return new URL(this.config.get<string>('webOrigin') ?? 'http://localhost')
        .hostname;
    } catch {
      return 'localhost';
    }
  }

  private client(verbindung: KalenderVerbindungEntity): KalenderKlient {
    if (
      verbindung.anbieter === 'google' ||
      verbindung.anbieter === 'microsoft'
    ) {
      const zugangId = verbindung.oauthZugangId;
      const oauth = this.oauth;
      const bearer = (): Promise<string> =>
        zugangId === null || oauth === undefined
          ? Promise.reject(
              new KalenderFehler(
                'Die Anmeldung über den Anbieter ist nicht eingerichtet. Bitte neu verbinden.',
              ),
            )
          : oauth.zugriffstoken(zugangId);

      return verbindung.anbieter === 'google'
        ? new GoogleKalenderClient(this.transport, bearer)
        : new GraphKalenderClient(this.transport, bearer);
    }

    return new CalDavClient(
      this.transport,
      verbindung.benutzer,
      open(verbindung.passwortVersiegelt, this.schluessel()),
      internErlaubt(),
    );
  }

  private nurMensch(caller: RequestUser): void {
    if (caller.apiKey !== undefined) {
      throw new ForbiddenException(
        'Einen Kalender verbindet nur eine Person, kein Schlüssel.',
      );
    }
  }

  stand(caller: RequestUser): Promise<KalenderVerbindungEntity | null> {
    return this.verbindungen.findOne({
      where: { workspaceId: caller.workspaceId, userId: caller.userId },
    });
  }

  private async eigene(caller: RequestUser): Promise<KalenderVerbindungEntity> {
    const verbindung = await this.stand(caller);

    if (verbindung === null) {
      throw new NotFoundException('Für Sie ist kein Kalender verbunden.');
    }

    return verbindung;
  }

  async verbinden(
    caller: RequestUser,
    eingabe: { serverUrl: string; benutzer: string; passwort: string },
  ): Promise<{
    verbindung: KalenderVerbindungEntity;
    kalender: GefundenerKalender[];
  }> {
    this.nurMensch(caller);

    let url: URL;

    try {
      url = pruefeKalenderUrl(eingabe.serverUrl, internErlaubt());
    } catch (fehler) {
      throw new BadRequestException(grundFuer(fehler));
    }

    const benutzer = eingabe.benutzer.trim();

    if (benutzer === '' || eingabe.passwort === '') {
      throw new BadRequestException('Benutzer und Passwort fehlen.');
    }

    let kalender: GefundenerKalender[];

    try {
      kalender = await new CalDavClient(
        this.transport,
        benutzer,
        eingabe.passwort,
        internErlaubt(),
      ).entdecken(url.toString());
    } catch (fehler) {
      throw new BadRequestException(grundFuer(fehler));
    }

    if (kalender.length === 0) {
      throw new BadRequestException(
        'Unter diesem Zugang gibt es keinen Kalender für Termine.',
      );
    }

    const vorher = await this.stand(caller);
    const einziger = kalender.length === 1 ? kalender[0] : null;
    const verbindung = this.verbindungen.create({
      ...(vorher ?? {}),
      workspaceId: caller.workspaceId,
      userId: caller.userId,
      anbieter: 'caldav',
      oauthZugangId: null,
      serverUrl: url.toString(),
      benutzer,
      passwortVersiegelt: seal(eingabe.passwort, this.schluessel()),
      kalenderUrl: einziger?.url ?? vorher?.kalenderUrl ?? null,
      kalenderName: einziger?.name ?? vorher?.kalenderName ?? null,
      letzterFehler: null,
    });

    if (vorher !== null && vorher.kalenderUrl !== verbindung.kalenderUrl) {
      await this.eintraege.delete({ verbindungId: vorher.id });
    }

    if (vorher?.oauthZugangId !== null && vorher?.oauthZugangId !== undefined) {
      await this.oauth?.entfernen(vorher.oauthZugangId);
    }

    const gespeichert = await this.verbindungen.save(verbindung);

    if (gespeichert.kalenderUrl !== null) {
      this.imHintergrund(gespeichert);
    }

    return { verbindung: gespeichert, kalender };
  }

  async oauthVerbinden(eingabe: {
    workspaceId: string;
    userId: string;
    anbieter: OAuthAnbieter;
    zugangId: string;
    konto: string;
  }): Promise<KalenderVerbindungEntity> {
    const vorher = await this.verbindungen.findOne({
      where: { workspaceId: eingabe.workspaceId, userId: eingabe.userId },
    });
    const entwurf = this.verbindungen.create({
      ...(vorher ?? {}),
      workspaceId: eingabe.workspaceId,
      userId: eingabe.userId,
      anbieter: eingabe.anbieter,
      oauthZugangId: eingabe.zugangId,
      serverUrl: eingabe.anbieter === 'google' ? GOOGLE_CALDAV : GRAPH,
      benutzer: eingabe.konto,
      passwortVersiegelt: '',
      letzterFehler: null,
    });
    let kalender: GefundenerKalender[];

    try {
      kalender = await this.client(entwurf).entdecken(entwurf.serverUrl);
    } catch (fehler) {
      throw new BadRequestException(grundFuer(fehler));
    }

    if (kalender.length === 0) {
      throw new BadRequestException(
        'In diesem Konto gibt es keinen Kalender, in den Stegwerk schreiben darf.',
      );
    }

    const gewaehlt =
      kalender.find((eintrag) => eintrag.url === vorher?.kalenderUrl) ??
      kalender[0];

    entwurf.kalenderUrl = gewaehlt.url;
    entwurf.kalenderName = gewaehlt.name;

    if (vorher !== null && vorher.kalenderUrl !== gewaehlt.url) {
      await this.eintraege.delete({ verbindungId: vorher.id });
    }

    const gespeichert = await this.verbindungen.save(entwurf);

    this.imHintergrund(gespeichert);

    return gespeichert;
  }

  async kalenderListe(caller: RequestUser): Promise<GefundenerKalender[]> {
    const verbindung = await this.eigene(caller);

    try {
      return await this.client(verbindung).entdecken(verbindung.serverUrl);
    } catch (fehler) {
      throw new BadRequestException(grundFuer(fehler));
    }
  }

  async kalenderWaehlen(
    caller: RequestUser,
    kalenderUrl: string,
  ): Promise<KalenderVerbindungEntity> {
    const verbindung = await this.eigene(caller);
    const gewaehlt = (await this.kalenderListe(caller)).find(
      (eintrag) => eintrag.url === kalenderUrl,
    );

    if (gewaehlt === undefined) {
      throw new BadRequestException(
        'Diesen Kalender gibt es in dem Konto nicht.',
      );
    }

    if (verbindung.kalenderUrl !== gewaehlt.url) {
      await this.eintraege.delete({ verbindungId: verbindung.id });
    }

    verbindung.kalenderUrl = gewaehlt.url;
    verbindung.kalenderName = gewaehlt.name;
    verbindung.letzterFehler = null;

    const gespeichert = await this.verbindungen.save(verbindung);

    this.imHintergrund(gespeichert);

    return gespeichert;
  }

  async sichtbarkeitSetzen(
    caller: RequestUser,
    sichtbarkeit: KalenderSichtbarkeit,
  ): Promise<KalenderVerbindungEntity> {
    if (!KALENDER_SICHTBARKEITEN.includes(sichtbarkeit)) {
      throw new BadRequestException('Diese Sichtbarkeit gibt es nicht.');
    }

    const verbindung = await this.eigene(caller);

    await this.verbindungen.update({ id: verbindung.id }, { sichtbarkeit });

    if (sichtbarkeit === 'alles') {
      await this.termine.update(
        {
          workspaceId: caller.workspaceId,
          ownerId: caller.userId,
          nurBelegt: true,
        },
        { nurBelegt: false },
      );
    }

    return { ...verbindung, sichtbarkeit };
  }

  async trennen(caller: RequestUser): Promise<boolean> {
    const vorher = await this.stand(caller);

    await this.oauth?.entfernen(vorher?.oauthZugangId ?? null);
    await belegtFesthalten(
      this.verbindungen.manager,
      caller.userId,
      caller.workspaceId,
    );

    const result = await this.verbindungen.delete({
      workspaceId: caller.workspaceId,
      userId: caller.userId,
    });

    return (result.affected ?? 0) > 0;
  }

  async jetztAbgleichen(
    caller: RequestUser,
  ): Promise<KalenderVerbindungEntity> {
    const verbindung = await this.eigene(caller);

    if (verbindung.kalenderUrl === null) {
      throw new BadRequestException('Bitte zuerst einen Kalender wählen.');
    }

    await this.abgleichen(verbindung);

    return this.eigene(caller);
  }

  private imHintergrund(verbindung: KalenderVerbindungEntity): void {
    void this.abgleichen(verbindung).catch(() => undefined);
  }

  private vormerken(ereignis: TerminEreignis): void {
    const schluessel = ereignis.terminId;
    const vorher = this.ausstehend.get(schluessel);

    if (vorher !== undefined) {
      clearTimeout(vorher);
    }

    this.ausstehend.set(
      schluessel,
      setTimeout(() => {
        this.ausstehend.delete(schluessel);
        void this.ausfuehren(ereignis).catch((fehler: unknown) =>
          this.logger.warn(
            `Termin ${ereignis.terminId} nicht übertragen: ${String(fehler)}`,
          ),
        );
      }, 400),
    );
  }

  private async ausfuehren(ereignis: TerminEreignis): Promise<void> {
    if (ereignis.art === 'geloescht') {
      await this.loeschungWeitergeben(ereignis.workspaceId, ereignis.terminId);

      if (ereignis.serieId !== undefined && ereignis.serieId !== null) {
        await this.terminWeitergeben(ereignis.workspaceId, ereignis.serieId);
      }

      return;
    }

    if (ereignis.abgesagt === true) {
      await this.absageSenden(ereignis.workspaceId, ereignis.terminId);
    }

    await this.terminWeitergeben(ereignis.workspaceId, ereignis.terminId);
  }

  private rundeVon(termin: AppointmentEntity) {
    return this.teilnehmer.find({
      where: { workspaceId: termin.workspaceId, appointmentId: termin.id },
      relations: { contact: true, user: true },
      order: { createdAt: 'ASC' },
    });
  }

  private async icsFuer(termin: AppointmentEntity): Promise<string> {
    const runde = await this.rundeVon(termin);

    if (termin.recurrence === null) {
      return buildIcs([asEvent(termin, this.host(), runde)], {
        ohneMethode: true,
      });
    }

    const ausnahmen = await this.termine.find({
      where: { workspaceId: termin.workspaceId, serieId: termin.id },
      order: { serieDatum: 'ASC' },
    });

    return buildIcs(
      serieAlsEvents(
        termin,
        this.host(),
        runde,
        await Promise.all(
          ausnahmen.map(async (ausnahme) => ({
            termin: ausnahme,
            runde: await this.rundeVon(ausnahme),
          })),
        ),
      ),
      { ohneMethode: true },
    );
  }

  private async fehlerMerken(
    verbindung: KalenderVerbindungEntity,
    fehler: unknown,
    jetzt = new Date(),
  ): Promise<void> {
    const grund = grundFuer(fehler);

    await this.verbindungen.update(
      { id: verbindung.id },
      {
        letzterFehler: grund.slice(0, 500),
        ...nachFehler(
          (await this.verbindungen.findOne({
            where: { id: verbindung.id },
            select: { id: true, fehlversuche: true, fehlerSeit: true },
          })) ?? verbindung,
          grund,
          jetzt,
        ),
      },
    );
  }

  async terminWeitergeben(
    workspaceId: string,
    terminId: string,
  ): Promise<void> {
    const termin = await this.termine.findOne({
      where: { id: terminId, workspaceId },
    });

    if (termin === null) {
      return;
    }

    if (termin.serieId !== null) {
      await this.loeschungWeitergeben(workspaceId, termin.id);
      await this.terminWeitergeben(workspaceId, termin.serieId);

      return;
    }

    const verbindung = await this.verbindungen.findOne({
      where: {
        workspaceId,
        userId: termin.ownerId,
        kalenderUrl: Not(IsNull()),
      },
    });

    const fremde = await this.eintraege.find({
      where: {
        appointmentId: termin.id,
        ...(verbindung === null ? {} : { verbindungId: Not(verbindung.id) }),
      },
      relations: { verbindung: true },
    });

    for (const eintrag of fremde) {
      await this.dateiLoeschen(eintrag);
    }

    if (verbindung === null || verbindung.kalenderUrl === null) {
      return;
    }

    try {
      await this.hochladen(verbindung, termin);
    } catch (fehler) {
      await this.fehlerMerken(verbindung, fehler);
    }
  }

  private async hochladen(
    verbindung: KalenderVerbindungEntity,
    termin: AppointmentEntity,
  ): Promise<void> {
    const client = this.client(verbindung);
    const eintrag = await this.eintraege.findOne({
      where: { verbindungId: verbindung.id, appointmentId: termin.id },
    });
    const href =
      eintrag?.href ??
      client.neueAdresse(verbindung.kalenderUrl ?? '', termin.id);
    const ics = await this.icsFuer(termin);
    let ergebnis = await client.ablegen(href, ics, {
      etag: eintrag === null ? undefined : eintrag.etag,
    });

    if (ergebnis.konflikt) {
      const dort = await client.holen(href);
      const datei = dort === null ? undefined : liesIcs(dort.ics);
      const gelesen = datei?.termine[0];

      if (
        dort !== null &&
        gelesen !== undefined &&
        gelesen.geaendertAm !== null &&
        gelesen.geaendertAm.getTime() > termin.updatedAt.getTime()
      ) {
        const neu = await this.uebernehmen(
          verbindung,
          termin,
          gelesen,
          datei?.ausnahmen ?? [],
        );

        await this.zuordnungMerken(
          verbindung,
          neu,
          href,
          gelesen.uid,
          dort.etag,
        );

        return;
      }

      ergebnis = await client.ablegen(href, ics, { erzwingen: true });
    }

    await this.zuordnungMerken(
      verbindung,
      termin,
      ergebnis.href ?? href,
      `${termin.id}@${this.host()}`,
      ergebnis.etag,
    );
  }

  private async zuordnungMerken(
    verbindung: KalenderVerbindungEntity,
    termin: AppointmentEntity,
    href: string,
    uid: string,
    etag: string | null,
  ): Promise<void> {
    const vorhanden = await this.eintraege.findOne({
      where: { verbindungId: verbindung.id, href },
    });

    await this.eintraege.save(
      this.eintraege.create({
        ...(vorhanden ?? {}),
        verbindungId: verbindung.id,
        appointmentId: termin.id,
        href,
        uid: uid.slice(0, 500),
        etag,
        lokalStand: termin.updatedAt,
      }),
    );
  }

  private async dateiLoeschen(eintrag: KalenderEintragEntity): Promise<void> {
    const verbindung =
      eintrag.verbindung ??
      (await this.verbindungen.findOne({
        where: { id: eintrag.verbindungId },
      }));

    if (verbindung !== null) {
      try {
        await this.client(verbindung).loeschen(eintrag.href);
      } catch (fehler) {
        await this.fehlerMerken(verbindung, fehler);

        return;
      }
    }

    await this.eintraege.delete({ id: eintrag.id });
  }

  async loeschungWeitergeben(
    workspaceId: string,
    terminId: string,
  ): Promise<void> {
    const eintraege = await this.eintraege.find({
      where: { appointmentId: terminId, verbindung: { workspaceId } },
      relations: { verbindung: true },
    });

    for (const eintrag of eintraege) {
      await this.dateiLoeschen(eintrag);
    }
  }

  async runde(jetzt = new Date()): Promise<number> {
    if (this.laeuft) {
      return 0;
    }

    this.laeuft = true;

    try {
      const alle = await this.verbindungen.find({
        where: { kalenderUrl: Not(IsNull()) },
      });
      const faellig = alle.filter(
        (verbindung) =>
          verbindung.letzterFehler === null ||
          wiederFaellig(verbindung, verbindung.letzterVersuchAm, jetzt),
      );

      for (const workspaceId of new Set(
        faellig.map((verbindung) => verbindung.workspaceId),
      )) {
        await teilnehmerZuordnen(this.termine.manager, workspaceId, {
          seit: new Date(jetzt.getTime() - 24 * 60 * 60 * 1000),
        }).catch(() => 0);
      }

      for (const verbindung of faellig) {
        await this.verbindungen.update(
          { id: verbindung.id },
          { letzterVersuchAm: jetzt },
        );
        await this.abgleichen(verbindung, jetzt).catch(() => undefined);
      }

      await this.stillstandMelden(jetzt).catch((fehler: unknown) =>
        this.logger.warn(`Stillstand nicht gemeldet: ${String(fehler)}`),
      );

      return faellig.length;
    } finally {
      this.laeuft = false;
    }
  }

  async abgleichen(
    verbindung: KalenderVerbindungEntity,
    jetzt = new Date(),
  ): Promise<Abgleichsergebnis> {
    const ergebnis: Abgleichsergebnis = {
      neu: 0,
      geaendert: 0,
      geloescht: 0,
      hochgeladen: 0,
    };

    if (verbindung.kalenderUrl === null) {
      return ergebnis;
    }

    try {
      const von = new Date(jetzt.getTime() - ZURUECK_TAGE * TAG_MS);
      const bis = new Date(jetzt.getTime() + VORAUS_TAGE * TAG_MS);
      const client = this.client(verbindung);
      const dort = await client.abfragen(verbindung.kalenderUrl, von, bis);
      const bekannt = await this.eintraege.find({
        where: { verbindungId: verbindung.id },
      });
      const nachHref = new Map(
        bekannt.map((eintrag) => [eintrag.href, eintrag]),
      );
      const gesehen = new Set<string>();

      for (const objekt of dort) {
        gesehen.add(objekt.href);

        const eintrag = nachHref.get(objekt.href);

        if (
          eintrag !== undefined &&
          eintrag.etag !== null &&
          eintrag.etag === objekt.etag
        ) {
          continue;
        }

        const datei = liesIcs(objekt.ics);
        const gelesen = datei.termine[0];

        if (gelesen === undefined) {
          continue;
        }

        const termin =
          eintrag?.appointmentId === null || eintrag === undefined
            ? await this.terminZurUid(verbindung, gelesen.uid)
            : await this.termine.findOne({
                where: {
                  id: eintrag.appointmentId,
                  workspaceId: verbindung.workspaceId,
                },
              });

        if (
          termin !== null &&
          eintrag !== undefined &&
          eintrag.etag !== null &&
          !eintrag.etag.includes(ETAG_ZUSATZ) &&
          objekt.etag?.includes(ETAG_ZUSATZ) === true
        ) {
          await this.hochladen(
            verbindung,
            await this.tageZusammenfuehren(verbindung, termin, datei),
          );
          ergebnis.hochgeladen += 1;
          continue;
        }

        if (termin !== null && eintrag !== undefined) {
          const hierGeaendert =
            eintrag.lokalStand === null ||
            termin.updatedAt.getTime() > eintrag.lokalStand.getTime() + 1000;
          const dortJuenger =
            gelesen.geaendertAm !== null &&
            gelesen.geaendertAm.getTime() > termin.updatedAt.getTime();

          if (hierGeaendert && !dortJuenger) {
            await this.hochladen(verbindung, termin);
            ergebnis.hochgeladen += 1;
            continue;
          }
        }

        if (termin === null && gelesen.abgesagt) {
          continue;
        }

        const neu = await this.uebernehmen(
          verbindung,
          termin,
          gelesen,
          datei.ausnahmen,
        );

        await this.zuordnungMerken(
          verbindung,
          neu,
          objekt.href,
          gelesen.uid,
          objekt.etag,
        );

        if (termin === null) {
          ergebnis.neu += 1;
        } else {
          ergebnis.geaendert += 1;
        }
      }

      for (const eintrag of bekannt) {
        if (gesehen.has(eintrag.href)) {
          continue;
        }

        const termin =
          eintrag.appointmentId === null
            ? null
            : await this.termine.findOne({
                where: {
                  id: eintrag.appointmentId,
                  workspaceId: verbindung.workspaceId,
                },
              });

        if (
          termin !== null &&
          termin.recurrence === null &&
          (termin.endsAt.getTime() < von.getTime() ||
            termin.startsAt.getTime() > bis.getTime())
        ) {
          continue;
        }

        if (termin !== null) {
          await imKalenderabgleich(() => this.termine.remove(termin));
          ergebnis.geloescht += 1;
        }

        await this.eintraege.delete({ id: eintrag.id });
      }

      ergebnis.hochgeladen += await this.nachreichen(verbindung, von, bis);

      await this.verbindungen.update(
        { id: verbindung.id },
        { letzterSyncAm: jetzt, letzterFehler: null, ...nachErfolg() },
      );
    } catch (fehler) {
      await this.fehlerMerken(verbindung, fehler, jetzt);
      throw fehler;
    }

    return ergebnis;
  }

  async stillstandMelden(jetzt = new Date()): Promise<number> {
    if (this.mail === undefined) {
      return 0;
    }

    const gestoert = await this.verbindungen.find({
      where: {
        letzterFehler: Not(IsNull()),
        fehlerMailAm: IsNull(),
        fehlerSeit: LessThan(new Date(jetzt.getTime() - TAG_MS)),
      },
      relations: { user: true },
      take: 50,
    });
    let gemeldet = 0;

    for (const verbindung of gestoert) {
      if (!mailFaellig(verbindung, jetzt) || verbindung.user === undefined) {
        continue;
      }

      await this.verbindungen.update(
        { id: verbindung.id },
        { fehlerMailAm: jetzt },
      );
      await this.mail.send(
        abrufStehtMail(
          verbindung.user.email,
          'Kalender',
          verbindung.kalenderName ?? verbindung.benutzer,
          verbindung.letzterFehler ?? '',
          `${this.config.get<string>('webOrigin') ?? 'http://localhost:5273'}/kalender`,
          verbindung.fehlerArt,
        ),
      );
      gemeldet += 1;
    }

    return gemeldet;
  }

  private async nachreichen(
    verbindung: KalenderVerbindungEntity,
    von: Date,
    bis: Date,
  ): Promise<number> {
    const offen = await this.termine
      .createQueryBuilder('t')
      .where('t."workspaceId" = :ws', { ws: verbindung.workspaceId })
      .andWhere('t."ownerId" = :owner', { owner: verbindung.userId })
      .andWhere('t."serieId" IS NULL')
      .andWhere('(t."recurrence" IS NOT NULL OR t."endsAt" >= :von)', { von })
      .andWhere('t."startsAt" <= :bis', { bis })
      .andWhere(
        `NOT EXISTS (SELECT 1 FROM kalender_eintraege e
          WHERE e."verbindungId" = :vid AND e."appointmentId" = t.id)`,
        { vid: verbindung.id },
      )
      .orderBy('t."startsAt"', 'ASC')
      .limit(NACHREICHEN_JE_RUNDE)
      .getMany();

    for (const termin of offen) {
      await this.hochladen(verbindung, termin);
    }

    return offen.length;
  }

  private async terminZurUid(
    verbindung: KalenderVerbindungEntity,
    uid: string,
  ): Promise<AppointmentEntity | null> {
    const [id, host] = uid.split('@');

    if (host !== this.host() || id === undefined || !UUID.test(id)) {
      return null;
    }

    return this.termine.findOne({
      where: { id, workspaceId: verbindung.workspaceId },
    });
  }

  private regel(roh: string | null): string | null {
    if (roh === null) {
      return null;
    }

    try {
      return formatRule(parseRule(roh));
    } catch {
      return null;
    }
  }

  private async uebernehmen(
    verbindung: KalenderVerbindungEntity,
    termin: AppointmentEntity | null,
    gelesen: GelesenerTermin,
    ausnahmen: GelesenerTermin[] = [],
  ): Promise<AppointmentEntity> {
    const gespeichert = await this.einenUebernehmen(
      verbindung,
      termin,
      gelesen,
      ausnahmen,
    );

    await imKalenderabgleich(() =>
      this.ausnahmenUebernehmen(verbindung, gespeichert, ausnahmen),
    );

    return gespeichert;
  }

  private async ausnahmenUebernehmen(
    verbindung: KalenderVerbindungEntity,
    serie: AppointmentEntity,
    ausnahmen: GelesenerTermin[],
    { nurErgaenzen = false }: { nurErgaenzen?: boolean } = {},
  ): Promise<void> {
    const vorhanden = await this.termine.find({
      where: { workspaceId: serie.workspaceId, serieId: serie.id },
    });
    const nachTag = new Map(
      vorhanden.map((termin) => [termin.serieDatum, termin]),
    );
    const gesehen = new Set<string>();

    if (serie.recurrence !== null) {
      for (const ausnahme of ausnahmen) {
        const tag = ausnahme.serienTag;

        if (tag === null || gesehen.has(tag)) {
          continue;
        }

        gesehen.add(tag);

        if (
          nurErgaenzen &&
          (nachTag.has(tag) || serie.skippedDates.includes(tag))
        ) {
          continue;
        }

        const ziel =
          nachTag.get(tag) ??
          this.termine.create({
            workspaceId: serie.workspaceId,
            ownerId: serie.ownerId,
            createdById: serie.createdById,
            quelle: 'kalender',
            remindMinutesBefore: serie.remindMinutesBefore,
            remindedAt: null,
            skippedDates: [],
            recurrence: null,
            companyId: serie.companyId,
            contactId: serie.contactId,
            dealId: serie.dealId,
            serieId: serie.id,
            serieDatum: tag,
          });

        this.inhaltSetzen(ziel, { ...ausnahme, regel: null });

        const gespeichert = await this.termine.save(ziel);

        await this.rundeUebernehmen(verbindung, gespeichert, ausnahme);
      }
    }

    const weg = nurErgaenzen
      ? []
      : vorhanden.filter((termin) => !gesehen.has(termin.serieDatum ?? ''));

    if (weg.length > 0) {
      await this.termine.remove(weg);
    }
  }

  private async tageZusammenfuehren(
    verbindung: KalenderVerbindungEntity,
    serie: AppointmentEntity,
    datei: GeleseneDatei,
  ): Promise<AppointmentEntity> {
    const gelesen = datei.termine[0];

    if (serie.recurrence === null || gelesen === undefined) {
      return serie;
    }

    return imKalenderabgleich(async () => {
      await this.ausnahmenUebernehmen(verbindung, serie, datei.ausnahmen, {
        nurErgaenzen: true,
      });

      const vertreten = await this.termine.find({
        where: { workspaceId: serie.workspaceId, serieId: serie.id },
        select: { id: true, serieDatum: true },
      });

      serie.skippedDates = [
        ...new Set([
          ...serie.skippedDates,
          ...gelesen.ausfaelle,
          ...vertreten
            .map((termin) => termin.serieDatum)
            .filter((tag): tag is string => tag !== null),
        ]),
      ].sort();

      return this.termine.save(serie);
    });
  }

  private inhaltSetzen(
    ziel: AppointmentEntity,
    gelesen: GelesenerTermin,
  ): void {
    ziel.title = (gelesen.titel === '' ? '(ohne Titel)' : gelesen.titel).slice(
      0,
      200,
    );
    ziel.description = gelesen.beschreibung;
    ziel.videoLink = videoLinkOderNull(gelesen.url);
    ziel.location =
      gelesen.ort === null || gelesen.ort === ziel.videoLink
        ? null
        : gelesen.ort.slice(0, 300);
    ziel.startsAt = gelesen.startsAt;
    ziel.endsAt = gelesen.endsAt;
    ziel.allDay = gelesen.ganztaegig;
    ziel.recurrence = this.regel(gelesen.regel);
    ziel.cancelledAt = gelesen.abgesagt
      ? (ziel.cancelledAt ?? new Date())
      : null;
    ziel.privat = gelesen.privat;
  }

  private async einenUebernehmen(
    verbindung: KalenderVerbindungEntity,
    termin: AppointmentEntity | null,
    gelesen: GelesenerTermin,
    ausnahmen: GelesenerTermin[],
  ): Promise<AppointmentEntity> {
    return imKalenderabgleich(async () => {
      const ziel =
        termin ??
        this.termine.create({
          workspaceId: verbindung.workspaceId,
          ownerId: verbindung.userId,
          createdById: verbindung.userId,
          quelle: 'kalender',
          remindMinutesBefore: null,
          remindedAt: null,
          skippedDates: [],
          companyId: null,
          contactId: null,
          dealId: null,
        });

      this.inhaltSetzen(ziel, gelesen);
      ziel.skippedDates =
        ziel.recurrence === null
          ? []
          : [
              ...new Set([
                ...gelesen.ausfaelle,
                ...ausnahmen
                  .map((ausnahme) => ausnahme.serienTag)
                  .filter((tag): tag is string => tag !== null),
              ]),
            ].sort();

      const gespeichert = await this.termine.save(ziel);
      const verknuepft = await this.rundeUebernehmen(
        verbindung,
        gespeichert,
        gelesen,
      );

      if (
        termin === null &&
        verknuepft.length > 0 &&
        gespeichert.companyId === null &&
        gespeichert.contactId === null &&
        gespeichert.dealId === null
      ) {
        const ziel = await this.zielFuer(verbindung.workspaceId, verknuepft);

        if (ziel !== null) {
          Object.assign(gespeichert, ziel);

          return this.termine.save(gespeichert);
        }
      }

      return gespeichert;
    });
  }

  private async zielFuer(
    workspaceId: string,
    kontakte: ContactEntity[],
  ): Promise<Pick<
    AppointmentEntity,
    'companyId' | 'contactId' | 'dealId'
  > | null> {
    if (kontakte.length === 0) {
      return null;
    }

    const firmen = new Set(kontakte.map((kontakt) => kontakt.companyId));
    const firma =
      firmen.size === 1 && kontakte[0].companyId !== null
        ? kontakte[0].companyId
        : null;
    const geschaefte = (await this.termine.manager.query(
      `SELECT d."id" FROM "deals" d
        WHERE d."workspaceId" = $1
          AND d."deletedAt" IS NULL
          AND d."stage" NOT IN ('won', 'lost')
          AND (d."primaryContactId" = ANY($2::uuid[])
            OR EXISTS (SELECT 1 FROM "deal_kontakte" dk
                WHERE dk."dealId" = d."id" AND dk."contactId" = ANY($2::uuid[]))
            OR ($3::uuid IS NOT NULL AND d."companyId" = $3::uuid))
        LIMIT 2`,
      [workspaceId, kontakte.map((kontakt) => kontakt.id), firma],
    )) as { id: string }[];

    if (geschaefte.length === 1) {
      return { dealId: geschaefte[0].id, contactId: null, companyId: null };
    }

    if (kontakte.length === 1) {
      return { contactId: kontakte[0].id, companyId: null, dealId: null };
    }

    return firma === null
      ? null
      : { companyId: firma, contactId: null, dealId: null };
  }

  private async kollegenNachAdresse(
    workspaceId: string,
    adressen: string[],
  ): Promise<Map<string, string>> {
    if (adressen.length === 0) {
      return new Map();
    }

    const zeilen = (await this.termine.manager.query(
      `SELECT u."id" AS "userId", lower(u."email") AS "adresse"
         FROM "users" u
         JOIN "memberships" m ON m."userId" = u."id" AND m."workspaceId" = $1
        WHERE lower(u."email") = ANY($2::text[])
       UNION
       SELECT p."userId", lower(a.adresse) AS "adresse"
         FROM "mailboxes" p
         JOIN "memberships" m ON m."userId" = p."userId" AND m."workspaceId" = $1
         CROSS JOIN LATERAL unnest(array_append(p."aliase", p."username")) AS a(adresse)
        WHERE p."workspaceId" = $1 AND p."art" = 'persoenlich'
          AND lower(a.adresse) = ANY($2::text[])`,
      [workspaceId, adressen],
    )) as { userId: string; adresse: string }[];

    return new Map(zeilen.map((zeile) => [zeile.adresse, zeile.userId]));
  }

  private async rundeUebernehmen(
    verbindung: KalenderVerbindungEntity,
    termin: AppointmentEntity,
    gelesen: GelesenerTermin,
  ): Promise<ContactEntity[]> {
    const ich = await this.users.findOne({ where: { id: verbindung.userId } });
    const eigene = new Set(
      [ich?.email, verbindung.benutzer]
        .filter((adresse): adresse is string => adresse !== undefined)
        .map((adresse) => adresse.toLowerCase()),
    );
    const fremde = gelesen.teilnehmer.filter(
      (eintrag) => !eigene.has(eintrag.email),
    );
    const adressen = fremde.map((eintrag) => eintrag.email);
    const kontakte =
      adressen.length === 0
        ? []
        : await this.kontakte
            .createQueryBuilder('k')
            .where('k."workspaceId" = :ws', { ws: verbindung.workspaceId })
            .andWhere('k."deletedAt" IS NULL')
            .andWhere(emailInSql('k', 'adressen'), { adressen })
            .getMany();
    const nachAdresse = new Map([
      ...kontakte.flatMap((kontakt) =>
        (kontakt.weitereEmails ?? []).map(
          (weitere) => [weitere.wert, kontakt] as const,
        ),
      ),
      ...kontakte.map(
        (kontakt) => [(kontakt.email ?? '').toLowerCase(), kontakt] as const,
      ),
    ]);

    const kollegen = await this.kollegenNachAdresse(
      verbindung.workspaceId,
      adressen,
    );

    await this.teilnehmer.delete({
      workspaceId: verbindung.workspaceId,
      appointmentId: termin.id,
    });

    const genutzt = new Set<string>();
    const zeilen = fremde.flatMap((eintrag) => {
      const kollege = kollegen.get(eintrag.email);
      const kontakt =
        kollege === undefined ? nachAdresse.get(eintrag.email) : undefined;
      const schluessel = kollege ?? kontakt?.id ?? eintrag.email;

      if (genutzt.has(schluessel) || kollege === verbindung.userId) {
        return [];
      }

      genutzt.add(schluessel);

      return [
        this.teilnehmer.create({
          workspaceId: verbindung.workspaceId,
          appointmentId: termin.id,
          contactId: kontakt?.id ?? null,
          userId: kollege ?? null,
          email:
            kontakt === undefined && kollege === undefined
              ? eintrag.email.slice(0, 320)
              : null,
          name:
            (
              eintrag.name || (kontakt === undefined ? null : eintrag.email)
            )?.slice(0, 200) ?? null,
          status: PARTSTAT[eintrag.partstat] ?? AttendeeStatus.NEEDS_ACTION,
        }),
      ];
    });

    if (zeilen.length > 0) {
      await this.teilnehmer.save(zeilen);
    }

    return [...new Map(kontakte.map((k) => [k.id, k])).values()].filter((k) =>
      genutzt.has(k.id),
    );
  }

  private async einladungsIcs(
    termin: AppointmentEntity,
    organisator: string,
    methode: 'REQUEST' | 'CANCEL',
    sequenz: number,
  ): Promise<{ ics: string; an: string[] }> {
    const runde = await this.teilnehmer.find({
      where: { workspaceId: termin.workspaceId, appointmentId: termin.id },
      relations: { contact: true, user: true },
      order: { createdAt: 'ASC' },
    });
    const ich = await this.users.findOne({ where: { id: termin.ownerId } });
    const an = runde
      .map(
        (eintrag) =>
          attendeeIdentity(eintrag, {
            contact: eintrag.contact,
            user: eintrag.user,
          }).email,
      )
      .filter(
        (adresse): adresse is string =>
          adresse !== null && adresse.toLowerCase() !== organisator,
      );
    const serie =
      termin.serieId === null
        ? null
        : await this.termine.findOne({
            where: { id: termin.serieId, workspaceId: termin.workspaceId },
          });
    const ereignis = asEvent(
      termin,
      this.host(),
      runde,
      serie !== null && serie.eingeladenAm !== null ? serie : null,
    );

    return {
      an,
      ics: buildIcs(
        [
          {
            ...ereignis,
            organizerEmail: organisator,
            organizerName:
              ich === null ? null : `${ich.firstName} ${ich.lastName}`.trim(),
            rsvp: methode === 'REQUEST',
            sequenz,
            cancelled: methode === 'CANCEL' || ereignis.cancelled,
          },
        ],
        { methode },
      ),
    };
  }

  private rumpf(termin: AppointmentEntity, absage: boolean): string {
    const wann = termin.allDay
      ? berlinDate(termin.startsAt).split('-').reverse().join('.')
      : `${berlinDate(termin.startsAt).split('-').reverse().join('.')}, ${berlinTime(
          termin.startsAt,
        )}–${berlinTime(termin.endsAt)} Uhr`;

    return [
      absage
        ? `Der Termin „${termin.title}“ wurde abgesagt.`
        : `Einladung zu „${termin.title}“.`,
      '',
      `Wann: ${wann}`,
      ...(termin.location === null ? [] : [`Wo: ${termin.location}`]),
      ...(termin.videoLink === null || absage
        ? []
        : [`Videokonferenz: ${termin.videoLink}`]),
      ...(termin.description === null || absage
        ? []
        : ['', termin.description]),
    ].join('\n');
  }

  async einladungSenden(
    caller: RequestUser,
    terminId: string,
  ): Promise<AppointmentEntity> {
    this.nurMensch(caller);

    const termin = await this.termine.findOne({
      where: { id: terminId, workspaceId: caller.workspaceId },
    });

    if (termin === null) {
      throw new NotFoundException('Diesen Termin gibt es nicht.');
    }

    const organisator = await this.mailboxes.absenderAdresse(
      caller.workspaceId,
      caller.userId,
    );

    if (organisator === null) {
      throw new BadRequestException(
        'Für Einladungen braucht es ein verbundenes Postfach mit Postausgang (SMTP).',
      );
    }

    const sequenz =
      termin.eingeladenAm === null ? termin.sequenz : termin.sequenz + 1;
    const { ics, an } = await this.einladungsIcs(
      termin,
      organisator,
      'REQUEST',
      sequenz,
    );

    if (an.length === 0) {
      throw new BadRequestException('Kein Teilnehmer hat eine E-Mail-Adresse.');
    }

    await this.mailboxes.kalenderSenden(caller.workspaceId, caller.userId, {
      an,
      betreff: `Einladung: ${termin.title}`,
      rumpf: this.rumpf(termin, false),
      methode: 'REQUEST',
      ics,
    });

    await this.termine.update(
      { id: termin.id },
      { eingeladenAm: new Date(), sequenz },
    );

    return this.termine.findOneOrFail({ where: { id: termin.id } });
  }

  async absageSenden(workspaceId: string, terminId: string): Promise<void> {
    const termin = await this.termine.findOne({
      where: { id: terminId, workspaceId },
    });

    if (termin === null || termin.eingeladenAm === null) {
      return;
    }

    const organisator = await this.mailboxes.absenderAdresse(
      workspaceId,
      termin.ownerId,
    );

    if (organisator === null) {
      return;
    }

    const sequenz = termin.sequenz + 1;
    const { ics, an } = await this.einladungsIcs(
      termin,
      organisator,
      'CANCEL',
      sequenz,
    );

    if (an.length === 0) {
      return;
    }

    try {
      await this.mailboxes.kalenderSenden(workspaceId, termin.ownerId, {
        an,
        betreff: `Abgesagt: ${termin.title}`,
        rumpf: this.rumpf(termin, true),
        methode: 'CANCEL',
        ics,
      });
      await this.termine.update({ id: termin.id }, { sequenz });
    } catch (fehler) {
      this.logger.warn(
        `Absage für ${termin.id} nicht verschickt: ${String(fehler)}`,
      );
    }
  }

  async antwortVerarbeiten(antwort: KalenderAntwort): Promise<number> {
    const datei = liesIcs(antwort.ics);

    if (datei.methode !== 'REPLY') {
      return 0;
    }

    let geaendert = 0;

    for (const gelesen of datei.termine) {
      const [id, host] = gelesen.uid.split('@');

      if (host !== this.host() || id === undefined || !UUID.test(id)) {
        continue;
      }

      const eintrag = gelesen.teilnehmer.find(
        (teil) => teil.email === antwort.von.toLowerCase(),
      );
      const status =
        eintrag === undefined ? undefined : PARTSTAT[eintrag.partstat];

      if (eintrag === undefined || status === undefined) {
        continue;
      }

      let terminId = id;

      if (gelesen.serienTag !== null) {
        const vertreter = await this.termine.findOne({
          where: {
            workspaceId: antwort.workspaceId,
            serieId: id,
            serieDatum: gelesen.serienTag,
          },
        });

        if (vertreter === null) {
          continue;
        }

        terminId = vertreter.id;
      }

      const runde = await this.teilnehmer.find({
        where: { workspaceId: antwort.workspaceId, appointmentId: terminId },
        relations: { contact: true, user: true },
      });
      const treffer = runde.find(
        (teil) =>
          attendeeIdentity(teil, {
            contact: teil.contact,
            user: teil.user,
          }).email?.toLowerCase() === eintrag.email ||
          (teil.contact?.weitereEmails ?? []).some(
            (weitere) => weitere.wert === eintrag.email,
          ),
      );

      if (treffer !== undefined && treffer.status !== status) {
        treffer.status = status;
        await this.teilnehmer.save(treffer);
        geaendert += 1;
      }
    }

    return geaendert;
  }
}
