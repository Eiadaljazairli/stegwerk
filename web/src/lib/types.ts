import { type Kontaktweg } from './kontaktwege';

export const DEAL_STAGES = [
  'LEAD',
  'QUALIFIED',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  LEAD: 'Kontakt',
  QUALIFIED: 'Qualifiziert',
  PROPOSAL: 'Angebot',
  NEGOTIATION: 'Verhandlung',
  WON: 'Gewonnen',
  LOST: 'Verloren',
};

export type Company = {
  customFields?: CustomFieldValues;
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  employeeCount: number | null;
  annualRevenue?: number | null;
  street?: string | null;
  postalCode?: string | null;
  invoiceEmail?: string | null;
  phone?: string | null;
  email?: string | null;
  vertretung?: string | null;
  registergericht?: string | null;
  registernummer?: string | null;
  ustIdNr?: string | null;
  zweitdomains?: string[];
  website?: string | null;
  linkedin?: string | null;
  city: string | null;
  country: string | null;
  owner?: { id: string; firstName: string; lastName: string } | null;
};

export type Contact = {
  customFields?: CustomFieldValues;
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  linkedin?: string | null;
  companyId?: string | null;
  company: { id: string; name: string } | null;
  owner?: { id: string; firstName: string; lastName: string } | null;
};

export type Deal = {
  customFields?: CustomFieldValues;
  id: string;
  name: string;
  amount: number | null;
  currency: string;
  stage: DealStage;
  pipelineId?: string | null;
  closeDate: string | null;
  probability?: number | null;
  lostReason?: string | null;
  companyId?: string | null;
  company: { id: string; name: string } | null;
  owner?: { id: string; firstName: string; lastName: string } | null;
};

export const formatCurrency = (
  amount: number | null,
  currency = 'EUR',
): string => {
  if (amount === null) {
    return '—';
  }

  const nachkomma = Number.isInteger(amount) ? 0 : 2;

  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    minimumFractionDigits: nachkomma,
    maximumFractionDigits: nachkomma,
  }).format(amount);
};

export type Note = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
  bearbeitetAm?: string | null;
  bearbeitetVon?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  company?: { id: string; name: string } | null;
  contact?: { id: string; firstName: string; lastName: string } | null;
  deal?: { id: string; name: string } | null;
};

export type RailAppointment = Pick<
  Appointment,
  | 'id'
  | 'title'
  | 'startDate'
  | 'startTime'
  | 'endDate'
  | 'minutes'
  | 'allDay'
  | 'location'
  | 'videoLink'
  | 'cancelledAt'
> & {
  geschwaerzt?: boolean;
};

export type CompanyDetail = Company & {
  customFields: CustomFieldValues;
  logo?: string | null;
  logoQuelle?: string | null;
  annualRevenue: number | null;
  createdAt: string;
  parentCompanyId: string | null;
  parentCompany: { id: string; name: string } | null;
  tochterfirmen: { id: string; name: string; city: string | null }[];
  contacts: Pick<
    Contact,
    'id' | 'firstName' | 'lastName' | 'email' | 'jobTitle'
  >[];
  deals: Pick<
    Deal,
    'id' | 'name' | 'amount' | 'currency' | 'stage' | 'pipelineId' | 'closeDate'
  >[];
  notes: Note[];
  tasks: Task[];
  appointments: RailAppointment[];
  kontaktNotizen: (Note & { contactId: string | null })[];
  kontaktAufgaben: Task[];
  kontaktTermine: (RailAppointment & { contactId: string | null })[];
};

export type ContactDetail = Contact & {
  customFields: CustomFieldValues;
  createdAt: string;
  unzustellbarSeit?: string | null;
  unzustellbarGrund?: string | null;
  weitereEmails: Kontaktweg[];
  weitereTelefone: Kontaktweg[];
  deals: (Pick<
    Deal,
    'id' | 'name' | 'amount' | 'currency' | 'stage' | 'pipelineId' | 'closeDate'
  > & { primaryContactId: string | null })[];
  beteiligungen: { id: string; dealId: string; rolle: string | null }[];
  verteiler?: { id: string; name: string }[];
  notes: Note[];
  tasks: Task[];
  appointments: RailAppointment[];
};

export type DealDetail = Deal & {
  customFields: CustomFieldValues;
  createdAt: string;
  letzteAktivitaet: string;
  primaryContactId?: string | null;
  primaryContact: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
  } | null;
  beteiligte: DealBeteiligter[];
  notes: Note[];
  tasks: Task[];
  appointments: RailAppointment[];
  beteiligtenTermine?: RailAppointment[];
};

