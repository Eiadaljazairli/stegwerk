import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useQuery } from '@apollo/client';
import { NavLink } from 'react-router-dom';

import { useAuth } from '../lib/auth';
import { usePermissions } from '../lib/usePermissions';
import { useLiveVerbindung } from '../lib/useLive';
import { useBezeichnung, useSeitenName } from '../lib/useBezeichnung';
import { ICH_BIN_BETREIBER } from '../lib/queries';
import { THEME_LABELS, type ThemeChoice, useTheme } from '../lib/useTheme';
import {
  IconCalendar,
  IconChevronDown,
  IconCompanies,
  IconContacts,
  IconData,
  IconDeals,
  IconGroups,
  IconHelp,
  IconHome,
  IconInvoices,
  IconLogOut,
  IconMail,
  IconMailbox,
  IconMenu,
  IconMonitor,
  IconMoon,
  IconOpenItems,
  IconProducts,
  IconQuotes,
  IconReports,
  IconSearch,
  IconSettings,
  IconSuggestions,
  IconSun,
  IconTasks,
} from './Icons';
import { type ObjectKind } from './ObjectTile';
import { Avatar } from './Avatar';
import { EmailVerificationBanner } from './EmailVerificationBanner';
import { SearchPalette } from './SearchPalette';
import { BetriebsBanner } from './BetriebsBanner';
import { LeerlaufWaechter } from './LeerlaufWaechter';
import { PostfachBanner } from './PostfachBanner';
import { SubscriptionBanner } from './SubscriptionBanner';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { ZweiFaktorSperre } from './ZweiFaktorSperre';
import { Wordmark } from './Wordmark';
import { Glocke } from './Glocke';
import { KiChat } from './KiChat';
import { NeuigkeitenHinweis } from './NeuigkeitenHinweis';
import { useAnkerSprung } from './Anker';

type Tab = {
  to: string;
  label: string;
  end: boolean;
  icon: (props: { size?: number }) => JSX.Element;
  kind: ObjectKind;
  recht?: string;
};

const PRIMARY: Tab[] = [
  { to: '/', label: 'Übersicht', end: true, icon: IconHome, kind: 'overview' },
  {
    to: '/aufgaben',
    label: 'Aufgaben',
    end: false,
    icon: IconTasks,
    kind: 'task',
  },
  {
    to: '/kalender',
    label: 'Kalender',
    end: false,
    icon: IconCalendar,
    kind: 'task',
  },
  {
    to: '/geschaefte',
    label: 'Geschäfte',
    end: false,
    icon: IconDeals,
    kind: 'deal',
  },
  {
    to: '/angebote',
    label: 'Angebote',
    end: false,
    icon: IconQuotes,
    kind: 'quote',
  },
  {
    to: '/firmen',
    label: 'Firmen',
    end: false,
    icon: IconCompanies,
    kind: 'company',
  },
  {
    to: '/kontakte',
    label: 'Kontakte',
    end: false,
    icon: IconContacts,
    kind: 'contact',
  },
  {
    to: '/artikel',
    label: 'Artikel',
    end: false,
    icon: IconProducts,
    kind: 'product',
  },
];

const MORE: Tab[] = [
  {
    to: '/auswertungen',
    label: 'Auswertungen',
    end: false,
    icon: IconReports,
    kind: 'deal',
  },
  {
    to: '/rechnungen',
    label: 'Rechnungen',
    end: false,
    icon: IconInvoices,
    kind: 'invoice',
  },
  {
    to: '/offene-posten',
    label: 'Offene Posten',
    end: false,
    icon: IconOpenItems,
    kind: 'invoice',
  },
  {
    to: '/postfach',
    label: 'Postfach',
    end: false,
    icon: IconMailbox,
    kind: 'mailbox',
  },
  {
    to: '/serienmails',
    label: 'Serienmails',
    end: false,
    icon: IconMail,
    kind: 'mailbox',
    recht: 'workspace:campaigns',
  },
  {
    to: '/ki-vorschlaege',
    label: 'KI-Vorschläge',
    end: false,
    icon: IconSuggestions,
    kind: 'data',
    recht: 'workspace:ki',
  },
  {
    to: '/verteiler',
    label: 'Verteiler',
    end: false,
    icon: IconGroups,
    kind: 'contact',
    recht: 'contact:view',
  },
];

const NavSymbol = ({ icon: Symbol }: { icon: Tab['icon'] }) => (
  <span className="nav-symbol" aria-hidden="true">
    <Symbol size={16} />
  </span>
);

