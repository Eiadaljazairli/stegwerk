import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppointmentAttendeeEntity } from '../calendar/appointment-attendee.entity';
import { AppointmentEntity } from '../calendar/appointment.entity';
import { CalendarModule } from '../calendar/calendar.module';
import { ContactEntity } from '../crm/entities/contact.entity';
import { MailboxesModule } from '../mailboxes/mailboxes.module';
import { OAuthModule } from '../oauth/oauth.module';
import { UserEntity } from '../users/user.entity';
import { internErlaubt } from '../webhooks/webhook-ziel';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { sichererTransport } from './caldav-client';
import { KalenderEintragEntity } from './kalender-eintrag.entity';
import {
  KalenderSyncResolver,
  KalenderVerbindungFelderResolver,
} from './kalender-sync.resolver';
import {
  KALENDER_TRANSPORT,
  KalenderSyncService,
} from './kalender-sync.service';
import { KalenderVerbindungEntity } from './kalender-verbindung.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KalenderVerbindungEntity,
      KalenderEintragEntity,
      AppointmentEntity,
      AppointmentAttendeeEntity,
      ContactEntity,
      UserEntity,
    ]),
    CalendarModule,
    MailboxesModule,
    OAuthModule,
    WorkspacesModule,
  ],
  providers: [
    KalenderSyncService,
    KalenderSyncResolver,
    KalenderVerbindungFelderResolver,
    {
      provide: KALENDER_TRANSPORT,
      useFactory: () => sichererTransport(internErlaubt()),
    },
  ],
  exports: [KalenderSyncService],
})
export class KalenderSyncModule {}