export type DealBeteiligter = {
  id: string;
  contactId: string;
  rolle: string | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    jobTitle?: string | null;
  } | null;
};

export const stageBadgeClass = (stage: DealStage): string => {
  if (stage === 'WON') {
    return 'badge badge--won';
  }

  if (stage === 'LOST') {
    return 'badge badge--lost';
  }

  return 'badge badge--active';
};

export const MEMBERSHIP_ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const;

export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const MEMBERSHIP_ROLE_LABELS: Record<MembershipRole, string> = {
  OWNER: 'Inhaber',
  ADMIN: 'Administrator',
  MEMBER: 'Mitglied',
};

export type Membership = {
  id: string;
  role: MembershipRole;
  roleId: string | null;
  roleRef: { id: string; name: string } | null;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
};

export type WorkspaceMembership = {
  id: string;
  role: MembershipRole;
  workspace: {
    id: string;
    name: string;
    slug: string;
    zweiFaktorPflicht?: boolean;
  };
};

export type Invitation = {
  id: string;
  email: string;
  role: MembershipRole;
  expiresAt: string;
};

export type AufgabenStatus = 'offen' | 'in_arbeit' | 'erledigt';

export const AUFGABEN_STATUS_LABEL: Record<AufgabenStatus, string> = {
  offen: 'Offen',
  in_arbeit: 'In Arbeit',
  erledigt: 'Erledigt',
};

export const formatFaellig = (task: {
  dueDate: string | null;
  dueTime?: string | null;
}): string =>
  task.dueDate === null
    ? '—'
    : task.dueTime === null || task.dueTime === undefined
      ? formatDate(task.dueDate)
      : `${formatDate(task.dueDate)}, ${task.dueTime} Uhr`;

export type Task = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  dueTime?: string | null;
  status?: AufgabenStatus;
  inArbeitSeit?: string | null;
  completedAt: string | null;
  isOverdue: boolean;
  assigneeId: string;
  assigneeName: string;
  customFields?: CustomFieldValues;
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  company: { id: string; name: string } | null;
  contact: { id: string; firstName: string; lastName: string } | null;
  deal: { id: string; name: string } | null;
};

export const formatDate = (isoDate: string | null): string =>
  isoDate === null
    ? '—'
    : new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(
        new Date(isoDate),
      );

export const taskLink = (task: Task): { label: string; to: string } | null => {
  if (task.deal !== null) {
    return { label: task.deal.name, to: `/geschaefte/${task.deal.id}` };
  }

  if (task.contact !== null) {
    return {
      label: `${task.contact.firstName} ${task.contact.lastName}`,
      to: `/kontakte/${task.contact.id}`,
    };
  }

  if (task.company !== null) {
    return { label: task.company.name, to: `/firmen/${task.company.id}` };
  }

  return null;
};

export const IMPORT_ENTITIES = [
  'COMPANY',
  'CONTACT',
  'DEAL',
  'NOTE',
  'TASK',
  'PRODUCT',
] as const;

export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

export const IMPORT_ENTITY_LABELS: Record<ImportEntity, string> = {
  COMPANY: 'Firmen',
  CONTACT: 'Kontakte',
  DEAL: 'Geschäfte',
  NOTE: 'Notizen',
  TASK: 'Aufgaben',
  PRODUCT: 'Artikel',
};

export type ImportableField = {
  name: string;
  label: string;
  required: boolean;
  optionen?: { wert: string; label: string }[] | null;
};

export type ImportReport = {
  dryRun: boolean;
  created: number;
  updated: number;
  rejected: number;
  rejections: { row: number; reason: string; zellen: string[] }[];
};

export type BillingPlanId = 'TRIAL' | 'STARTER' | 'PROFESSIONAL';

export type SubscriptionStatusId =
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED';

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatusId, string> =
  {
    TRIALING: 'Testphase',
    ACTIVE: 'Aktiv',
    PAST_DUE: 'Zahlung offen',
    CANCELED: 'Gekündigt',
  };

export type Entitlement = {
  plan: BillingPlanId;
  status: SubscriptionStatusId;
  seats: number;
  usedSeats: number;
  canWrite: boolean;
  readOnly: boolean;
  trialDaysLeft: number | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  billingConfigured: boolean;
};

export type BillingPlanView = {
  plan: BillingPlanId;
  name: string;
  monthlyPricePerSeat: number;
  yearlyPricePerSeat: number;
  maxSeats: number | null;
  purchasable: boolean;
};

