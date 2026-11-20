import { ApiKeyEntity } from '../api-keys/api-key.entity';
import { CompanyEntity } from '../crm/entities/company.entity';
import { FirmenlogoEntity } from '../crm/anreicherung/firmenlogo.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealKontaktEntity } from '../crm/entities/deal-kontakt.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { BenachrichtigungEntity } from '../crm/entities/benachrichtigung.entity';
import { NoteEntity } from '../crm/entities/note.entity';
import { FreigabeEntity } from '../crm/freigaben/freigabe.entity';
import { TaskEntity } from '../crm/entities/task.entity';
import { UserEntity } from '../users/user.entity';
import { AttachmentBlobEntity } from '../attachments/attachment-blob.entity';
import { AttachmentEntity } from '../attachments/attachment.entity';
import { RecoveryCodeEntity } from '../auth/recovery-code.entity';
import { AuditLogEntity } from '../audit/audit-log.entity';
import {
  AbmeldungEntity,
  KampagneEntity,
  KampagnenEmpfaengerEntity,
} from '../serienmails/serienmail.entities';
import { AvvAnnahmeEntity } from '../legal/avv-annahme.entity';
import {
  VerteilerEntity,
  VerteilerMitgliedEntity,
} from '../verteiler/verteiler.entity';
import { EmailAenderungEntity } from '../auth/email-aenderung.entity';
import { CustomFieldGroupEntity } from '../custom-fields/custom-field-group.entity';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import { SavedViewDefaultEntity } from '../saved-views/saved-view-default.entity';
import { LetterheadEntity } from '../quotes/letterhead.entity';
import { ProductEntity } from '../quotes/product.entity';
import { QuoteLineEntity } from '../quotes/quote-line.entity';
import { QuoteEntity } from '../quotes/quote.entity';
import {
  BegleitbelegEntity,
  BegleitbelegPositionEntity,
} from '../begleitbelege/begleitbeleg.entity';
import { SavedViewEntity } from '../saved-views/saved-view.entity';
import { EmailVerificationEntity } from '../auth/email-verification.entity';
import { PasswordResetEntity } from '../auth/password-reset.entity';
import { RefreshTokenEntity } from '../auth/refresh-token.entity';
import { SubscriptionEntity } from '../billing/subscription.entity';
import { InvitationEntity } from '../workspaces/invitation.entity';
import { MembershipEntity } from '../workspaces/membership.entity';
import { InvoiceCounterEntity } from '../invoices/invoice-counter.entity';
import { InvoiceLineEntity } from '../invoices/invoice-line.entity';
import { InvoiceEntity } from '../invoices/invoice.entity';
import { WebhookEntity } from '../webhooks/webhook.entity';
import { AutomationEntity } from '../automationen/automation.entity';
import {
  AutomationAusfuehrungEntity,
  AutomationRuhendEntity,
} from '../automationen/automation-ausfuehrung.entity';
import { WebFormEntity } from '../web-forms/web-form.entity';
import { MailTemplateEntity } from '../mailboxes/mail-template.entity';
import { DealStageSettingEntity } from '../crm/entities/deal-stage-setting.entity';
import { PipelineEntity } from '../crm/entities/pipeline.entity';
import { InvoiceSeriesEntity } from '../invoices/invoice-series.entity';
import { InvoiceReminderEntity } from '../reminders/invoice-reminder.entity';
import { MailMessageEntity } from '../mailboxes/mail-message.entity';
import { MailSperreEntity } from '../mailboxes/mail-sperre.entity';
import { MailEntwurfEntity } from '../mailboxes/mail-entwurf.entity';
import { KiVorschlagEntity } from '../ki-vorschlaege/ki-vorschlag.entity';
import { AppointmentAttendeeEntity } from '../calendar/appointment-attendee.entity';
import { AppointmentEntity } from '../calendar/appointment.entity';
import { KalenderEintragEntity } from '../kalender-sync/kalender-eintrag.entity';
import { KalenderVerbindungEntity } from '../kalender-sync/kalender-verbindung.entity';
import { OAuthVorgangEntity } from '../oauth/oauth-vorgang.entity';
import {
  AnmeldeEinloesungEntity,
  AnmeldeVerknuepfungEntity,
  AnmeldeVorgangEntity,
} from '../auth/anmeldung-sso.entities';
import { OAuthZugangEntity } from '../oauth/oauth-zugang.entity';
import { MailboxEntity } from '../mailboxes/mailbox.entity';
import { MailboxMitgliedEntity } from '../mailboxes/mailbox-mitglied.entity';
import { RoleEntity } from '../workspaces/role.entity';
import { NutzungEntity } from '../betrieb/nutzung.entity';
import { SicherheitsEreignisEntity } from '../sicherheit/sicherheits-ereignis.entity';
import { FavoritEntity } from '../favoriten/favorit.entity';
import { UebersichtEntity } from '../uebersicht/uebersicht.entity';
import { DashboardEntity } from '../uebersicht/dashboard.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { AnkuendigungEntity } from '../betrieb/ankuendigung.entity';
import { GeplanterLaufEntity } from '../ueberwachung/geplanter-lauf.entity';
import {
  BuchhaltungKontaktEntity,
  BuchhaltungUebertragungEntity,
  BuchhaltungVerbindungEntity,
} from '../buchhaltung/buchhaltung.entities';
import { KiEinstellungEntity } from '../ki/ki-einstellung.entity';

