import { normaliseAddress, parseAddressList } from './address-match';
import { type IncomingMessage } from './imap-reader';

export type Zustellfehler = {
  adressen: string[];
  grund: string;
};

const ABSENDER = /^(mailer-daemon|postmaster|mail-daemon|mailerdaemon)@/iu;

const BETREFF =
  /undeliver|unzustellbar|delivery status notification|delivery failure|mail delivery failed|returned mail|failure notice|nicht zugestellt|zustellung fehlgeschlagen/iu;

const ausBericht = (bericht: string): string[] => {
  const adressen: string[] = [];

  for (const absatz of bericht.replace(/\r\n/gu, '\n').split(/\n\s*\n/u)) {
    const empfaenger =
      /^final-recipient:\s*rfc822;\s*(.+)$/imu.exec(absatz)?.[1] ??
      /^original-recipient:\s*rfc822;\s*(.+)$/imu.exec(absatz)?.[1];
    const aktion = /^action:\s*(\S+)/imu.exec(absatz)?.[1]?.toLowerCase();

    if (empfaenger === undefined || aktion !== 'failed') {
      continue;
    }

    const adresse = normaliseAddress(empfaenger.trim());

    if (adresse !== '') {
      adressen.push(adresse);
    }
  }

  return [...new Set(adressen)];
};

const grundAus = (text: string): string => {
  const diagnose = /^diagnostic-code:\s*(?:smtp;\s*)?(.+)$/imu.exec(text)?.[1];

  return (diagnose ?? 'Die Nachricht konnte nicht zugestellt werden.')
    .trim()
    .slice(0, 300);
};

export const zustellfehler = (
  nachricht: Pick<IncomingMessage, 'from' | 'subject' | 'text'> & {
    zustellbericht?: string | null;
  },
  eigeneAdresse: string,
): Zustellfehler | null => {
  const bericht = nachricht.zustellbericht ?? null;

  if (bericht !== null && bericht.trim() !== '') {
    const adressen = ausBericht(bericht).filter(
      (adresse) => adresse !== eigeneAdresse,
    );

    return adressen.length === 0
      ? null
      : { adressen, grund: grundAus(bericht) };
  }

  const absender = normaliseAddress(nachricht.from ?? '');

  if (!ABSENDER.test(absender) || !BETREFF.test(nachricht.subject ?? '')) {
    return null;
  }

  const imText = ausBericht(nachricht.text);

  if (imText.length > 0) {
    const adressen = imText.filter((adresse) => adresse !== eigeneAdresse);

    return adressen.length === 0
      ? null
      : { adressen, grund: grundAus(nachricht.text) };
  }

  const fremde = [
    ...new Set(
      (
        nachricht.text.match(/[^\s<>()"',;:]+@[^\s<>()"',;:]+\.[a-z]{2,}/giu) ??
        []
      )
        .flatMap((treffer) => parseAddressList(treffer))
        .filter(
          (adresse) => adresse !== eigeneAdresse && !ABSENDER.test(adresse),
        ),
    ),
  ];

  return fremde.length === 1
    ? { adressen: fremde, grund: grundAus(nachricht.text) }
    : null;
};
