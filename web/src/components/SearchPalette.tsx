import { useQuery } from '@apollo/client';
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';

import {
  INVOICES,
  MAIL_SUCHE,
  NOTIZ_SUCHE,
  QUOTES,
  SUCHE,
  TASKS,
} from '../lib/queries';
import { einstellungenFuer, passtZu } from '../lib/einstellungen';
import {
  abhilfePfad,
  FEHLERFAELLE,
  fehlerfallPasst,
} from '../lib/fehlerbehebung';
import { useEinstellungen } from '../lib/useEinstellungen';
import { type ObjektArt } from '../lib/bezeichnung';
import { useBezeichnung, useBezeichnungen } from '../lib/useBezeichnung';
import { usePermissions } from '../lib/usePermissions';
import { alsKlartext } from '../lib/formatierter-text';
import { artDesBesuchs, zuletztGeoeffnet } from '../lib/zuletzt';
import { type Deal, formatCurrency, formatDate, type Task } from '../lib/types';
import { Avatar } from './Avatar';
import { favoritPfad, useFavoriten } from './Favoriten';
import { IconArrowRight, IconPlus, IconSearch } from './Icons';
import { useStageLabel } from '../lib/stages';

const PER_TYPE = 5;
const DEBOUNCE_MS = 180;
const MIN_LENGTH = 2;

type Hit = {
  key: string;
  to: string;
  title: string;
  detail: string;
  befehl?: boolean;
  recht?: string;
};

type SuchTreffer = {
  art: 'firma' | 'kontakt' | 'geschaeft';
  rang: number;
  firma: {
    id: string;
    name: string;
    industry: string | null;
    city: string | null;
  } | null;
  kontakt: {
    id: string;
    firstName: string;
    lastName: string;
    jobTitle: string | null;
    company: { id: string; name: string } | null;
  } | null;
  geschaeft: {
    id: string;
    name: string;
    stage: Deal['stage'];
    amount: number | null;
    currency: string;
    company: { id: string; name: string } | null;
  } | null;
};

const ohneLeere = (teile: (string | null | undefined)[]) =>
  teile.filter((teil) => teil !== null && teil !== undefined && teil !== '');

type Beleg = {
  id: string;
  number: string | null;
  status: string;
  company: { id: string; name: string } | null;
  totals: { grossCents: number };
};

const BEFEHLE: Hit[] = [
  {
    key: 'neu-firma',
    to: '/firmen?neu',
    title: 'Neue Firma',
    detail: 'Anlegen',
    befehl: true,
    recht: 'company:write',
  },
  {
    key: 'neu-kontakt',
    to: '/kontakte?neu',
    title: 'Neuer Kontakt',
    detail: 'Anlegen',
    befehl: true,
    recht: 'contact:write',
  },
  {
    key: 'neu-geschaeft',
    to: '/geschaefte?neu',
    title: 'Neues Geschäft',
    detail: 'Anlegen',
    befehl: true,
    recht: 'deal:write',
  },
  {
    key: 'neu-aufgabe',
    to: '/aufgaben?neu',
    title: 'Neue Aufgabe',
    detail: 'Anlegen',
    befehl: true,
    recht: 'task:write',
  },
  {
    key: 'neu-angebot',
    to: '/angebote?neu',
    title: 'Neues Angebot',
    detail: 'Anlegen',
    befehl: true,
    recht: 'quote:write',
  },
  {
    key: 'neu-artikel',
    to: '/artikel?neu',
    title: 'Neuer Artikel',
    detail: 'Anlegen',
    befehl: true,
  },
  {
    key: 'gehe-uebersicht',
    to: '/',
    title: 'Übersicht',
    detail: 'Gehe zu',
    befehl: true,
  },
  {
    key: 'gehe-aufgaben',
    to: '/aufgaben',
    title: 'Aufgaben',
    detail: 'Gehe zu',
    befehl: true,
  },
  {
    key: 'gehe-kalender',
    to: '/kalender',
    title: 'Kalender',
    detail: 'Gehe zu',
    befehl: true,
  },
  {
    key: 'gehe-rechnungen',
    to: '/rechnungen',
    title: 'Rechnungen',
    detail: 'Gehe zu',
    befehl: true,
  },
  {
    key: 'gehe-op',
    to: '/offene-posten',
    title: 'Offene Posten',
    detail: 'Gehe zu',
    befehl: true,
  },
  {
    key: 'gehe-postfach',
    to: '/postfach',
    title: 'Postfach',
    detail: 'Gehe zu',
    befehl: true,
  },
  {
    key: 'gehe-einstellungen',
    to: '/einstellungen',
    title: 'Einstellungen',
    detail: 'Gehe zu',
    befehl: true,
  },
  {
    key: 'gehe-hilfe',
    to: '/hilfe',
    title: 'Hilfe und Handbuch',
    detail: 'Gehe zu',
    befehl: true,
  },
  {
    key: 'gehe-fehlerbehebung',
    to: '/hilfe/fehlerbehebung',
    title: 'Fehlerbehebung',
    detail: 'Gehe zu',
    befehl: true,
  },
];

