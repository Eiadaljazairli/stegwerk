import { servesInterface, vorgerenderteDatei } from './web-fallback';

describe('Routen der Oberfläche', () => {
  it('liefert die Seite für die Startseite', () => {
    expect(servesInterface('GET', '/')).toBe(true);
  });

  it('liefert die Seite für eine tiefe Route, die nur der Browser kennt', () => {
    expect(servesInterface('GET', '/geschaefte/123')).toBe(true);
  });

  it('liefert die Seite auch für einen unbekannten Pfad', () => {
    expect(servesInterface('GET', '/gibtesnicht')).toBe(true);
  });
});

describe('HEAD', () => {
  it('wird wie GET behandelt', () => {
    expect(servesInterface('HEAD', '/')).toBe(true);
    expect(servesInterface('HEAD', '/kalender')).toBe(true);
  });

  it('wird bei API-Pfaden genauso ausgenommen wie GET', () => {
    expect(servesInterface('HEAD', '/graphql')).toBe(false);
  });
});

describe('Pfade der API', () => {
  it.each([
    '/graphql',
    '/health',
    '/health/ready',
    '/billing/webhook',
    '/quotes/abc/pdf',
    '/invoices/abc/pdf',
    '/appointments/abc.ics',
    '/export/firmen.csv',
    '/attachments',
    '/attachments/9f1d0d3e-0000-4000-8000-000000000000',
  ])('gibt für %s keine Seite zurück', (pfad) => {
    expect(servesInterface('GET', pfad)).toBe(false);
  });

  it('trifft nur den ersten Abschnitt, nicht irgendeinen', () => {
    expect(servesInterface('GET', '/firmen/export')).toBe(true);
    expect(servesInterface('GET', '/kontakte/graphql')).toBe(true);
  });
});

describe('andere Methoden', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'gibt für %s keine Seite zurück',
    (methode) => {
      expect(servesInterface(methode, '/')).toBe(false);
    },
  );
});

describe('vorgerenderte Seiten', () => {
  it('liefert für die Startseite die eigene Datei, nicht index.html', () => {
    expect(vorgerenderteDatei('/')).toBe('start.html');
  });

  it.each([
    ['/funktionen', 'funktionen/index.html'],
    ['/funktionen/e-rechnung', 'funktionen/e-rechnung/index.html'],
    ['/funktionen/e-rechnung/', 'funktionen/e-rechnung/index.html'],
    ['/entwickler', 'entwickler/index.html'],
    ['/entwickler/referenz', 'entwickler/referenz/index.html'],
    ['/hilfe/fehlerbehebung', 'hilfe/fehlerbehebung/index.html'],
  ])('%s → %s', (pfad, datei) => {
    expect(vorgerenderteDatei(pfad)).toBe(datei);
  });

  it.each([
    '/geschaefte/123',
    '/hilfe',
    '/funktionen/../../etc/passwd',
    '/funktionen/%2e%2e',
    '/funktionen/a/b',
    '/funktionen/E-Rechnung',
    '/entwicklerxyz',
  ])('nimmt %s nicht als vorgerenderte Seite', (pfad) => {
    expect(vorgerenderteDatei(pfad)).toBeNull();
  });
});