export const DATABASE_ENTITIES = [
  KiEinstellungEntity,
  GeplanterLaufEntity,
  BuchhaltungVerbindungEntity,
  BuchhaltungUebertragungEntity,
  BuchhaltungKontaktEntity,
  AnkuendigungEntity,
  FavoritEntity,
  UebersichtEntity,
  DashboardEntity,
  SicherheitsEreignisEntity,
  NutzungEntity,
  ApiKeyEntity,
  UserEntity,
  RefreshTokenEntity,
  PasswordResetEntity,
  EmailVerificationEntity,
  InvoiceEntity,
  BegleitbelegEntity,
  BegleitbelegPositionEntity,
  InvoiceSeriesEntity,
  InvoiceLineEntity,
  InvoiceCounterEntity,
  InvoiceReminderEntity,
  MailboxEntity,
  MailboxMitgliedEntity,
  MailMessageEntity,
  MailTemplateEntity,
  MailSperreEntity,
  MailEntwurfEntity,
  KiVorschlagEntity,
  WebhookEntity,
  AutomationEntity,
  AutomationAusfuehrungEntity,
  AutomationRuhendEntity,
  WebFormEntity,
  RoleEntity,
  WorkspaceEntity,
  MembershipEntity,
  InvitationEntity,
  SubscriptionEntity,
  CompanyEntity,
  FirmenlogoEntity,
  ContactEntity,
  DealEntity,
  DealKontaktEntity,
  DealStageSettingEntity,
  PipelineEntity,
  NoteEntity,
  FreigabeEntity,
  TaskEntity,
  BenachrichtigungEntity,
  RecoveryCodeEntity,
  AttachmentEntity,
  AttachmentBlobEntity,
  AuditLogEntity,
  KampagneEntity,
  KampagnenEmpfaengerEntity,
  AbmeldungEntity,
  VerteilerEntity,
  VerteilerMitgliedEntity,
  AvvAnnahmeEntity,
  EmailAenderungEntity,
  CustomFieldDefinition,
  CustomFieldGroupEntity,
  SavedViewEntity,
  SavedViewDefaultEntity,
  LetterheadEntity,
  ProductEntity,
  QuoteEntity,
  QuoteLineEntity,
  AppointmentEntity,
  AppointmentAttendeeEntity,
  KalenderVerbindungEntity,
  KalenderEintragEntity,
  OAuthZugangEntity,
  OAuthVorgangEntity,
  AnmeldeVerknuepfungEntity,
  AnmeldeVorgangEntity,
  AnmeldeEinloesungEntity,
];
