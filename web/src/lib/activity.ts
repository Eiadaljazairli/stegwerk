import { stageLabelNow } from './stages';
import { DEAL_STAGE_LABELS, type DealStage } from './types';

export type FieldChange = {
  label: string;
  from: string;
  to: string;
};

export type FeedItem =
  | {
      kind: 'note';
      id: string;
      noteId: string;
      at: string;
      author: string;
      body: string;
      bearbeitet: { am: string; von: string } | null;
      herkunft?: string;
    }
  | {
      kind: 'change';
      id: string;
      at: string;
      author: string;
      created: boolean;
      changes: FieldChange[];
      herkunft?: string;
    }
  | {
      kind: 'attachment';
      id: string;
      at: string;
      author: string;
      attachmentId: string;
      name: string;
      sizeBytes: number;
    };

const FIELD_LABELS: Record<string, string> = {
  name: 'Bezeichnung',
  firstName: 'Vorname',
  lastName: 'Nachname',
  email: 'E-Mail',
  phone: 'Telefon',
  weitereEmails: 'Weitere E-Mails',
  weitereTelefone: 'Weitere Telefonnummern',
  jobTitle: 'Position',
  domain: 'Domain',
  zweitdomains: 'Weitere Domains',
  website: 'Website',
  linkedin: 'LinkedIn',
  industry: 'Branche',
  employeeCount: 'Mitarbeiter',
  annualRevenue: 'Jahresumsatz',
  city: 'Stadt',
  country: 'Land',
  amount: 'Betrag',
  currency: 'Währung',
  stage: 'Phase',
  closeDate: 'Abschluss',
  companyId: 'Firma',
  contactId: 'Kontakt',
  primaryContactId: 'Hauptkontakt',
  beteiligte: 'Beteiligte',
  dealId: 'Geschäft',
  dueDate: 'Fällig',
  completedAt: 'Erledigt',
  assigneeId: 'Zuständig',
  title: 'Titel',
  street: 'Straße',
  postalCode: 'PLZ',
  invoiceEmail: 'Rechnungs-E-Mail',
  vertretung: 'Vertreten durch',
  registergericht: 'Registergericht',
  registernummer: 'Registernummer',
  ustIdNr: 'USt-IdNr.',
  logo: 'Logo',
  probability: 'Wahrscheinlichkeit',
  lostReason: 'Verlustgrund',
  serienmail: 'Serienmail gesendet',
  ownerId: 'Verantwortlich',
  description: 'Beschreibung',
};

const HIDDEN_FIELDS = new Set([
  'updatedAt',
  'createdAt',
  'customFields',
  'searchVector',
]);

const isIsoDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}(?:T|$)/u.test(value);

export const describeValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') {
    return 'leer';
  }

  if (typeof value === 'boolean') {
    return value ? 'Ja' : 'Nein';
  }

  if (typeof value === 'number') {
    return value.toLocaleString('de-DE');
  }

  if (typeof value === 'string') {
    const upper = value.toUpperCase() as DealStage;

    if (upper in DEAL_STAGE_LABELS) {
      return stageLabelNow(upper);
    }

    if (isIsoDate(value)) {
      const [year, month, day] = value.slice(0, 10).split('-');

      return `${day}.${month}.${year}`;
    }

    return value;
  }

  return 'geändert';
};

export const describeChanges = (
  changes: Record<string, [unknown, unknown]> | null,
): FieldChange[] => {
  if (changes === null) {
    return [];
  }

  return Object.entries(changes)
    .filter(([field]) => !HIDDEN_FIELDS.has(field))
    .map(([field, pair]) => ({
      label: FIELD_LABELS[field] ?? field,
      from: describeValue(pair[0]),
      to: describeValue(pair[1]),
    }))
    .filter((change) => change.from !== change.to);
};

export type AuditEntry = {
  id: string;
  action: string;
  actorName: string;
  createdAt: string;
  changes: string | null;
  herkunft?: string | null;
};

const HERKUNFT_TEXT: Record<string, string> = {
  impressum: 'Aus dem Impressum der Website übernommen',
  website: 'Von der Website der Firma geholt',
};

export const herkunftText = (
  herkunft: string | null | undefined,
): string | undefined =>
  herkunft == null ? undefined : (HERKUNFT_TEXT[herkunft] ?? undefined);

export type FeedNote = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
  bearbeitetAm?: string | null;
  bearbeitetVon?: string | null;
  herkunft?: string;
};

export const parseChanges = (
  raw: string | null,
): Record<string, [unknown, unknown]> | null => {
  if (raw === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    return typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, [unknown, unknown]>)
      : null;
  } catch {
    return null;
  }
};

export type FeedAttachment = {
  id: string;
  name: string;
  sizeBytes: number;
  createdAt: string;
  uploaderName: string;
};

export const buildFeed = (
  notes: FeedNote[],
  entries: AuditEntry[],
  attachments: FeedAttachment[] = [],
): FeedItem[] => {
  const items: FeedItem[] = notes.map((note) => ({
    kind: 'note',
    id: `note-${note.id}`,
    noteId: note.id,
    at: note.createdAt,
    author: note.authorName,
    body: note.body,
    bearbeitet:
      note.bearbeitetAm == null
        ? null
        : { am: note.bearbeitetAm, von: note.bearbeitetVon ?? 'Unbekannt' },
    ...(note.herkunft === undefined ? {} : { herkunft: note.herkunft }),
  }));

  for (const entry of entries) {
    const created = entry.action.toLowerCase() === 'created';
    const changes = describeChanges(parseChanges(entry.changes));

    if (!created && changes.length === 0) {
      continue;
    }

    items.push({
      kind: 'change',
      id: `audit-${entry.id}`,
      at: entry.createdAt,
      author: entry.actorName,
      created,
      changes,
      ...(herkunftText(entry.herkunft) === undefined
        ? {}
        : { herkunft: herkunftText(entry.herkunft) }),
    });
  }

  for (const anhang of attachments) {
    items.push({
      kind: 'attachment',
      id: `attachment-${anhang.id}`,
      at: anhang.createdAt,
      author: anhang.uploaderName,
      attachmentId: anhang.id,
      name: anhang.name,
      sizeBytes: anhang.sizeBytes,
    });
  }

  return items.sort(
    (left, right) => new Date(right.at).getTime() - new Date(left.at).getTime(),
  );
};

export type FeedArt = 'alle' | FeedItem['kind'];

export const FEED_ARTEN: { wert: FeedArt; label: string }[] = [
  { wert: 'alle', label: 'Alles' },
  { wert: 'note', label: 'Notizen' },
  { wert: 'attachment', label: 'Dateien' },
  { wert: 'change', label: 'Änderungen' },
];

export const filterFeed = (feed: FeedItem[], art: FeedArt): FeedItem[] =>
  art === 'alle' ? feed : feed.filter((item) => item.kind === art);

const FEED_SPEICHER = 'stegwerk:zeitleiste';

export const gemerkteFeedArt = (): FeedArt => {
  try {
    const wert = window.localStorage.getItem(FEED_SPEICHER);

    return FEED_ARTEN.some((art) => art.wert === wert)
      ? (wert as FeedArt)
      : 'alle';
  } catch {
    return 'alle';
  }
};

export const merkeFeedArt = (art: FeedArt): void => {
  try {
    window.localStorage.setItem(FEED_SPEICHER, art);
  } catch {}
};