export const formatCents = (cents: number): string =>
  new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

export type LegalEntity = {
  configured: boolean;
  companyName: string | null;
  legalForm: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  representative: string | null;
  registerEntry: string | null;
  vatId: string | null;
};

export type Sicherheit = {
  massnahmen: string[];
  hosting: string | null;
  sicherung: string | null;
  unterauftragsverarbeiter: string[];
  unterauftragStand: string;
  loeschfristTage: number;
  loeschfristAktiv: boolean;
  vertragGeprueft: boolean;
};

export type PrivacyFacts = {
  reviewed: boolean;
  hosting: string | null;
  privacyContact: string | null;
  supervisoryAuthority: string | null;
  billing: boolean;
  errorReporting: boolean;
  outgoingMail: boolean;
  mailboxes: boolean;
  retentionDays: number;
  retentionEnabled: boolean;
  protokollAenderungenMonate: number;
  protokollSicherheitMonate: number;
};

export type DpaBlock = {
  kind: 'text' | 'list' | 'gap';
  text: string | null;
  items: string[] | null;
  variable: string | null;
};

export type DpaSection = {
  label: string;
  title: string;
  blocks: DpaBlock[];
};

export type DpaDocument = {
  title: string;
  reviewed: boolean;
  processorName: string | null;
  sections: DpaSection[];
  annexes: DpaSection[];
};

export type Attachment = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
};

export type CustomField = {
  id: string;
  entity: 'COMPANY' | 'CONTACT' | 'DEAL' | 'TASK';
  key: string;
  label: string;
  type:
    | 'TEXT'
    | 'NUMBER'
    | 'DATE'
    | 'BOOLEAN'
    | 'SELECT'
    | 'MULTI_SELECT'
    | 'CURRENCY'
    | 'URL'
    | 'EMAIL'
    | 'PHONE'
    | 'RATING'
    | 'ADDRESS'
    | 'LINKS'
    | 'RELATION';
  options: string[];
  farben: { option: string; farbe: string }[];
  waehrung: string | null;
  eindeutig: boolean;
  required: boolean;
  position: number;
  archivedAt: string | null;
  pflichtAbPhase?: string | null;
  nachkommastellen?: number | null;
  zahlformat?: string | null;
  datumsformat?: string | null;
  optionLabels?: Record<string, string>;
  beschreibung?: string | null;
  standardwert?: string | null;
  gruppeId?: string | null;
  zielEntity?: CustomField['entity'] | null;
  mehrere?: boolean;
  gegenfeldId?: string | null;
  gegenseite?: boolean;
};

export type CustomFieldGroup = {
  id: string;
  entity: CustomField['entity'];
  name: string;
  position: number;
  eingeklappt: boolean;
};

export type Adresse = {
  strasse?: string;
  zusatz?: string;
  plz?: string;
  ort?: string;
  bundesland?: string;
  land?: string;
};

export type Link = { url: string; label?: string };

export type CustomFieldValues = Record<
  string,
  string | number | boolean | string[] | Adresse | Link[] | null
>;

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomField['type'], string> = {
  TEXT: 'Text',
  NUMBER: 'Zahl',
  DATE: 'Datum',
  BOOLEAN: 'Ja / Nein',
  SELECT: 'Auswahl',
  MULTI_SELECT: 'Mehrfachauswahl',
  CURRENCY: 'Betrag',
  URL: 'Link',
  EMAIL: 'E-Mail',
  PHONE: 'Telefon',
  RATING: 'Bewertung',
  ADDRESS: 'Anschrift',
  LINKS: 'Links',
  RELATION: 'Verknüpfung',
};

export const OPTION_FARBEN: { wert: string; label: string }[] = [
  { wert: 'grau', label: 'Grau' },
  { wert: 'rot', label: 'Rot' },
  { wert: 'orange', label: 'Orange' },
  { wert: 'gelb', label: 'Gelb' },
  { wert: 'gruen', label: 'Grün' },
  { wert: 'blau', label: 'Blau' },
  { wert: 'lila', label: 'Lila' },
  { wert: 'pink', label: 'Pink' },
];

export const optionFarbe = (field: CustomField, option: string): string =>
  field.farben.find((entry) => entry.option === option)?.farbe ?? 'grau';

export const formatBetrag = (amount: number, currency = 'EUR'): string =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(
    amount,
  );

export const EINDEUTIG_MOEGLICH: CustomField['type'][] = [
  'TEXT',
  'NUMBER',
  'DATE',
  'SELECT',
  'CURRENCY',
  'URL',
  'EMAIL',
  'PHONE',
];

