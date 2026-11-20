import { type BoardFeld } from './recordBoard';
import { QUOTE_STATUS_LABELS, type QuoteStatus } from './types';

export type AngebotsSchritt = 'senden' | 'annehmen' | 'ablehnen';

export const ANGEBOTS_STATUS_FELD: BoardFeld = {
  key: 'std:status',
  label: 'Status',
  art: 'auswahl',
  optionen: [
    { wert: 'DRAFT', label: QUOTE_STATUS_LABELS.DRAFT, farbe: 'grau' },
    { wert: 'SENT', label: QUOTE_STATUS_LABELS.SENT, farbe: 'blau' },
    { wert: 'ACCEPTED', label: QUOTE_STATUS_LABELS.ACCEPTED, farbe: 'gruen' },
    { wert: 'DECLINED', label: QUOTE_STATUS_LABELS.DECLINED, farbe: 'rot' },
  ],
  ohneWert: null,
};

export const angebotsSchritt = (
  von: QuoteStatus,
  nach: string,
  rechte: { senden: boolean; aendern: boolean },
): AngebotsSchritt | null => {
  if (von === 'DRAFT' && nach === 'SENT') {
    return rechte.senden ? 'senden' : null;
  }

  if (von === 'SENT' && (nach === 'ACCEPTED' || nach === 'DECLINED')) {
    return rechte.aendern
      ? nach === 'ACCEPTED'
        ? 'annehmen'
        : 'ablehnen'
      : null;
  }

  return null;
};

export const angebotsSchrittVerboten = (
  von: QuoteStatus,
  nach: string,
  rechte: { senden: boolean; aendern: boolean },
): string => {
  if (von === 'DRAFT' && nach === 'SENT') {
    return 'Ihre Rolle darf Angebote nicht versenden.';
  }

  if (von === 'SENT' && (nach === 'ACCEPTED' || nach === 'DECLINED')) {
    return 'Ihre Rolle darf die Antwort auf ein Angebot nicht eintragen.';
  }

  if (von === 'DRAFT') {
    return rechte.senden
      ? 'Ein Entwurf wird erst versendet, dann beantwortet.'
      : 'Ein Entwurf wird erst versendet; das darf Ihre Rolle nicht.';
  }

  return von === 'SENT'
    ? 'Ein versendetes Angebot lässt sich nicht zurückholen. Für eine neue Fassung kopieren Sie es.'
    : 'Die Antwort des Kunden lässt sich nicht mehr ändern.';
};

export const angebotsSchrittFrage = (
  schritt: AngebotsSchritt,
  nummer: string,
): { titel: string; folge: string; knopf: string } => {
  switch (schritt) {
    case 'senden':
      return {
        titel: `Angebot ${nummer} als versendet markieren?`,
        folge:
          'Danach lässt sich nichts mehr daran ändern. Für eine neue Fassung kopieren Sie das Angebot.',
        knopf: 'Als versendet markieren',
      };
    case 'annehmen':
      return {
        titel: `Angebot ${nummer} als angenommen eintragen?`,
        folge: 'Der Eintrag lässt sich danach nicht mehr ändern.',
        knopf: 'Als angenommen eintragen',
      };
    case 'ablehnen':
      return {
        titel: `Angebot ${nummer} als abgelehnt eintragen?`,
        folge: 'Der Eintrag lässt sich danach nicht mehr ändern.',
        knopf: 'Als abgelehnt eintragen',
      };
  }
};
