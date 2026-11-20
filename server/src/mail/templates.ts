import { huelle, sicher } from './layout';
import { type FehlerArt } from '../mailboxes/abruf-fehler';
import { type Mail } from './mail.service';

export const invitationMail = (
  to: string,
  inviterName: string,
  workspaceName: string,
  url: string,
): Mail => ({
  to,
  subject: `${inviterName} lädt Sie zu ${workspaceName} ein`,
  text: [
    `${inviterName} hat Sie eingeladen, in Stegwerk mit ${workspaceName} zu arbeiten.`,
    '',
    'Einladung annehmen:',
    url,
    '',
    'Der Link ist sieben Tage gültig und kann nur einmal verwendet werden.',
    '',
    'Wenn Sie diese Einladung nicht erwartet haben, ignorieren Sie diese',
    'Nachricht. Ohne den Link passiert nichts.',
  ].join('\n'),
  html: huelle({
    vorschau: `${inviterName} möchte mit Ihnen in ${workspaceName} arbeiten.`,
    ueberschrift: `Einladung zu ${sicher(workspaceName)}`,
    absaetze: [
      `<strong>${sicher(inviterName)}</strong> hat Sie eingeladen, in Stegwerk mit <strong>${sicher(workspaceName)}</strong> zu arbeiten.`,
    ],
    knopf: { text: 'Einladung annehmen', url },
    nachsatz: [
      'Der Link ist sieben Tage gültig und kann nur einmal verwendet werden.',
      'Wenn Sie diese Einladung nicht erwartet haben, ignorieren Sie diese Nachricht. Ohne den Link passiert nichts.',
    ],
  }),
});

export const passwordResetMail = (to: string, url: string): Mail => ({
  to,
  subject: 'Passwort zurücksetzen',
  text: [
    'Sie haben angefordert, Ihr Stegwerk-Passwort zurückzusetzen.',
    '',
    'Neues Passwort festlegen:',
    url,
    '',
    'Der Link ist eine Stunde gültig und kann nur einmal verwendet werden.',
    '',
    'Wenn Sie das nicht waren, ignorieren Sie diese Nachricht — Ihr Passwort',
    'bleibt unverändert. Wir empfehlen aber, es zu ändern, falls Sie diese',
    'Nachricht öfter erhalten.',
  ].join('\n'),
  html: huelle({
    vorschau: 'Ein Link, um ein neues Passwort festzulegen.',
    ueberschrift: 'Passwort zurücksetzen',
    absaetze: ['Sie haben angefordert, Ihr Stegwerk-Passwort zurückzusetzen.'],
    knopf: { text: 'Neues Passwort festlegen', url },
    nachsatz: [
      'Der Link ist eine Stunde gültig und kann nur einmal verwendet werden.',
      'Wenn Sie das nicht waren, ignorieren Sie diese Nachricht — Ihr Passwort bleibt unverändert. Wir empfehlen aber, es zu ändern, falls Sie diese Nachricht öfter erhalten.',
    ],
  }),
});

export const emailVerificationMail = (to: string, url: string): Mail => ({
  to,
  subject: 'Bestätigen Sie Ihre E-Mail-Adresse',
  text: [
    'Diese Adresse wurde für ein Stegwerk-Konto angegeben. Bestätigen Sie',
    'sie, damit Sie Einladungen zu Arbeitsbereichen annehmen können.',
    '',
    'Adresse bestätigen:',
    url,
    '',
    'Der Link ist 24 Stunden gültig, kann nur einmal verwendet werden und',
    'wirkt nur in dem Browser, in dem Sie bei diesem Konto angemeldet sind.',
    '',
    'Wenn Sie sich nicht angemeldet haben, klicken Sie den Link nicht. Dann',
    'hat jemand anderes Ihre Adresse angegeben, und ohne die Bestätigung',
    'kommt dieses Konto an keinen Arbeitsbereich. Sie können uns das gern',
    'melden.',
  ].join('\n'),
  html: huelle({
    vorschau: 'Ein Klick, und Ihre Adresse gehört bestätigt zu Ihrem Konto.',
    ueberschrift: 'Bestätigen Sie Ihre E-Mail-Adresse',
    absaetze: [
      `Diese Adresse wurde für ein Stegwerk-Konto angegeben. Bestätigen Sie sie, damit Sie Einladungen zu Arbeitsbereichen annehmen können.`,
    ],
    knopf: { text: 'Adresse bestätigen', url },
    nachsatz: [
      'Der Link ist 24 Stunden gültig, kann nur einmal verwendet werden und wirkt nur in dem Browser, in dem Sie bei diesem Konto angemeldet sind.',
      'Wenn Sie sich nicht angemeldet haben, klicken Sie den Link nicht. Dann hat jemand anderes Ihre Adresse angegeben, und ohne die Bestätigung kommt dieses Konto an keinen Arbeitsbereich. Sie können uns das gern melden.',
    ],
  }),
});

