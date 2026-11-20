import { type BuchhaltungUebertragung, formatDate } from './types';

export type Anbieter = 'lexware' | 'sevdesk';

export const ANBIETER: { wert: Anbieter; name: string }[] = [
  { wert: 'lexware', name: 'Lexware Office' },
  { wert: 'sevdesk', name: 'sevDesk' },
];

export const anbieterName = (anbieter: string): string =>
  ANBIETER.find((eintrag) => eintrag.wert === anbieter)?.name ??
  'die Buchhaltung';

export type Anleitung = {
  schritte: string[];
  link: { href: string; text: string } | null;
  feld: string;
  hinweis: string;
};

export const ANLEITUNG: Record<Anbieter, Anleitung> = {
  lexware: {
    schritte: [
      'Melden Sie sich bei Lexware Office an.',
      'Öffnen Sie die Seite für die Public API und erzeugen Sie dort Ihren privaten API-Schlüssel.',
      'Lässt Lexware Office Sie die Rechte des Schlüssels wählen, geben Sie ihm Zugriff auf Kontakte, Belege, Dateien und Zahlungen. Fehlt eines davon, lehnt Stegwerk den Schlüssel beim Verbinden ab oder die Übertragung scheitert mit einem Hinweis.',
      'Kopieren Sie den Schlüssel vollständig und fügen Sie ihn unten ein.',
    ],
    link: {
      href: 'https://app.lexware.de/addons/public-api',
      text: 'app.lexware.de/addons/public-api',
    },
    feld: 'API-Schlüssel aus Lexware Office',
    hinweis:
      'Wer den Schlüssel in Lexware Office neu erzeugt oder löscht, beendet damit diese Verbindung; dann hier neu verbinden.',
  },
  sevdesk: {
    schritte: [
      'Melden Sie sich bei sevDesk mit einem Administrator-Zugang an. Jeder Administrator hat einen eigenen API-Token.',
      'Sie finden ihn in den Einstellungen unter „Benutzer“ bei Ihrem Benutzer: eine Zeichenkette aus 32 Zeichen (0–9 und a–f).',
      'Kopieren Sie den Token vollständig und fügen Sie ihn unten ein.',
    ],
    link: null,
    feld: 'API-Token aus sevDesk',
    hinweis:
      'Der Token gilt, solange der Benutzer in sevDesk besteht. Erzeugt jemand dort einen neuen Token, ist der alte ungültig; dann hier neu verbinden.',
  },
};

export type StandText = {
  text: string;
  ton: 'gut' | 'laeuft' | 'fehler';
  wiederholbar: boolean;
};

export const standText = (
  uebertragung: BuchhaltungUebertragung | null | undefined,
): StandText | null => {
  if (uebertragung === null || uebertragung === undefined) {
    return null;
  }

  const name = anbieterName(uebertragung.anbieter);

  switch (uebertragung.status) {
    case 'uebertragen':
      return {
        text: `An ${name} übertragen am ${formatDate(uebertragung.uebertragenAm)}${
          uebertragung.zuPruefen
            ? '. Der Beleg liegt dort unter „Zu prüfen“: bitte die Buchungskategorie wählen.'
            : '.'
        }${uebertragung.bezahltGemeldet ? ` Als bezahlt gemeldet von ${name}.` : ''}`,
        ton: 'gut',
        wiederholbar: false,
      };
    case 'fehler':
      return {
        text: `Nicht an ${name} übertragen: ${uebertragung.letzterFehler ?? 'unbekannter Fehler.'}`,
        ton: 'fehler',
        wiederholbar: true,
      };
    default:
      return {
        text:
          uebertragung.fehlerArt === 'anmeldung'
            ? `Wartet: ${name} lehnt den API-Schlüssel ab. Nach dem Neu-Verbinden geht die Rechnung von selbst hinaus.`
            : uebertragung.letzterFehler !== null && uebertragung.versuche > 0
              ? `Wird an ${name} übertragen. Letzter Versuch: ${uebertragung.letzterFehler}`
              : `Wird an ${name} übertragen …`,
        ton: uebertragung.fehlerArt === 'anmeldung' ? 'fehler' : 'laeuft',
        wiederholbar: false,
      };
  }
};

export const buchhaltungHinweis = (
  verbindung: {
    anbieter: string;
    anmeldungFehler: string | null;
    fehlerZeigen: boolean;
  } | null,
  pfad: string,
): { text: string; meldung: string; link: string; linkText: string } | null => {
  if (
    verbindung === null ||
    !verbindung.fehlerZeigen ||
    verbindung.anmeldungFehler === null ||
    pfad.startsWith('/buchhaltung')
  ) {
    return null;
  }

  return {
    text: `Rechnungen gehen nicht mehr an ${anbieterName(verbindung.anbieter)}: ${verbindung.anmeldungFehler}`,
    meldung: verbindung.anmeldungFehler,
    link: '/buchhaltung',
    linkText: 'Buchhaltung neu verbinden',
  };
};
