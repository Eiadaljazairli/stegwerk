import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { CreateNoteInput } from './dto/note.dto';
import { UpdateTaskInput } from './dto/task.dto';
import {
  alsKlartext,
  alsReinerText,
  erwaehnteNutzer,
  kurzfassung,
  unerlaubteLinks,
} from './formatierter-text';

const ANNA = '6f1c2a3b-0000-4000-8000-000000000001';
const BEN = '6f1c2a3b-0000-4000-8000-000000000002';

describe('formatierter Text', () => {
  it('findet die Erwähnten, jede Person einmal', () => {
    expect(
      erwaehnteNutzer(
        `Hallo @[Anna Pruefer](nutzer:${ANNA}) und @[Ben](nutzer:${BEN}), ` +
          `noch einmal @[Anna](nutzer:${ANNA.toUpperCase()}).`,
      ),
    ).toEqual([ANNA, BEN]);
    expect(erwaehnteNutzer(null)).toEqual([]);
    expect(erwaehnteNutzer('@Anna ohne Klammern')).toEqual([]);
  });

  it('erlaubt nur http, https, mailto, tel und Erwähnungen als Ziel', () => {
    expect(
      unerlaubteLinks(
        '[a](https://x.de) [b](http://y.de) [c](mailto:a@b.de) [d](tel:+4930) ' +
          `@[Anna](nutzer:${ANNA})`,
      ),
    ).toEqual([]);
    expect(
      unerlaubteLinks(
        '[böse](javascript:alert(1)) [auch](JavaScript:x) [bild](data:text/html,x) [rel](/firmen)',
      ),
    ).toEqual([
      'javascript:alert(1',
      'JavaScript:x',
      'data:text/html,x',
      '/firmen',
    ]);
  });

  it('prüft auch Referenz-Links und Autolinks', () => {
    expect(unerlaubteLinks('[Angebot][1]\n\n[1]: javascript:fetch(1)')).toEqual(
      ['javascript:fetch(1)'],
    );
    expect(unerlaubteLinks('[1]: <javascript:x> "Titel"')).toEqual([
      'javascript:x',
    ]);
    expect(unerlaubteLinks('Klick <javascript:alert(1)>')).toEqual([
      'javascript:alert(1)',
    ]);
    expect(
      unerlaubteLinks(
        '[Angebot][1]\n\n[1]: https://x.de "Angebot"\n<https://y.de> <mailto:a@b.de>',
      ),
    ).toEqual([]);
    expect(
      unerlaubteLinks('[Wichtig]: Termin: morgen früh\n2 < 3 und a:b > c'),
    ).toEqual([]);
    expect(unerlaubteLinks('\\<javascript:x\\>')).toEqual([]);

    expect(unerlaubteLinks('\\\\<javascript:alert(1)>')).toEqual([
      'javascript:alert(1)',
    ]);
  });

  it('erkennt Referenzen mit Ziel auf der Folgezeile, im Zitat und in Listen', () => {
    expect(unerlaubteLinks('[1]:\njavascript:alert(1)')).toEqual([
      'javascript:alert(1)',
    ]);
    expect(unerlaubteLinks('> [1]: javascript:alert(1)')).toEqual([
      'javascript:alert(1)',
    ]);
    expect(unerlaubteLinks('- [1]: javascript:x')).toEqual(['javascript:x']);
    expect(unerlaubteLinks('1. > [1]: data:text/html,x')).toEqual([
      'data:text/html,x',
    ]);
    expect(unerlaubteLinks('> [1]:\n> vbscript:x "T"')).toEqual(['vbscript:x']);
  });

  it('lässt gewöhnlichen Text in Referenz-Form durch', () => {
    expect(unerlaubteLinks('[Status]: offen')).toEqual([]);
    expect(unerlaubteLinks('[Termin]: 14:00')).toEqual([]);
    expect(unerlaubteLinks('Notiz\n[Status]: erledigt')).toEqual([]);
    expect(unerlaubteLinks('- [Status]: offen\n> [Ort]: Halle')).toEqual([]);
    expect(unerlaubteLinks('[Status]:\nerledigt')).toEqual([]);
  });

  it('maskiert fremden Text, sodass nichts mehr auszeichnet', () => {
    const fremd = `**Hallo** @[Anna](nutzer:${ANNA}) [x](javascript:1) <a> \\ _b_ # c`;
    const maskiert = alsReinerText(fremd);

    expect(maskiert).toBe(
      `\\*\\*Hallo\\*\\* \\@\\[Anna\\]\\(nutzer:${ANNA}\\) \\[x\\]\\(javascript:1\\) \\<a\\> \\\\ \\_b\\_ \\# c`,
    );
    expect(erwaehnteNutzer(maskiert)).toEqual([]);
    expect(unerlaubteLinks(maskiert)).toEqual([]);
    expect(alsKlartext(maskiert)).toBe(fremd);
  });

  it('lässt nackte Adressen in fremdem Text unverändert', () => {
    const fremd = 'Siehe (https://x.de/foo_bar#teil?a=@b) und _c_';
    const maskiert = alsReinerText(fremd);

    expect(maskiert).toBe(
      'Siehe \\(https://x.de/foo_bar#teil?a=@b\\) und \\_c\\_',
    );
    expect(alsKlartext(maskiert)).toBe(fremd);
    expect(unerlaubteLinks(maskiert)).toEqual([]);
    expect(alsReinerText('https://x.de/[a](javascript:1)')).toBe(
      'https://x.de/\\[a\\]\\(javascript:1\\)',
    );
  });

  it('macht daraus Klartext für Vorschau und Mail', () => {
    expect(
      alsKlartext(
        [
          '# Besuch',
          '- [x] Angebot schicken',
          '- [ ] **Termin** machen',
          '1. *erstens*',
          `Siehe [Webseite](https://x.de), @[Anna](nutzer:${ANNA}).`,
          'Rechnung 5 * 3 * 2 bleibt.',
        ].join('\n'),
      ),
    ).toBe(
      [
        'Besuch',
        'Angebot schicken',
        'Termin machen',
        'erstens',
        'Siehe Webseite, @Anna.',
        'Rechnung 5 * 3 * 2 bleibt.',
      ].join('\n'),
    );
  });

  it('kürzt auf eine Zeile', () => {
    expect(kurzfassung('a\n\nb', 10)).toBe('a b');
    expect(kurzfassung('x'.repeat(20), 10)).toBe(`${'x'.repeat(9)}…`);
  });

  it('lehnt einen javascript:-Link schon beim Eingang ab', async () => {
    const notiz = plainToInstance(CreateNoteInput, {
      body: 'Klick [hier](javascript:alert(document.cookie))',
      dealId: ANNA,
    });
    const aufgabe = plainToInstance(UpdateTaskInput, {
      id: ANNA,
      description: '[x](data:text/html;base64,PHNjcmlwdD4=)',
    });
    const gut = plainToInstance(CreateNoteInput, {
      body: '**fett** und [Link](https://stegwerk.com)',
      dealId: ANNA,
    });

    expect((await validate(notiz)).map((f) => f.property)).toEqual(['body']);
    expect((await validate(aufgabe)).map((f) => f.property)).toEqual([
      'description',
    ]);
    expect(await validate(gut)).toEqual([]);
  });
});
