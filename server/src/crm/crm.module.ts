import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CalendarModule } from '../calendar/calendar.module';
import { MembershipEntity } from '../workspaces/membership.entity';
import { BenachrichtigungenResolver } from './benachrichtigungen.resolver';
import { BenachrichtigungenService } from './benachrichtigungen.service';
import { BenachrichtigungEntity } from './entities/benachrichtigung.entity';
import { CompaniesResolver } from './companies.resolver';
import { CompaniesService } from './companies.service';
import { ContactsResolver } from './contacts.resolver';
import { ContactsService } from './contacts.service';
import { DealStagesResolver } from './deal-stages.resolver';
import { DealStagesService } from './deal-stages.service';
import { DealStageSettingEntity } from './entities/deal-stage-setting.entity';
import { PipelineEntity } from './entities/pipeline.entity';
import { PipelinesResolver } from './pipelines.resolver';
import { PipelinesService } from './pipelines.service';
import { DealsResolver } from './deals.resolver';
import { DealsService } from './deals.service';
import { CompanyEntity } from './entities/company.entity';
import { ContactEntity } from './entities/contact.entity';
import { DealKontaktEntity } from './entities/deal-kontakt.entity';
import { DealKontakteService } from './deal-kontakte.service';
import { DealKontakteResolver } from './deal-kontakte.resolver';
import { DealEntity } from './entities/deal.entity';
import { NoteEntity } from './entities/note.entity';
import { NotesResolver } from './notes.resolver';
import { TaskEntity } from './entities/task.entity';
import { TasksResolver } from './tasks.resolver';
import { TasksService } from './tasks.service';
import { NotesService } from './notes.service';
import { SammelResolver } from './sammel.resolver';
import { SucheResolver } from './suche.resolver';
import { PlzResolver } from './plz/plz.resolver';
import { MassenResolver } from './massen.resolver';
import { DublettenResolver } from './dubletten.resolver';
import { DublettenService } from './dubletten.service';
import { UserEntity } from '../users/user.entity';
import { AuswertungResolver } from './auswertung.resolver';
import { AuswertungService } from './auswertung.service';
import { AnreicherungResolver } from './anreicherung/anreicherung.resolver';
import { AnreicherungService } from './anreicherung/anreicherung.service';
import { FirmenlogoEntity } from './anreicherung/firmenlogo.entity';
import { FreigabeEntity } from './freigaben/freigabe.entity';
import { FreigabenResolver } from './freigaben/freigaben.resolver';
import { FreigabenService } from './freigaben/freigaben.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompanyEntity,
      FirmenlogoEntity,
      ContactEntity,
      DealEntity,
      DealKontaktEntity,
      DealStageSettingEntity,
      PipelineEntity,
      NoteEntity,
      TaskEntity,
      UserEntity,
      BenachrichtigungEntity,
      MembershipEntity,
      FreigabeEntity,
    ]),
    CalendarModule,
  ],
  providers: [
    FreigabenService,
    FreigabenResolver,
    CompaniesService,
    CompaniesResolver,
    AnreicherungService,
    AnreicherungResolver,
    ContactsService,
    ContactsResolver,
    DealsService,
    DealsResolver,
    DealKontakteService,
    DealKontakteResolver,
    DealStagesService,
    DealStagesResolver,
    PipelinesService,
    PipelinesResolver,
    NotesService,
    NotesResolver,
    TasksService,
    TasksResolver,
    SammelResolver,
    MassenResolver,
    DublettenService,
    DublettenResolver,
    SucheResolver,
    PlzResolver,
    AuswertungService,
    AuswertungResolver,
    BenachrichtigungenService,
    BenachrichtigungenResolver,
  ],
  exports: [
    DealStagesService,
    CompaniesService,
    ContactsService,
    DealsService,
    NotesService,
    TasksService,
  ],
})
export class CrmModule {}
