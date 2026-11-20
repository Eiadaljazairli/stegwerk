import { EventEmitter } from 'node:events';

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { AttachmentsController } from '../attachments/attachments.controller';
import { AttachmentsResolver } from '../attachments/attachments.resolver';
import { AuditResolver } from '../audit/audit.resolver';
import { BereichsprotokollResolver } from '../audit/bereichsprotokoll.resolver';
import { SerienmailsResolver } from '../serienmails/serienmails.resolver';
import { AuthResolver } from '../auth/auth.resolver';
import { AutomationenResolver } from '../automationen/automationen.resolver';
import { BetriebResolver } from '../betrieb/betrieb.resolver';
import { PapierkorbResolver } from '../papierkorb/papierkorb.resolver';
import { FavoritenResolver } from '../favoriten/favoriten.resolver';
import { UebersichtResolver } from '../uebersicht/uebersicht.resolver';
import { DashboardsResolver } from '../uebersicht/dashboards.resolver';
import { SammelResolver } from '../crm/sammel.resolver';
import { MassenResolver } from '../crm/massen.resolver';
import { DublettenResolver } from '../crm/dubletten.resolver';
import { SucheResolver } from '../crm/suche.resolver';
import { PlzResolver } from '../crm/plz/plz.resolver';
import { AuswertungResolver } from '../crm/auswertung.resolver';
import { ErsteSchritteResolver } from '../onboarding/erste-schritte.resolver';
import { EinstiegResolver } from '../onboarding/einstieg.resolver';
import { SitzungenResolver } from '../auth/sitzungen.resolver';
import { KalenderSyncResolver } from '../kalender-sync/kalender-sync.resolver';
import { PostfachZustandResolver } from '../mailboxes/postfach-zustand.resolver';
import { VerteilerResolver } from '../verteiler/verteiler.resolver';
import { KontoResolver } from '../auth/konto.resolver';
import { OAuthResolver } from '../oauth/oauth.resolver';
import { SsoResolver } from '../auth/sso.resolver';
import { SicherheitResolver } from '../sicherheit/sicherheit.resolver';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { TwoFactorResolver } from '../auth/two-factor.resolver';
import { BillingResolver } from '../billing/billing.resolver';
import { BillingInterval } from '../billing/dto/billing.dto';
import { BillingPlan } from '../billing/plans';
import {
  AppointmentAttendeeResolver,
  AppointmentsResolver,
} from '../calendar/appointments.resolver';
import { CompaniesResolver } from '../crm/companies.resolver';
import { ContactsResolver } from '../crm/contacts.resolver';
import { DealKontakteResolver } from '../crm/deal-kontakte.resolver';
import { DealsResolver } from '../crm/deals.resolver';
import { DealStage } from '../crm/entities/deal.entity';
import { NotesResolver } from '../crm/notes.resolver';
import { BenachrichtigungenResolver } from '../crm/benachrichtigungen.resolver';
import { TasksResolver } from '../crm/tasks.resolver';
import { CustomFieldsResolver } from '../custom-fields/custom-fields.resolver';
import { ExportController } from '../export/export.controller';
import { ImportEntity } from '../import/dto/import.dto';
import { ImportResolver } from '../import/import.resolver';
import { InvoiceDocumentsController } from '../invoices/invoice-documents.controller';
import { InvoicesResolver } from '../invoices/invoices.resolver';
import { WebFormsResolver } from '../web-forms/web-forms.resolver';
import { WebhooksResolver } from '../webhooks/webhooks.resolver';
import { MailTemplatesResolver } from '../mailboxes/mail-templates.resolver';
import { MailEntwuerfeResolver } from '../mailboxes/mail-entwuerfe.resolver';
import { KiVorschlaegeResolver } from '../ki-vorschlaege/ki-vorschlaege.resolver';
import { DealStagesResolver } from '../crm/deal-stages.resolver';
import { PipelinesResolver } from '../crm/pipelines.resolver';
import { CalendarFeedResolver } from '../calendar/calendar-feed.resolver';
import { InvoiceSeriesResolver } from '../invoices/invoice-series.resolver';
import { LegalResolver } from '../legal/legal.resolver';
import { AvvResolver } from '../legal/avv.resolver';
import { MailboxesResolver } from '../mailboxes/mailboxes.resolver';
import { PrivacyResolver } from '../privacy/privacy.resolver';
import { LetterheadsResolver } from '../quotes/letterheads.resolver';
import { ProductsResolver } from '../quotes/products.resolver';
import { QuoteDocumentsController } from '../quotes/quote-documents.controller';
import { QuotesResolver } from '../quotes/quotes.resolver';
import { BegleitbelegeResolver } from '../begleitbelege/begleitbelege.resolver';
import { RemindersResolver } from '../reminders/reminders.resolver';
import { RetentionResolver } from '../retention/retention.resolver';
import { SavedViewsResolver } from '../saved-views/saved-views.resolver';
import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import { InvitationsResolver } from './invitations.resolver';
import { MembershipEntity, MembershipRole } from './membership.entity';
import { Permission, ROLE_TEMPLATES } from './permissions';
import { PermissionsService } from './permissions.service';
import { RoleEntity } from './role.entity';
import { RolesResolver } from './roles.resolver';
import { WorkspaceEntity } from './workspace.entity';
import { WorkspacesResolver } from './workspaces.resolver';

const SUITE = 'rechte';

jest.setTimeout(60_000);