export const CUSTOM_FIELD_ENTITY_LABELS: Record<CustomField['entity'], string> =
  {
    COMPANY: 'Firmen',
    CONTACT: 'Kontakte',
    DEAL: 'Geschäfte',
    TASK: 'Aufgaben',
  };

export type CustomFieldFilterOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'CONTAINS'
  | 'GREATER_THAN'
  | 'LESS_THAN'
  | 'IS_EMPTY'
  | 'IS_NOT_EMPTY'
  | 'CONTAINS_ANY'
  | 'CONTAINS_NONE'
  | 'NOT_CONTAINS'
  | 'STARTS_WITH'
  | 'IN_LAST_DAYS'
  | 'IN_NEXT_DAYS'
  | 'OLDER_THAN_DAYS';

export type CustomFieldFilter = {
  key: string;
  operator: CustomFieldFilterOperator;
  value?: string;
  gruppe?: number;
};

export type FilterVerknuepfung = 'UND' | 'ODER';

export type ListenGruppe = {
  wert: string | null;
  label: string | null;
  nichtSichtbar: boolean;
  anzahl: number;
  summen: { gruppe: string | null; summe: number }[];
};

export const CUSTOM_FILTER_OPERATOR_LABELS: Record<
  CustomFieldFilterOperator,
  string
> = {
  EQUALS: 'ist',
  NOT_EQUALS: 'ist nicht',
  CONTAINS: 'enthält',
  GREATER_THAN: 'größer als',
  LESS_THAN: 'kleiner als',
  IS_EMPTY: 'ist leer',
  IS_NOT_EMPTY: 'ist ausgefüllt',
  CONTAINS_ANY: 'enthält eines von',
  CONTAINS_NONE: 'enthält nicht',
  NOT_CONTAINS: 'enthält nicht',
  STARTS_WITH: 'beginnt mit',
  IN_LAST_DAYS: 'in den letzten',
  IN_NEXT_DAYS: 'in den nächsten',
  OLDER_THAN_DAYS: 'älter als',
};

export const TAGE_OPERATOREN: CustomFieldFilterOperator[] = [
  'IN_LAST_DAYS',
  'IN_NEXT_DAYS',
  'OLDER_THAN_DAYS',
];

const TEXT_OPERATORS: CustomFieldFilterOperator[] = [
  'EQUALS',
  'NOT_EQUALS',
  'CONTAINS',
  'NOT_CONTAINS',
  'STARTS_WITH',
  'IS_EMPTY',
  'IS_NOT_EMPTY',
];

const NUMBER_OPERATORS: CustomFieldFilterOperator[] = [
  'EQUALS',
  'NOT_EQUALS',
  'GREATER_THAN',
  'LESS_THAN',
  'IS_EMPTY',
  'IS_NOT_EMPTY',
];

export const OPERATORS_FOR_TYPE: Record<
  CustomField['type'],
  CustomFieldFilterOperator[]
