import { privacyFacts } from './privacy-facts';

describe('was genannt wird, wenn nichts eingerichtet ist', () => {
  const fakten = privacyFacts({});

  it('nennt keinen Dienst, den es nicht gibt', () => {
    expect(fakten.billing).toBe(false);
    expect(fakten.errorReporting).toBe(false);
    expect(fakten.outgoingMail).toBe(false);
    expect(fakten.mailboxes).toBe(false);
  });

  it('lässt die Angaben leer, die ein Mensch eintragen muss', () => {
    expect(fakten.hosting).toBeNull();
    expect(fakten.privacyContact).toBeNull();
    expect(fakten.supervisoryAuthority).toBeNull();
  });

  it('gilt als ungeprüft', () => {
    expect(fakten.reviewed).toBe(false);
    expect(fakten.dpaReviewed).toBe(false);
  });

  it('macht keine Angabe zur Sicherung', () => {
    expect(fakten.backupDescription).toBeNull();
  });

  it('nimmt neunzig Tage an, solange nichts anderes dasteht', () => {
    expect(fakten.retentionDays).toBe(90);
    expect(fakten.retentionEnabled).toBe(false);
  });
});

describe('ein eingerichteter Dienst wird genannt', () => {
  it.each([
    ['STRIPE_SECRET_KEY', 'billing'],
    ['SENTRY_DSN', 'errorReporting'],
    ['SMTP_HOST', 'outgoingMail'],
    ['MAIL_ENCRYPTION_KEY', 'mailboxes'],
  ] as const)('%s schaltet %s ein', (variable, feld) => {
    expect(privacyFacts({ [variable]: 'gesetzt' })[feld]).toBe(true);
  });

  it('behandelt eine leere Variable wie eine fehlende', () => {
    const fakten = privacyFacts({ STRIPE_SECRET_KEY: '', SENTRY_DSN: '   ' });

    expect(fakten.billing).toBe(false);
    expect(fakten.errorReporting).toBe(false);
  });
});

describe('die Freigabe', () => {
  it('zählt nur bei einem ausdrücklichen true', () => {
    expect(privacyFacts({ LEGAL_PRIVACY_REVIEWED: 'true' }).reviewed).toBe(
      true,
    );
    expect(privacyFacts({ LEGAL_DPA_REVIEWED: 'true' }).dpaReviewed).toBe(true);
  });

  it('gilt für Erklärung und Vertrag getrennt', () => {
    const nurErklaerung = privacyFacts({ LEGAL_PRIVACY_REVIEWED: 'true' });

    expect(nurErklaerung.reviewed).toBe(true);
    expect(nurErklaerung.dpaReviewed).toBe(false);
  });

  it.each(['', 'ja', '1', 'TRUE', 'yes', 'vielleicht'])(
    'gilt bei %p als nicht freigegeben',
    (wert) => {
      expect(privacyFacts({ LEGAL_PRIVACY_REVIEWED: wert }).reviewed).toBe(
        false,
      );
    },
  );
});

describe('die Angaben, die ein Mensch einträgt', () => {
  it('gibt zurück, was eingetragen wurde', () => {
    const fakten = privacyFacts({
      LEGAL_HOSTING: 'Hetzner Online GmbH, Nürnberg',
      LEGAL_PRIVACY_CONTACT: 'datenschutz@example.de',
      LEGAL_SUPERVISORY_AUTHORITY: 'BayLDA, Ansbach',
    });

    expect(fakten.hosting).toBe('Hetzner Online GmbH, Nürnberg');
    expect(fakten.privacyContact).toBe('datenschutz@example.de');
    expect(fakten.supervisoryAuthority).toBe('BayLDA, Ansbach');
  });

  it('schneidet Leerraum ab', () => {
    expect(privacyFacts({ LEGAL_HOSTING: '  Hetzner  ' }).hosting).toBe(
      'Hetzner',
    );
  });
});

describe('die Aufbewahrung', () => {
  it('übernimmt eine eingestellte Frist', () => {
    expect(privacyFacts({ RETENTION_DAYS: '180' }).retentionDays).toBe(180);
  });

  it('sagt, ob tatsächlich gelöscht wird', () => {
    expect(
      privacyFacts({ RETENTION_SWEEP_ENABLED: 'true' }).retentionEnabled,
    ).toBe(true);
    expect(
      privacyFacts({ RETENTION_SWEEP_ENABLED: 'false' }).retentionEnabled,
    ).toBe(false);
  });
});