export const passwordChangedMail = (to: string, nurAndere = false): Mail => ({
  to,
  subject: 'Ihr Passwort wurde geändert',
  text: [
    nurAndere
      ? 'Ihr Stegwerk-Passwort wurde soeben geändert. Alle anderen\nAnmeldungen wurden abgemeldet.'
      : 'Ihr Stegwerk-Passwort wurde soeben geändert. Alle bestehenden\nAnmeldungen wurden abgemeldet.',
    '',
    'Wenn Sie das nicht waren, setzen Sie Ihr Passwort sofort zurück und',
    'melden Sie sich bei uns.',
  ].join('\n'),
  html: huelle({
    vorschau:
      'Ihr Passwort wurde geändert — falls Sie das nicht waren, lesen Sie weiter.',
    ueberschrift: 'Ihr Passwort wurde geändert',
    absaetze: [
      `Ihr Stegwerk-Passwort wurde soeben geändert. Alle ${nurAndere ? 'anderen' : 'bestehenden'} Anmeldungen wurden abgemeldet.`,
    ],
    nachsatz: [
      'Wenn Sie das nicht waren, setzen Sie Ihr Passwort sofort zurück und melden Sie sich bei uns.',
    ],
  }),
});

const kontoHinweis = (
  to: string,
  betreff: string,
  absaetze: string[],
  nachsatz: string[],
  knopf?: { text: string; url: string },
): Mail => ({
  to,
  subject: betreff,
  text: [
    ...absaetze,
    ...(knopf === undefined ? [] : ['', `${knopf.text}:`, knopf.url]),
    '',
    ...nachsatz,
  ].join('\n'),
  html: huelle({
    vorschau: absaetze[0] ?? betreff,
    ueberschrift: betreff,
    absaetze: absaetze.map(sicher),
    ...(knopf === undefined ? {} : { knopf }),
    nachsatz: nachsatz.map(sicher),
  }),
});

const WENN_NICHT_SIE =
  'Wenn Sie das nicht waren, ändern Sie sofort Ihr Passwort und melden Sie unter Einstellungen → Sicherheit alle anderen Geräte ab.';

export const neueAnmeldungMail = (
  to: string,
  geraet: string,
  ipGekuerzt: string,
  zeit: string,
): Mail =>
  kontoHinweis(
    to,
    'Anmeldung von einem neuen Gerät',
    [
      `Ihr Stegwerk-Konto wurde soeben auf einem Gerät angemeldet, das wir bisher nicht kannten: ${geraet}, Netz ${ipGekuerzt}, ${zeit}.`,
      'Waren Sie das, ist nichts zu tun.',
    ],
    [WENN_NICHT_SIE],
  );

export const kontoGesperrtMail = (to: string, zweiterFaktor: boolean): Mail =>
  kontoHinweis(
    to,
    'Anmeldung vorübergehend gesperrt',
    [
      zweiterFaktor
        ? 'Für Ihr Stegwerk-Konto wurde zehnmal ein falscher Zwei-Faktor-Code eingegeben — mit Ihrem richtigen Passwort. Die Anmeldung ist deshalb für 15 Minuten gesperrt.'
        : 'Für Ihr Stegwerk-Konto wurde zehnmal ein falsches Passwort eingegeben. Die Anmeldung ist deshalb für 15 Minuten gesperrt.',
      'Waren Sie das, warten Sie die Viertelstunde ab oder setzen Sie Ihr Passwort zurück.',
    ],
    [
      zweiterFaktor
        ? 'Waren Sie das nicht, kennt jemand Ihr Passwort: ändern Sie es sofort und melden Sie unter Einstellungen → Sicherheit alle anderen Geräte ab.'
        : 'Waren Sie das nicht, versucht jemand, Ihr Passwort zu erraten. Ein langes, nur hier benutztes Passwort und die Zwei-Faktor-Anmeldung halten ihn auf.',
    ],
  );

