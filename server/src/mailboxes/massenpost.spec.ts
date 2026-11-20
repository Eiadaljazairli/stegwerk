import { istMassenpost } from './massenpost';

describe('Massenpost', () => {
  it.each([
    [
      'Newsletter mit Abmeldelink',
      'List-Unsubscribe: <mailto:x@y.de>',
      'anna@firma.de',
    ],
    ['Verteiler', 'List-Id: <vertrieb.firma.de>', 'anna@firma.de'],
    ['Precedence bulk', 'Precedence: bulk', 'anna@firma.de'],
    ['Abwesenheitsnotiz', 'Auto-Submitted: auto-replied', 'anna@firma.de'],
    ['Spam laut Server', 'X-Spam-Flag: YES', 'anna@firma.de'],
    ['Maschinen-Absender', null, 'noreply@firma.de'],
  ])('erkennt %s', (_name, kopf, absender) => {
    expect(istMassenpost(kopf, absender)).toBe(true);
  });

  it.each([
    ['gewöhnliche Post', 'References: <a@b.de>', 'anna@firma.de'],
    ['info@ eines kleinen Kunden', null, 'info@baeckerei-mueller.de'],
    ['ausdrücklich keine Automatik', 'Auto-Submitted: no', 'anna@firma.de'],
    ['ohne Kopf und Absender', null, null],
  ])('lässt %s durch', (_name, kopf, absender) => {
    expect(istMassenpost(kopf, absender)).toBe(false);
  });

  it('liest gefaltete Kopfzeilen', () => {
    expect(
      istMassenpost(
        'References: <a@b.de>\r\nList-Unsubscribe:\r\n <https://x.de/ab>',
        'anna@firma.de',
      ),
    ).toBe(true);
  });
});