const RESOLVER = [
  AppointmentAttendeeResolver,
  BenachrichtigungenResolver,
  AppointmentsResolver,
  AttachmentsResolver,
  AuditResolver,
  BereichsprotokollResolver,
  EinstiegResolver,
  SerienmailsResolver,
  AuthResolver,
  AutomationenResolver,
  BetriebResolver,
  BillingResolver,
  CompaniesResolver,
  ContactsResolver,
  CustomFieldsResolver,
  DealsResolver,
  DealKontakteResolver,
  PipelinesResolver,
  ImportResolver,
  InvitationsResolver,
  InvoicesResolver,
  KiVorschlaegeResolver,
  LegalResolver,
  AvvResolver,
  LetterheadsResolver,
  MailboxesResolver,
  MailEntwuerfeResolver,
  NotesResolver,
  PapierkorbResolver,
  FavoritenResolver,
  UebersichtResolver,
  DashboardsResolver,
  SammelResolver,
  MassenResolver,
  DublettenResolver,
  SucheResolver,
  PlzResolver,
  AuswertungResolver,
  ErsteSchritteResolver,
  SitzungenResolver,
  KalenderSyncResolver,
  PostfachZustandResolver,
  VerteilerResolver,
  KontoResolver,
  OAuthResolver,
  SsoResolver,
  SicherheitResolver,
  PrivacyResolver,
  ProductsResolver,
  QuotesResolver,
  BegleitbelegeResolver,
  RemindersResolver,
  RetentionResolver,
  RolesResolver,
  SavedViewsResolver,
  TasksResolver,
  TwoFactorResolver,
  WorkspacesResolver,
];