> = {
  TEXT: TEXT_OPERATORS,
  URL: TEXT_OPERATORS,
  EMAIL: TEXT_OPERATORS,
  PHONE: TEXT_OPERATORS,
  SELECT: ['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'IS_EMPTY', 'IS_NOT_EMPTY'],
  MULTI_SELECT: ['CONTAINS_ANY', 'CONTAINS_NONE', 'IS_EMPTY', 'IS_NOT_EMPTY'],
  NUMBER: NUMBER_OPERATORS,
  CURRENCY: NUMBER_OPERATORS,
  RATING: NUMBER_OPERATORS,
  DATE: [
    'IN_LAST_DAYS',
    'IN_NEXT_DAYS',
    'OLDER_THAN_DAYS',
    'EQUALS',
    'NOT_EQUALS',
    'GREATER_THAN',
    'LESS_THAN',
    'IS_EMPTY',
    'IS_NOT_EMPTY',
  ],
  BOOLEAN: ['EQUALS', 'IS_EMPTY', 'IS_NOT_EMPTY'],
  ADDRESS: ['CONTAINS', 'NOT_CONTAINS', 'IS_EMPTY', 'IS_NOT_EMPTY'],
  LINKS: ['CONTAINS', 'NOT_CONTAINS', 'IS_EMPTY', 'IS_NOT_EMPTY'],
  RELATION: ['EQUALS', 'NOT_EQUALS', 'IS_EMPTY', 'IS_NOT_EMPTY'],
};

export const OPERATORS_WITHOUT_VALUE: CustomFieldFilterOperator[] = [
  'IS_EMPTY',
  'IS_NOT_EMPTY',
];

export type SavedView = {
  id: string;
  entity: CustomField['entity'];
  name: string;
  createdById: string;
  search: string | null;
  sortField: string | null;
  sortDirection: string | null;
  customFilters: CustomFieldFilter[];
  columns: string[];
  filters: Record<string, string | number | boolean | null>;
  privat: boolean;
  isDefault: boolean;
  gruppierung: string | null;
  filterVerknuepfung: string | null;
  darstellung: string | null;
  gruppenFeld?: string | null;
  datumFeld?: string | null;
};

export const QUOTE_STATUSES = [
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'DECLINED',
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: 'Entwurf',
  SENT: 'Versendet',
  ACCEPTED: 'Angenommen',
  DECLINED: 'Abgelehnt',
};

export const quoteStatusBadgeClass = (status: QuoteStatus): string =>
  `badge badge--quote-${status.toLowerCase()}`;

export const TAX_RATES = [0, 7, 19] as const;

export const QUOTE_UNITS = [
  'Stück',
  'Stunde',
  'Tag',
  'Pauschal',
  'Monat',
  'Jahr',
  'km',
  'kg',
  'm',
  'm²',
] as const;

export type Product = {
  id: string;
  name: string;
  articleNumber: string | null;
  description: string | null;
  unitPriceCents: number;
  unit: string;
  taxRatePercent: number;
  active: boolean;
};

export type QuoteLine = {
  id: string;
  productId: string | null;
  position: number;
  name: string;
  articleNumber: string | null;
  description: string | null;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  discountPercent: number;
  taxRatePercent: number;
};

export type QuoteTaxGroup = {
  ratePercent: number;
  netCents: number;
  taxCents: number;
};

export type QuoteTotals = {
  netCents: number;
  taxCents: number;
  grossCents: number;
  taxGroups: QuoteTaxGroup[];
};

export type QuoteSummary = {
  id: string;
  number: string;
  status: QuoteStatus;
  issuedOn: string;
  validUntil: string;
  sentAt: string | null;
  company: { id: string; name: string } | null;
  totals: Pick<QuoteTotals, 'grossCents'>;
};

export type TaxExemption =
  | 'REVERSE_CHARGE'
  | 'REVERSE_CHARGE_EU'
  | 'INNERGEMEINSCHAFTLICH'
  | 'AUSFUHR'
  | 'STEUERFREI'
  | 'NULLSATZ';

export type Quote = {
  id: string;
  number: string;
  status: QuoteStatus;
  currency: string;
  smallBusiness: boolean;
  taxExemption: TaxExemption | null;
  taxExemptionNote: string | null;
  recipientVatId: string | null;
  recipientAddress: string | null;
  issuedOn: string;
  validUntil: string;
  introText: string | null;
  closingText: string | null;
  sentAt: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  decidedOnline: boolean;
  publicLink: string | null;
  company: { id: string; name: string } | null;
  contact: { id: string; firstName: string; lastName: string } | null;
  deal: { id: string; name: string } | null;
  lines: QuoteLine[];
  totals: QuoteTotals;
};

export const formatMoney = (cents: number, currency = 'EUR'): string =>
  new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);

export const parseMoneyToCents = (value: string): number | null => {
  const normalised = value.trim().replace(/\./gu, '').replace(',', '.');
  const parsed = Number.parseFloat(normalised);

  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
};

export const parseQuantity = (value: string): number | null => {
  const parsed = Number.parseFloat(value.trim().replace(',', '.'));

  return Number.isFinite(parsed) ? Math.round(parsed * 1000) / 1000 : null;
};

export type Letterhead = {
  id: string;
  companyName: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  representative: string | null;
  registerEntry: string | null;
  taxNumber: string | null;
  vatId: string | null;
  bankName: string | null;
  iban: string | null;
  bic: string | null;
  datevBeraternummer: string | null;
  datevMandantennummer: string | null;
  datevKontenrahmen: string;
  smallBusiness: boolean;
  defaultValidityDays: number;
  defaultIntroText: string | null;
  defaultClosingText: string | null;
};

export type LetterheadGap = { field: string; label: string };

