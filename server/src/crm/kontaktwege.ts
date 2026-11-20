import { BadRequestException } from '@nestjs/common';
import { Field, InputType, ObjectType } from '@nestjs/graphql';
import { IsIn, IsNotEmpty, Matches, MaxLength } from 'class-validator';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export const EMAIL_ARTEN = ['arbeit', 'privat', 'sonstige'] as const;

export const TELEFON_ARTEN = [
  'mobil',
  'festnetz',
  'arbeit',
  'privat',
  'fax',
  'sonstige',
] as const;

export type EmailArt = (typeof EMAIL_ARTEN)[number];

export type TelefonArt = (typeof TELEFON_ARTEN)[number];

export const MAX_WEITERE = 10;

export type Kontaktweg = { art: string; wert: string };

@ObjectType('KontaktEmail')
export class KontaktEmail {
  @Field()
  art: string;

  @Field()
  wert: string;

  @Field(() => Date, { nullable: true })
  unzustellbarSeit?: Date | null;
}

@ObjectType('KontaktTelefon')
export class KontaktTelefon {
  @Field()
  art: string;

  @Field()
  wert: string;
}

@InputType()
export class KontaktEmailInput {
  @Field()
  @IsIn(EMAIL_ARTEN)
  art: string;

  @Field()
  @IsNotEmpty()
  @MaxLength(320)
  wert: string;
}

export const TELEFON_MELDUNG =
  'Eine Telefonnummer braucht mindestens eine Ziffer.';

export const hatZiffer = (roh: string): boolean => /^\s*$|\d/u.test(roh);

export const Telefonnummer = (): PropertyDecorator =>
  Matches(/^\s*$|\d/u, { message: TELEFON_MELDUNG });

@InputType()
export class KontaktTelefonInput {
  @Field()
  @IsIn(TELEFON_ARTEN)
  art: string;

  @Field()
  @IsNotEmpty()
  @Telefonnummer()
  @MaxLength(40)
  wert: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export const normalisiereTelefon = (roh: string): string => {
  const text = roh.trim();

  if (text === '') {
    return '';
  }

  const nummer = parsePhoneNumberFromString(text, 'DE');

  return nummer !== undefined && nummer.isValid() ? nummer.number : text;
};

export const normalisiereTelefonOderNull = (
  roh: string | null | undefined,
): string | null => {
  if (roh === null || roh === undefined) {
    return roh ?? null;
  }

  const wert = normalisiereTelefon(roh);

  return wert === '' ? null : wert.slice(0, 40);
};

export const normalisiereEmail = (roh: string): string =>
  roh.trim().toLowerCase();

export const bereinigeEmails = (
  liste: readonly Kontaktweg[],
  haupt: string | null | undefined,
  vorher: readonly KontaktEmail[] = [],
  ueberzaehligAblehnen = true,
): KontaktEmail[] => {
  const hauptadresse = normalisiereEmail(haupt ?? '');
  const gesehen = new Set<string>(hauptadresse === '' ? [] : [hauptadresse]);
  const ergebnis: KontaktEmail[] = [];

  for (const eintrag of liste) {
    const wert = normalisiereEmail(eintrag.wert);

    if (wert === '' || gesehen.has(wert)) {
      continue;
    }

    if (!EMAIL.test(wert) || wert.length > 320) {
      throw new BadRequestException(
        `„${eintrag.wert}“ ist keine E-Mail-Adresse.`,
      );
    }

    gesehen.add(wert);

    const alt = vorher.find((v) => v.wert === wert);

    ergebnis.push({
      art: (EMAIL_ARTEN as readonly string[]).includes(eintrag.art)
        ? eintrag.art
        : 'sonstige',
      wert,
      ...(alt?.unzustellbarSeit == null
        ? {}
        : { unzustellbarSeit: alt.unzustellbarSeit }),
    });
  }

  if (ergebnis.length > MAX_WEITERE) {
    if (!ueberzaehligAblehnen) {
      return ergebnis.slice(0, MAX_WEITERE);
    }

    throw new BadRequestException(
      `Höchstens ${String(MAX_WEITERE)} weitere E-Mail-Adressen je Kontakt.`,
    );
  }

  return ergebnis;
};

export const bereinigeTelefone = (
  liste: readonly Kontaktweg[],
  haupt: string | null | undefined,
  ueberzaehligAblehnen = true,
): KontaktTelefon[] => {
  const hauptnummer = normalisiereTelefon(haupt ?? '');
  const gesehen = new Set<string>(hauptnummer === '' ? [] : [hauptnummer]);
  const ergebnis: KontaktTelefon[] = [];

  for (const eintrag of liste) {
    const wert = normalisiereTelefon(eintrag.wert).slice(0, 40);

    if (wert === '' || gesehen.has(wert)) {
      continue;
    }

    gesehen.add(wert);
    ergebnis.push({
      art: (TELEFON_ARTEN as readonly string[]).includes(eintrag.art)
        ? eintrag.art
        : 'sonstige',
      wert,
    });
  }

  if (ergebnis.length > MAX_WEITERE) {
    if (!ueberzaehligAblehnen) {
      return ergebnis.slice(0, MAX_WEITERE);
    }

    throw new BadRequestException(
      `Höchstens ${String(MAX_WEITERE)} weitere Telefonnummern je Kontakt.`,
    );
  }

  return ergebnis;
};

export const alleEmails = (kontakt: {
  email: string | null;
  weitereEmails?: readonly Kontaktweg[] | null;
}): string[] => [
  ...new Set(
    [kontakt.email ?? '', ...(kontakt.weitereEmails ?? []).map((e) => e.wert)]
      .map(normalisiereEmail)
      .filter((wert) => wert !== ''),
  ),
];

export const emailTrifftSql = (alias: string, parameter: string): string =>
  `(lower(${alias}.email) = :${parameter} OR ${alias}."weitereEmails" @> jsonb_build_array(jsonb_build_object('wert', CAST(:${parameter} AS text))))`;

export const emailInSql = (alias: string, parameter: string): string =>
  `(lower(${alias}.email) IN (:...${parameter}) OR EXISTS (SELECT 1 FROM jsonb_array_elements(${alias}."weitereEmails") AS weitere WHERE weitere->>'wert' IN (:...${parameter})))`;

export const kontaktwegeVereinen = (
  bleibt: {
    email: string | null;
    phone: string | null;
    weitereEmails?: KontaktEmail[] | null;
    weitereTelefone?: KontaktTelefon[] | null;
  },
  geht: {
    email: string | null;
    phone: string | null;
    weitereEmails?: KontaktEmail[] | null;
    weitereTelefone?: KontaktTelefon[] | null;
  },
): { weitereEmails: KontaktEmail[]; weitereTelefone: KontaktTelefon[] } => {
  const emails = [
    ...(bleibt.weitereEmails ?? []),
    ...(geht.email === null ? [] : [{ art: 'sonstige', wert: geht.email }]),
    ...(geht.weitereEmails ?? []),
  ];
  const telefone = [
    ...(bleibt.weitereTelefone ?? []),
    ...(geht.phone === null ? [] : [{ art: 'sonstige', wert: geht.phone }]),
    ...(geht.weitereTelefone ?? []),
  ];

  return {
    weitereEmails: bereinigeEmails(emails, bleibt.email, emails, false),
    weitereTelefone: bereinigeTelefone(telefone, bleibt.phone, false),
  };
};
