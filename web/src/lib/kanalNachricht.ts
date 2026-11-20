export type KanalDienst = 'slack' | 'teams';

export const KANAL_NAMEN: Record<KanalDienst, string> = {
  slack: 'Slack',
  teams: 'Microsoft Teams',
};

const TEAMS_ENDUNGEN = [
  '.webhook.office.com',
  '.logic.azure.com',
  '.api.powerplatform.com',
];

export const kanalHinweis = (
  dienst: KanalDienst,
  roh: string,
): string | null => {
  const text = roh.trim();

  if (text === '') {
    return null;
  }

  let url: URL;

  try {
    url = new URL(text);
  } catch {
    return 'Das ist keine vollständige Adresse (https://…).';
  }

  if (url.protocol !== 'https:') {
    return 'Die Adresse muss mit https:// beginnen.';
  }

  const rechner = url.hostname.toLowerCase();

  if (dienst === 'slack') {
    if (rechner !== 'hooks.slack.com') {
      return 'Eine Slack-Adresse beginnt mit https://hooks.slack.com/.';
    }

    return ['/services/', '/triggers/', '/workflows/'].some((pfad) =>
      url.pathname.startsWith(pfad),
    )
      ? null
      : 'Das ist keine Webhook-Adresse von Slack (…/services/… oder …/triggers/…).';
  }

  return TEAMS_ENDUNGEN.some((endung) => rechner.endsWith(endung))
    ? null
    : 'Eine Teams-Adresse endet auf webhook.office.com, logic.azure.com oder api.powerplatform.com.';
};

export const KANAL_ANLEITUNG: Record<KanalDienst, string> = {
  slack:
    'In Slack: Apps → „Incoming Webhooks“ hinzufügen, Kanal wählen und die Webhook-URL kopieren (oder ein Workflow mit dem Auslöser „Webhook“).',
  teams:
    'In Teams: im Kanal die App „Workflows“ öffnen, die Vorlage „Bei Empfang einer Webhookanfrage in einem Kanal posten“ wählen und die angezeigte Adresse kopieren.',
};
