import { describe, expect, it } from 'vitest';

import { kanalHinweis } from './kanalNachricht';

describe('Webhook-Adressen für Slack und Teams', () => {
  it('nimmt die üblichen Adressen ohne Hinweis', () => {
    expect(
      kanalHinweis('slack', 'https://hooks.slack.com/services/T0/B0/x'),
    ).toBeNull();
    expect(
      kanalHinweis(
        'teams',
        'https://prod-01.westeurope.logic.azure.com:443/workflows/x',
      ),
    ).toBeNull();
    expect(
      kanalHinweis('teams', 'https://firma.webhook.office.com/webhookb2/x'),
    ).toBeNull();
    expect(kanalHinweis('slack', '')).toBeNull();
  });

  it('sagt, was nicht stimmt', () => {
    expect(kanalHinweis('slack', 'hooks.slack.com/x')).toContain(
      'vollständige',
    );
    expect(
      kanalHinweis('slack', 'http://hooks.slack.com/services/x'),
    ).toContain('https://');
    expect(kanalHinweis('slack', 'https://slack.com/services/x')).toContain(
      'hooks.slack.com',
    );
    expect(kanalHinweis('slack', 'https://hooks.slack.com/apps/x')).toContain(
      'Webhook-Adresse',
    );
    expect(
      kanalHinweis('teams', 'https://hooks.slack.com/services/x'),
    ).toContain('webhook.office.com');
  });
});
