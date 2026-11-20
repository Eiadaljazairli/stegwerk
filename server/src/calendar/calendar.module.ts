import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TaskEntity } from '../crm/entities/task.entity';

import { MailModule } from '../mail/mail.module';
import { UserEntity } from '../users/user.entity';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AppointmentDocumentsController } from './appointment-documents.controller';
import { AppointmentReminderScheduler } from './appointment-reminder.scheduler';
import { AppointmentReminderService } from './appointment-reminder.service';
import { AppointmentAttendeeEntity } from './appointment-attendee.entity';
import { AppointmentEntity } from './appointment.entity';
import {
  AppointmentAttendeeResolver,
  AppointmentsResolver,
} from './appointments.resolver';
import { AppointmentsService } from './appointments.service';
import { CalendarFeedController } from './calendar-feed.controller';
import { CalendarFeedResolver } from './calendar-feed.resolver';
import { CalendarFeedService } from './calendar-feed.service';
import { IcsExportService } from './ics-export.service';
import { TeilnehmerZuordnung } from './teilnehmer-zuordnung';
import { TerminBeobachter } from './termin-beobachter';
import { MembershipEntity } from '../workspaces/membership.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AppointmentEntity,
      AppointmentAttendeeEntity,
      UserEntity,
      MembershipEntity,
      TaskEntity,
    ]),
    MailModule,
    WorkspacesModule,
  ],
  controllers: [AppointmentDocumentsController, CalendarFeedController],
  providers: [
    AppointmentsService,
    AppointmentsResolver,
    IcsExportService,
    CalendarFeedService,
    CalendarFeedResolver,
    AppointmentAttendeeResolver,
    AppointmentReminderService,
    AppointmentReminderScheduler,
    TerminBeobachter,
    TeilnehmerZuordnung,
  ],
  exports: [AppointmentsService, AppointmentReminderService],
})
export class CalendarModule {}
