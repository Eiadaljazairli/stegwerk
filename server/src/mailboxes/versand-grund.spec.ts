import { postfachFehler, versandGrund } from './smtp-sender';

describe('warum der Versand scheiterte', () => {
  it('sagt bei zu großen Anhängen, was zu tun ist', () => {
    expect(
      versandGrund({
        responseCode: 552,
        response:
          "552-5.3.4 Your message exceeded Google's message size limits.",
      }),
    ).toMatch(/zu groß.*Anhänge/u);
  });

  it('hält ein volles Postfach nicht für eine zu große Nachricht', () => {
    expect(
      versandGrund({ responseCode: 552, response: '552 5.2.2 Mailbox full' }),
    ).toBe('Der Mailserver hat die Nachricht abgelehnt (552).');
  });

  it('trennt Fehler am Postfach von Fehlern an einer Adresse', () => {
    expect(postfachFehler({ code: 'EAUTH', responseCode: 535 })).toBe(true);
    expect(postfachFehler({ code: 'ECONNECTION' })).toBe(true);
    expect(postfachFehler({ code: 'EENVELOPE', responseCode: 550 })).toBe(
      false,
    );
  });
});