export const PERMISSION_GROUPS: {
  label: string;
  permissions: { key: string; label: string }[];
}[] = [
  {
    label: 'Firmen',
    permissions: [
      { key: 'company:view', label: 'Sehen' },
      { key: 'company:write', label: 'Anlegen und ändern' },
      { key: 'company:delete', label: 'Löschen' },
    ],
  },
  {
    label: 'Kontakte',
    permissions: [
      { key: 'contact:view', label: 'Sehen' },
      { key: 'contact:write', label: 'Anlegen und ändern' },
      { key: 'contact:delete', label: 'Löschen' },
    ],
  },
  {
    label: 'Geschäfte',
    permissions: [
      { key: 'deal:view', label: 'Sehen' },
      { key: 'deal:write', label: 'Anlegen und ändern' },
      { key: 'deal:delete', label: 'Löschen' },
    ],
  },
  {
    label: 'Angebote',
    permissions: [
      { key: 'quote:view', label: 'Sehen' },
      { key: 'quote:write', label: 'Anlegen und ändern' },
      { key: 'quote:send', label: 'Versenden' },
      { key: 'quote:delete', label: 'Löschen' },
    ],
  },
  {
    label: 'Rechnungen',
    permissions: [
      { key: 'invoice:view', label: 'Sehen' },
      { key: 'invoice:write', label: 'Entwürfe anlegen und ändern' },
      { key: 'invoice:issue', label: 'Stellen, stornieren und mahnen' },
    ],
  },
  {
    label: 'Aufgaben',
    permissions: [
      { key: 'task:view', label: 'Sehen' },
      { key: 'task:write', label: 'Anlegen und ändern' },
    ],
  },
  {
    label: 'Termine',
    permissions: [
      { key: 'appointment:view', label: 'Kalender sehen' },
      { key: 'appointment:write', label: 'Anlegen, ändern und absagen' },
    ],
  },
  {
    label: 'Arbeitsbereich',
    permissions: [
      { key: 'workspace:members', label: 'Team verwalten' },
      { key: 'workspace:roles', label: 'Rollen verwalten' },
      { key: 'workspace:fields', label: 'Eigene Felder verwalten' },
      { key: 'workspace:letterhead', label: 'Briefkopf ändern' },
      { key: 'workspace:billing', label: 'Abrechnung' },
      { key: 'workspace:export', label: 'Daten exportieren' },
      { key: 'workspace:campaigns', label: 'Serienmails verschicken' },
      { key: 'workspace:privacy', label: 'DSGVO-Werkzeuge' },
      { key: 'workspace:api', label: 'API-Schlüssel und Webhooks' },
      { key: 'workspace:audit', label: 'Protokoll des Bereichs sehen' },
      { key: 'workspace:ki', label: 'Vorschläge der KI freigeben' },
      {
        key: 'workspace:postfaecher',
        label: 'Gemeinsame Postfächer einrichten',
      },
    ],
  },
];

export type Role = {
  id: string;
  name: string;
  description: string | null;
  templateKey: string | null;
  everything: boolean;
  permissions: string[];
  sichtbarkeit: Sichtbarkeit;
  feldrechte?: FeldrechtEintrag[];
  isSystem: boolean;
  memberCount: number;
};

export type Sichtweite = 'alle' | 'eigene';

export type Sichtbarkeit = {
  company: Sichtweite;
  contact: Sichtweite;
  deal: Sichtweite;
};

export const SICHTBARKEITS_ARTEN: {
  key: keyof Sichtbarkeit;
  label: string;
}[] = [
  { key: 'company', label: 'Firmen' },
  { key: 'contact', label: 'Kontakte' },
  { key: 'deal', label: 'Geschäfte' },
];

export type FeldrechtEintrag = { feld: string; recht: 'verborgen' | 'lesen' };

export type MyPermissions = {
  everything: boolean;
  permissions: string[];
  feldrechte?: FeldrechtEintrag[];
};

export type Mailbox = {
  id: string;
  art: 'persoenlich' | 'gemeinsam';
  bezeichnung: string | null;
  haupt: boolean;
  getrennt?: boolean;
  darfVerwalten?: boolean;
  mitglieder?: string[];
  host: string;
  port: number;
  secure: boolean;
  username: string;
  folder: string;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  active: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  messageCount: number;
  sichtbarkeit: 'alles' | 'kopf' | 'privat';
  gesendetOrdner: string | null;
  oauthAnbieter: string | null;
  ausschlussIntern: boolean;
  ausschlussMassenpost: boolean;
  ausschlussGruppen: boolean;
  ausschlussFreemail: boolean;
  ausschlussGmailKategorien?: boolean;
  istGmail?: boolean;
  fehlerArt?: string | null;
  fehlversuche?: number;
  fehlerZeigen?: boolean;
  aliase: string[];
  anhaengeAutomatisch: boolean;
  anhaengeBisMb: number;
};