const OHNE_PRUEFUNG: Record<string, string> = {
  'AuthResolver.signUp': 'vor der Anmeldung, es gibt noch keine Rolle',
  'AuthResolver.signIn': 'vor der Anmeldung',
  'AuthResolver.refresh': 'erneuert die eigene Sitzung',
  'AuthResolver.requestPasswordReset': 'vor der Anmeldung',
  'AuthResolver.resetPassword': 'vor der Anmeldung, mit dem Link aus der Mail',
  'AuthResolver.verifyEmail':
    'die eigene Adresse, im Dienst an die Sitzung gebunden',
  'AuthResolver.resendEmailVerification': 'die Adresse des eigenen Kontos',
  'AuthResolver.signOut': 'beendet die eigene Sitzung',
  'AuthResolver.switchWorkspace': 'zwischen den eigenen Mitgliedschaften',
  'AuthResolver.me': 'das eigene Konto',
  'BetriebResolver.ichBinBetreiber': 'nur ob das eigene Konto Betreiber ist',
  'BetriebResolver.betriebKonto':
    'im Dienst geprüft: Betreiber aus der Serverkonfiguration, mit 2FA',
  'BetriebResolver.betriebsUebersicht':
    'im Dienst geprüft: Betreiber aus der Serverkonfiguration, mit 2FA',
  'BetriebResolver.betriebsZustand':
    'pruefeBetreiber: Betreiber aus der Serverkonfiguration, mit 2FA',
  'BetriebResolver.ankuendigungen':
    'pruefeBetreiber: Betreiber aus der Serverkonfiguration, mit 2FA',
  'BetriebResolver.ankuendigungSetzen':
    'pruefeBetreiber: Betreiber aus der Serverkonfiguration, mit 2FA',
  'BetriebResolver.ankuendigungBeenden':
    'pruefeBetreiber: Betreiber aus der Serverkonfiguration, mit 2FA',
  'BetriebResolver.betriebsHinweis':
    'der Hinweis an alle Angemeldeten, ohne Daten eines Bereichs',
  'ErsteSchritteResolver.ersteSchritte':
    'nur Ja/Nein je Schritt für den eigenen Bereich, keine Inhalte',
  'SitzungenResolver.meineSitzungen': 'die eigenen Sitzungen',
  'UebersichtResolver.meineUebersicht':
    'die eigene Anordnung, ohne Werte; jede Kachel prüft beim Rechnen',
  'UebersichtResolver.kachelnWerte':
    'rechnet jede Kachel über kachelWerte, das dort nach dem Leserecht fragt',
  'UebersichtResolver.uebersichtSpeichern': 'die eigene Anordnung, ohne Werte',
  'UebersichtResolver.uebersichtZuruecksetzen': 'die eigene Anordnung',
  'DashboardsResolver.dashboards':
    'Namen und Anordnung, ohne Werte; fremde private nie (im Dienst)',
  'DashboardsResolver.dashboard':
    'Namen und Anordnung, ohne Werte; fremde private nie (im Dienst)',
  'DashboardsResolver.dashboardAnlegen':
    'eine Anordnung ohne Werte, wie eine gespeicherte Ansicht',
  'DashboardsResolver.dashboardAendern':
    'im Dienst: wer es angelegt hat oder, wenn geteilt, die Verwaltung',
  'DashboardsResolver.dashboardKachelnSpeichern':
    'im Dienst: wer es angelegt hat oder, wenn geteilt, die Verwaltung',
  'DashboardsResolver.dashboardLoeschen':
    'im Dienst: wer es angelegt hat oder, wenn geteilt, die Verwaltung',
  'KalenderSyncResolver.kalenderVerbindung':
    'eigenes Konto: der eigene Kalender',
  'KalenderSyncResolver.kalenderListe': 'eigenes Konto: der eigene Kalender',
  'KalenderSyncResolver.kalenderVerbinden':
    'eigenes Konto: der eigene Kalender',
  'KalenderSyncResolver.kalenderWaehlen': 'eigenes Konto: der eigene Kalender',
  'KalenderSyncResolver.kalenderTrennen': 'eigenes Konto: der eigene Kalender',
  'KalenderSyncResolver.kalenderAbgleichen':
    'eigenes Konto: der eigene Kalender',
  'KalenderSyncResolver.kalenderSichtbarkeitSetzen':
    'eigenes Konto: der eigene Kalender',
  'PostfachZustandResolver.absenderPruefung':
    'eigenes Konto: die Domain des eigenen Postfachs, öffentliches DNS',
  'OAuthResolver.oauthAnbieter': 'nur die eingerichteten Anbieter, keine Daten',
  'SsoResolver.anmeldeAnbieter': 'nur die eingerichteten Anbieter, keine Daten',
  'SsoResolver.anmeldungStarten': 'vor der Anmeldung',
  'SsoResolver.registrierungStarten':
    'vor der Anmeldung, es gibt noch keine Rolle',
  'SsoResolver.anmeldungEinloesen':
    'vor der Anmeldung, mit der Marke aus dem Rückruf; zweiter Faktor wie signIn',
  'SsoResolver.anmeldeVerknuepfungen': 'das eigene Konto',
  'SsoResolver.anmeldungVerknuepfenStarten':
    'das eigene Konto, mit Passwort und bestätigter Adresse',
  'SsoResolver.anmeldungTrennen':
    'das eigene Konto, im Dienst an userId gebunden',
  'SsoResolver.passwortLinkSenden': 'an die Adresse des eigenen Kontos',
  'OAuthResolver.oauthStarten':
    'eigenes Konto: das eigene Postfach oder der eigene Kalender',
  'SitzungenResolver.sitzungBeenden':
    'die eigene Sitzung, im Dienst an userId gebunden',
  'SitzungenResolver.andereSitzungenBeenden': 'die eigenen Sitzungen',
  'SicherheitResolver.meinSicherheitsverlauf': 'das eigene Konto',
  'KontoResolver.profilAendern': 'das eigene Konto',
  'KontoResolver.passwortAendern':
    'das eigene Konto, mit dem bisherigen Passwort',
  'KontoResolver.zweiFaktorVerlangt': 'nur Ja/Nein für das eigene Konto',
  'KontoResolver.emailAendernAnfragen': 'das eigene Konto, mit Passwort',
  'KontoResolver.emailAendernBestaetigen':
    'das eigene Konto, an den Antrag gebunden',
  'KontoResolver.kontoLoeschen': 'das eigene Konto, mit Passwort',
  'KontoResolver.zweiFaktorZuruecksetzen':
    'im Dienst geprüft: Mitglieder verwalten',
  'WorkspacesResolver.setZweiFaktorPflicht': 'im Dienst geprüft',
  'DealsResolver.verlustgruende': 'feste Vorschlagsliste, keine Daten',
  'DealKontakteResolver.dealRollen': 'feste Vorschlagsliste, keine Daten',
  'BillingResolver.entitlement': 'der Stand der Testphase als Hinweis für alle',
  'BillingResolver.billingPlans': 'die öffentliche Preisliste',
  'CustomFieldsResolver.customFields': 'welche Felder es gibt, keine Werte',
  'CustomFieldsResolver.customFieldGroups':
    'die Abschnitte der Akte, Überschriften ohne Werte',
  'PlzResolver.plzOrte':
    'eine öffentliche Liste von Orten, keine Daten des Bereichs',
  'ImportResolver.importableFields': 'welche Felder es gibt, keine Werte',
  'ImportResolver.inspectCsv': 'liest nur die mitgeschickte Datei',
  'InvitationsResolver.pendingInvitations':
    'offen: wer eingeladen ist, steht für alle auf der Teamseite',
  'InvitationsResolver.inviteMember': 'im Dienst geprüft',
  'InvitationsResolver.revokeInvitation': 'im Dienst geprüft',
  'InvitationsResolver.removeMember': 'im Dienst geprüft',
  'InvitationsResolver.acceptInvitation':
    'die eigene Einladung, im Dienst an die eigene Adresse gebunden',
  'LegalResolver.dataProcessingAgreement':
    'der Vertragstext, keine Kundendaten',
  'LegalResolver.sicherheit':
    'öffentliche Sicherheitsseite aus der Konfiguration, keine Kundendaten',
  'AvvResolver.avvStand':
    'Vertragsstand des eigenen Bereichs, für alle Mitglieder',
  'AvvResolver.avvAnnehmen': 'im Dienst geprüft: nur wer alles darf',
  'LetterheadsResolver.letterhead': 'steht auf jedem Beleg des Bereichs',
  'LetterheadsResolver.letterheadGaps': 'steht auf jedem Beleg des Bereichs',
  'MailboxesResolver.myMailbox': 'das eigene Postfach',
  'MailboxesResolver.connectMailbox': 'das eigene Postfach',
  'MailboxesResolver.sendMail': 'aus dem eigenen Postfach',
  'MailboxesResolver.disconnectMailbox': 'das eigene Postfach',
  'MailboxesResolver.syncMailbox': 'das eigene Postfach',
  'MailboxesResolver.setMailSichtbarkeit': 'das eigene Postfach',
  'MailboxesResolver.setPostfachEinstellungen': 'das eigene Postfach',
  'MailboxesResolver.postfaecher':
    'die eigenen Postfächer und die gemeinsamen, deren Mitglied man ist; alle gemeinsamen nur mit workspace:postfaecher',
  'MailboxesResolver.setHauptpostfach':
    'eines der eigenen Postfächer, im Dienst an die Person gebunden',
  'MailboxesResolver.postfachGespraeche':
    'ein eigenes Postfach oder ein gemeinsames, dessen Mitglied man ist; im Dienst geprüft',
  'MailboxesResolver.postfachGespraech':
    'ein eigenes Postfach oder ein gemeinsames, dessen Mitglied man ist; im Dienst geprüft',
  'MailboxesResolver.postfachZuweisen':
    'ein eigenes Postfach oder ein gemeinsames, dessen Mitglied man ist; nur an Mitglieder',
  'MailboxesResolver.postfachErledigt':
    'ein eigenes Postfach oder ein gemeinsames, dessen Mitglied man ist; im Dienst geprüft',
  'MailboxesResolver.kontaktVorschlaege':
    'Absender aus dem eigenen Postfach, nicht aus fremden',
  'MailEntwuerfeResolver.mailEntwuerfe':
    'die eigenen Entwürfe, wie das eigene Postfach; nur Menschen',
  'MailEntwuerfeResolver.offeneMailEntwuerfe': 'die Zahl der eigenen Entwürfe',
  'MailEntwuerfeResolver.mailEntwurfAendern':
    'der eigene Entwurf, im Dienst an ownerId gebunden',
  'MailEntwuerfeResolver.mailEntwurfSenden':
    'aus dem eigenen Postfach, wie sendMail; im Dienst an ownerId gebunden',
  'MailEntwuerfeResolver.mailEntwurfVerwerfen':
    'der eigene Entwurf, im Dienst an ownerId gebunden',
  'MailboxesResolver.mailSperren':
    'nur Adressen, deren Post beim Abruf übergangen wird',
  'PrivacyResolver.legalEntity': 'Angaben für Impressum und Datenschutz',
  'PrivacyResolver.privacyFacts': 'Angaben für Impressum und Datenschutz',
  'PrivacyResolver.exportWorkspaceData': 'im Dienst geprüft, nur der Inhaber',
  'PrivacyResolver.deleteWorkspace': 'im Dienst geprüft, nur der Inhaber',
  'RemindersResolver.myTaskDigest': 'die eigenen Aufgaben, wie in der Mail',
  'RolesResolver.roles': 'die Rollen für die Teamseite, keine Kundendaten',
  'SavedViewsResolver.savedViews': 'ausdrücklich für alle, siehe Resolver',
  'SavedViewsResolver.createSavedView': 'ausdrücklich für alle, siehe Resolver',
  'SavedViewsResolver.setDefaultSavedView': 'die eigene Voreinstellung',
  'SavedViewsResolver.deleteSavedView': 'ausdrücklich für alle, siehe Resolver',
  'SavedViewsResolver.updateSavedView':
    'Ersteller oder Admin, private nur der Ersteller; siehe Dienst',
  'TwoFactorResolver.twoFactorStatus': 'das eigene Konto',
  'TwoFactorResolver.beginTwoFactorSetup': 'das eigene Konto',
  'TwoFactorResolver.confirmTwoFactorSetup': 'das eigene Konto',
  'TwoFactorResolver.disableTwoFactor': 'das eigene Konto',
  'WorkspacesResolver.renameWorkspace': 'im Dienst geprüft',
  'WorkspacesResolver.setBaseInterestRate': 'im Dienst geprüft',
  'WorkspacesResolver.setPapierkorbTage': 'im Dienst geprüft',
  'WorkspacesResolver.setLeerlauf': 'im Dienst geprüft',
  'WorkspacesResolver.setEinladungsDomains':
    'im Dienst geprüft (Mitglieder verwalten)',
  'PapierkorbResolver.papierkorbTage': 'nur die Frist des eigenen Bereichs',
  'WorkspacesResolver.setTaskDigest': 'die eigene Einstellung',
  'WorkspacesResolver.setErwaehnungMail': 'die eigene Einstellung',
  'BenachrichtigungenResolver.benachrichtigungen':
    'nur die eigenen; der Inhalt wird über einsicht() mit dem Leserecht der Akte geholt',
  'BenachrichtigungenResolver.ungeleseneBenachrichtigungen':
    'nur die Zahl der eigenen, ohne Inhalt',
  'BenachrichtigungenResolver.benachrichtigungGelesen': 'nur die eigenen',
  'WorkspacesResolver.myWorkspaces': 'die eigenen Mitgliedschaften',
  'WorkspacesResolver.myRole': 'die eigene Rolle',
  'WorkspacesResolver.workspaceMembers': 'die Teamliste, für alle im Bereich',
};

