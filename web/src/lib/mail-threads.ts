import { type MailMessage } from './types';

export type Faden = {
  key: string;
  betreff: string | null;
  nachrichten: MailMessage[];
  zuletzt: string;
  neueste: MailMessage;
};

const zeit = (wert: string): number => {
  const wann = new Date(wert).getTime();

  return Number.isNaN(wann) ? 0 : wann;
};

export const gruppiereFaeden = (nachrichten: MailMessage[]): Faden[] => {
  const nachSchluessel = new Map<string, MailMessage[]>();

  for (const nachricht of nachrichten) {
    const key =
      nachricht.threadKey === '' || nachricht.threadKey === null
        ? `ohne:${nachricht.id}`
        : nachricht.threadKey;

    const vorhandene = nachSchluessel.get(key);

    if (vorhandene === undefined) {
      nachSchluessel.set(key, [nachricht]);
    } else {
      vorhandene.push(nachricht);
    }
  }

  const faeden: Faden[] = [];

  for (const [key, gruppe] of nachSchluessel) {
    const sortiert = [...gruppe].sort(
      (a, b) => zeit(a.sentAt) - zeit(b.sentAt),
    );
    const neueste = sortiert[sortiert.length - 1];

    faeden.push({
      key,
      betreff: sortiert[0].subject,
      nachrichten: sortiert,
      zuletzt: neueste.sentAt,
      neueste,
    });
  }

  return faeden.sort((a, b) => zeit(b.zuletzt) - zeit(a.zuletzt));
};

export const antwortAn = (faden: Faden, eigeneAdresse: string): string[] => {
  const eigen = eigeneAdresse.trim().toLowerCase();

  for (let i = faden.nachrichten.length - 1; i >= 0; i -= 1) {
    const nachricht = faden.nachrichten[i];

    if (!nachricht.outgoing) {
      return [nachricht.fromAddress];
    }

    const empfaenger = (nachricht.toAddresses ?? '')
      .split(',')
      .map((eintrag) => eintrag.trim().toLowerCase())
      .filter((eintrag) => eintrag !== '' && eintrag !== eigen);

    if (empfaenger.length > 0) {
      return empfaenger;
    }
  }

  return [];
};

export const antwortBetreff = (betreff: string | null): string => {
  const ohne = (betreff ?? '')
    .replace(/^(\s*(re|aw|antw|fwd|wg)\s*(\[\d+\])?\s*:\s*)+/iu, '')
    .trim();

  return ohne === '' ? 'Re:' : `Re: ${ohne}`;
};