export type MailMessage = {
  id: string;
  subject: string | null;
  snippet: string | null;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string;
  threadKey: string;
  outgoing: boolean;
  sentAt: string;
  mailboxId?: string;
  inhaltVerborgen?: boolean | null;
  anhangAnzahl?: number | null;
};

export type MailAnhang = {
  index: number;
  name: string;
  mimeType: string;
  groesse: number;
  gespeichertId: string | null;
};

export type MailInhalt = {
  id: string;
  inhalt: string | null;
  zitat: string | null;
  inhaltVerborgen: boolean;
  anhaenge: MailAnhang[];
};

export type PostfachGespraech = {
  threadKey: string;
  nachrichtId: string;
  betreff: string | null;
  vonAdresse: string;
  vonName: string | null;
  ausschnitt: string | null;
  ausgehend: boolean;
  zuletzt: string;
  anzahl: number;
  offen: boolean;
  zugewiesenAnId: string | null;
  contactId: string | null;
  companyId: string | null;
};

export type MailboxSyncResult = {
  stored: number;
  matched: number;
  unfiled: number;
};

export const INVOICE_STATUSES = [
  'DRAFT',
  'ISSUED',
  'PAID',
  'CANCELLED',
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: 'Entwurf',
  ISSUED: 'Gestellt',
  PAID: 'Bezahlt',
  CANCELLED: 'Storniert',
};

export const invoiceStatusBadgeClass = (status: InvoiceStatus): string =>
  `badge badge--invoice-${status.toLowerCase()}`;

export const PAYMENT_TERM_DAYS = [7, 14, 30, 60] as const;

export type InvoiceLine = {
  id: string;
  position: number;
  name: string;
  articleNumber: string | null;
  description: string | null;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  discountPercent: number;
  taxRatePercent: number;
};

export type Invoice = {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  quoteId: string | null;
  correctsInvoiceId: string | null;
  companyId: string | null;
  company: { id: string; name: string } | null;
  contactId: string | null;
  contact: { id: string; firstName: string; lastName: string } | null;
  recipientAddress: string | null;
  buyerReference: string | null;
  issuedOn: string;
  serviceDate: string | null;
  dueOn: string | null;
  paymentTermDays: number;
  xrechnungLuecken?: string[];
  zugferdLuecken?: string[];
  seriesId?: string | null;
  templateSeries?: InvoiceSeries | null;
  buchhaltung?: BuchhaltungUebertragung | null;
  introText: string | null;
  closingText: string | null;
  smallBusiness: boolean;
  taxExemption: TaxExemption | null;
  taxExemptionNote: string | null;
  recipientVatId: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  lines: InvoiceLine[];
  totals: {
    netCents: number;
    taxCents: number;
    grossCents: number;
    taxGroups: { ratePercent: number; netCents: number; taxCents: number }[];
  };
};

export type InvoiceGap = { field: string; label: string };

export const DUNNING_LEVELS = [
  'NONE',
  'DUE',
  'REMINDER',
  'FIRST',
  'FINAL',
] as const;

export type DunningLevel = (typeof DUNNING_LEVELS)[number];

export const DUNNING_LABELS: Record<DunningLevel, string> = {
  NONE: 'Nicht fällig',
  DUE: 'Fällig',
  REMINDER: 'Erinnerung raus',
  FIRST: '1. Mahnung raus',
  FINAL: 'Letzte Mahnung raus',
};

export const NEXT_STEP_LABELS: Record<string, string> = {
  REMINDER: 'Zahlungserinnerung',
  FIRST: '1. Mahnung',
  FINAL: 'Letzte Mahnung',
};

export type OpenItem = {
  invoice: {
    id: string;
    number: string | null;
    issuedOn: string;
    dueOn: string | null;
    company: { id: string; name: string } | null;
    totals: { grossCents: number };
  };
  level: DunningLevel;
  nextStep: DunningLevel | null;
  nextStepOn: string | null;
  daysOverdue: number;
  inDefault: boolean;
  interestCents: number;
  lateFeeCents: number;
  recipientEmail: string | null;
};

export type ReminderPreview = {
  level: DunningLevel;
  subject: string;
  body: string;
  to: string | null;
};

export type InvoiceReminder = {
  id: string;
  level: DunningLevel;
  sentOn: string;
  sentTo: string | null;
  daysOverdue: number;
  interestCents: number;
  lateFeeCents: number;
};

export const ATTENDEE_STATUSES = [
  'NEEDS_ACTION',
  'ACCEPTED',
  'DECLINED',
  'TENTATIVE',
] as const;