const FRAGT_NACH_RECHT =
  /\.(assert|assertAny|can|permissionsOf|darf|pruefe|assertSchreibrecht|assertAbrechnung|assertCanAdminister)\(/;

const stellen = RESOLVER.flatMap((klasse) =>
  Object.getOwnPropertyNames(klasse.prototype)
    .filter((name) =>
      ['Query', 'Mutation'].includes(
        Reflect.getMetadata(
          'graphql:resolver_type',
          (klasse.prototype as unknown as Record<string, unknown>)[
            name
          ] as object,
        ) as string,
      ),
    )
    .map((name) => ({
      stelle: `${klasse.name}.${name}`,
      quelle: String(
        (klasse.prototype as unknown as Record<string, unknown>)[name],
      ),
    })),
);

describe('jede Abfrage und jede Änderung hat eine Rechteentscheidung', () => {
  it('findet die Stellen überhaupt', () => {
    expect(stellen.length).toBeGreaterThan(100);
  });

  it.each(stellen.map(({ stelle, quelle }) => [stelle, quelle]))(
    '%s',
    (stelle, quelle) => {
      if (stelle in OHNE_PRUEFUNG) {
        return;
      }

      expect({ stelle, fragtNachRecht: FRAGT_NACH_RECHT.test(quelle) }).toEqual(
        { stelle, fragtNachRecht: true },
      );
    },
  );

  it('begründet nur Stellen, die es gibt', () => {
    const vorhanden = new Set(stellen.map(({ stelle }) => stelle));

    expect(
      Object.keys(OHNE_PRUEFUNG).filter((stelle) => !vorhanden.has(stelle)),
    ).toEqual([]);
  });
});

type Person = 'inhaber' | 'lesen' | 'leer' | 'nurExport';
type Aufruf = (user: RequestUser) => Promise<unknown>;

let dataSource: DataSource;
let rechte: PermissionsService;
const leute = {} as Record<Person, RequestUser>;

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);

  const m = dataSource.manager;
  const workspaceId = (
    await m.save(m.create(WorkspaceEntity, { name: 'Rechte', slug: 'rechte' }))
  ).id;
  const vorlagen = await m.save(
    ROLE_TEMPLATES.map((vorlage) =>
      m.create(RoleEntity, {
        workspaceId,
        name: vorlage.name,
        templateKey: vorlage.key,
        everything: vorlage.everything,
        permissions: [...vorlage.permissions],
        isSystem: true,
      }),
    ),
  );
  const eigene = (name: string, permissions: Permission[]) =>
    m.save(
      m.create(RoleEntity, {
        workspaceId,
        name,
        everything: false,
        permissions,
      }),
    );
  const vorlage = (key: string) =>
    vorlagen.find((rolle) => rolle.templateKey === key) as RoleEntity;
  const anlegen = async (
    kurz: Person,
    rolle: RoleEntity,
    enumRolle: MembershipRole,
  ) => {
    const user = await m.save(
      m.create(UserEntity, {
        email: `${kurz}@rechte.example`,
        passwordHash: 'x',
        firstName: kurz,
        lastName: 'Test',
      }),
    );

    await m.save(
      m.create(MembershipEntity, {
        userId: user.id,
        workspaceId,
        role: enumRolle,
        roleId: rolle.id,
      }),
    );
    leute[kurz] = { userId: user.id, workspaceId, email: user.email };
  };

  await anlegen('inhaber', vorlage('owner'), MembershipRole.OWNER);
  await anlegen('lesen', vorlage('readonly'), MembershipRole.MEMBER);
  await anlegen('leer', await eigene('Leer', []), MembershipRole.MEMBER);
  await anlegen(
    'nurExport',
    await eigene('Nur Export', [Permission.DATA_EXPORT]),
    MembershipRole.MEMBER,
  );

  rechte = new PermissionsService(
    dataSource.getRepository(MembershipEntity),
    dataSource.getRepository(RoleEntity),
  );
});

