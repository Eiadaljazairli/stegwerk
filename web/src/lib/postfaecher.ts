import { type Mailbox } from './types';

type PostfachKurz = Pick<
  Mailbox,
  'id' | 'username' | 'bezeichnung' | 'art' | 'haupt' | 'smtpHost' | 'aliase'
> & { getrennt?: boolean; mitglieder?: string[] };

export const postfachName = (
  postfach: Pick<Mailbox, 'username' | 'bezeichnung'>,
): string =>
  postfach.bezeichnung === null || postfach.bezeichnung.trim() === ''
    ? postfach.username
    : `${postfach.bezeichnung} (${postfach.username})`;

export const kannSendenAus = (postfach: PostfachKurz): boolean =>
  postfach.smtpHost !== null &&
  postfach.smtpHost.trim() !== '' &&
  postfach.getrennt !== true;

export const darfNutzen = (
  postfach: PostfachKurz,
  ich: string | null,
): boolean =>
  postfach.art !== 'gemeinsam' ||
  (ich !== null && (postfach.mitglieder ?? []).includes(ich));

export const kannSendenAls = (
  postfach: PostfachKurz,
  ich: string | null,
): boolean => kannSendenAus(postfach) && darfNutzen(postfach, ich);

export type AbsenderOption = {
  wert: string;
  mailboxId: string;
  adresse: string;
  hauptadresse: boolean;
  text: string;
};

const TRENNER = '|';

export const absenderOptionen = (
  postfaecher: readonly PostfachKurz[],
  ich: string | null,
): AbsenderOption[] => {
  const rang = (postfach: PostfachKurz): number =>
    postfach.haupt ? 0 : postfach.art === 'persoenlich' ? 1 : 2;

  return [...postfaecher]
    .filter((postfach) => kannSendenAls(postfach, ich))
    .sort((a, b) => rang(a) - rang(b))
    .flatMap((postfach) => {
      const zusatz =
        postfach.art === 'gemeinsam'
          ? ` · gemeinsam${
              postfach.bezeichnung === null || postfach.bezeichnung === ''
                ? ''
                : `: ${postfach.bezeichnung}`
            }`
          : '';

      return [postfach.username, ...postfach.aliase].map((adresse, index) => ({
        wert: `${postfach.id}${TRENNER}${adresse}`,
        mailboxId: postfach.id,
        adresse,
        hauptadresse: index === 0,
        text: `${adresse}${zusatz}`,
      }));
    });
};

export const absenderEingabe = (
  optionen: readonly AbsenderOption[],
  wert: string,
): { mailboxId: string; from?: string } | null => {
  const option = optionen.find((eintrag) => eintrag.wert === wert);

  if (option === undefined) {
    return null;
  }

  return option.hauptadresse
    ? { mailboxId: option.mailboxId }
    : { mailboxId: option.mailboxId, from: option.adresse };
};

export const vorgabeAbsender = (
  optionen: readonly AbsenderOption[],
  postfachId?: string | null,
): string => {
  const passend =
    postfachId === undefined || postfachId === null
      ? undefined
      : optionen.find(
          (option) => option.mailboxId === postfachId && option.hauptadresse,
        );

  return (passend ?? optionen[0])?.wert ?? '';
};

export const POSTFACH_FILTER = [
  { wert: 'offen', text: 'Offen' },
  { wert: 'mir', text: 'Mir zugewiesen' },
  { wert: 'erledigt', text: 'Erledigt' },
  { wert: 'alle', text: 'Alle' },
] as const;

export type PostfachFilter = (typeof POSTFACH_FILTER)[number]['wert'];

export const gespraechStand = (
  gespraech: { offen: boolean; zugewiesenAnId: string | null },
  namen: ReadonlyMap<string, string>,
  ich: string | null,
): string => {
  const wer =
    gespraech.zugewiesenAnId === null
      ? 'niemandem zugewiesen'
      : gespraech.zugewiesenAnId === ich
        ? 'mir zugewiesen'
        : `zugewiesen an ${namen.get(gespraech.zugewiesenAnId) ?? 'jemanden, der nicht mehr im Team ist'}`;

  return `${gespraech.offen ? 'Offen' : 'Erledigt'}, ${wer}`;
};

export const mitgliederUmschalten = (
  mitglieder: readonly string[],
  userId: string,
): string[] =>
  mitglieder.includes(userId)
    ? mitglieder.filter((eintrag) => eintrag !== userId)
    : [...mitglieder, userId];
