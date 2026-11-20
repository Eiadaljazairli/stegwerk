import {
  type BodyNode,
  decodeText,
  htmlOhneZitat,
  htmlToText,
  pickTextPart,
  snippetOf,
  subjectOf,
} from './message-shape';

const plain = (part: string | undefined, charset = 'utf-8'): BodyNode => ({
  part,
  type: 'text/plain',
  parameters: { charset },
});

describe('choosing which part to read', () => {
  it('reads a one-part message as part 1', () => {
    expect(pickTextPart(plain(undefined))).toEqual({
      part: '1',
      charset: 'utf-8',
      html: false,
    });
  });

  it('prefers plain text over the HTML twin', () => {
    const alternative: BodyNode = {
      type: 'multipart/alternative',
      childNodes: [
        { part: '1', type: 'text/html', parameters: { charset: 'utf-8' } },
        plain('2'),
      ],
    };

    expect(pickTextPart(alternative)?.part).toBe('2');
  });

  it('takes the HTML when that is all there is', () => {
    const only: BodyNode = {
      type: 'multipart/alternative',
      childNodes: [
        { part: '1', type: 'text/html', parameters: { charset: 'utf-8' } },
      ],
    };

    expect(pickTextPart(only)).toEqual({
      part: '1',
      charset: 'utf-8',
      html: true,
    });
  });

  it('finds the text under an attachment', () => {
    const withPdf: BodyNode = {
      type: 'multipart/mixed',
      childNodes: [
        {
          type: 'multipart/alternative',
          childNodes: [plain('1.1'), { part: '1.2', type: 'text/html' }],
        },
        { part: '2', type: 'application/pdf', disposition: 'attachment' },
      ],
    };

    expect(pickTextPart(withPdf)?.part).toBe('1.1');
  });

  it('does not read an attached text file as the message', () => {
    const withTxt: BodyNode = {
      type: 'multipart/mixed',
      childNodes: [
        {
          part: '1',
          type: 'text/plain',
          disposition: 'attachment',
          parameters: { charset: 'utf-8' },
        },
        { part: '2', type: 'text/html', parameters: { charset: 'utf-8' } },
      ],
    };

    expect(pickTextPart(withTxt)?.part).toBe('2');
  });

  it('carries the charset the part declares', () => {
    expect(pickTextPart(plain('1', 'iso-8859-1'))?.charset).toBe('iso-8859-1');
  });

  it('assumes UTF-8 when nothing is declared', () => {
    expect(pickTextPart({ part: '1', type: 'text/plain' })?.charset).toBe(
      'utf-8',
    );
  });

  it('answers nothing for a message with no text at all', () => {
    const onlyImage: BodyNode = {
      type: 'multipart/mixed',
      childNodes: [{ part: '1', type: 'image/jpeg' }],
    };

    expect(pickTextPart(onlyImage)).toBeNull();
  });
});

describe('reading the bytes', () => {
  it('reads UTF-8', () => {
    expect(decodeText(Buffer.from('Grüße', 'utf8'), 'utf-8')).toBe('Grüße');
  });

  it('reads iso-8859-1, which German mail still uses', () => {
    expect(
      decodeText(Buffer.from([0x47, 0x72, 0xfc, 0xdf, 0x65]), 'iso-8859-1'),
    ).toBe('Grüße');
  });

  it('reads windows-1252, which Outlook still sends', () => {
    expect(decodeText(Buffer.from([0x80]), 'windows-1252')).toBe('€');
  });

  it('liest Outlooks Anführungszeichen und Gedankenstriche, auch unter iso-8859-1', () => {
    const bytes = Buffer.from([
      0x84, 0x47, 0x72, 0xfc, 0xdf, 0x65, 0x93, 0x20, 0x96, 0x20, 0x35, 0x20,
      0x80,
    ]);

    expect(decodeText(bytes, 'windows-1252')).toBe('„Grüße“ – 5 €');
    expect(decodeText(bytes, 'ISO-8859-1')).toBe('„Grüße“ – 5 €');
  });

  it('falls back rather than throwing on a charset nobody knows', () => {
    expect(decodeText(Buffer.from('hallo', 'utf8'), 'x-erfunden')).toBe(
      'hallo',
    );
  });
});

describe('turning HTML into something readable', () => {
  it('removes the tags', () => {
    expect(htmlToText('<p>Guten <b>Tag</b></p>').trim()).toBe('Guten Tag');
  });

  it('does not run sentences together at a block edge', () => {
    expect(htmlToText('<div>Erste</div><div>Zweite</div>')).toContain('\n');
  });

  it('drops what is in a style block', () => {
    expect(htmlToText('<style>p{color:red}</style><p>Text</p>')).not.toContain(
      'color',
    );
  });

  it('drops what is in a script block', () => {
    expect(
      htmlToText('<script>var x = "geheim";</script><p>Text</p>'),
    ).not.toContain('geheim');
  });

  it('decodes the entities German mail uses', () => {
    expect(htmlToText('Gr&uuml;&szlig;e &amp; 5&nbsp;&euro;')).toBe(
      'Grüße & 5 €',
    );
  });

  it('decodes numeric entities', () => {
    expect(htmlToText('5&#8364; &#x20AC;')).toBe('5€ €');
  });

  it('leaves an entity it does not know alone rather than eating it', () => {
    expect(htmlToText('&nichtsowas;')).toBe('&nichtsowas;');
  });
});