afterAll(async () => {
  await dropTestDatabase(dataSource, SUITE);
});

const ERGEBNIS = { id: 'ergebnis', name: 'ergebnis', sizeBytes: 0 };

const attrappe = (antworten: Record<string, unknown> = {}): never =>
  new Proxy(
    {},
    {
      get: (_ziel, name) => {
        const antwort = antworten[String(name)];

        return typeof antwort === 'function'
          ? antwort
          : () =>
              Promise.resolve(String(name) in antworten ? antwort : ERGEBNIS);
      },
    },
  ) as never;

const abfrageAttrappe = (): never => {
  const kette: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_ziel, name) =>
        name === 'getMany'
          ? () => Promise.resolve([ERGEBNIS])
          : name === 'getCount'
            ? () => Promise.resolve(1)
            : () => kette,
    },
  );

  return kette as never;
};

const antwort = (): never => {
  const r = { status: () => r, setHeader: () => r, end: () => r };

  return r as never;
};

const leererRumpf = (user: RequestUser): never => {
  const anfrage = Object.assign(new EventEmitter(), { user, headers: {} });

  anfrage.on('newListener', (ereignis) => {
    if (ereignis === 'end') {
      setImmediate(() => anfrage.emit('end'));
    }
  });

  return anfrage as never;
};

const PDF = { fileName: 'beleg.pdf', content: Buffer.from('%PDF-1.4') };
const DATEI = {
  name: 'beleg.pdf',
  mimeType: 'application/pdf',
  bytes: Buffer.from('x'),
};
const X = { id: 'x' } as never;

const firmen = () =>
  new CompaniesResolver(
    rechte,
    attrappe(),
    attrappe(),
    attrappe(),
    attrappe(),
    attrappe(),
    attrappe(),
  );
const kontakte = () =>
  new ContactsResolver(
    rechte,
    attrappe(),
    attrappe(),
    attrappe(),
    attrappe(),
    attrappe(),
    attrappe(),
  );
const geschaefte = () =>
  new DealsResolver(
    rechte,
    attrappe(),
    attrappe(),
    attrappe(),
    attrappe(),
    attrappe(),
    attrappe(),
    attrappe(),
  );
const beteiligte = () => new DealKontakteResolver(rechte, attrappe());
const notizen = (antworten?: Record<string, unknown>) =>
  new NotesResolver(attrappe(antworten), rechte, attrappe(), attrappe());
