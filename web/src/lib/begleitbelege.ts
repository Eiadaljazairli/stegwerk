import { type QuoteStatus } from './types';

export type BegleitbelegArt = 'AUFTRAGSBESTAETIGUNG' | 'LIEFERSCHEIN';

export type BegleitbelegStatus = 'GESTELLT' | 'STORNIERT';

export const BEGLEITBELEG_ART_LABELS: Record<BegleitbelegArt, string> = {
  AUFTRAGSBESTAETIGUNG: 'Auftragsbestätigung',
  LIEFERSCHEIN: 'Lieferschein',
};

export const BEGLEITBELEG_DATEI: Record<BegleitbelegArt, string> = {
  AUFTRAGSBESTAETIGUNG: 'Auftragsbestaetigung',
  LIEFERSCHEIN: 'Lieferschein',
};

export type BegleitbelegKurz = {
  id: string;
  art: BegleitbelegArt;
  number: string;
  status: BegleitbelegStatus;
  stornoVonId: string | null;
  issuedOn: string;
  liefertermin: string | null;
  angebotId: string;
  currency: string;
  angebot: { id: string; number: string };
  stornoVon: { id: string; number: string } | null;
  company: { id: string; name: string } | null;
  totals: { grossCents: number } | null;
};

export type BegleitbelegPosition = {
  id: string;
  angebotsPositionId: string | null;
  position: number;
  name: string;
  articleNumber: string | null;
  description: string | null;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  discountPercent: number;
  taxRatePercent: number;
  restOffen: number | null;
};

export type Begleitbeleg = {
  id: string;
  art: BegleitbelegArt;
  number: string;
  status: BegleitbelegStatus;
  stornoVonId: string | null;
  stornoGrund: string | null;
  storniertAm: string | null;
  angebotId: string;
  auftragsbestaetigungId: string | null;
  recipientAddress: string | null;
  lieferadresse: string | null;
  issuedOn: string;
  liefertermin: string | null;
  introText: string | null;
  closingText: string | null;
  currency: string;
  kontaktName: string | null;
  createdAt: string;
  angebot: {
    id: string;
    number: string;
    issuedOn: string;
    status: QuoteStatus;
  };
  contact: {
    id: string;
    email: string | null;
    firstName: string;
    lastName: string;
  } | null;
  auftragsbestaetigung: { id: string; number: string } | null;
  stornoVon: { id: string; number: string } | null;
  company: { id: string; name: string } | null;
  deal: { id: string; name: string } | null;
  positionen: BegleitbelegPosition[];
  totals: { netCents: number; taxCents: number; grossCents: number } | null;
};

export type LieferstandZeile = {
  angebotsPositionId: string;
  position: number;
  name: string;
  articleNumber: string | null;
  unit: string;
  bestellt: number;
  geliefert: number;
  offen: number;
};

export const begleitbelegTitel = (beleg: {
  art: BegleitbelegArt;
  stornoVonId: string | null;
}): string =>
  beleg.stornoVonId === null
    ? BEGLEITBELEG_ART_LABELS[beleg.art]
    : `Stornierung ${BEGLEITBELEG_ART_LABELS[beleg.art]}`;

export const begleitbelegBadge = (beleg: {
  status: BegleitbelegStatus;
  stornoVonId: string | null;
}): { text: string; className: string } =>
  beleg.stornoVonId !== null
    ? { text: 'Storno', className: 'badge badge--invoice-draft' }
    : beleg.status === 'STORNIERT'
      ? { text: 'Storniert', className: 'badge badge--invoice-cancelled' }
      : { text: 'Gestellt', className: 'badge badge--invoice-issued' };

export const formatMenge = (menge: number): string =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(menge);
