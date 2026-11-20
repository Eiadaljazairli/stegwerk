import { kanalRumpf, kanalUrlAnzeige, pruefeKanalUrl } from './kanal-nachricht';

describe('Adressen für Slack und Teams', () => {
  it('nimmt die üblichen Webhook-Adressen der Dienste', () => {
    for (const [dienst, url] of [
      ['slack', 'https://hooks.slack.com/services/T0/B0/abc'],
      ['slack', 'https://hooks.slack.com/triggers/T0/1/abc'],
      ['teams', 'https://firma.webhook.office.com/webhookb2/abc'],
      [
        'teams',
        'https://prod-12.westeurope.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?sig=x',
      ],
      [
        'teams',
        'https://default1.environment.api.powerplatform.com/powerautomate/abc',
      ],
    ] as const) {
      expect([url, pruefeKanalUrl(dienst, url).ok]).toEqual([url, true]);
    }
  });

  it('lehnt fremde Rechner, http, Zugangsdaten und Slack-Seiten ohne Webhook ab', () => {
    for (const [dienst, url] of [
      ['slack', 'https://hooks.slack.com.boese.example/services/x'],
      ['slack', 'http://hooks.slack.com/services/x'],
      ['slack', 'https://hooks.slack.com/apps/x'],
      ['slack', 'https://a:b@hooks.slack.com/services/x'],
      ['teams', 'https://hooks.slack.com/services/x'],
      ['teams', 'https://webhook.office.com.boese.example/x'],
      ['teams', 'https://127.0.0.1/x'],
      ['slack', 'kein link'],
    ] as const) {
      expect([url, pruefeKanalUrl(dienst, url).ok]).toEqual([url, false]);
    }
  });

  it('erlaubt einen lokalen Rechner nur, wenn ausdrücklich zum Testen', () => {
    expect(pruefeKanalUrl('slack', 'http://127.0.0.1:9/x').ok).toBe(false);
    expect(pruefeKanalUrl('slack', 'http://127.0.0.1:9/x', true).ok).toBe(true);
  });

  it('zeigt nur den Rechner, nie den geheimen Teil', () => {
    expect(
      kanalUrlAnzeige('https://hooks.slack.com/services/T0/B0/geheim'),
    ).toBe('https://hooks.slack.com/…');
  });

  it('baut für Teams eine Adaptive Card mit Knopf zur Akte', () => {
    const karte = JSON.parse(
      kanalRumpf('teams', 'Hallo', {
        url: 'https://crm.example.de/geschaefte/1',
        titel: 'Dach',
      }),
    ) as {
      attachments: { content: { type: string; actions: unknown[] } }[];
    };

    expect(karte.attachments[0].content.type).toBe('AdaptiveCard');
    expect(karte.attachments[0].content.actions).toEqual([
      {
        type: 'Action.OpenUrl',
        title: 'Dach',
        url: 'https://crm.example.de/geschaefte/1',
      },
    ]);
  });

  it('macht aus Datensatzwerten in Teams keinen Markdown-Link', () => {
    const text =
      'Neuer Lead: [Rechnung 4711 offen](https://evil.example/login)';
    const akte = { url: 'https://crm.example.de/kontakte/1', titel: 'Akte' };
    const karte = JSON.parse(kanalRumpf('teams', text, akte)) as {
      attachments: {
        content: { body: { text: string }[]; actions: { url: string }[] };
      }[];
    };
    const { body, actions } = karte.attachments[0].content;

    expect(body[0].text).toBe(
      'Neuer Lead: \\[Rechnung 4711 offen\\]\\(https://evil.example/login\\)',
    );
    expect(body[0].text).not.toMatch(/(?<!\\)\]\(/u);
    expect(actions[0].url).toBe('https://crm.example.de/kontakte/1');

    expect(
      (JSON.parse(kanalRumpf('slack', text, null)) as { text: string }).text,
    ).toBe(text);
  });

  it('entschärft in Teams auch Hervorhebung, Überschrift und Backslash', () => {
    const karte = JSON.parse(
      kanalRumpf('teams', '# *a* _b_ `c` > ~d~ \\', null),
    ) as {
      attachments: { content: { body: { text: string }[] } }[];
    };

    expect(karte.attachments[0].content.body[0].text).toBe(
      '\\# \\*a\\* \\_b\\_ \\`c\\` \\> \\~d\\~ \\\\',
    );
  });
});
