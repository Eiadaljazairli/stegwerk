export const KANAL_DIENSTE = ['slack', 'teams'] as const;
export type KanalDienst = (typeof KANAL_DIENSTE)[number];

export const KANAL_NAME: Record<KanalDienst, string> = {
  slack: 'Slack',
  teams: 'Microsoft Teams',
};

export const MAX_KANAL_TEXT = 4000;

const erlaubterRechner = (dienst: KanalDienst, rechner: string): boolean => {
  if (dienst === 'slack') {
    return rechner === 'hooks.slack.com';
  }

  return (
    rechner.endsWith('.webhook.office.com') ||
    rechner.endsWith('.logic.azure.com') ||
    rechner.endsWith('.api.powerplatform.com')
  );
};

const SLACK_PFADE = ['/services/', '/triggers/', '/workflows/'];

export const pruefeKanalUrl = (
  dienst: KanalDienst,
  roh: string,
  testRechner = false,
): { ok: true; url: URL } | { ok: false; grund: string } => {
  let url: URL;

  try {
    url = new URL(roh.trim());
  } catch {
    return { ok: false, grund: 'Das ist keine gültige Adresse.' };
  }

  const lokal =
    testRechner &&
    (url.hostname === '127.0.0.1' || url.hostname === 'localhost');

  if (url.protocol !== 'https:' && !lokal) {
    return { ok: false, grund: 'Die Adresse muss mit https:// beginnen.' };
  }

  if (url.username !== '' || url.password !== '') {
    return { ok: false, grund: 'Die Adresse darf keine Zugangsdaten tragen.' };
  }

  if (!lokal && !erlaubterRechner(dienst, url.hostname.toLowerCase())) {
    return {
      ok: false,
      grund:
        dienst === 'slack'
          ? 'Eine Slack-Adresse beginnt mit https://hooks.slack.com/.'
          : 'Eine Teams-Adresse endet auf webhook.office.com, logic.azure.com oder api.powerplatform.com.',
    };
  }

  if (
    dienst === 'slack' &&
    !lokal &&
    !SLACK_PFADE.some((pfad) => url.pathname.startsWith(pfad))
  ) {
    return {
      ok: false,
      grund:
        'Diese Slack-Adresse ist keine Webhook-Adresse (…/services/… oder …/triggers/…).',
    };
  }

  return { ok: true, url };
};

export const kanalUrlAnzeige = (roh: string): string => {
  try {
    const url = new URL(roh);

    return `${url.protocol}//${url.host}/…`;
  } catch {
    return '…';
  }
};

const slackText = (text: string): string =>
  text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');

const teamsText = (text: string): string =>
  text.replace(/[\\[\]()*_`#>~]/gu, (zeichen) => `\\${zeichen}`);

export const kanalRumpf = (
  dienst: KanalDienst,
  text: string,
  link: { url: string; titel: string } | null,
): string => {
  if (dienst === 'slack') {
    const zeilen = [slackText(text)];

    if (link !== null) {
      zeilen.push(`<${link.url}|${slackText(link.titel)}>`);
    }

    return JSON.stringify({ text: zeilen.join('\n') });
  }

  return JSON.stringify({
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [{ type: 'TextBlock', text: teamsText(text), wrap: true }],
          ...(link === null
            ? {}
            : {
                actions: [
                  { type: 'Action.OpenUrl', title: link.titel, url: link.url },
                ],
              }),
        },
      },
    ],
  });
};
