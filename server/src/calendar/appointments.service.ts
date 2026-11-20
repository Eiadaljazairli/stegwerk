import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  berlinDate,
  berlinTime,
  durationMinutes,
  instantFromBerlin,
  type Window,
} from './berlin-time';
import { AppointmentAttendeeEntity } from './appointment-attendee.entity';
import { pruefeVideoLink } from './video-link';
import { AppointmentEntity } from './appointment.entity';
import {
  type CreateAppointmentInput,
  type UpdateAppointmentInput,
} from './appointment.dto';
import {
  type AttendeeLink,
  AttendeeStatus,
  attendeeProblem,
  isSameAttendee,
} from './attendees';
import {
  addDays,
  formatRule,
  occurrencesBetween,
  parseRule,
  teileRegel,
} from './recurrence';
import { ohneGeschwaerzteFuer, schwaerzeFuer } from './termin-sichtbarkeit';
import { assertVerweiseImBereich } from '../workspaces/verweise';
import {
  assertZielSichtbar,
  neueZiele,
  zielBedingung,
  zielSichtbar,
} from '../workspaces/ziel-sichtbarkeit';

export type Conflict = {
  appointment: AppointmentEntity;
  minutes: number;
};

export const occurrenceId = (appointmentId: string, day: string): string =>
  `${appointmentId}:${day}`;

export const splitOccurrenceId = (
  id: string,
): { appointmentId: string; occurrenceOn: string | null } => {
  const at = id.indexOf(':');

  return at === -1
    ? { appointmentId: id, occurrenceOn: null }
    : { appointmentId: id.slice(0, at), occurrenceOn: id.slice(at + 1) };
};

export type Umfang = 'ONE' | 'FOLLOWING' | 'SERIES';

const tageZwischen = (von: string, bis: string): number =>
  Math.round(
    (Date.parse(`${bis}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`)) /
      86_400_000,
  );

const DAY_START = '00:00';

const nextDay = (date: string): string => {
  const cursor = new Date(`${date}T00:00:00Z`);

  cursor.setUTCDate(cursor.getUTCDate() + 1);

  return cursor.toISOString().slice(0, 10);
};