const EINSTELLUNGEN_TAB: Tab = {
  to: '/einstellungen',
  label: 'Einstellungen',
  end: false,
  icon: IconSettings,
  kind: 'data',
};

const MOBIL: Tab[] = PRIMARY.filter((tab) =>
  ['/', '/aufgaben', '/geschaefte'].includes(tab.to),
);

const BETRIEB: Tab = {
  to: '/betrieb',
  label: 'Betrieb',
  end: false,
  icon: IconData,
  kind: 'data',
};

const THEME_ICONS = { light: IconSun, dark: IconMoon, system: IconMonitor };

const isMac = () => /Mac|iPhone|iPad/u.test(navigator.platform);

const useDismiss = (open: boolean, close: () => void) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        close();
      }
    };

    window.addEventListener('mousedown', onDown);

    return () => window.removeEventListener('mousedown', onDown);
  }, [open, close]);

  return ref;
};

export const AppShell = ({ children }: { children: ReactNode }) => {
  const { session, endSession } = useAuth();
  const { choice, setChoice } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { data: betriebData } = useQuery<{ ichBinBetreiber: boolean }>(
    ICH_BIN_BETREIBER,
  );
  const betreiber = betriebData?.ichBinBetreiber === true;
  const rechte = usePermissions();
  const name = useSeitenName();
  const bez = useBezeichnung();
  const mehr = [
    ...MORE.filter((tab) => tab.recht === undefined || rechte.can(tab.recht)),
    ...(betreiber ? [BETRIEB] : []),
  ];
  const [blattOffen, setBlattOffen] = useState(false);

  useAnkerSprung();
  useLiveVerbindung(session?.workspace.id ?? null);

  const menuRef = useDismiss(menuOpen, () => setMenuOpen(false));
  const moreRef = useDismiss(moreOpen, () => setMoreOpen(false));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fullName =
    `${session?.user.firstName ?? ''} ${session?.user.lastName ?? ''}`.trim();

  return (
    <div className="shell">
      <a className="sprunglink" href="#inhalt">
        Zum Inhalt springen
      </a>
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />

      <header className="topbar">
        <div className="topbar__brand">
          <Wordmark size={14} />
        </div>

        <button
          type="button"
          className="topbar__search"
          aria-label="Suchen"
          onClick={() => setSearchOpen(true)}
        >
          <IconSearch size={15} />
          <span className="topbar__search-label">
            {bez('FIRMA', 'mehrzahl')}, {bez('KONTAKT', 'mehrzahl')},{' '}
            {bez('GESCHAEFT', 'mehrzahl')} durchsuchen…
          </span>
          <kbd>{isMac() ? '⌘K' : 'Strg K'}</kbd>
        </button>

        <KiChat />

        <NeuigkeitenHinweis />

        <Glocke />

        <div className="topbar__account" ref={menuRef}>
          <button
            type="button"
            className="topbar__me"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={fullName === '' ? 'Konto' : `Konto: ${fullName}`}
            title={fullName}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Avatar name={fullName === '' ? '?' : fullName} size="sm" />
            <span className="topbar__me-name">{fullName}</span>
            <IconChevronDown size={14} />
          </button>

          {menuOpen && (
            <div className="menu-panel menu-panel--right" role="menu">
              <div className="menu-panel__heading">Arbeitsbereich</div>
              <div className="menu-panel__workspace">
                <WorkspaceSwitcher />
              </div>

              <div className="menu-panel__sep" />
              <div className="menu-panel__heading">Darstellung</div>
              {(Object.keys(THEME_LABELS) as ThemeChoice[]).map((option) => {
                const Icon = THEME_ICONS[option];

                return (
                  <button
                    key={option}
                    type="button"
                    role="menuitemradio"
                    aria-checked={choice === option}
                    className={
                      choice === option
                        ? 'menu-panel__item is-selected'
                        : 'menu-panel__item'
                    }
                    onClick={() => setChoice(option)}
                  >
                    <Icon />
                    {THEME_LABELS[option]}
                  </button>
                );
              })}

              <div className="menu-panel__sep" />
              <NavLink
                to="/hilfe"
                className="menu-panel__item"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
              >
                <IconHelp />
                Hilfe
              </NavLink>
              <NavLink
                to="/neuigkeiten"
                className="menu-panel__item"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
              >
                Neuigkeiten
              </NavLink>
              <NavLink
                to="/impressum"
                className="menu-panel__item"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
              >
                Impressum
              </NavLink>
              <NavLink
                to="/datenschutz"
                className="menu-panel__item"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
              >
                Datenschutz
              </NavLink>
              <NavLink
                to="/auftragsverarbeitung"
                className="menu-panel__item"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
              >
                Auftragsverarbeitung
              </NavLink>
              <button
                type="button"
                role="menuitem"
                className="menu-panel__item"
                onClick={endSession}
              >
                <IconLogOut />
                Abmelden
              </button>
            </div>
          )}
        </div>
      </header>

      <nav className="tabbar" aria-label="Bereiche">
        <div className="tabbar__row">
          <div className="tabbar__inner">
            {PRIMARY.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  isActive ? 'tab is-active' : 'tab'
                }
              >
                <NavSymbol icon={tab.icon} />
                {name(tab)}
              </NavLink>
            ))}
          </div>

          <div className="tabbar__more" ref={moreRef}>
            <button
              type="button"
              className="tab tab--more"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
            >
              Mehr
              <IconChevronDown size={13} />
            </button>

            {moreOpen && (
              <div className="menu-panel" role="menu">
                {mehr.map((tab) => (
                  <NavLink
                    key={tab.to}
                    to={tab.to}
                    role="menuitem"
                    className="menu-panel__item"
                    onClick={() => setMoreOpen(false)}
                  >
                    <NavSymbol icon={tab.icon} />
                    {tab.label}
                  </NavLink>
                ))}
                <div className="menu-panel__sep" />
                <NavLink
                  to={EINSTELLUNGEN_TAB.to}
                  role="menuitem"
                  className="menu-panel__item"
                  onClick={() => setMoreOpen(false)}
                >
                  <NavSymbol icon={EINSTELLUNGEN_TAB.icon} />
                  {EINSTELLUNGEN_TAB.label}
                </NavLink>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="shell__main" id="inhalt" tabIndex={-1}>
        <BetriebsBanner />
        <LeerlaufWaechter />
        <EmailVerificationBanner />
        <SubscriptionBanner />
        <PostfachBanner />
        <ZweiFaktorSperre>{children}</ZweiFaktorSperre>
      </main>

      <MobilNavigation
        mehr={[
          ...PRIMARY.filter((tab) => !MOBIL.includes(tab)),
          ...mehr,
          EINSTELLUNGEN_TAB,
        ]}
        blattOffen={blattOffen}
        setBlattOffen={setBlattOffen}
        onSuche={() => setSearchOpen(true)}
      />
    </div>
  );
};

