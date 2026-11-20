import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { Startdaten } from './components/Startdaten';
import { useAuth } from './lib/auth';
import {
  forgetPendingInvite,
  readPendingInvite,
  readPendingVerification,
} from './lib/session';
import { AcceptInvitationPage } from './pages/AcceptInvitationPage';
import { BillingPage } from './pages/BillingPage';
import { CompaniesPage } from './pages/CompaniesPage';
import { DataPage } from './pages/DataPage';
import { CompanyDetailPage } from './pages/CompanyDetailPage';
import { ContactDetailPage } from './pages/ContactDetailPage';
import { ContactsPage } from './pages/ContactsPage';
import { DashboardPage } from './pages/DashboardPage';
import { DealDetailPage } from './pages/DealDetailPage';
import { DealsPage } from './pages/DealsPage';
import { LetterheadPage } from './pages/LetterheadPage';
import { BuchhaltungPage } from './pages/BuchhaltungPage';
import { HilfePage } from './pages/HilfePage';
import { KontaktPage } from './pages/KontaktPage';
import { NeuigkeitenPage } from './pages/NeuigkeitenPage';
import { SicherheitPage } from './pages/SicherheitPage';
import { UnterauftragsverarbeiterPage } from './pages/UnterauftragsverarbeiterPage';
import { InvoiceDetailPage } from './pages/InvoiceDetailPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { LandingPage } from './pages/LandingPage';
import { StagesPage } from './pages/StagesPage';
import { AuswertungenPage } from './pages/AuswertungenPage';
import { AutomationenPage } from './pages/AutomationenPage';
import { AbmeldenPage } from './pages/AbmeldenPage';
import { SerienmailsPage } from './pages/SerienmailsPage';
import { VerteilerPage } from './pages/VerteilerPage';
import { WebFormPage } from './pages/WebFormPage';
import { PapierkorbPage } from './pages/PapierkorbPage';
import { ProtokollPage } from './pages/ProtokollPage';
import { BetriebPage } from './pages/BetriebPage';
import { StageSettingsProvider } from './lib/stages';
import { PublicFormPage } from './pages/PublicFormPage';
import { PublicQuotePage } from './pages/PublicQuotePage';
import { OpenItemsPage } from './pages/OpenItemsPage';
import { MailboxPage } from './pages/MailboxPage';
import { PostfachEingangPage } from './pages/PostfachEingangPage';
import { KiVorschlaegePage } from './pages/KiVorschlaegePage';
import { KiPage } from './pages/KiPage';
import { ProductsPage } from './pages/ProductsPage';
import { BegleitbelegDetailPage } from './pages/BegleitbelegDetailPage';
import { BegleitbelegePage } from './pages/BegleitbelegePage';
import { QuoteDetailPage } from './pages/QuoteDetailPage';
import { QuotesPage } from './pages/QuotesPage';
import { ImportPage } from './pages/ImportPage';
import { AuftragsverarbeitungPage } from './pages/AuftragsverarbeitungPage';
import { DatenschutzPage } from './pages/DatenschutzPage';
import { ImpressumPage } from './pages/ImpressumPage';
import { PendingInvitePage } from './pages/PendingInvitePage';
import { PendingVerificationPage } from './pages/PendingVerificationPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { EmailAendernPage } from './pages/EmailAendernPage';
import { CustomFieldsPage } from './pages/CustomFieldsPage';
import { ObjektePage } from './pages/ObjektePage';
import { PasswordResetPage } from './pages/PasswordResetPage';
import { PasswordResetRequestPage } from './pages/PasswordResetRequestPage';
import { SignInPage } from './pages/SignInPage';
import { SignUpPage } from './pages/SignUpPage';
import { CalendarPage } from './pages/CalendarPage';
import { TasksPage } from './pages/TasksPage';
import { TeamPage } from './pages/TeamPage';
import { EinstellungenPage } from './pages/EinstellungenPage';
import { FehlerbehebungPage } from './pages/FehlerbehebungPage';
import { FunktionenPage, ProduktPage } from './pages/ProduktPage';

const EntwicklerPage = lazy(() => import('./pages/EntwicklerPage'));

const entwickler = (
  <Suspense fallback={<div className="state">Wird geladen…</div>}>
    <EntwicklerPage />
  </Suspense>
);

