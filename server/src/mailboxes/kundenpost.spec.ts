import {
  istAbmeldung,
  istEinladung,
  istIntern,
  teamDomains,
} from './kundenpost';

describe('Post unter Kollegen', () => {
  const haus = teamDomains([
    'Ich <ich@wir.de>',
    'kollege@wir.de',
    'x@gmail.com',
  ]);

  it('nimmt Freemail nicht als Hausdomain', () => {
    expect([...haus]).toEqual(['wir.de']);
  });

  it('erkennt Post, an der nur das Haus beteiligt ist', () => {
    expect(
      istIntern(
        {
          from: 'ich@wir.de',
          to: 'Kollege <kollege@wir.de>',
          cc: 'chef@wir.de',
        },
        haus,
      ),
    ).toBe(true);
  });

  it('lässt Post mit einem Kunden in Kopie durch', () => {
    expect(
      istIntern(
        { from: 'ich@wir.de', to: 'kollege@wir.de', cc: 'anna@nordwind.de' },
        haus,
      ),
    ).toBe(false);
  });

  it('macht Kunden mit derselben Freemail nicht zu Kollegen', () => {
    expect(
      istIntern(
        { from: 'kunde@gmail.com', to: 'x@gmail.com' },
        teamDomains(['x@gmail.com']),
      ),
    ).toBe(false);
  });
});

describe('Einladungen', () => {
  it('erkennt eine iTIP-Einladung und eine Zusage', () => {
    expect(istEinladung('BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\n')).toBe(true);
    expect(istEinladung('BEGIN:VCALENDAR\r\nMETHOD:REPLY\r\n')).toBe(true);
  });

  it('lässt eine angehängte .ics ohne Methode und Post ohne Kalender durch', () => {
    expect(istEinladung('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(false);
    expect(istEinladung(null)).toBe(false);
  });
});

describe('Abmeldungen', () => {
  it('erkennt Post an eine Abmeldeadresse', () => {
    expect(
      istAbmeldung(
        { from: 'ich@wir.de', to: 'unsubscribe@list.anbieter.de' },
        'ich@wir.de',
      ),
    ).toBe(true);
    expect(
      istAbmeldung(
        { from: 'ich@wir.de', to: 'x123@unsubscribe2.customer.io' },
        'ich@wir.de',
      ),
    ).toBe(true);
  });

  it('erkennt die Abmeldung im Betreff, die ein Mailprogramm schickt', () => {
    expect(
      istAbmeldung(
        {
          from: 'ich@wir.de',
          to: 'liste@anbieter.de',
          subject: ' Unsubscribe ',
        },
        'ich@wir.de',
      ),
    ).toBe(true);
  });

  it('lässt gewöhnliche Post durch', () => {
    expect(
      istAbmeldung(
        { from: 'anna@nordwind.de', to: 'ich@wir.de', subject: 'unsubscribe' },
        'ich@wir.de',
      ),
    ).toBe(false);
    expect(
      istAbmeldung(
        { from: 'ich@wir.de', to: 'anna@nordwind.de' },
        'ich@wir.de',
      ),
    ).toBe(false);
  });
});