export const zweiFaktorAusMail = (to: string): Mail =>
  kontoHinweis(
    to,
    'Zwei-Faktor-Anmeldung ausgeschaltet',
    [
      'Für Ihr Stegwerk-Konto ist die Zwei-Faktor-Anmeldung jetzt ausgeschaltet. Zum Anmelden genügt wieder das Passwort.',
    ],
    [WENN_NICHT_SIE],
  );

export const anmeldungVerknuepftMail = (to: string, anbieter: string): Mail =>
  kontoHinweis(
    to,
    `Anmelden mit ${anbieter} eingerichtet`,
    [
      `Ihr Stegwerk-Konto lässt sich ab jetzt auch mit ${anbieter} anmelden. Trennen können Sie das unter Team → Mein Konto → Anmelden mit Google und Microsoft.`,
    ],
    [WENN_NICHT_SIE],
  );

export const zweiFaktorZurueckgesetztMail = (to: string, durch: string): Mail =>
  kontoHinweis(
    to,
    'Ihre Zwei-Faktor-Anmeldung wurde zurückgesetzt',
    [
      `${durch} hat die Zwei-Faktor-Anmeldung Ihres Kontos zurückgesetzt, etwa weil Ihr Telefon fehlte.`,
      'Melden Sie sich mit Ihrem Passwort an und richten Sie sie unter Einstellungen → Sicherheit neu ein.',
    ],
    [WENN_NICHT_SIE],
  );

export const emailAendernMail = (to: string, url: string): Mail =>
  kontoHinweis(
    to,
    'Neue Anmelde-Adresse bestätigen',
    [
      'Diese Adresse soll künftig zum Anmelden bei Stegwerk dienen. Bestätigen Sie, dass sie Ihnen gehört.',
    ],
    [
      'Der Link ist 24 Stunden gültig. Bis dahin gilt weiter die bisherige Adresse.',
      'Haben Sie das nicht veranlasst, ignorieren Sie diese Nachricht.',
    ],
    { text: 'Adresse bestätigen', url },
  );

export const emailGeaendertMail = (to: string, neu: string): Mail =>
  kontoHinweis(
    to,
    'Ihre Anmelde-Adresse wurde geändert',
    [
      `Ihr Stegwerk-Konto meldet sich ab sofort mit ${neu} an, nicht mehr mit dieser Adresse.`,
    ],
    [
      'Wenn Sie das nicht waren, antworten Sie auf diese Nachricht oder melden Sie sich beim Betreiber: die alte Adresse lässt sich nur dort zurückholen.',
    ],
  );

export const kontoGeloeschtMail = (to: string): Mail =>
  kontoHinweis(
    to,
    'Ihr Stegwerk-Konto wurde gelöscht',
    [
      'Ihr Konto ist gelöscht. Name, Adresse und Anmeldedaten sind entfernt; Einträge, die Sie in Arbeitsbereichen angelegt haben, gehören den Bereichen und bleiben dort ohne Ihren Namen.',
    ],
    [
      'Diese Nachricht ist die letzte, die Sie von uns zu diesem Konto bekommen.',
    ],
  );

export const erwaehnungMail = (
  to: string,
  von: string,
  wo: 'Notiz' | 'Aufgabe',
  akte: string | null,
  url: string,
): Mail =>
  kontoHinweis(
    to,
    `${von} hat Sie erwähnt`,
    [
      akte === null
        ? `${von} hat Sie in ${wo === 'Notiz' ? 'einer Notiz' : 'einer Aufgabe'} erwähnt.`
        : `${von} hat Sie in ${wo === 'Notiz' ? 'einer Notiz' : 'einer Aufgabe'} zu „${akte}“ erwähnt.`,
    ],
    [
      'Diese Mail lässt sich in Stegwerk unter „Team“ bei den Erinnerungen abschalten; in der App sehen Sie Erwähnungen weiterhin unter der Glocke.',
    ],
    { text: 'In Stegwerk öffnen', url },
  );

