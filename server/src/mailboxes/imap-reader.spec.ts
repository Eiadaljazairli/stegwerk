import { UngueltigesZiel } from '../webhooks/webhook-ziel';
import { gmailKategorieUids, reasonFor } from './imap-reader';

describe('den Grund benennen', () => {
  it('erkennt eine abgelehnte Anmeldung', () => {
    expect(
      reasonFor(new Error('Invalid credentials (AUTHENTICATIONFAILED)')),
    ).toMatch(/Benutzername oder Passwort/u);
  });

  it('erkennt einen falschen Hostnamen', () => {
    expect(
      reasonFor(new Error('getaddrinfo ENOTFOUND imap.tippfehler.de')),
    ).toMatch(/Hostnamen/u);
  });

  it('erkennt einen falschen Port', () => {
    expect(reasonFor(new Error('connect ECONNREFUSED 127.0.0.1:143'))).toMatch(
      /Port und Verschlüsselung/u,
    );
  });

  it('erkennt eine Zeitüberschreitung', () => {
    expect(reasonFor(new Error('Socket timeout'))).toMatch(/Verbindung/u);
  });

  it('erkennt ein abgelehntes Zertifikat', () => {
    expect(reasonFor(new Error('self signed certificate in chain'))).toMatch(
      /Zertifikat/u,
    );
  });

  it('erkennt einen Ordner, den es nicht gibt', () => {
    expect(reasonFor(new Error('Mailbox does not exist'))).toMatch(/INBOX/u);
  });

  it('gibt den Wortlaut eines fremden Servers nicht weiter', () => {
    const satz = reasonFor(new Error('SSH-2.0-OpenSSH_9.6 Protocol mismatch'));

    expect(satz).not.toContain('OpenSSH');
    expect(satz).toContain('Server');
  });

  it('kommt auch mit etwas zurecht, das kein Fehler ist', () => {
    expect(reasonFor('nur ein Text')).toContain('Server');
  });

  it('sagt, wenn der Server intern ist', () => {
    expect(
      reasonFor(
        new UngueltigesZiel(
          'Dieser Server liegt in einem internen Netz und ist nicht erlaubt.',
        ),
      ),
    ).toContain('internen Netz');
  });
});

describe('Gmail-Kategorien', () => {
  const client = (
    erweiterungen: string[],
    treffer: number[] | false | Error,
  ) => {
    const fragen: unknown[] = [];

    return {
      fragen,
      capabilities: new Map<string, boolean>(
        erweiterungen.map((name) => [name, true]),
      ),
      search: (query: unknown, options?: unknown) => {
        fragen.push([query, options]);

        return treffer instanceof Error
          ? Promise.reject(treffer)
          : Promise.resolve(treffer);
      },
    };
  };

  it('fragt bei Gmail im Posteingang mit X-GM-RAW nach den vier Kategorien', async () => {
    const gmail = client(['IMAP4rev1', 'X-GM-EXT-1'], [12, 15]);

    expect([...(await gmailKategorieUids(gmail, 'INBOX', 10))]).toEqual([
      12, 15,
    ]);
    expect(gmail.fragen).toEqual([
      [
        {
          uid: '11:*',
          gmraw:
            'category:promotions OR category:social OR category:forums OR category:updates',
        },
        { uid: true },
      ],
    ]);
  });

  it('fragt andere Server und andere Ordner gar nicht', async () => {
    const anderer = client(['IMAP4rev1'], [1]);
    const gmail = client(['X-GM-EXT-1'], [1]);

    expect((await gmailKategorieUids(anderer, 'INBOX', 0)).size).toBe(0);
    expect((await gmailKategorieUids(gmail, '[Gmail]/Gesendet', 0)).size).toBe(
      0,
    );
    expect(anderer.fragen).toEqual([]);
    expect(gmail.fragen).toEqual([]);
  });

  it('lässt nichts aus, wenn die Suche scheitert', async () => {
    expect(
      (
        await gmailKategorieUids(
          client(['X-GM-EXT-1'], new Error('BAD')),
          'INBOX',
          0,
        )
      ).size,
    ).toBe(0);
    expect(
      (await gmailKategorieUids(client(['X-GM-EXT-1'], false), 'INBOX', 0))
        .size,
    ).toBe(0);
  });
});