const aufgaben = () =>
  new TasksResolver(attrappe(), rechte, attrappe(), attrappe());
const artikel = () => new ProductsResolver(attrappe(), rechte);
const angebote = () => new QuotesResolver(attrappe(), rechte, attrappe());
const begleitbelege = () =>
  new BegleitbelegeResolver(attrappe({ lieferstand: [] }), rechte);
const serien = () => new InvoiceSeriesResolver(attrappe(), rechte);
const abo = () => new CalendarFeedResolver(attrappe(), rechte);
const phasen = () => new DealStagesResolver(attrappe(), rechte);
const vorlagen = () => new MailTemplatesResolver(attrappe(), rechte);
const entwuerfe = () => new MailEntwuerfeResolver(attrappe(), rechte);
const VORSCHLAG = {
  id: 'v',
  werkzeug: 'update_deal',
  zusammenfassung: 'Geschäft ändern',
  schluesselName: 'KI',
  zielArt: null,
  zielId: null,
  zielName: null,
  vorher: null,
  nachher: {},
  status: 'offen',
  entschiedenVon: null,
  entschiedenAm: null,
  grund: null,
  fehler: null,
  ergebnis: null,
  createdAt: new Date(),
};
const ki = () =>
  new KiVorschlaegeResolver(
    attrappe({
      liste: [VORSCHLAG],
      annehmen: { vorschlag: VORSCHLAG, veraltet: false, aktuell: null },
      verwerfen: VORSCHLAG,
    }),
    rechte,
  );
const haken = () => new WebhooksResolver(attrappe(), rechte);
const formular = () => new WebFormsResolver(attrappe(), rechte);
const durchreichen = (_bereich: string, ziel: unknown) => Promise.resolve(ziel);

const anhaenge = (antworten?: Record<string, unknown>) =>
  new AttachmentsResolver(
    attrappe({ mitAkte: durchreichen, ...antworten }),
    rechte,
  );

const SCHREIBEN: [string, Aufruf][] = [
  ['Angebotstexte ändern', (u) => angebote().setQuoteTexts(u, X)],
  ['KI-Vorschläge sehen', (u) => ki().kiVorschlaege(u)],
  [
    'KI-Vorschläge an einer Akte',
    (u) => ki().kiVorschlaegeFuer(u, 'deal', 'x'),
  ],
  ['KI-Vorschlag annehmen', (u) => ki().kiVorschlagAnnehmen(u, {}, 'v')],
  ['KI-Vorschlag verwerfen', (u) => ki().kiVorschlagVerwerfen(u, 'v')],
  ['Firma anlegen', (u) => firmen().createCompany(u, X)],
  ['Firma ändern', (u) => firmen().updateCompany(u, X)],
  ['Kontakt anlegen', (u) => kontakte().createContact(u, X)],
  ['Kontakt ändern', (u) => kontakte().updateContact(u, X)],
  ['Geschäft anlegen', (u) => geschaefte().createDeal(u, X)],
  ['Geschäft ändern', (u) => geschaefte().updateDeal(u, X)],
  [
    'Geschäft verschieben',
    (u) => geschaefte().moveDealToStage(u, 'x', DealStage.LOST),
  ],
  [
    'Kontakt an ein Geschäft',
    (u) => beteiligte().dealKontaktHinzufuegen(u, 'x', 'y', null),
  ],
  ['Rolle am Geschäft', (u) => beteiligte().dealKontaktRolle(u, 'x', null)],
  ['Kontakt vom Geschäft', (u) => beteiligte().dealKontaktEntfernen(u, 'x')],
  [
    'Beteiligten zum Hauptkontakt',
    (u) => beteiligte().dealKontaktZumHauptkontakt(u, 'x'),
  ],
  [
    'Notiz schreiben',
    (u) => notizen().createNote(u, { body: 'x', companyId: 'x' } as never),
  ],
  [
    'Notiz löschen',
    (u) => notizen({ findOne: { companyId: 'x' } }).deleteNote(u, 'x'),
  ],
  ['Aufgabe anlegen', (u) => aufgaben().createTask(u, { title: 'x' } as never)],
  ['Aufgabe ändern', (u) => aufgaben().updateTask(u, X)],
  ['Aufgabe abhaken', (u) => aufgaben().setTaskCompleted(u, 'x', true)],
  ['Aufgabe löschen', (u) => aufgaben().deleteTask(u, 'x')],
  ['Artikel anlegen', (u) => artikel().createProduct(u, X)],
  ['Artikel ändern', (u) => artikel().updateProduct(u, X)],
  ['Angebot anlegen', (u) => angebote().createQuote(u, X)],
  ['Angebot ändern', (u) => angebote().updateQuote(u, X)],
  ['Angebotszeilen setzen', (u) => angebote().setQuoteLines(u, X)],
  ['Angebot entscheiden', (u) => angebote().decideQuote(u, 'x', true)],
  ['Angebot duplizieren', (u) => angebote().duplicateQuote(u, 'x')],
  ['Kundenlink erzeugen', (u) => angebote().createQuoteLink(u, 'x')],
  ['Kundenlink zurückziehen', (u) => angebote().revokeQuoteLink(u, 'x')],
  [
    'Auftragsbestätigung stellen',
    (u) => begleitbelege().auftragsbestaetigungStellen(u, X),
  ],
  ['Lieferschein stellen', (u) => begleitbelege().lieferscheinStellen(u, X)],
  [
    'Beleg stornieren',
    (u) => begleitbelege().begleitbelegStornieren(u, 'x', undefined),
  ],
  [
    'Beleg ans Angebot legen',
    (u) => begleitbelege().begleitbelegAlsAnhang(u, 'x'),
  ],
  ['Serie anlegen', (u) => serien().createInvoiceSeries(u, X)],
  ['Serie beenden', (u) => serien().endInvoiceSeries(u, 'x')],
  ['Phasen anpassen', (u) => phasen().updateDealStages(u, [])],
  [
    'Mailvorlage speichern',
    (u) => vorlagen().saveMailTemplate(u, { name: 'x', body: 'x' }),
  ],
  ['Mailvorlage löschen', (u) => vorlagen().deleteMailTemplate(u, 'x')],
  ['Webhook anlegen', (u) => haken().createWebhook(u, X)],
  ['Webhook schalten', (u) => haken().setWebhookActive(u, 'x', true)],
  ['Webhook testen', (u) => haken().testWebhook(u, 'x')],
  ['Webhook löschen', (u) => haken().deleteWebhook(u, 'x')],
  ['Webformular speichern', (u) => formular().saveWebForm(u, {})],
  [
    'Import',
    (u) =>
      new ImportResolver(attrappe(), rechte).importRecords(u, {
        entity: ImportEntity.COMPANY,
      } as never),
  ],
  [
    'Anhang löschen',
    (u) => anhaenge({ zielVon: { invoiceId: 'x' } }).deleteAttachment(u, 'x'),
  ],
  [
    'Anhang hochladen',
    (u) =>
      new AttachmentsController(
        attrappe({ mitAkte: durchreichen }),
        rechte,
        attrappe(),
      ).upload(
        leererRumpf(u),
        'beleg.pdf',
        'x',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      ),
  ],
  [
    'Anhang an eine Aufgabe hochladen',
    (u) =>
      new AttachmentsController(
        attrappe({ mitAkte: durchreichen }),
        rechte,
        attrappe(),
      ).upload(
        leererRumpf(u),
        'beleg.pdf',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'x',
        undefined,
      ),
  ],
  [
    'Aufgabenstatus setzen',
    (u) => aufgaben().setTaskStatus(u, 'x', 'in_arbeit'),
  ],
  [
    'Tarif bestellen',
    (u) =>
      new BillingResolver(attrappe(), attrappe(), rechte).createCheckoutSession(
        u,
        BillingPlan.STARTER,
        BillingInterval.MONTH,
        3,
      ),
  ],
  [
    'Kundenportal der Abrechnung',
    (u) =>
      new BillingResolver(
        attrappe(),
        attrappe(),
        rechte,
      ).createBillingPortalSession(u),
  ],
];

