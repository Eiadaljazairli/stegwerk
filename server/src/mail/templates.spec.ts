import {
  abrufStehtMail,
  emailVerificationMail,
  invitationMail,
  passwordChangedMail,
  passwordResetMail,
} from './templates';

const ALLE = [
  [
    'Einladung',
    invitationMail(
      'du@example.de',
      'Marie',
      'Nordwind',
      'https://app.example.de/einladung/abc',
    ),
  ],
  [
    'Passwort zurücksetzen',
    passwordResetMail(
      'du@example.de',
      'https://app.example.de/passwort-neu/abc',
    ),
  ],
  [
    'Adresse bestätigen',
    emailVerificationMail(
      'du@example.de',
      'https://app.example.de/adresse-bestaetigen/abc',
    ),
  ],
  ['Passwort geändert', passwordChangedMail('du@example.de')],
  [
    'Abruf steht',
    abrufStehtMail(
      'du@example.de',
      'Postfach',
      'ich@firma.de',
      'Anmeldung fehlgeschlagen.',
      'https://app.example.de/postfach',
    ),
  ],
] as const;

describe('jede Nachricht', () => {
  it.each(ALLE)('%s: hat Betreff, Text und HTML', (_name, mail) => {
    expect(mail.subject.length).toBeGreaterThan(5);
    expect(mail.text.length).toBeGreaterThan(50);
    expect(mail.html).toContain('<!doctype html>');
  });

  it.each(ALLE)('%s: trägt die Marke', (_name, mail) => {
    expect(mail.html).toContain('STEGWERK');
  });

  it.each(ALLE)('%s: lässt keine Platzhalter stehen', (_name, mail) => {
    expect(mail.html).not.toContain('undefined');
    expect(mail.text).not.toContain('undefined');
    expect(mail.html).not.toMatch(/\$\{/);
  });
});

describe('Nachrichten mit einem Link', () => {
  const mitLink = [
    [
      'Einladung',
      invitationMail(
        'du@example.de',
        'Marie',
        'Nordwind',
        'https://app.example.de/einladung/abc',
      ),
    ],
    [
      'Passwort zurücksetzen',
      passwordResetMail(
        'du@example.de',
        'https://app.example.de/passwort-neu/abc',
      ),
    ],
    [
      'Adresse bestätigen',
      emailVerificationMail(
        'du@example.de',
        'https://app.example.de/adresse-bestaetigen/abc',
      ),
    ],
  ] as const;

  it.each(mitLink)('%s: nennt die Adresse auch im Klartext', (_name, mail) => {
    const treffer =
      mail.html?.match(/https:\/\/app\.example\.de\/[^"<\s]+/g) ?? [];

    expect(treffer.length).toBeGreaterThanOrEqual(2);
    expect(mail.text).toContain('https://app.example.de/');
  });

  it.each(mitLink)('%s: sagt, wie lange der Link gilt', (_name, mail) => {
    expect(mail.text).toMatch(/gültig/);
    expect(mail.html).toMatch(/gültig/);
  });
});

describe('die Warnung nach einer Passwortänderung', () => {
  it('trägt bewusst keinen Knopf', () => {
    const mail = passwordChangedMail('du@example.de');

    expect(mail.html).not.toContain('href=');
  });
});

describe('Namen, die jemand selbst eintippt', () => {
  it('brechen die Nachricht nicht auf', () => {
    const mail = invitationMail(
      'du@example.de',
      '<script>alert(1)</script>',
      'Nord & Wind "GmbH"',
      'https://app.example.de/einladung/abc',
    );

    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('Nord &amp; Wind');
    expect(mail.html).toContain('&quot;GmbH&quot;');
  });
});

describe('die Mail nach einem Tag Stillstand', () => {
  const mail = (art: 'voruebergehend' | 'anmeldung' | 'sonstig' | null) =>
    abrufStehtMail(
      'du@example.de',
      'Postfach',
      'ich@firma.de',
      'Grund.',
      'https://app.example.de/postfach',
      art,
    );

  it('verspricht bei einem Netzaussetzer, dass es von selbst wieder läuft', () => {
    expect(mail('voruebergehend').text).toContain('nichts mehr zu tun');
    expect(mail(null).text).toContain('nichts mehr zu tun');
  });

  it('sagt bei falscher Anmeldung, dass neu verbunden werden muss', () => {
    const anmeldung = mail('anmeldung');

    expect(anmeldung.text).toContain('nicht von selbst');
    expect(anmeldung.text).toContain('neu');
    expect(anmeldung.text).not.toContain('nichts mehr zu tun');
    expect(anmeldung.html).toContain('Neu verbinden');
  });

  it('verspricht bei sonstigen Fehlern nichts', () => {
    expect(mail('sonstig').text).not.toContain('nichts mehr zu tun');
  });
});
