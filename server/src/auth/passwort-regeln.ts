import { BadRequestException } from '@nestjs/common';

export const PASSWORT_ZU_SCHWACH = 'PASSWORT_ZU_SCHWACH';

export const MINDESTREST = 6;

const GRUNDWOERTER = [
  'passwort',
  'password',
  'kennwort',
  'geheimnis',
  'geheim',
  'secret',
  'willkommen',
  'welcome',
  'hallo',
  'hello',
  'letmein',
  'login',
  'admin',
  'administrator',
  'root',
  'user',
  'benutzer',
  'test',
  'master',
  'qwertz',
  'qwerty',
  'asdf',
  'yxcv',
  'zxcv',
  'iloveyou',
  'ichliebedich',
  'liebe',
  'love',
  'schatz',
  'schatzi',
  'baby',
  'sonne',
  'sunshine',
  'sommer',
  'summer',
  'winter',
  'fruehling',
  'fruehjahr',
  'herbst',
  'januar',
  'februar',
  'maerz',
  'april',
  'juni',
  'juli',
  'august',
  'september',
  'oktober',
  'november',
  'dezember',
  'montag',
  'freitag',
  'fussball',
  'football',
  'soccer',
  'baseball',
  'bayern',
  'borussia',
  'schalke',
  'dragon',
  'monkey',
  'shadow',
  'superman',
  'batman',
  'pokemon',
  'starwars',
  'princess',
  'prinzessin',
  'computer',
  'internet',
  'deutschland',
  'germany',
  'berlin',
  'hamburg',
  'muenchen',
  'koeln',
  'mercedes',
  'porsche',
  'ferrari',
  'firma',
  'company',
  'office',
  'buero',
  'stegwerk',
  'crm',
  'abc',
  'mein',
  'start',
  'zugang',
  'access',
  'changeme',
  'aendern',
  'default',
  'standard',
  'trustno',
  'freedom',
  'whatever',
  'matrix',
  'michael',
  'thomas',
  'andreas',
  'stefan',
  'daniel',
  'sabine',
  'nicole',
  'julia',
  'jennifer',
  'jessica',
].sort((a, b) => b.length - a.length);

const FOLGEN = [
  '01234567890',
  'abcdefghijklmnopqrstuvwxyz',
  'qwertzuiopasdfghjklyxcvbnm',
  'qwertyuiopasdfghjklzxcvbnm',
  '1q2w3e4r5t6z7u8i9o0p',
  '1q2w3e4r5t6y7u8i9o0p',
  'q1w2e3r4t5z6u7i8o9p0',
  'q1w2e3r4t5y6u7i8o9p0',
  '1qay2wsx3edc4rfv5tgb6zhn7ujm',
  '1qaz2wsx3edc4rfv5tgb6yhn7ujm',
  'qaywsxedcrfvtgbzhnujmikolp',
  'qazwsxedcrfvtgbyhnujmikolp',
];

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
};

const vereinheitliche = (text: string): string =>
  text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');

const ohneLeet = (text: string): string =>
  [...text].map((zeichen) => LEET[zeichen] ?? zeichen).join('');

const FOLGEN_BEIDE = FOLGEN.flatMap((folge) => [
  folge,
  [...folge].reverse().join(''),
]);

const ohneFolgen = (text: string): string => {
  let rest = text;
  let gefunden = true;

  while (gefunden) {
    gefunden = false;

    suche: for (let laenge = rest.length; laenge >= 4; laenge--) {
      for (let start = 0; start + laenge <= rest.length; start++) {
        const stueck = rest.slice(start, start + laenge);

        if (FOLGEN_BEIDE.some((folge) => folge.includes(stueck))) {
          rest = rest.slice(0, start) + rest.slice(start + laenge);
          gefunden = true;
          break suche;
        }
      }
    }
  }

  return rest;
};

const ohneWiederholungen = (text: string): string =>
  text.replace(/(.{1,4}?)\1{2,}/g, '$1');

const ohneWoerter = (text: string, woerter: readonly string[]): string => {
  let rest = text;

  for (const wort of woerter) {
    if (wort.length >= 3) {
      rest = rest.split(wort).join('');
    }
  }

  return rest;
};

export const eigenerAnteil = (
  passwort: string,
  bezug: { email?: string | null; namen?: (string | null | undefined)[] } = {},
): string => {
  const persoenlich = [
    ...(bezug.email ?? '')
      .toLowerCase()
      .split(/[@.+_-]/)
      .filter((teil) => teil.length >= 3),
    ...(bezug.namen ?? [])
      .filter((name): name is string => typeof name === 'string')
      .flatMap((name) => vereinheitliche(name).split(/\s+/))
      .filter((teil) => teil.length >= 3),
  ].map(vereinheitliche);

  const pruefe = (text: string): string => {
    let rest = ohneWoerter(text, persoenlich);

    rest = ohneWoerter(rest, GRUNDWOERTER);
    rest = rest.replace(/(19|20)\d\d/g, '');
    rest = ohneWiederholungen(rest);
    rest = ohneFolgen(rest);
    rest = ohneWiederholungen(rest);

    return rest;
  };

  const klar = vereinheitliche(passwort);

  const a = pruefe(klar);
  const b = pruefe(ohneLeet(klar));

  return a.length <= b.length ? a : b;
};

export const istZuSchwach = (
  passwort: string,
  bezug?: { email?: string | null; namen?: (string | null | undefined)[] },
): boolean => eigenerAnteil(passwort, bezug).length < MINDESTREST;

export const pruefePasswort = (
  passwort: string,
  bezug?: { email?: string | null; namen?: (string | null | undefined)[] },
): void => {
  if (istZuSchwach(passwort, bezug)) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message:
        'Dieses Passwort ist leicht zu erraten (bekanntes Wort, Zahlen- oder Tastaturfolge, Jahreszahl oder Ihr Name). Nehmen Sie besser mehrere zufällige Wörter oder ein Passwort aus einer Passwortverwaltung.',
      reason: PASSWORT_ZU_SCHWACH,
    });
  }
};