const BEFEHL_ART: Partial<Record<string, ObjektArt>> = {
  'neu-firma': 'FIRMA',
  'neu-kontakt': 'KONTAKT',
  'neu-geschaeft': 'GESCHAEFT',
  'neu-aufgabe': 'AUFGABE',
  'neu-angebot': 'ANGEBOT',
  'gehe-aufgaben': 'AUFGABE',
};

const passt = passtZu;

const euro = (cents: number) =>
  (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

type Group = { label: string; hits: Hit[] };

const listVariables = (search: string, sortField: string) => ({
  search,
  limit: PER_TYPE,
  offset: 0,
  sortField,
  sortDirection: 'ASC',
  customFilters: null,
});

export const SearchPalette = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const stageLabel = useStageLabel();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');
  const [term, setTerm] = useState('');
  const [cursor, setCursor] = useState(0);
  const [wartendeAuswahl, setWartendeAuswahl] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(typed.trim()), DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [typed]);

  useEffect(() => {
    if (open) {
      setTyped('');
      setTerm('');
      setCursor(0);
      setWartendeAuswahl(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      document
        .querySelector('.palette__hit.is-active')
        ?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [cursor, open]);

  const skip = !open || term.length < MIN_LENGTH;

  const treffer = useQuery<{ suche: SuchTreffer[] }>(SUCHE, {
    variables: { text: term, limit: 10 },
    skip,
  });

  const tasks = useQuery<{ tasks: { items: Task[] } }>(TASKS, {
    variables: listVariables(term, 'dueDate'),
    skip,
  });
  const notizen = useQuery<{
    notizSuche: {
      id: string;
      body: string;
      createdAt: string;
      authorName: string;
      companyId: string | null;
      contactId: string | null;
      dealId: string | null;
    }[];
  }>(NOTIZ_SUCHE, { variables: { text: term, limit: PER_TYPE }, skip });

  const mails = useQuery<{
    mailSuche: {
      id: string;
      subject: string | null;
      fromAddress: string;
      fromName: string | null;
      sentAt: string;
      contactId: string | null;
      companyId: string | null;
    }[];
  }>(MAIL_SUCHE, { variables: { text: term, limit: PER_TYPE }, skip });

  const quotes = useQuery<{ quotes: Beleg[] }>(QUOTES, { skip });
  const invoices = useQuery<{ invoices: Beleg[] }>(INVOICES, { skip });

  const beleg = (pfad: string, b: Beleg): Hit => ({
    key: `${pfad}-${b.id}`,
    to: `/${pfad}/${b.id}`,
    title: b.number ?? 'Entwurf',
    detail: [b.company?.name, euro(b.totals.grossCents)]
      .filter((teil) => teil !== undefined && teil !== null)
      .join(' · '),
  });
  const belegPasst = (b: Beleg) =>
    passt(`${b.number ?? ''} ${b.company?.name ?? ''}`, term);

  const favoriten = useFavoriten(!open);
  const { can } = usePermissions();
  const einstellungen = useEinstellungen();
  const bez = useBezeichnung();
  const bezeichnungen = useBezeichnungen();
  const befehle = BEFEHLE.filter(
    (befehl) => befehl.recht === undefined || can(befehl.recht),
  ).map((befehl) => {
    const art = BEFEHL_ART[befehl.key];

    return art === undefined
      ? befehl
      : {
          ...befehl,
          title: bez(art, befehl.key.startsWith('neu-') ? 'neu' : 'mehrzahl'),
        };
  });

  const leer = term.length < MIN_LENGTH;
  const startGruppen: Group[] = !open
    ? []
    : [
        {
          label: 'Favoriten',
          hits: favoriten.slice(0, 8).map((f) => ({
            key: `favorit-${f.art}-${f.datensatzId}`,
            to: favoritPfad(f),
            title: f.titel,
            detail: bez(f.art),
          })),
        },
        {
          label: 'Zuletzt geöffnet',
          hits: zuletztGeoeffnet().map((b) => ({
            key: `zuletzt-${b.to}`,
            to: b.to,
            title: b.title,
            detail: artDesBesuchs(b, bezeichnungen),
          })),
        },
        { label: 'Befehle', hits: befehle },
      ].filter((group) => group.hits.length > 0);

  const groups: Group[] = leer
    ? startGruppen
    : [
        {
          label: 'Befehle',
          hits: befehle
            .filter((b) => passt(`${b.title} ${b.detail}`, term))
            .slice(0, 4),
        },
        {
          label: 'Einstellungen',
          hits: einstellungenFuer(einstellungen, term)
            .slice(0, 5)
            .map((eintrag) => ({
              key: `einstellung-${eintrag.to}-${eintrag.titel}`,
              to: eintrag.to,
              title: eintrag.titel,
              detail: eintrag.gruppe,
              befehl: true,
            })),
        },
        {
          label: 'Treffer',
          hits: (treffer.data?.suche ?? []).flatMap((t): Hit[] => {
            if (t.firma !== null) {
              return [
                {
                  key: `company-${t.firma.id}`,
                  to: `/firmen/${t.firma.id}`,
                  title: t.firma.name,
                  detail: [
                    bez('FIRMA'),
                    ...ohneLeere([t.firma.industry, t.firma.city]),
                  ].join(' · '),
                },
              ];
            }

            if (t.kontakt !== null) {
              return [
                {
                  key: `contact-${t.kontakt.id}`,
                  to: `/kontakte/${t.kontakt.id}`,
                  title: `${t.kontakt.firstName} ${t.kontakt.lastName}`,
                  detail: [
                    bez('KONTAKT'),
                    ...ohneLeere([t.kontakt.jobTitle, t.kontakt.company?.name]),
                  ].join(' · '),
                },
              ];
            }

            if (t.geschaeft !== null) {
              const geschaeft = t.geschaeft;

              return [
                {
                  key: `deal-${geschaeft.id}`,
                  to: `/geschaefte/${geschaeft.id}`,
                  title: geschaeft.name,
                  detail: [
                    bez('GESCHAEFT'),
                    ...ohneLeere([
                      geschaeft.company?.name,
                      stageLabel(geschaeft.stage),
                      geschaeft.amount === null
                        ? null
                        : formatCurrency(geschaeft.amount, geschaeft.currency),
                    ]),
                  ].join(' · '),
                },
              ];
            }

            return [];
          }),
        },
        {
          label: bez('AUFGABE', 'mehrzahl'),
          hits: (tasks.data?.tasks.items ?? []).map((task) => ({
            key: `task-${task.id}`,
            to:
              task.deal !== null
                ? `/geschaefte/${task.deal.id}`
                : task.contact !== null
                  ? `/kontakte/${task.contact.id}`
                  : task.company !== null
                    ? `/firmen/${task.company.id}`
                    : '/aufgaben',
            title: task.title,
            detail: [
              task.completedAt === null ? 'offen' : 'erledigt',
              task.dueDate === null ? null : formatDate(task.dueDate),
              task.deal?.name ?? task.company?.name ?? null,
            ]
              .filter((teil) => teil !== null)
              .join(' · '),
          })),
        },
        {
          label: 'Notizen',
          hits: (notizen.data?.notizSuche ?? []).map((notiz) => ({
            key: `notiz-${notiz.id}`,
            to:
              notiz.dealId !== null
                ? `/geschaefte/${notiz.dealId}`
                : notiz.contactId !== null
                  ? `/kontakte/${notiz.contactId}`
                  : `/firmen/${notiz.companyId ?? ''}`,
            title: ((klartext) =>
              klartext.length > 70 ? `${klartext.slice(0, 70)}…` : klartext)(
              alsKlartext(notiz.body),
            ),
            detail: `${notiz.authorName} · ${formatDate(notiz.createdAt)}`,
          })),
        },
        {
          label: 'E-Mails',
          hits: (mails.data?.mailSuche ?? []).map((mail) => ({
            key: `mail-${mail.id}`,
            to:
              mail.contactId !== null
                ? `/kontakte/${mail.contactId}`
                : mail.companyId !== null
                  ? `/firmen/${mail.companyId}`
                  : '/postfach',
            title: mail.subject ?? '(ohne Betreff)',
            detail: `${mail.fromName ?? mail.fromAddress} · ${formatDate(mail.sentAt)}`,
          })),
        },
        {
          label: bez('ANGEBOT', 'mehrzahl'),
          hits: (quotes.data?.quotes ?? [])
            .filter(belegPasst)
            .slice(0, PER_TYPE)
            .map((b) => beleg('angebote', b)),
        },
        {
          label: 'Rechnungen',
          hits: (invoices.data?.invoices ?? [])
            .filter(belegPasst)
            .slice(0, PER_TYPE)
            .map((b) => beleg('rechnungen', b)),
        },
        {
          label: 'Fehlerbehebung',
          hits: FEHLERFAELLE.filter((fall) => fehlerfallPasst(fall, term))
            .slice(0, 3)
            .map((fall) => ({
              key: `fehler-${fall.id}`,
              to: abhilfePfad(fall.id),
              title: fall.titel,
              detail: 'Fehlerbehebung',
              befehl: true,
            })),
        },
      ].filter((group) => group.hits.length > 0);

  const flat = groups.flatMap((group) => group.hits);
  const searching =
    treffer.loading ||
    tasks.loading ||
    notizen.loading ||
    mails.loading ||
    quotes.loading ||
    invoices.loading;

  const go = (hit: Hit) => {
    onClose();
    navigate(hit.to);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((current) =>
        Math.min(current + 1, Math.max(flat.length - 1, 0)),
      );
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      if (typed.trim() !== term) {
        event.preventDefault();
        setTerm(typed.trim());
        setCursor(0);
        setWartendeAuswahl(true);

        return;
      }

      if (searching) {
        event.preventDefault();
        setWartendeAuswahl(true);

        return;
      }

      const hit = flat[cursor];

      if (hit !== undefined) {
        go(hit);
      }
    } else if (event.key === 'Escape') {
      onClose();
    }
  };

  useEffect(() => {
    if (!wartendeAuswahl || searching) {
      return;
    }

    setWartendeAuswahl(false);
    const hit = flat[cursor];

    if (hit !== undefined) {
      go(hit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wartendeAuswahl, searching]);

  if (!open) {
    return null;
  }

  const ansage = leer
    ? `${String(flat.length)} Vorschläge`
    : searching
      ? 'Wird gesucht …'
      : flat.length === 0
        ? `Nichts gefunden für „${term}“.`
        : flat.length === 1
          ? '1 Treffer'
          : `${String(flat.length)} Treffer`;

  return (
    <PaletteDialog onClose={onClose}>
      {(listId) => {
        const optionId = (index: number) => `${listId}-${String(index)}`;
        let position = -1;

        return (
          <>
            <div className="palette__input-row">
              <IconSearch size={18} />
              <input
                ref={inputRef}
                className="palette__input"
                placeholder="Suchen oder Befehl eingeben…"
                value={typed}
                maxLength={200}
                onChange={(event) => {
                  setTyped(event.target.value);
                  setCursor(0);
                  setWartendeAuswahl(false);
                }}
                onKeyDown={onKeyDown}
                role="combobox"
                aria-label="Suchbegriff"
                aria-autocomplete="list"
                aria-expanded={flat.length > 0}
                aria-controls={listId}
                aria-activedescendant={
                  flat[cursor] === undefined ? undefined : optionId(cursor)
                }
              />
              <kbd className="palette__hint" aria-hidden="true">
                Esc
              </kbd>
            </div>

            <div
              className="palette__results"
              id={listId}
              role="listbox"
              aria-label="Treffer"
              hidden={flat.length === 0 && !(term.length >= MIN_LENGTH)}
            >
              {groups.map((group, gruppe) => (
                <div
                  key={group.label}
                  className="palette__group"
                  role="group"
                  aria-labelledby={`${listId}-g${String(gruppe)}`}
                >
                  <div
                    id={`${listId}-g${String(gruppe)}`}
                    className="palette__group-label"
                    role="presentation"
                  >
                    {group.label}
                  </div>
                  {group.hits.map((hit) => {
                    position += 1;

                    const index = position;

                    return (
                      <div
                        key={hit.key}
                        id={optionId(index)}
                        role="option"
                        aria-selected={index === cursor}
                        className={
                          index === cursor
                            ? 'palette__hit is-active'
                            : 'palette__hit'
                        }
                        onMouseEnter={() => setCursor(index)}
                        onClick={() => go(hit)}
                      >
                        {hit.befehl === true ? (
                          <span className="palette__befehl" aria-hidden="true">
                            {hit.detail === 'Anlegen' ? (
                              <IconPlus size={16} />
                            ) : (
                              <IconArrowRight size={16} />
                            )}
                          </span>
                        ) : (
                          <Avatar name={hit.title} size="sm" />
                        )}
                        <span className="palette__hit-text">
                          <span className="palette__hit-title">
                            {hit.title}
                          </span>
                          {hit.detail !== '' && (
                            <span className="palette__hit-detail">
                              {hit.detail}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {!searching && !leer && flat.length === 0 && (
              <p className="palette__empty" aria-hidden="true">
                Nichts gefunden für „{term}“.
              </p>
            )}

            <div className="visually-hidden" role="status" aria-live="polite">
              {ansage}
            </div>
          </>
        );
      }}
    </PaletteDialog>
  );
};

const PaletteDialog = ({
  onClose,
  children,
}: {
  onClose: () => void;
  children: (listId: string) => ReactNode;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listId = useId();

  useEffect(() => {
    const vorher =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = dialogRef.current;

    if (dialog !== null && !dialog.open) {
      dialog.showModal();
    }

    return () => {
      if (dialog?.open === true) {
        dialog.close();
      }

      if (vorher !== null && vorher.isConnected) {
        vorher.focus();
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="palette__dialog"
      aria-label="Suche"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        className="palette__backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
      >
        <div className="palette">{children(listId)}</div>
      </div>
    </dialog>
  );
};