export type AttendeeStatusId = (typeof ATTENDEE_STATUSES)[number];

export const ATTENDEE_STATUS_LABELS: Record<AttendeeStatusId, string> = {
  NEEDS_ACTION: 'Offen',
  ACCEPTED: 'Zugesagt',
  DECLINED: 'Abgesagt',
  TENTATIVE: 'Unter Vorbehalt',
};

export type AppointmentAttendee = {
  id: string;
  name: string;
  email: string | null;
  status: AttendeeStatusId;
  statusLabel: string;
  contactId: string | null;
  userId: string | null;
};

export type Appointment = {
  id: string;
  seriesId: string;
  occurrenceOn: string | null;
  serieId?: string | null;
  serieDatum?: string | null;
  recurrence: string | null;
  recurrenceText: string | null;
  attendeeSummary: string;
  attendees: AppointmentAttendee[];
  title: string;
  description: string | null;
  location: string | null;
  videoLink?: string | null;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  minutes: number;
  allDay: boolean;
  ownerId: string;
  ownerName: string;
  remindMinutesBefore: number | null;
  cancelledAt: string | null;
  quelle: string;
  privat?: boolean;
  geschwaerzt?: boolean;
  eingeladenAm: string | null;
  company: { id: string; name: string } | null;
  contact: { id: string; firstName: string; lastName: string } | null;
  deal: { id: string; name: string } | null;
};

export type AppointmentConflict = {
  minutes: number;
  appointment: {
    id: string;
    title: string;
    startDate: string;
    startTime: string;
    endTime: string;
  };
};

export const REMINDER_CHOICES: { value: number | null; label: string }[] = [
  { value: null, label: 'Keine Erinnerung' },
  { value: 10, label: '10 Minuten vorher' },
  { value: 30, label: '30 Minuten vorher' },
  { value: 60, label: '1 Stunde vorher' },
  { value: 1440, label: '1 Tag vorher' },
];

export const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${String(minutes)} Min`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest === 0
    ? `${String(hours)} Std`
    : `${String(hours)} Std ${String(rest)} Min`;
};

export type ApiKey = {
  id: string;
  name: string;
  anzeige: string;
  permissions: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  createdByName: string | null;
  schreibmodus: 'direkt' | 'vorschlag';
};

export type InvoiceSeriesInterval = 'monthly' | 'quarterly' | 'yearly';

export type InvoiceSeries = {
  id: string;
  interval: InvoiceSeriesInterval;
  nextRunOn: string;
  endOn: string | null;
  active: boolean;
  sourceInvoiceId: string;
  sourceInvoice?: {
    id: string;
    number: string | null;
    company: { id: string; name: string } | null;
    totals: { grossCents: number };
  };
};

export const INTERVAL_LABELS: Record<InvoiceSeriesInterval, string> = {
  monthly: 'Monatlich',
  quarterly: 'Vierteljährlich',
  yearly: 'Jährlich',
};

export type ListenSumme = { gruppe: string | null; summe: number };

export type KalenderVerbindung = {
  id: string;
  anbieter: string;
  serverUrl: string;
  benutzer: string;
  kalenderUrl: string | null;
  kalenderName: string | null;
  letzterSyncAm: string | null;
  letzterFehler: string | null;
  sichtbarkeit?: 'alles' | 'belegt';
  fehlerArt?: string | null;
  fehlversuche?: number;
  fehlerZeigen?: boolean;
};

export type BuchhaltungVerbindung = {
  id: string;
  anbieter: string;
  kontoName: string | null;
  automatisch: boolean;
  zahlungenAbgleichen: boolean;
  anmeldungFehler: string | null;
  anmeldungFehlerAm: string | null;
  fehlerZeigen: boolean;
  createdAt: string;
  wartend?: number;
  fehlerhaft?: number;
  nichtUebertragen?: number;
};

export type BuchhaltungUebertragung = {
  id: string;
  invoiceId: string;
  anbieter: string;
  status: string;
  externeBelegId: string | null;
  zuPruefen: boolean;
  versuche: number;
  letzterFehler: string | null;
  fehlerArt: string | null;
  uebertragenAm: string | null;
  bezahltGemeldet: boolean;
  updatedAt: string;
};

export type Verteiler = {
  id: string;
  name: string;
  beschreibung: string | null;
  anzahl: number;
  createdAt: string;
  updatedAt: string;
};

export type VerteilerMitglied = {
  hinzugefuegtAm: string;
  abgemeldet: boolean;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    company: { id: string; name: string } | null;
  };
};