export const App = () => {
  const { isSignedIn } = useAuth();
  const { pathname } = useLocation();

  const zurueckgelegt = isSignedIn ? readPendingInvite() : null;
  const einladung =
    zurueckgelegt === null ? null : `/einladung/${zurueckgelegt}`;

  const bestaetigungToken = isSignedIn ? readPendingVerification() : null;
  const bestaetigung =
    bestaetigungToken === null
      ? null
      : `/adresse-bestaetigen/${bestaetigungToken}`;

  useEffect(() => {
    if (einladung !== null && pathname === einladung) {
      forgetPendingInvite();
    }
  }, [einladung, pathname]);

  if (pathname.startsWith('/angebot/')) {
    return (
      <Routes>
        <Route path="/angebot/:token" element={<PublicQuotePage />} />
      </Routes>
    );
  }

  if (pathname.startsWith('/abmelden/')) {
    return (
      <Routes>
        <Route path="/abmelden/:token" element={<AbmeldenPage />} />
      </Routes>
    );
  }

  if (pathname.startsWith('/formular/')) {
    return (
      <Routes>
        <Route path="/formular/:id" element={<PublicFormPage />} />
      </Routes>
    );
  }

  if (pathname === '/funktionen' || pathname.startsWith('/funktionen/')) {
    return (
      <Routes>
        <Route path="/funktionen" element={<FunktionenPage />} />
        <Route path="/funktionen/:slug" element={<ProduktPage />} />
      </Routes>
    );
  }

  if (!isSignedIn) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/anmelden" element={<SignInPage />} />
        <Route path="/registrieren" element={<SignUpPage />} />
        <Route
          path="/passwort-vergessen"
          element={<PasswordResetRequestPage />}
        />
        <Route path="/passwort-neu/:token" element={<PasswordResetPage />} />
        <Route path="/einladung/:token" element={<PendingInvitePage />} />
        <Route
          path="/adresse-bestaetigen/:token"
          element={<PendingVerificationPage />}
        />
        <Route path="/impressum" element={<ImpressumPage />} />
        <Route path="/datenschutz" element={<DatenschutzPage />} />
        <Route
          path="/auftragsverarbeitung"
          element={<AuftragsverarbeitungPage />}
        />
        <Route path="/sicherheit" element={<SicherheitPage />} />
        <Route
          path="/unterauftragsverarbeiter"
          element={<UnterauftragsverarbeiterPage />}
        />
        <Route path="/neuigkeiten" element={<NeuigkeitenPage />} />
        <Route path="/kontakt" element={<KontaktPage />} />
        <Route path="/hilfe/fehlerbehebung" element={<FehlerbehebungPage />} />
        <Route path="/entwickler" element={entwickler} />
        <Route path="/entwickler/:teil" element={entwickler} />
        <Route path="*" element={<Navigate to="/anmelden" replace />} />
      </Routes>
    );
  }

  if (bestaetigung !== null && pathname !== bestaetigung) {
    return <Navigate to={bestaetigung} replace />;
  }

  if (bestaetigung === null && einladung !== null && pathname !== einladung) {
    return <Navigate to={einladung} replace />;
  }

  return (
    <Startdaten>
      <StageSettingsProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/firmen" element={<CompaniesPage />} />
            <Route path="/firmen/:id" element={<CompanyDetailPage />} />
            <Route path="/kontakte" element={<ContactsPage />} />
            <Route path="/kontakte/:id" element={<ContactDetailPage />} />
            <Route path="/geschaefte" element={<DealsPage />} />
            <Route path="/geschaefte/:id" element={<DealDetailPage />} />
            <Route path="/aufgaben" element={<TasksPage />} />
            <Route path="/kalender" element={<CalendarPage />} />
            <Route path="/angebote" element={<QuotesPage />} />
            <Route path="/angebote/:id" element={<QuoteDetailPage />} />
            <Route path="/belege" element={<BegleitbelegePage />} />
            <Route path="/belege/:id" element={<BegleitbelegDetailPage />} />
            <Route path="/artikel" element={<ProductsPage />} />
            <Route path="/briefkopf" element={<LetterheadPage />} />
            <Route path="/buchhaltung" element={<BuchhaltungPage />} />
            <Route path="/rechnungen" element={<InvoicesPage />} />
            <Route path="/offene-posten" element={<OpenItemsPage />} />
            <Route path="/rechnungen/:id" element={<InvoiceDetailPage />} />
            <Route path="/postfach" element={<MailboxPage />} />
            <Route path="/postfach/:id" element={<PostfachEingangPage />} />
            <Route path="/ki-vorschlaege" element={<KiVorschlaegePage />} />
            <Route path="/ki" element={<KiPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/abrechnung" element={<BillingPage />} />
            <Route path="/daten" element={<DataPage />} />
            <Route path="/impressum" element={<ImpressumPage />} />
            <Route path="/datenschutz" element={<DatenschutzPage />} />
            <Route
              path="/auftragsverarbeitung"
              element={<AuftragsverarbeitungPage />}
            />
            <Route path="/felder" element={<CustomFieldsPage />} />
            <Route path="/objekte" element={<ObjektePage />} />
            <Route path="/phasen" element={<StagesPage />} />
            <Route path="/auswertungen" element={<AuswertungenPage />} />
            <Route path="/automationen" element={<AutomationenPage />} />
            <Route path="/serienmails" element={<SerienmailsPage />} />
            <Route path="/serienmails/:id" element={<SerienmailsPage />} />
            <Route path="/verteiler" element={<VerteilerPage />} />
            <Route path="/verteiler/:id" element={<VerteilerPage />} />
            <Route path="/webformular" element={<WebFormPage />} />
            <Route path="/papierkorb" element={<PapierkorbPage />} />
            <Route path="/protokoll" element={<ProtokollPage />} />
            <Route path="/hilfe" element={<HilfePage />} />
            <Route
              path="/hilfe/fehlerbehebung"
              element={<FehlerbehebungPage />}
            />
            <Route path="/entwickler" element={entwickler} />
            <Route path="/entwickler/:teil" element={entwickler} />
            <Route path="/sicherheit" element={<SicherheitPage />} />
            <Route
              path="/unterauftragsverarbeiter"
              element={<UnterauftragsverarbeiterPage />}
            />
            <Route path="/neuigkeiten" element={<NeuigkeitenPage />} />
            <Route path="/kontakt" element={<KontaktPage />} />
            <Route path="/betrieb" element={<BetriebPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/einstellungen" element={<EinstellungenPage />} />
            <Route
              path="/einladung/:token"
              element={<AcceptInvitationPage />}
            />
            <Route
              path="/adresse-bestaetigen/:token"
              element={<VerifyEmailPage />}
            />
            <Route
              path="/email-aendern/:token"
              element={<EmailAendernPage />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </StageSettingsProvider>
    </Startdaten>
  );
};