const SEHEN: [string, Aufruf][] = [
  [
    'Mail-Entwurf an einer Akte anlegen',
    (u) =>
      entwuerfe().mailEntwurfAnlegen(u, {
        art: 'contact',
        id: 'x',
        betreff: 'x',
        rumpf: 'y',
      }),
  ],
  ['Begleitbelege', (u) => begleitbelege().begleitbelege(u)],
  ['Begleitbeleg', (u) => begleitbelege().begleitbeleg(u, 'x')],
  ['Lieferstand', (u) => begleitbelege().lieferstand(u, 'x')],
  ['Serienliste', (u) => serien().invoiceSeriesList(u)],
  ['Phasen', (u) => phasen().dealStages(u)],
  ['Mailvorlagen', (u) => vorlagen().mailTemplates(u)],
  ['Prognose', (u) => phasen().dealForecast(u)],
  [
    'Auswertung',
    (u) =>
      new AuswertungResolver(rechte, attrappe()).auswertung(
        u,
        '2026-01-01',
        '2026-12-31',
      ),
  ],
  ['Kalender-Abo ansehen', (u) => abo().calendarFeedUrl(u)],
  ['Kalender-Abo erzeugen', (u) => abo().enableCalendarFeed(u)],
  ['Kalender-Abo beenden', (u) => abo().disableCalendarFeed(u)],
  ['Firmenliste', (u) => firmen().companies(u, {} as never)],
  ['Branchen', (u) => firmen().companyIndustries(u)],
  ['Firma', (u) => firmen().company(u, 'x')],
  ['Kontaktliste', (u) => kontakte().contacts(u, {} as never)],
  ['Kontakt', (u) => kontakte().contact(u, 'x')],
  ['Geschäftsliste', (u) => geschaefte().deals(u, {} as never)],
  ['Geschäft', (u) => geschaefte().deal(u, 'x')],
  ['Aufgabenliste', (u) => aufgaben().tasks(u, {} as never)],
  ['Angebotsliste', (u) => angebote().quotes(u)],
  ['Angebot', (u) => angebote().quote(u, 'x')],
  ['Artikelstamm', (u) => artikel().products(u, false)],
  [
    'Anhänge einer Rechnung',
    (u) =>
      anhaenge().attachments(
        u,
        undefined,
        undefined,
        undefined,
        undefined,
        'x',
      ),
  ],
  [
    'Anhänge einer Aufgabe',
    (u) =>
      anhaenge().attachments(
        u,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'x',
      ),
  ],
  [
    'Angebots-PDF',
    (u) =>
      new QuoteDocumentsController(attrappe({ pdf: PDF }), rechte).pdf(
        { user: u } as never,
        'x',
        antwort(),
      ),
  ],
  [
    'Rechnungs-PDF',
    (u) =>
      new InvoiceDocumentsController(attrappe({ pdf: PDF }), rechte).pdf(
        { user: u } as never,
        'x',
        antwort(),
      ),
  ],
  [
    'Anhang herunterladen',
    (u) =>
      new AttachmentsController(
        attrappe({ zielVon: { invoiceId: 'x' }, download: DATEI }),
        rechte,
        attrappe(),
      ).download({ user: u } as never, 'x', antwort()),
  ],
];

