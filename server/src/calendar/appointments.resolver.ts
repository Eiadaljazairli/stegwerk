import { ForbiddenException, UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  Int,
  Mutation,
  ObjectType,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { UserEntity } from '../users/user.entity';
import { webhookDaten } from '../crm/workspace-scoped.service';
import { aenderungen, melde } from '../webhooks/ereignisse';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { AppointmentAttendeeEntity } from './appointment-attendee.entity';
import { AppointmentEntity } from './appointment.entity';
import {
  AppointmentRangeArgs,
  AppointmentScope,
  CreateAppointmentInput,
  UpdateAppointmentInput,
} from './appointment.dto';
import { AppointmentsService, splitOccurrenceId } from './appointments.service';
import {
  ATTENDEE_STATUS_LABELS,
  AttendeeStatus,
  attendeeIdentity,
  attendeeSummary,
} from './attendees';
import { berlinDate, berlinTime, durationMinutes } from './berlin-time';
import { describeRule, parseRule } from './recurrence';
import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { sichtbareAkte } from '../workspaces/ziel-sichtbarkeit';
import {
  istGeschwaerzt,
  schwaerzeFuer,
  sichtregelLaden,
} from './termin-sichtbarkeit';

@ObjectType('AppointmentConflict')
export class AppointmentConflictView {
  @Field(() => AppointmentEntity)
  appointment: AppointmentEntity;

  @Field(() => Int)
  minutes: number;
}

@Resolver(() => AppointmentEntity)
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class AppointmentsResolver {
  constructor(
    private readonly service: AppointmentsService,
    private readonly permissions: PermissionsService,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  @ResolveField(() => String)
  startDate(@Parent() appointment: AppointmentEntity): string {
    return berlinDate(appointment.startsAt);
  }

  @ResolveField(() => String)
  startTime(@Parent() appointment: AppointmentEntity): string {
    return berlinTime(appointment.startsAt);
  }

  @ResolveField(() => String)
  endDate(@Parent() appointment: AppointmentEntity): string {
    return berlinDate(appointment.endsAt);
  }

  @ResolveField(() => String)
  endTime(@Parent() appointment: AppointmentEntity): string {
    return berlinTime(appointment.endsAt);
  }

  @ResolveField(() => Int)
  minutes(@Parent() appointment: AppointmentEntity): number {
    return durationMinutes(appointment);
  }

  @ResolveField(() => ID)
  seriesId(@Parent() appointment: AppointmentEntity): string {
    return splitOccurrenceId(appointment.id).appointmentId;
  }

  @ResolveField(() => String, { nullable: true })
  occurrenceOn(@Parent() appointment: AppointmentEntity): string | null {
    return splitOccurrenceId(appointment.id).occurrenceOn;
  }

  @ResolveField(() => String, { nullable: true })
  recurrenceText(@Parent() appointment: AppointmentEntity): string | null {
    if (appointment.recurrence === null || appointment.recurrence === '') {
      return null;
    }

    try {
      return describeRule(
        parseRule(appointment.recurrence),
        berlinDate(appointment.startsAt),
      );
    } catch {
      return appointment.recurrence;
    }
  }

  @ResolveField(() => String)
  async attendeeSummary(
    @CurrentUser() user: RequestUser,
    @Parent() appointment: AppointmentEntity,
  ): Promise<string> {
    if (appointment.geschwaerzt === true) {
      return '';
    }

    const runde = await this.service.attendeesOf(
      user.workspaceId,
      splitOccurrenceId(appointment.id).appointmentId,
    );

    return attendeeSummary(runde.map((attendee) => attendee.status));
  }

  @ResolveField(() => [AppointmentAttendeeEntity])
  attendees(
    @CurrentUser() user: RequestUser,
    @Parent() appointment: AppointmentEntity,
  ): Promise<AppointmentAttendeeEntity[]> {
    if (appointment.geschwaerzt === true) {
      return Promise.resolve([]);
    }

    return this.service.attendeesOf(
      user.workspaceId,
      splitOccurrenceId(appointment.id).appointmentId,
    );
  }

  @ResolveField(() => Boolean)
  geschwaerzt(@Parent() appointment: AppointmentEntity): boolean {
    return appointment.geschwaerzt === true;
  }

  @ResolveField(() => String)
  async ownerName(@Parent() appointment: AppointmentEntity): Promise<string> {
    const owner = await this.users.findOne({
      where: { id: appointment.ownerId },
    });

    if (owner === null) {
      return 'Unbekannt';
    }

    return `${owner.firstName} ${owner.lastName}`;
  }

  @ResolveField('company', () => CompanyEntity, { nullable: true })
  company(@Parent() eintrag: AppointmentEntity): Promise<CompanyEntity | null> {
    return sichtbareAkte('company', eintrag.company);
  }

  @ResolveField('contact', () => ContactEntity, { nullable: true })
  contact(@Parent() eintrag: AppointmentEntity): Promise<ContactEntity | null> {
    return sichtbareAkte('contact', eintrag.contact);
  }

  @ResolveField('deal', () => DealEntity, { nullable: true })
  deal(@Parent() eintrag: AppointmentEntity): Promise<DealEntity | null> {
    return sichtbareAkte('deal', eintrag.deal);
  }

  @Query(() => [AppointmentEntity])
  async appointments(
    @CurrentUser() user: RequestUser,
    @Args() args: AppointmentRangeArgs,
  ): Promise<AppointmentEntity[]> {
    await this.assert(
      user,
      Permission.APPOINTMENT_VIEW,
      'den Kalender zu sehen',
    );

    return this.sicht(
      user,
      await this.service.range(user.workspaceId, args.from, args.to, {
        ownerId: args.ownerId,
        includeCancelled: args.includeCancelled,
      }),
    );
  }

  @Query(() => AppointmentEntity)
  async appointment(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<AppointmentEntity> {
    await this.assert(
      user,
      Permission.APPOINTMENT_VIEW,
      'einen Termin zu sehen',
    );

    const [termin] = await this.sicht(user, [
      await this.service.byId(user.workspaceId, id),
    ]);

    return termin;
  }

  @Query(() => [AppointmentConflictView])
  async appointmentConflicts(
    @CurrentUser() user: RequestUser,
    @Args('startDate') startDate: string,
    @Args('startTime') startTime: string,
    @Args('endDate') endDate: string,
    @Args('endTime') endTime: string,
    @Args('ownerId', { type: () => ID, nullable: true }) ownerId?: string,
    @Args('exceptId', { type: () => ID, nullable: true }) exceptId?: string,
  ): Promise<AppointmentConflictView[]> {
    await this.assert(
      user,
      Permission.APPOINTMENT_VIEW,
      'den Kalender zu sehen',
    );

    const konflikte = await this.service.conflictsForWallTime(
      user.workspaceId,
      ownerId ?? user.userId,
      { startDate, startTime, endDate, endTime },
      exceptId,
    );
    const termine = await this.sicht(
      user,
      konflikte.map((konflikt) => konflikt.appointment),
    );

    return konflikte.map((konflikt, index) => ({
      ...konflikt,
      appointment: termine[index],
    }));
  }

  @Mutation(() => AppointmentEntity)
  async createAppointment(
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateAppointmentInput,
  ): Promise<AppointmentEntity> {
    await this.assert(
      user,
      Permission.APPOINTMENT_WRITE,
      'einen Termin anzulegen',
    );

    const termin = await this.service.create(
      user.workspaceId,
      user.userId,
      input,
    );

    melde({
      workspaceId: user.workspaceId,
      event: 'appointment.created',
      data: webhookDaten(termin),
    });

    return termin;
  }

  @Mutation(() => AppointmentEntity)
  async updateAppointment(
    @CurrentUser() user: RequestUser,
    @Args('input') input: UpdateAppointmentInput,
  ): Promise<AppointmentEntity> {
    await this.assert(
      user,
      Permission.APPOINTMENT_WRITE,
      'einen Termin zu ändern',
    );

    const vorher = webhookDaten(
      await this.nurWennSichtbar(
        user,
        await this.service.byId(user.workspaceId, input.id),
      ),
    );
    const termin = await this.service.update(
      user.workspaceId,
      input,
      input.scope ?? AppointmentScope.SERIES,
    );

    this.meldeGeaendert(user.workspaceId, vorher, termin);

    return termin;
  }

  @Mutation(() => AppointmentEntity)
  async cancelAppointment(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('scope', { type: () => AppointmentScope, nullable: true })
    scope?: AppointmentScope | null,
  ): Promise<AppointmentEntity> {
    await this.assert(
      user,
      Permission.APPOINTMENT_WRITE,
      'einen Termin abzusagen',
    );

    const vorher = webhookDaten(
      await this.nurWennSichtbar(
        user,
        await this.service.byId(user.workspaceId, id),
      ),
    );
    const termin = await this.service.cancel(
      user.workspaceId,
      id,
      new Date(),
      scope,
    );

    this.meldeGeaendert(user.workspaceId, vorher, termin);

    return termin;
  }

  @Mutation(() => AppointmentEntity)
  async reinstateAppointment(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<AppointmentEntity> {
    await this.assert(
      user,
      Permission.APPOINTMENT_WRITE,
      'einen Termin wieder aufzunehmen',
    );

    const vorher = webhookDaten(
      await this.nurWennSichtbar(
        user,
        await this.service.byId(user.workspaceId, id),
      ),
    );
    const termin = await this.service.reinstate(user.workspaceId, id);

    this.meldeGeaendert(user.workspaceId, vorher, termin);

    return termin;
  }

  @Mutation(() => AppointmentAttendeeEntity)
  async setAttendeeStatus(
    @CurrentUser() user: RequestUser,
    @Args('attendeeId', { type: () => ID }) attendeeId: string,
    @Args('status', { type: () => AttendeeStatus }) status: AttendeeStatus,
  ): Promise<AppointmentAttendeeEntity> {
    await this.assert(
      user,
      Permission.APPOINTMENT_WRITE,
      'eine Rückmeldung einzutragen',
    );

    return this.service.setAttendeeStatus(user.workspaceId, attendeeId, status);
  }

  @Mutation(() => Boolean)
  async deleteAppointment(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('scope', { type: () => AppointmentScope, nullable: true })
    scope?: AppointmentScope | null,
  ): Promise<boolean> {
    await this.assert(
      user,
      Permission.APPOINTMENT_WRITE,
      'einen Termin zu löschen',
    );

    const vorher = webhookDaten(
      await this.nurWennSichtbar(
        user,
        await this.service.byId(user.workspaceId, id),
      ),
    );
    const weg = await this.service.remove(user.workspaceId, id, scope);

    melde({
      workspaceId: user.workspaceId,
      event: 'appointment.deleted',
      data: { ...vorher, scope: scope ?? null },
    });

    return weg;
  }

  private meldeGeaendert(
    workspaceId: string,
    vorher: Record<string, unknown>,
    termin: AppointmentEntity,
  ): void {
    const data = webhookDaten(termin);

    if (data.id !== vorher.id) {
      melde({ workspaceId, event: 'appointment.created', data });

      return;
    }

    melde({
      workspaceId,
      event: 'appointment.updated',
      data,
      changes: aenderungen(vorher, data),
    });
  }

  private sicht(
    user: RequestUser,
    termine: AppointmentEntity[],
  ): Promise<AppointmentEntity[]> {
    return schwaerzeFuer(
      this.users.manager,
      user.workspaceId,
      user.userId,
      termine,
    );
  }

  private async nurWennSichtbar(
    user: RequestUser,
    termin: AppointmentEntity,
  ): Promise<AppointmentEntity> {
    const regel = await sichtregelLaden(
      this.users.manager,
      user.workspaceId,
      user.userId,
    );

    if (istGeschwaerzt(termin, regel)) {
      throw new ForbiddenException(
        'Dieser Termin ist privat. Ändern kann ihn nur, in wessen Kalender er steht.',
      );
    }

    return termin;
  }

  private assert(
    user: RequestUser,
    permission: Permission,
    what: string,
  ): Promise<void> {
    return this.permissions.assert(user, permission, what);
  }
}

@Resolver(() => AppointmentAttendeeEntity)
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class AppointmentAttendeeResolver {
  @ResolveField(() => String)
  name(@Parent() attendee: AppointmentAttendeeEntity): string {
    return attendeeIdentity(attendee, {
      contact: attendee.contact,
      user: attendee.user,
    }).name;
  }

  @ResolveField(() => String, { nullable: true })
  email(@Parent() attendee: AppointmentAttendeeEntity): string | null {
    return attendeeIdentity(attendee, {
      contact: attendee.contact,
      user: attendee.user,
    }).email;
  }

  @ResolveField(() => String)
  statusLabel(@Parent() attendee: AppointmentAttendeeEntity): string {
    return ATTENDEE_STATUS_LABELS[attendee.status];
  }
}
