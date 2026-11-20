const LINK = /\[([^\]\n]{0,300})\]\(([^()\s]{1,2000})\)/gu;

const ERWAEHNUNG =
  /@\[([^\]\n]{1,120})\]\(nutzer:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/giu;

const ERLAUBTE_ZIELE = /^(?:https?:\/\/|mailto:|tel:|nutzer:)/iu;

const LINKZIEL = /\]\(\s*([^)\s]{1,2000})/gu;

const CONTAINER = String.raw`(?:[ \t]*(?:>|(?:[-*+]|\d{1,9}[.)])[ \t]))*[ \t]*`;
const REFERENZ = new RegExp(
  String.raw`^${CONTAINER}\[[^\]\n]{1,300}\]:[ \t]*(?:\n${CONTAINER})?<?([^\s<>]{1,2000})>?(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?[ \t]*$`,
  'gmu',
);

const AUTOLINK =
  /(?<=(?:^|[^\\])(?:\\\\)*)<([a-z][a-z0-9+.-]{1,31}:[^>\s]{0,2000})>/giu;

const SCHEMA = /^[a-z][a-z0-9+.-]{0,31}:/iu;

export const unerlaubteLinks = (text: string): string[] => {
  const ziele = (muster: RegExp): string[] =>
    [...text.matchAll(muster)].map((treffer) => treffer[1]);

  return [
    ...new Set(
      [
        ...ziele(LINKZIEL),
        ...ziele(REFERENZ).filter((ziel) => SCHEMA.test(ziel)),
        ...ziele(AUTOLINK),
      ].filter((ziel) => !ERLAUBTE_ZIELE.test(ziel)),
    ),
  ];
};

const STEUERZEICHEN = /[\\[\]()@*_#<>]/gu;

const NACKTE_ADRESSE = /(https?:\/\/[^\s<>()[\]"'\\]+)/iu;

const MASKIERT = /\\([\\[\]()@*_#<>])/gu;

export const alsReinerText = (text: string): string =>
  text
    .split(NACKTE_ADRESSE)
    .map((stueck, index) =>
      index % 2 === 1 ? stueck : stueck.replace(STEUERZEICHEN, '\\$&'),
    )
    .join('');

export const erwaehnteNutzer = (text: string | null | undefined): string[] =>
  text === null || text === undefined
    ? []
    : [
        ...new Set(
          [...text.matchAll(ERWAEHNUNG)].map((treffer) =>
            treffer[2].toLowerCase(),
          ),
        ),
      ];

export const alsKlartext = (text: string): string =>
  text
    .replace(MASKIERT, (_ganz, zeichen: string) =>
      String.fromCharCode(0xe000 + zeichen.charCodeAt(0)),
    )
    .replace(ERWAEHNUNG, (_ganz, name: string) => `@${name}`)
    .replace(LINK, (_ganz, beschriftung: string, ziel: string) =>
      beschriftung === '' ? ziel : beschriftung,
    )
    .split('\n')
    .map((zeile) =>
      zeile
        .replace(/^\s*#{1,3}\s+/u, '')
        .replace(/^\s*[-*]\s+\[[ xX]\]\s+/u, '')
        .replace(/^\s*[-*]\s+/u, '')
        .replace(/^\s*\d{1,3}[.)]\s+/u, ''),
    )
    .join('\n')
    .replace(/\*\*([^*\n]+)\*\*/gu, '$1')
    .replace(/(^|[^\w*])[*_]([^\s*_][^*_\n]*?)[*_](?=$|[^\w*])/gu, '$1$2')
    .replace(/[\ue000-\ue07f]/gu, (zeichen) =>
      String.fromCharCode(zeichen.charCodeAt(0) - 0xe000),
    );

export const kurzfassung = (text: string, laenge = 140): string => {
  const flach = alsKlartext(text).replace(/\s+/gu, ' ').trim();

  return flach.length > laenge ? `${flach.slice(0, laenge - 1)}…` : flach;
};