const MobilNavigation = ({
  mehr,
  blattOffen,
  setBlattOffen,
  onSuche,
}: {
  mehr: Tab[];
  blattOffen: boolean;
  setBlattOffen: (offen: boolean) => void;
  onSuche: () => void;
}) => {
  const name = useSeitenName();

  useEffect(() => {
    if (!blattOffen) {
      return undefined;
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBlattOffen(false);
      }
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [blattOffen, setBlattOffen]);

  const [erster, zweiter, dritter] = MOBIL;

  return (
    <>
      {blattOffen && (
        <div
          className="mobilnav__hintergrund"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setBlattOffen(false);
            }
          }}
        >
          <div
            className="mobilnav__blatt"
            role="dialog"
            aria-modal="true"
            aria-label="Weitere Bereiche"
          >
            <ul className="mobilnav__liste">
              {mehr.map((tab) => (
                <li key={tab.to}>
                  <NavLink
                    to={tab.to}
                    className="mobilnav__eintrag"
                    onClick={() => setBlattOffen(false)}
                  >
                    <NavSymbol icon={tab.icon} />
                    {name(tab)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <nav className="mobilnav" aria-label="Bereiche (Handy)">
        {[erster, zweiter].map((tab) => (
          <MobilZiel key={tab.to} tab={tab} />
        ))}
        <button
          type="button"
          className="mobilnav__ziel"
          onClick={() => {
            setBlattOffen(false);
            onSuche();
          }}
        >
          <IconSearch size={20} />
          <span>Suche</span>
        </button>
        <MobilZiel tab={dritter} />
        <button
          type="button"
          className={blattOffen ? 'mobilnav__ziel is-active' : 'mobilnav__ziel'}
          aria-expanded={blattOffen}
          onClick={() => setBlattOffen(!blattOffen)}
        >
          <IconMenu size={20} />
          <span>Mehr</span>
        </button>
      </nav>
    </>
  );
};

const MobilZiel = ({ tab }: { tab: Tab }) => {
  const Icon = tab.icon;
  const name = useSeitenName();

  return (
    <NavLink
      to={tab.to}
      end={tab.end}
      className={({ isActive }) =>
        isActive ? 'mobilnav__ziel is-active' : 'mobilnav__ziel'
      }
    >
      <Icon size={20} />
      <span>{name(tab)}</span>
    </NavLink>
  );
};