const lastDayOf = (appointment: { endsAt: Date; allDay: boolean }): string =>
  berlinDate(
    appointment.allDay
      ? new Date(appointment.endsAt.getTime() - 60_000)
      : appointment.endsAt,
  );

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(AppointmentEntity)
    private readonly appointments: Repository<AppointmentEntity>,
    @InjectRepository(AppointmentAttendeeEntity)
    private readonly attendees: Repository<AppointmentAttendeeEntity>,
  ) {}

  private expand(
    appointment: AppointmentEntity,
    window: { from: string; to: string },
  ): AppointmentEntity[] {
    if (appointment.recurrence === null || appointment.recurrence === '') {
      return [appointment];
    }

    const startDay = berlinDate(appointment.startsAt);
    const startTime = berlinTime(appointment.startsAt);
    const endTime = berlinTime(appointment.endsAt);

    const spanDays = Math.round(
      (Date.parse(`${berlinDate(appointment.endsAt)}T00:00:00Z`) -
        Date.parse(`${startDay}T00:00:00Z`)) /
        86_400_000,
    );

    let days: string[];

    try {
      days = occurrencesBetween(
        parseRule(appointment.recurrence),
        startDay,
        window,
        { skip: appointment.skippedDates ?? [] },
      );
    } catch {
      return [appointment];
    }

    return days.map((day) => {
      const endDay = new Date(Date.parse(`${day}T00:00:00Z`));

      endDay.setUTCDate(endDay.getUTCDate() + spanDays);

      const occurrence = Object.create(
        Object.getPrototypeOf(appointment) as object,
      ) as AppointmentEntity;

      Object.assign(occurrence, appointment, {
        id: occurrenceId(appointment.id, day),
        startsAt: instantFromBerlin(day, startTime),
        endsAt: instantFromBerlin(endDay.toISOString().slice(0, 10), endTime),
      });

      return occurrence;
    });
  }

  async range(
    workspaceId: string,
    from: string,
    to: string,
    options: {
      ownerId?: string | null;
      includeCancelled?: boolean | null;
    } = {},
  ): Promise<AppointmentEntity[]> {
    const start = instantFromBerlin(from, DAY_START);
    const end = instantFromBerlin(nextDay(to), DAY_START);

    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException('Der Zeitraum endet vor seinem Anfang.');
    }

    const query = this.appointments
      .createQueryBuilder('appointment')
      .leftJoinAndSelect('appointment.company', 'company')
      .leftJoinAndSelect('appointment.contact', 'contact')
      .leftJoinAndSelect('appointment.deal', 'deal')
      .where('appointment.workspaceId = :workspaceId', { workspaceId })
      .andWhere(
        `(
          (appointment.recurrence IS NULL AND appointment.startsAt < :end AND appointment.endsAt > :start)
          OR (appointment.recurrence IS NOT NULL AND appointment.startsAt < :end)
        )`,
        { start, end },
      )
      .orderBy('appointment.startsAt', 'ASC');

    if (options.ownerId !== undefined && options.ownerId !== null) {
      query.andWhere('appointment.ownerId = :ownerId', {
        ownerId: options.ownerId,
      });
    }

    if (options.includeCancelled !== true) {
      query.andWhere('appointment.cancelledAt IS NULL');
    }

    await this.nurSichtbare(query);

    const found = await query.getMany();

    return found
      .flatMap((appointment) => this.expand(appointment, { from, to }))
      .sort(
        (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
      );
  }

  async forRecord(
    workspaceId: string,
    column: 'companyId' | 'contactId' | 'dealId',
    recordId: string,
    now: Date = new Date(),
  ): Promise<AppointmentEntity[]> {
    const found = await this.appointments
      .createQueryBuilder('appointment')
      .where('appointment.workspaceId = :workspaceId', { workspaceId })
      .andWhere(`appointment.${column} = :recordId`, { recordId })
      .orderBy('appointment.startsAt', 'ASC')
      .getMany();

    const kommend = found.filter(
      (termin) => termin.endsAt.getTime() >= now.getTime(),
    );
    const vergangen = found
      .filter((termin) => termin.endsAt.getTime() < now.getTime())
      .reverse();

    return [...kommend, ...vergangen];
  }

  fuerKontakteDerFirma(
    workspaceId: string,
    companyId: string,
    now: Date = new Date(),
    grenze = 100,
  ): Promise<AppointmentEntity[]> {
    return this.anKontakten(
      workspaceId,
      `SELECT kontakt."id" FROM "contacts" kontakt
        WHERE kontakt."workspaceId" = :workspaceId
          AND kontakt."companyId" = :companyId
          AND kontakt."deletedAt" IS NULL`,
      { companyId },
      now,
      grenze,
    );
  }

  fuerKontakt(
    workspaceId: string,
    contactId: string,
    now: Date = new Date(),
    grenze = 100,
  ): Promise<AppointmentEntity[]> {
    return this.anKontakten(
      workspaceId,
      `SELECT CAST(:contactId AS uuid)`,
      { contactId },
      now,
      grenze,
    );
  }

  fuerBeteiligteDesGeschaefts(
    workspaceId: string,
    dealId: string,
    now: Date = new Date(),
    grenze = 100,
  ): Promise<AppointmentEntity[]> {
    return this.anKontakten(
      workspaceId,
      `SELECT d."primaryContactId" FROM "deals" d
        WHERE d."id" = :dealId AND d."workspaceId" = :workspaceId
          AND d."primaryContactId" IS NOT NULL
       UNION
       SELECT dk."contactId" FROM "deal_kontakte" dk
        WHERE dk."dealId" = :dealId AND dk."workspaceId" = :workspaceId`,
      { dealId },
      now,
      grenze,
      { ohneGeschaeft: dealId },
    );
  }

  private async anKontakten(
    workspaceId: string,
    kontakteSql: string,
    parameter: Record<string, unknown>,
    now: Date,
    grenze: number,
    optionen: { ohneGeschaeft?: string } = {},
  ): Promise<AppointmentEntity[]> {
    const abfrage = async (kommend: boolean) => {
      const teil = this.appointments
        .createQueryBuilder('appointment')
        .where('appointment.workspaceId = :workspaceId', { workspaceId })
        .andWhere(
          `(appointment."contactId" IN (${kontakteSql})
            OR EXISTS (SELECT 1 FROM "appointment_attendees" teilnehmer
              WHERE teilnehmer."workspaceId" = :workspaceId
                AND teilnehmer."appointmentId" = appointment."id"
                AND teilnehmer."contactId" IN (${kontakteSql})))`,
          parameter,
        )
        .andWhere(
          kommend ? 'appointment.endsAt >= :now' : 'appointment.endsAt < :now',
          { now },
        )
        .orderBy('appointment.startsAt', kommend ? 'ASC' : 'DESC')
        .take(grenze);

      if (optionen.ohneGeschaeft !== undefined) {
        teil.andWhere(
          '(appointment."dealId" IS NULL OR appointment."dealId" <> :ohneGeschaeft)',
          { ohneGeschaeft: optionen.ohneGeschaeft },
        );
      }

      const bedingung = await zielBedingung('appointment', 'ownerId');

      if (bedingung !== null) {
        teil.andWhere(bedingung.where, bedingung.parameters);
      }

      return teil.getMany();
    };

    const [kommend, vergangen] = await Promise.all([
      abfrage(true),
      abfrage(false),
    ]);

    return [...kommend, ...vergangen];
  }

  fuerBetrachter(
    workspaceId: string,
    betrachterId: string | null,
    termine: AppointmentEntity[],
  ): Promise<AppointmentEntity[]> {
    return schwaerzeFuer(
      this.appointments.manager,
      workspaceId,
      betrachterId,
      termine,
    );
  }

  fuerAkte(
    workspaceId: string,
    betrachterId: string | null,
    termine: AppointmentEntity[],
  ): Promise<AppointmentEntity[]> {
    return ohneGeschwaerzteFuer(
      this.appointments.manager,
      workspaceId,
      betrachterId,
      termine,
    );
  }

  async byId(workspaceId: string, id: string): Promise<AppointmentEntity> {
    const { appointmentId } = splitOccurrenceId(id);

    const appointment = await this.appointments.findOne({
      where: { id: appointmentId, workspaceId },
      relations: { company: true, contact: true, deal: true },
    });

    if (
      appointment === null ||
      !(await zielSichtbar(
        this.appointments.manager,
        appointment,
        appointment.ownerId,
      ))
    ) {
      throw new NotFoundException('Diesen Termin gibt es nicht.');
    }

    return appointment;
  }

  private async nurSichtbare(
    query: ReturnType<Repository<AppointmentEntity>['createQueryBuilder']>,
  ): Promise<void> {
    const bedingung = await zielBedingung('appointment', 'ownerId');

    if (bedingung !== null) {
      query.andWhere(bedingung.where, bedingung.parameters);
    }
  }

  async occurrence(
    workspaceId: string,
    id: string,
  ): Promise<AppointmentEntity> {
    const { occurrenceOn } = splitOccurrenceId(id);
    const appointment = await this.byId(workspaceId, id);

    if (occurrenceOn === null || appointment.recurrence === null) {
      return appointment;
    }

    const [einer] = this.expand(appointment, {
      from: occurrenceOn,
      to: occurrenceOn,
    });

    if (einer === undefined) {
      throw new NotFoundException('Diesen Termin gibt es nicht.');
    }

    return einer;
  }

  async conflicts(
    workspaceId: string,
    ownerId: string,
    window: Window,
    exceptId?: string | null,
  ): Promise<Conflict[]> {
    const query = this.appointments
      .createQueryBuilder('appointment')
      .where('appointment.workspaceId = :workspaceId', { workspaceId })
      .andWhere('appointment.ownerId = :ownerId', { ownerId })
      .andWhere('appointment.cancelledAt IS NULL')
      .andWhere(
        `(
          (appointment.recurrence IS NULL AND appointment.startsAt < :end AND appointment.endsAt > :start)
          OR (appointment.recurrence IS NOT NULL AND appointment.startsAt < :end)
        )`,
        { start: window.startsAt, end: window.endsAt },
      )
      .orderBy('appointment.startsAt', 'ASC');

    const ohne =
      exceptId === undefined || exceptId === null
        ? null
        : splitOccurrenceId(exceptId).appointmentId;

    if (ohne !== null) {
      query.andWhere('appointment.id != :ohne', { ohne });
    }

    await this.nurSichtbare(query);

    const candidates = await query.getMany();

    const from = berlinDate(new Date(window.startsAt.getTime() - 86_400_000));
    const to = berlinDate(new Date(window.endsAt.getTime() + 86_400_000));

    const found = candidates
      .flatMap((appointment) => this.expand(appointment, { from, to }))
      .filter(
        (appointment) =>
          appointment.startsAt.getTime() < window.endsAt.getTime() &&
          appointment.endsAt.getTime() > window.startsAt.getTime(),
      )
      .sort(
        (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
      );

    return found.map((appointment) => ({
      appointment,
      minutes: durationMinutes({
        startsAt: new Date(
          Math.max(appointment.startsAt.getTime(), window.startsAt.getTime()),
        ),
        endsAt: new Date(
          Math.min(appointment.endsAt.getTime(), window.endsAt.getTime()),
        ),
      }),
    }));
  }

  async conflictsForWallTime(
    workspaceId: string,
    ownerId: string,
    wall: {
      startDate: string;
      startTime: string;
      endDate: string;
      endTime: string;
      allDay?: boolean;
    },
    exceptId?: string | null,
  ): Promise<Conflict[]> {
    return this.conflicts(
      workspaceId,
      ownerId,
      this.windowFrom(wall),
      exceptId,
    );
  }

  async create(
    workspaceId: string,
    userId: string,
    input: CreateAppointmentInput,
  ): Promise<AppointmentEntity> {
    const window = this.windowFrom(input);

    this.assertSingleTarget(input);

    await assertVerweiseImBereich(this.appointments.manager, workspaceId, {
      companyId: input.companyId,
      contactId: input.contactId,
      dealId: input.dealId,
      userIds: [input.ownerId],
    });
    await this.assertTeilnehmerImBereich(workspaceId, input.attendees);
    await assertZielSichtbar(this.appointments.manager, input);

    const recurrence = this.cleanRecurrence(input.recurrence);

    const appointment = this.appointments.create({
      workspaceId,
      title: input.title.trim(),
      description: input.description ?? null,
      location: input.location ?? null,
      videoLink: pruefeVideoLink(input.videoLink),
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      allDay: input.allDay ?? false,
      ownerId: input.ownerId ?? userId,
      createdById: userId,
      remindMinutesBefore: input.remindMinutesBefore ?? null,
      remindedAt: null,
      recurrence,
      skippedDates: [],
      cancelledAt: null,
      companyId: input.companyId ?? null,
      contactId: input.contactId ?? null,
      dealId: input.dealId ?? null,
      privat: input.privat ?? false,
    });

    const saved = await this.appointments.save(appointment);

    if (input.attendees !== undefined) {
      await this.setAttendees(workspaceId, saved.id, input.attendees);
    }

    return saved;
  }

  async update(
    workspaceId: string,
    input: UpdateAppointmentInput,
    scope: Umfang = 'SERIES',
  ): Promise<AppointmentEntity> {
    const { occurrenceOn } = splitOccurrenceId(input.id);
    const kopf = await this.byId(workspaceId, input.id);

    await assertVerweiseImBereich(this.appointments.manager, workspaceId, {
      companyId: input.companyId,
      contactId: input.contactId,
      dealId: input.dealId,
      userIds: [input.ownerId],
    });
    await this.assertTeilnehmerImBereich(workspaceId, input.attendees);
    await assertZielSichtbar(this.appointments.manager, neueZiele(input, kopf));

    const istSerientag =
      occurrenceOn !== null &&
      kopf.recurrence !== null &&
      kopf.recurrence !== '';

    if (istSerientag && scope === 'ONE') {
      return this.detachOccurrence(workspaceId, kopf, occurrenceOn, input);
    }

    if (
      istSerientag &&
      scope === 'FOLLOWING' &&
      occurrenceOn > berlinDate(kopf.startsAt)
    ) {
      return this.splitSeries(workspaceId, kopf, occurrenceOn, input);
    }

    const appointment = kopf;
    const vorher = {
      title: appointment.title,
      description: appointment.description,
      location: appointment.location,
      videoLink: appointment.videoLink,
      ownerId: appointment.ownerId,
      remindMinutesBefore: appointment.remindMinutesBefore,
      startDay: berlinDate(appointment.startsAt),
      recurrence: appointment.recurrence,
    };

    this.assertSingleTarget({
      companyId: input.companyId ?? appointment.companyId ?? undefined,
      contactId: input.contactId ?? appointment.contactId ?? undefined,
      dealId: input.dealId ?? appointment.dealId ?? undefined,
    });

    const touchesTime =
      input.startDate !== undefined ||
      input.startTime !== undefined ||
      input.endDate !== undefined ||
      input.endTime !== undefined ||
      input.allDay !== undefined;

    if (touchesTime) {
      const serienStart = berlinDate(appointment.startsAt);
      let startDate = input.startDate ?? serienStart;
      let endDate = input.endDate ?? lastDayOf(appointment);

      if (istSerientag) {
        const tagStart = input.startDate ?? occurrenceOn;
        const spanne =
          input.endDate === undefined
            ? tageZwischen(serienStart, lastDayOf(appointment))
            : tageZwischen(tagStart, input.endDate);

        startDate = addDays(serienStart, tageZwischen(occurrenceOn, tagStart));
        endDate = addDays(startDate, spanne);
      }

      const window = this.windowFrom({
        startDate,
        startTime: input.startTime ?? berlinTime(appointment.startsAt),
        endDate,
        endTime: input.endTime ?? berlinTime(appointment.endsAt),
        allDay: input.allDay ?? appointment.allDay,
      });

      appointment.startsAt = window.startsAt;
      appointment.endsAt = window.endsAt;
      appointment.allDay = input.allDay ?? appointment.allDay;

      appointment.remindedAt = null;
    }

    if (input.title !== undefined) {
      appointment.title = input.title.trim();
    }

    for (const key of ['description', 'location'] as const) {
      if (input[key] !== undefined) {
        appointment[key] = input[key] === '' ? null : (input[key] as string);
      }
    }

    if (input.videoLink !== undefined) {
      appointment.videoLink = pruefeVideoLink(input.videoLink);
    }

    if (input.ownerId !== undefined) {
      appointment.ownerId = input.ownerId;
    }

    if (input.privat !== undefined && input.privat !== null) {
      appointment.privat = input.privat;
    }

    if (input.remindMinutesBefore !== undefined) {
      appointment.remindMinutesBefore = input.remindMinutesBefore;
      appointment.remindedAt = null;
    }

    if (input.recurrence !== undefined) {
      appointment.recurrence = this.cleanRecurrence(input.recurrence);
    }

    for (const key of ['companyId', 'contactId', 'dealId'] as const) {
      if (input[key] !== undefined) {
        appointment[key] = input[key] ?? null;
      }
    }

    const andereTage =
      appointment.recurrence !== vorher.recurrence ||
      berlinDate(appointment.startsAt) !== vorher.startDay;

    if (andereTage) {
      appointment.skippedDates = [];
    }

    const saved = await this.appointments.save(appointment);

    if (input.attendees !== undefined) {
      await this.setAttendees(workspaceId, saved.id, input.attendees);
    }

    if (andereTage) {
      await this.ausnahmenEntfernen(workspaceId, saved.id);
    } else {
      await this.ausnahmenNachziehen(workspaceId, saved, vorher);
    }

    return saved;
  }

  private async ausnahmenNachziehen(
    workspaceId: string,
    serie: AppointmentEntity,
    vorher: Pick<
      AppointmentEntity,
      | 'title'
      | 'description'
      | 'location'
      | 'videoLink'
      | 'ownerId'
      | 'remindMinutesBefore'
    >,
  ): Promise<void> {
    const ausnahmen = await this.appointments.find({
      where: { workspaceId, serieId: serie.id },
    });

    for (const ausnahme of ausnahmen) {
      let geaendert = false;

      for (const key of [
        'title',
        'description',
        'location',
        'videoLink',
        'ownerId',
        'remindMinutesBefore',
      ] as const) {
        if (ausnahme[key] === vorher[key] && serie[key] !== vorher[key]) {
          (ausnahme as unknown as Record<string, unknown>)[key] = serie[key];
          geaendert = true;
        }
      }

      if (geaendert) {
        await this.appointments.save(ausnahme);
      }
    }
  }

  ausnahmenVon(
    workspaceId: string,
    serieId: string,
  ): Promise<AppointmentEntity[]> {
    return this.appointments.find({
      where: { workspaceId, serieId },
      order: { serieDatum: 'ASC' },
    });
  }

  private async ausnahmenEntfernen(
    workspaceId: string,
    serieId: string,
    abTag?: string,
  ): Promise<void> {
    const ausnahmen = await this.ausnahmenVon(workspaceId, serieId);
    const weg = ausnahmen.filter(
      (ausnahme) => abTag === undefined || (ausnahme.serieDatum ?? '') >= abTag,
    );

    if (weg.length > 0) {
      await this.appointments.remove(weg);
    }
  }

  private async detachOccurrence(
    workspaceId: string,
    series: AppointmentEntity,
    occurrenceOn: string,
    input: Omit<UpdateAppointmentInput, 'id'>,
    abgesagt = false,
  ): Promise<AppointmentEntity> {
    const [dieser] = this.expand(series, {
      from: occurrenceOn,
      to: occurrenceOn,
    });

    if (dieser === undefined) {
      throw new NotFoundException('Diesen Termin gibt es nicht.');
    }

    if (!series.skippedDates.includes(occurrenceOn)) {
      series.skippedDates = [...series.skippedDates, occurrenceOn].sort();
      await this.appointments.save(series);
    }

    const window = this.windowFrom({
      startDate: input.startDate ?? berlinDate(dieser.startsAt),
      startTime: input.startTime ?? berlinTime(dieser.startsAt),
      endDate:
        input.endDate ??
        addDays(
          lastDayOf(dieser),
          tageZwischen(occurrenceOn, input.startDate ?? occurrenceOn),
        ),
      endTime: input.endTime ?? berlinTime(dieser.endsAt),
      allDay: input.allDay ?? dieser.allDay,
    });

    const einzeln = this.appointments.create({
      workspaceId,
      title: input.title?.trim() ?? series.title,
      description: input.description ?? series.description,
      location: input.location ?? series.location,
      videoLink:
        input.videoLink === undefined
          ? series.videoLink
          : pruefeVideoLink(input.videoLink),
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      allDay: input.allDay ?? series.allDay,
      ownerId: input.ownerId ?? series.ownerId,
      createdById: series.createdById,
      remindMinutesBefore:
        input.remindMinutesBefore ?? series.remindMinutesBefore,
      remindedAt: null,
      recurrence: null,
      skippedDates: [],
      cancelledAt: abgesagt ? new Date() : null,
      companyId: input.companyId ?? series.companyId,
      contactId: input.contactId ?? series.contactId,
      dealId: input.dealId ?? series.dealId,
      quelle: series.quelle,
      privat: input.privat ?? series.privat,
      nurBelegt: series.nurBelegt,
      serieId: series.id,
      serieDatum: occurrenceOn,
      eingeladenAm: series.eingeladenAm,
      sequenz: series.sequenz,
    });

    const saved = await this.appointments.save(einzeln);

    const runde =
      input.attendees ??
      (await this.attendeesOf(workspaceId, series.id)).map((attendee) => ({
        contactId: attendee.contactId,
        userId: attendee.userId,
        email: attendee.email,
        name: attendee.name,
        status: attendee.status,
      }));

    await this.setAttendees(workspaceId, saved.id, runde);

    return saved;
  }

  private async splitSeries(
    workspaceId: string,
    alt: AppointmentEntity,
    tag: string,
    input: Omit<UpdateAppointmentInput, 'id'>,
  ): Promise<AppointmentEntity> {
    const [dieser] = this.expand(
      { ...alt, skippedDates: [] } as AppointmentEntity,
      { from: tag, to: tag },
    );

    if (dieser === undefined || alt.recurrence === null) {
      throw new NotFoundException('Diesen Termin gibt es nicht.');
    }

    const altStart = berlinDate(alt.startsAt);
    const { vorher, nachher } = teileRegel(
      parseRule(alt.recurrence),
      altStart,
      tag,
    );
    const nachherText = formatRule(nachher);
    const neueRegel =
      input.recurrence === undefined
        ? nachherText
        : this.cleanRecurrence(input.recurrence);

    const window = this.windowFrom({
      startDate: input.startDate ?? tag,
      startTime: input.startTime ?? berlinTime(dieser.startsAt),
      endDate:
        input.endDate ??
        addDays(lastDayOf(dieser), tageZwischen(tag, input.startDate ?? tag)),
      endTime: input.endTime ?? berlinTime(dieser.endsAt),
      allDay: input.allDay ?? dieser.allDay,
    });
    const gleicheTage =
      neueRegel === nachherText && berlinDate(window.startsAt) === tag;

    this.assertSingleTarget({
      companyId: input.companyId ?? alt.companyId ?? undefined,
      contactId: input.contactId ?? alt.contactId ?? undefined,
      dealId: input.dealId ?? alt.dealId ?? undefined,
    });

    const neu = await this.appointments.save(
      this.appointments.create({
        workspaceId,
        title: input.title?.trim() ?? alt.title,
        description:
          input.description === undefined
            ? alt.description
            : input.description === ''
              ? null
              : input.description,
        location:
          input.location === undefined
            ? alt.location
            : input.location === ''
              ? null
              : input.location,
        videoLink:
          input.videoLink === undefined
            ? alt.videoLink
            : pruefeVideoLink(input.videoLink),
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        allDay: input.allDay ?? alt.allDay,
        ownerId: input.ownerId ?? alt.ownerId,
        createdById: alt.createdById,
        remindMinutesBefore:
          input.remindMinutesBefore === undefined
            ? alt.remindMinutesBefore
            : input.remindMinutesBefore,
        remindedAt: null,
        recurrence: neueRegel,
        skippedDates: gleicheTage
          ? alt.skippedDates.filter((day) => day >= tag)
          : [],
        cancelledAt: null,
        companyId:
          input.companyId === undefined ? alt.companyId : input.companyId,
        contactId:
          input.contactId === undefined ? alt.contactId : input.contactId,
        dealId: input.dealId === undefined ? alt.dealId : input.dealId,
        quelle: alt.quelle,
        privat: input.privat ?? alt.privat,
        nurBelegt: alt.nurBelegt,
      }),
    );

    alt.recurrence = formatRule(vorher);
    alt.skippedDates = alt.skippedDates.filter((day) => day < tag);
    await this.appointments.save(alt);

    const runde =
      input.attendees ??
      (await this.attendeesOf(workspaceId, alt.id)).map((attendee) => ({
        contactId: attendee.contactId,
        userId: attendee.userId,
        email: attendee.email,
        name: attendee.name,
        status: attendee.status,
      }));

    await this.setAttendees(workspaceId, neu.id, runde);

    if (gleicheTage) {
      for (const ausnahme of await this.ausnahmenVon(workspaceId, alt.id)) {
        if ((ausnahme.serieDatum ?? '') >= tag) {
          ausnahme.serieId = neu.id;
          await this.appointments.save(ausnahme);
        }
      }
    } else {
      await this.ausnahmenEntfernen(workspaceId, alt.id, tag);
    }

    return neu;
  }

  private async serieBeenden(
    workspaceId: string,
    serie: AppointmentEntity,
    tag: string,
    ausnahmen: 'absagen' | 'loeschen',
  ): Promise<AppointmentEntity> {
    if (serie.recurrence === null) {
      return serie;
    }

    const { vorher } = teileRegel(
      parseRule(serie.recurrence),
      berlinDate(serie.startsAt),
      tag,
    );

    serie.recurrence = formatRule(vorher);
    serie.skippedDates = serie.skippedDates.filter((day) => day < tag);

    const gespeichert = await this.appointments.save(serie);

    if (ausnahmen === 'loeschen') {
      await this.ausnahmenEntfernen(workspaceId, serie.id, tag);
    } else {
      await this.appointments
        .createQueryBuilder()
        .update()
        .set({ cancelledAt: new Date() })
        .where('"serieId" = :serie AND "serieDatum" >= :tag', {
          serie: serie.id,
          tag,
        })
        .andWhere('"cancelledAt" IS NULL')
        .execute();
    }

    return gespeichert;
  }

  private async serienBezug(
    workspaceId: string,
    id: string,
    termin: AppointmentEntity,
  ): Promise<{ serie: AppointmentEntity; tag: string } | null> {
    const { occurrenceOn } = splitOccurrenceId(id);

    if (occurrenceOn !== null && termin.recurrence !== null) {
      return { serie: termin, tag: occurrenceOn };
    }

    if (termin.serieId !== null && termin.serieDatum !== null) {
      return {
        serie: await this.byId(workspaceId, termin.serieId),
        tag: termin.serieDatum,
      };
    }

    return null;
  }

  async cancel(
    workspaceId: string,
    id: string,
    when: Date = new Date(),
    scope?: Umfang | null,
  ): Promise<AppointmentEntity> {
    const { occurrenceOn } = splitOccurrenceId(id);
    const appointment = await this.byId(workspaceId, id);
    const bezug = await this.serienBezug(workspaceId, id, appointment);
    const umfang = scope ?? (occurrenceOn !== null ? 'ONE' : 'SERIES');

    if (bezug !== null && umfang === 'FOLLOWING') {
      return bezug.tag <= berlinDate(bezug.serie.startsAt)
        ? this.cancel(workspaceId, bezug.serie.id, when, 'SERIES')
        : this.serieBeenden(workspaceId, bezug.serie, bezug.tag, 'absagen');
    }

    if (bezug !== null && umfang === 'SERIES' && appointment.serieId !== null) {
      return this.cancel(workspaceId, bezug.serie.id, when, 'SERIES');
    }

    if (occurrenceOn !== null && appointment.recurrence !== null) {
      if (umfang === 'ONE') {
        return this.detachOccurrence(
          workspaceId,
          appointment,
          occurrenceOn,
          {},
          true,
        );
      }
    }

    if (appointment.cancelledAt !== null) {
      return appointment;
    }

    appointment.cancelledAt = when;

    const gespeichert = await this.appointments.save(appointment);

    if (appointment.recurrence !== null) {
      await this.appointments
        .createQueryBuilder()
        .update()
        .set({ cancelledAt: when })
        .where('"serieId" = :serie', { serie: appointment.id })
        .andWhere('"cancelledAt" IS NULL')
        .execute();
    }

    return gespeichert;
  }

  async reinstate(workspaceId: string, id: string): Promise<AppointmentEntity> {
    const { occurrenceOn } = splitOccurrenceId(id);
    const appointment = await this.byId(workspaceId, id);

    if (occurrenceOn !== null && appointment.recurrence !== null) {
      const vertreter = await this.appointments.findOne({
        where: {
          workspaceId,
          serieId: appointment.id,
          serieDatum: occurrenceOn,
        },
      });

      if (vertreter !== null && vertreter.cancelledAt === null) {
        return vertreter;
      }

      if (vertreter !== null) {
        await this.appointments.remove(vertreter);
      }

      appointment.skippedDates = appointment.skippedDates.filter(
        (day) => day !== occurrenceOn,
      );

      return this.appointments.save(appointment);
    }

    appointment.cancelledAt = null;

    return this.appointments.save(appointment);
  }

  async remove(
    workspaceId: string,
    id: string,
    scope?: Umfang | null,
  ): Promise<boolean> {
    const { occurrenceOn } = splitOccurrenceId(id);
    const appointment = await this.byId(workspaceId, id);
    const bezug = await this.serienBezug(workspaceId, id, appointment);
    const umfang = scope ?? (appointment.serieId !== null ? 'ONE' : 'SERIES');

    if (bezug !== null && umfang === 'FOLLOWING') {
      if (bezug.tag <= berlinDate(bezug.serie.startsAt)) {
        await this.appointments.remove(bezug.serie);
      } else {
        await this.serieBeenden(
          workspaceId,
          bezug.serie,
          bezug.tag,
          'loeschen',
        );
      }

      return true;
    }

    if (bezug !== null && umfang === 'SERIES' && appointment.serieId !== null) {
      await this.appointments.remove(bezug.serie);

      return true;
    }

    if (
      umfang === 'ONE' &&
      occurrenceOn !== null &&
      appointment.recurrence !== null
    ) {
      if (!appointment.skippedDates.includes(occurrenceOn)) {
        appointment.skippedDates = [
          ...appointment.skippedDates,
          occurrenceOn,
        ].sort();
        await this.appointments.save(appointment);
      }

      return true;
    }

    await this.appointments.remove(appointment);

    return true;
  }

  private windowFrom(input: {
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    allDay?: boolean;
  }): Window {
    const startsAt = instantFromBerlin(
      input.startDate,
      input.allDay === true ? DAY_START : input.startTime,
    );
    const endsAt = instantFromBerlin(
      input.allDay === true ? nextDay(input.endDate) : input.endDate,
      input.allDay === true ? DAY_START : input.endTime,
    );

    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException(
        'Ein Termin muss nach seinem Anfang enden.',
      );
    }

    return { startsAt, endsAt };
  }

  attendeesOf(
    workspaceId: string,
    appointmentId: string,
  ): Promise<AppointmentAttendeeEntity[]> {
    return this.attendees.find({
      where: { workspaceId, appointmentId },
      relations: { contact: true, user: true },
      order: { createdAt: 'ASC' },
    });
  }

  private async assertTeilnehmerImBereich(
    workspaceId: string,
    teilnehmer: readonly AttendeeLink[] | undefined,
  ): Promise<void> {
    for (const eintrag of teilnehmer ?? []) {
      await assertVerweiseImBereich(this.appointments.manager, workspaceId, {
        contactId: eintrag.contactId,
        userIds: [eintrag.userId],
      });
    }
  }

  async setAttendees(
    workspaceId: string,
    appointmentId: string,
    wanted: readonly (AttendeeLink & { status?: AttendeeStatus })[],
  ): Promise<AppointmentAttendeeEntity[]> {
    await this.assertTeilnehmerImBereich(workspaceId, wanted);

    const vorher = await this.attendeesOf(workspaceId, appointmentId);

    const gereinigt: (AttendeeLink & { status?: AttendeeStatus })[] = [];

    for (const eintrag of wanted) {
      const problem = attendeeProblem(eintrag);

      if (problem !== null) {
        throw new BadRequestException(problem);
      }

      if (
        gereinigt.some((schon) =>
          isSameAttendee(
            { ...schon, resolvedEmail: schon.email },
            { ...eintrag, resolvedEmail: eintrag.email },
          ),
        )
      ) {
        continue;
      }

      gereinigt.push(eintrag);
    }

    await this.attendees.delete({ workspaceId, appointmentId });

    if (gereinigt.length === 0) {
      return [];
    }

    const kontaktNamen = await this.kontaktNamen(
      workspaceId,
      gereinigt.flatMap((eintrag) =>
        eintrag.contactId !== undefined &&
        eintrag.contactId !== null &&
        !eintrag.name?.trim()
          ? [eintrag.contactId]
          : [],
      ),
    );

    const zeilen = gereinigt.map((eintrag) => {
      const bekannt = vorher.find((alt) =>
        isSameAttendee(
          { ...alt, resolvedEmail: alt.contact?.email ?? alt.email },
          { ...eintrag, resolvedEmail: eintrag.email },
        ),
      );

      return this.attendees.create({
        workspaceId,
        appointmentId,
        contactId: eintrag.contactId ?? null,
        userId: eintrag.userId ?? null,
        email:
          eintrag.contactId !== undefined && eintrag.contactId !== null
            ? null
            : eintrag.userId !== undefined && eintrag.userId !== null
              ? null
              : (eintrag.email?.trim() ?? null),
        name:
          (eintrag.name?.trim() || bekannt?.name) ??
          kontaktNamen.get(eintrag.contactId ?? '') ??
          null,
        status:
          eintrag.status ?? bekannt?.status ?? AttendeeStatus.NEEDS_ACTION,
      });
    });

    return this.attendees.save(zeilen);
  }

  private async kontaktNamen(
    workspaceId: string,
    kontaktIds: string[],
  ): Promise<Map<string, string>> {
    if (kontaktIds.length === 0) {
      return new Map();
    }

    const zeilen = (await this.attendees.query(
      `SELECT "id",
              left(COALESCE(NULLIF(trim(concat_ws(' ', "firstName", "lastName")), ''),
                            "email"), 200) AS "name"
         FROM "contacts"
        WHERE "workspaceId" = $1 AND "id" = ANY($2::uuid[])`,
      [workspaceId, kontaktIds],
    )) as { id: string; name: string | null }[];

    return new Map(
      zeilen.flatMap((zeile) =>
        zeile.name === null ? [] : [[zeile.id, zeile.name] as const],
      ),
    );
  }

  async setAttendeeStatus(
    workspaceId: string,
    attendeeId: string,
    status: AttendeeStatus,
  ): Promise<AppointmentAttendeeEntity> {
    const attendee = await this.attendees.findOne({
      where: { id: attendeeId, workspaceId },
      relations: { contact: true, user: true },
    });

    if (attendee === null) {
      throw new NotFoundException('Diesen Teilnehmer gibt es nicht.');
    }

    attendee.status = status;

    return this.attendees.save(attendee);
  }

  private cleanRecurrence(input: string | null | undefined): string | null {
    if (input === undefined || input === null || input.trim() === '') {
      return null;
    }

    return formatRule(parseRule(input));
  }

  private assertSingleTarget(target: {
    companyId?: string | null;
    contactId?: string | null;
    dealId?: string | null;
  }): void {
    const linked = [target.companyId, target.contactId, target.dealId].filter(
      (value) => value !== undefined && value !== null,
    );

    if (linked.length > 1) {
      throw new BadRequestException(
        'Ein Termin gehört zu höchstens einem Datensatz.',
      );
    }
  }
}