describe('HTML-Antworten', () => {
  const kurz = (html: string) => snippetOf(htmlToText(htmlOhneZitat(html)));

  it('schneidet Outlooks Zitat ab', () => {
    expect(
      kurz(
        '<div>Passt, danke!</div><hr><div id="divRplyFwdMsg"><b>Von:</b> Ich<br><b>Gesendet:</b> Mittwoch</div><div>Angebot anbei</div>',
      ),
    ).toBe('Passt, danke!');
  });

  it('schneidet Gmails Zitat und ein blockquote ab', () => {
    expect(
      kurz(
        '<div dir="ltr">Ja.</div><div class="gmail_quote"><div class="gmail_attr">Am Mi. schrieb Ich:</div><blockquote>alt</blockquote></div>',
      ),
    ).toBe('Ja.');
    expect(kurz('<p>Gern.</p><blockquote type="cite">alt</blockquote>')).toBe(
      'Gern.',
    );
  });

  it('zeigt das Zitat, wenn sonst nichts dasteht', () => {
    expect(kurz('<blockquote>Nur weitergeleitet</blockquote>')).toBe(
      'Nur weitergeleitet',
    );
  });

  it('erkennt Outlooks Kopf auch im Text', () => {
    expect(
      snippetOf(
        'Passt.\n\nVon: Ich <ich@wir.de>\nGesendet: Mittwoch\nAn: Anna',
      ),
    ).toBe('Passt.');
    expect(snippetOf('Von: Montag an geht es los.\nBis dann')).toContain(
      'Bis dann',
    );
  });
});

describe('the snippet', () => {
  it('is the message when the message is short', () => {
    expect(snippetOf('Passt, danke!')).toBe('Passt, danke!');
  });

  it('collapses the wrapping a mail client puts in', () => {
    expect(snippetOf('Guten Tag,\n\nanbei das Angebot.\n')).toBe(
      'Guten Tag, anbei das Angebot.',
    );
  });

  it('drops the quoted message underneath', () => {
    const reply = 'Ja, passt.\n\n> Guten Tag,\n> hier ist unser Angebot.';

    expect(snippetOf(reply)).toBe('Ja, passt.');
  });

  it('drops the line that introduces the quote', () => {
    const reply =
      'Ja, passt.\n\nAm 12.03.2026 um 10:14 schrieb Anna Schmidt:\n> Angebot anbei.';

    expect(snippetOf(reply)).toBe('Ja, passt.');
  });

  it('drops an English attribution too', () => {
    expect(snippetOf('Fine.\n\nOn Mar 12 Anna wrote:\nsomething')).toBe(
      'Fine.',
    );
  });

  it('drops the separator Outlook writes', () => {
    expect(
      snippetOf('Ja, passt.\n\n-----Ursprüngliche Nachricht-----\nVon: Anna'),
    ).toBe('Ja, passt.');
  });

  it('drops the signature under the RFC delimiter', () => {
    const signed =
      'Ja, passt.\n-- \nAnna Schmidt\nNordwind GmbH\nAmtsgericht Hamburg HRB 12345';

    expect(snippetOf(signed)).toBe('Ja, passt.');
  });

  it('handles a signature delimiter whose trailing space a client ate', () => {
    expect(snippetOf('Ja, passt.\n--\nAnna Schmidt')).toBe('Ja, passt.');
  });

  it('does not mistake a line of dashes for a signature', () => {
    expect(snippetOf('Ja, passt.\n----\nUnd noch etwas.')).toContain(
      'Und noch etwas.',
    );
  });

  it('still says something when the message is only a quote', () => {
    expect(snippetOf('> Guten Tag, hier ist das Angebot.')).toContain(
      'Guten Tag',
    );
  });

  it('cuts long text on a word boundary', () => {
    const long =
      'Guten Tag, anbei finden Sie unser Angebot für die Lieferung im März.';

    expect(snippetOf(long, 40)).toBe('Guten Tag, anbei finden Sie unser…');
  });

  it('cuts a single very long word rather than giving up', () => {
    expect(snippetOf('a'.repeat(300), 20)).toHaveLength(21);
  });

  it('does not add an ellipsis to text that fitted', () => {
    expect(snippetOf('kurz', 40)).toBe('kurz');
  });

  it('does not add one to text that fitted exactly', () => {
    expect(snippetOf('12345', 5)).toBe('12345');
  });

  it('handles an empty body', () => {
    expect(snippetOf('')).toBe('');
  });

  it('handles CRLF, which is what actually comes off the wire', () => {
    expect(snippetOf('Ja, passt.\r\n> alt')).toBe('Ja, passt.');
  });
});

describe('the subject', () => {
  it('is kept as it is', () => {
    expect(subjectOf('Angebot 2026-0007')).toBe('Angebot 2026-0007');
  });

  it('is empty rather than blank when there is none', () => {
    expect(subjectOf('')).toBeNull();
    expect(subjectOf('   ')).toBeNull();
    expect(subjectOf(null)).toBeNull();
    expect(subjectOf(undefined)).toBeNull();
  });

  it('fits the column', () => {
    expect(subjectOf('x'.repeat(900))).toHaveLength(500);
  });
});