const KENNZAHLEN_VERBORGEN = {
  companyCount: null,
  contactCount: null,
  openDealCount: null,
  openPipelineValue: null,
  openTaskCount: null,
  overdueTaskCount: null,
  betraegeVerborgen: false,
};

const WEICH: [string, Aufruf, unknown][] = [
  [
    'Offene KI-Vorschläge für die Glocke',
    (u) => ki().offeneKiVorschlaege(u),
    0,
  ],
  ['Kontakte einer Firma', (u) => firmen().contacts(u, X), []],
  ['Geschäfte einer Firma', (u) => firmen().deals(u, X), []],
  ['Aufgaben einer Firma', (u) => firmen().tasks(u, X), []],
  ['Termine einer Firma', (u) => firmen().appointments(u, X), []],
  ['Geschäfte eines Kontakts', (u) => kontakte().deals(u, X), []],
  ['Aufgaben eines Kontakts', (u) => kontakte().tasks(u, X), []],
  ['Termine eines Kontakts', (u) => kontakte().appointments(u, X), []],
  ['Termine eines Geschäfts', (u) => geschaefte().appointments(u, X), []],
  ['Aufgaben eines Geschäfts', (u) => geschaefte().tasks(u, X), []],
  ['Pipeline', (u) => geschaefte().pipeline(u), []],
  ['Meine offenen Aufgaben', (u) => aufgaben().myOpenTasks(u), []],
  [
    'Protokoll',
    (u) =>
      new AuditResolver(
        attrappe({ createQueryBuilder: abfrageAttrappe }),
        attrappe(),
        rechte,
      ).auditLog(u),
    [],
  ],
  [
    'Suche',
    (u) => {
      const treffer = attrappe({
        rangSuche: () => Promise.resolve([{ eintrag: { id: X }, rang: 1 }]),
      });

      return new SucheResolver(rechte, treffer, treffer, treffer).suche(
        u,
        'Müller',
        10,
      );
    },
    [],
  ],
  [
    'Kennzahlen der Übersicht',
    (u) => geschaefte().workspaceSummary(u),
    KENNZAHLEN_VERBORGEN,
  ],
];

describe.each(SCHREIBEN)('Schreiben: %s', (_name, aufruf) => {
  it('verweigert "Nur Lesen" und eine Rolle ohne Rechte', async () => {
    await expect(aufruf(leute.lesen)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(aufruf(leute.leer)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lässt den Inhaber durch', async () => {
    await expect(aufruf(leute.inhaber)).resolves.not.toThrow();
  });
});

describe.each(SEHEN)('Sehen: %s', (_name, aufruf) => {
  it('verweigert eine Rolle ohne Leserecht', async () => {
    await expect(aufruf(leute.leer)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lässt "Nur Lesen" durch', async () => {
    await expect(aufruf(leute.lesen)).resolves.not.toThrow();
  });
});

describe.each(WEICH)(
  'Leer statt verweigert: %s',
  (_name, aufruf, verborgen) => {
    it('gibt einer Rolle ohne Leserecht nichts preis', async () => {
      await expect(aufruf(leute.leer)).resolves.toEqual(verborgen);
    });

    it('zeigt dem Inhaber, was da ist', async () => {
      await expect(aufruf(leute.inhaber)).resolves.not.toEqual(verborgen);
    });
  },
);

describe('der Export', () => {
  const exportieren = (u: RequestUser, ids?: string, liste?: string) =>
    new ExportController(
      attrappe({ csv: 'Name;Stadt', fileName: () => 'Firmen.csv' }),
      rechte,
    ).csv(
      { user: u } as never,
      'company',
      undefined,
      undefined,
      undefined,
      ids,
      liste,
      antwort(),
    );

  it('nimmt die Filter der Liste nur so an, wie die Liste sie prüft', async () => {
    await expect(
      exportieren(leute.inhaber, undefined, '{"unbekannt":1}'),
    ).rejects.toThrow('Die Filter des Exports sind ungültig.');
    await expect(
      exportieren(leute.inhaber, undefined, 'kein json'),
    ).rejects.toThrow('Die Filter des Exports sind ungültig.');
    await expect(
      exportieren(
        leute.inhaber,
        undefined,
        JSON.stringify({
          customFilters: Array.from({ length: 11 }, () => ({
            key: 'std:name',
            operator: 'is_empty',
          })),
        }),
      ),
    ).rejects.toThrow('Die Filter des Exports sind ungültig.');
    await expect(
      exportieren(
        leute.inhaber,
        undefined,
        JSON.stringify({
          industry: 'Bau',
          customFilters: [
            { key: 'std:city', operator: 'equals', value: 'Hamburg' },
          ],
          filterVerknuepfung: 'ODER',
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it('nimmt als Auswahl nur Kennungen an', async () => {
    await expect(
      exportieren(leute.inhaber, "1' OR '1'='1"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('verlangt neben dem Exportrecht das Leserecht der Liste', async () => {
    await expect(exportieren(leute.nurExport)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lässt den Inhaber exportieren', async () => {
    await expect(exportieren(leute.inhaber)).resolves.toBeUndefined();
  });
});