export const verlaengerungMail = (
  to: string,
  bereich: string,
  eingabe: {
    datum: string;
    tarif: string;
    plaetze: number;
    betragNetto: string | null;
  },
  url: string,
): Mail =>
  kontoHinweis(
    to,
    `Ihr Jahresabo verlängert sich am ${eingabe.datum}`,
    [
      `Das Jahresabo für „${bereich}“ (Tarif ${eingabe.tarif}, ${String(eingabe.plaetze)} ${eingabe.plaetze === 1 ? 'Platz' : 'Plätze'}) verlängert sich am ${eingabe.datum} automatisch um ein Jahr.`,
      ...(eingabe.betragNetto === null
        ? []
        : [
            `Nach der aktuellen Preisliste sind das ${eingabe.betragNetto} netto, zuzüglich der gesetzlichen Umsatzsteuer.`,
          ]),
      'Ist alles richtig, müssen Sie nichts tun. Plätze ändern oder zum Ende der Laufzeit kündigen können Sie unter „Abrechnung“ im Kundenportal.',
    ],
    [
      'Sie bekommen diese Nachricht, weil Sie Inhaber dieses Arbeitsbereichs sind.',
    ],
    { text: 'Abrechnung öffnen', url },
  );

export const testphaseEndetMail = (
  to: string,
  bereich: string,
  tage: number,
  url: string,
): Mail =>
  kontoHinweis(
    to,
    tage <= 1
      ? 'Ihre Testphase endet morgen'
      : `Ihre Testphase endet in ${String(tage)} Tagen`,
    [
      `Die kostenlose Testphase für „${bereich}“ läuft ${tage <= 1 ? 'morgen' : `in ${String(tage)} Tagen`} ab.`,
      'Wählen Sie einen Tarif, damit Ihr Team ohne Unterbrechung weiterarbeiten kann. Ihre Daten bleiben in jedem Fall erhalten; ohne Tarif lassen sie sich nur noch lesen und exportieren.',
    ],
    [
      'Sie bekommen diese Nachricht, weil Sie Inhaber dieses Arbeitsbereichs sind.',
    ],
    { text: 'Tarif wählen', url },
  );

export const abrufStehtMail = (
  to: string,
  was: 'Postfach' | 'Kalender',
  konto: string,
  grund: string,
  url: string,
  fehlerArt: FehlerArt | null = null,
): Mail => {
  const ihr = was === 'Postfach' ? 'Ihr Postfach' : 'Ihren Kalender';
  const weiter =
    fehlerArt === 'anmeldung'
      ? `Stegwerk kommt mit den gespeicherten Zugangsdaten nicht mehr hinein, etwa weil das Passwort geändert oder der Zugriff widerrufen wurde. Das behebt sich nicht von selbst: Bitte verbinden Sie ${ihr} in Stegwerk neu. Sie bekommen diese Nachricht nur einmal.`
      : fehlerArt === 'sonstig'
        ? `Stegwerk versucht es weiter von selbst. Steht in einer Stunde noch derselbe Grund in der App, prüfen Sie bitte die Einstellungen oder verbinden Sie ${ihr} neu. Sie bekommen diese Nachricht nur einmal.`
        : 'Stegwerk versucht es weiter von selbst. Sie bekommen diese Nachricht nur einmal; sobald es wieder läuft, ist nichts mehr zu tun.';

  return kontoHinweis(
    to,
    was === 'Postfach'
      ? 'Ihr Postfach wird seit einem Tag nicht abgerufen'
      : 'Ihr Kalender wird seit einem Tag nicht abgeglichen',
    [
      was === 'Postfach'
        ? `Stegwerk kann Ihr Postfach ${konto} seit mehr als 24 Stunden nicht abrufen. Neue Post kommt so lange nicht an die Akten.`
        : `Stegwerk kann Ihren Kalender ${konto} seit mehr als 24 Stunden nicht abgleichen. Termine von dort kommen so lange nicht hierher und umgekehrt.`,
      `Grund: ${grund}`,
    ],
    [weiter],
    {
      text: fehlerArt === 'anmeldung' ? 'Neu verbinden' : 'In Stegwerk ansehen',
      url,
    },
  );
};
