import { Injectable } from '@nestjs/common';
import { Field, Int, ObjectType } from '@nestjs/graphql';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import {
  domainOf,
  isPublicDomain,
  normaliseAddress,
  parseAddressList,
} from '../mailboxes/address-match';
import { adresseGesperrt } from '../mailboxes/sperrliste';

export const RUECKBLICK_TAGE = 90;

export const HOECHSTENS = 10;

const MAX_NACHRICHTEN = 2_000;

const SAMMELADRESSEN = new Set([
  'info',
  'kontakt',
  'contact',
  'office',
  'buero',
  'mail',
  'post',
  'service',
  'support',
  'hilfe',
  'help',
  'team',
  'hallo',
  'hello',
  'sales',
  'vertrieb',
  'verkauf',
  'buchhaltung',
  'rechnung',
  'rechnungen',
  'invoice',
  'billing',
  'newsletter',
  'noreply',
  'no-reply',
  'donotreply',
  'do-not-reply',
  'mailer-daemon',
  'postmaster',
  'admin',
  'webmaster',
  'bewerbung',
  'jobs',
  'karriere',
  'presse',
  'datenschutz',
]);

export const istSammeladresse = (adresse: string): boolean => {
  const lokal = adresse.slice(0, adresse.lastIndexOf('@')).toLowerCase();

  return SAMMELADRESSEN.has(lokal) || /^(no-?reply|bounce)/u.test(lokal);
};

@ObjectType()
export class EinladungsVorschlag {
  @Field()
  email: string;

  @Field(() => String, { nullable: true })
  name: string | null;

  @Field(() => Int)
  anzahl: number;
}

export type Fundstelle = { email: string; name: string | null };

export type Ausschluss = {
  domain: string;
  bekannt: ReadonlySet<string>;
  sperren: ReadonlySet<string>;
};

export const vorschlaegeAus = (
  fundstellen: Fundstelle[],
  ausschluss: Ausschluss,
  hoechstens = HOECHSTENS,
): EinladungsVorschlag[] => {
  if (ausschluss.domain === '' || isPublicDomain(ausschluss.domain)) {
    return [];
  }

  const gezaehlt = new Map<string, EinladungsVorschlag>();

  for (const fund of fundstellen) {
    const email = normaliseAddress(fund.email);

    if (
      email === '' ||
      domainOf(email) !== ausschluss.domain ||
      ausschluss.bekannt.has(email) ||
      istSammeladresse(email) ||
      adresseGesperrt(email, ausschluss.sperren)
    ) {
      continue;
    }

    const bisher = gezaehlt.get(email) ?? { email, name: null, anzahl: 0 };
    const name = (fund.name ?? '').trim();

    bisher.anzahl += 1;

    if (bisher.name === null && name !== '' && !name.includes('@')) {
      bisher.name = name.slice(0, 200);
    }

    gezaehlt.set(email, bisher);
  }

  return [...gezaehlt.values()]
    .sort((a, b) => b.anzahl - a.anzahl || a.email.localeCompare(b.email))
    .slice(0, hoechstens);
};

export const empfaengerMitNamen = (zeile: string): Fundstelle[] => {
  const teile: string[] = [];
  let aktuell = '';
  let inAnfuehrung = false;

  for (const zeichen of zeile) {
    if (zeichen === '"') {
      inAnfuehrung = !inAnfuehrung;
    }

    if (zeichen === ',' && !inAnfuehrung) {
      teile.push(aktuell);
      aktuell = '';
    } else {
      aktuell += zeichen;
    }
  }

  teile.push(aktuell);

  return teile.flatMap((teil) => {
    const [email] = parseAddressList(teil);

    if (email === undefined) {
      return [];
    }

    const vorne = teil.includes('<')
      ? teil.split('<')[0].replace(/"/gu, '').trim()
      : '';

    return [{ email, name: vorne === '' ? null : vorne }];
  });
};

@Injectable()
export class EinladungsVorschlaegeService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async fuer(
    userId: string,
    workspaceId: string,
    jetzt = new Date(),
  ): Promise<EinladungsVorschlag[]> {
    const ich = (await this.dataSource.query(
      `SELECT "email" FROM "users" WHERE "id" = $1`,
      [userId],
    )) as { email: string }[];
    const eigene = normaliseAddress(ich[0]?.email ?? '');
    const domain = domainOf(eigene);

    if (domain === '' || isPublicDomain(domain)) {
      return [];
    }

    const seit = new Date(jetzt.getTime() - RUECKBLICK_TAGE * 86_400_000);
    const bis = new Date(jetzt.getTime() + 7 * 86_400_000);

    const nachrichten = (await this.dataSource.query(
      `SELECT m."fromAddress", m."fromName", m."toAddresses"
         FROM "mail_messages" m
         JOIN "mailboxes" b ON b."id" = m."mailboxId"
        WHERE b."userId" = $1 AND b."workspaceId" = $2
          AND b."art" = 'persoenlich'
          AND m."workspaceId" = $2 AND m."sentAt" >= $3
        ORDER BY m."sentAt" DESC
        LIMIT ${String(MAX_NACHRICHTEN)}`,
      [userId, workspaceId, seit],
    )) as {
      fromAddress: string;
      fromName: string | null;
      toAddresses: string;
    }[];

    const teilnehmer = (await this.dataSource.query(
      `SELECT aa."email", aa."name"
         FROM "appointment_attendees" aa
         JOIN "appointments" a ON a."id" = aa."appointmentId"
        WHERE a."workspaceId" = $2 AND aa."workspaceId" = $2
          AND a."ownerId" = $1
          AND aa."email" IS NOT NULL
          AND a."startsAt" >= $3 AND a."startsAt" <= $4`,
      [userId, workspaceId, seit, bis],
    )) as { email: string; name: string | null }[];

    const bekannt = (await this.dataSource.query(
      `SELECT lower(u."email") AS "email" FROM "memberships" mm
         JOIN "users" u ON u."id" = mm."userId"
        WHERE mm."workspaceId" = $1
       UNION
       SELECT lower("email") FROM "invitations"
        WHERE "workspaceId" = $1 AND "acceptedAt" IS NULL
          AND "expiresAt" > $2
       UNION
       SELECT lower("username") FROM "mailboxes" WHERE "userId" = $3
       UNION
       SELECT lower(alias) FROM "mailboxes", unnest("aliase") AS alias
        WHERE "userId" = $3`,
      [workspaceId, jetzt, userId],
    )) as { email: string }[];

    const sperren = (await this.dataSource.query(
      `SELECT "eintrag" FROM "mail_sperren" WHERE "workspaceId" = $1`,
      [workspaceId],
    )) as { eintrag: string }[];

    const fundstellen: Fundstelle[] = [];

    for (const n of nachrichten) {
      fundstellen.push({ email: n.fromAddress, name: n.fromName });

      fundstellen.push(...empfaengerMitNamen(n.toAddresses));
    }

    fundstellen.push(...teilnehmer);

    return vorschlaegeAus(fundstellen, {
      domain,
      bekannt: new Set([eigene, ...bekannt.map((b) => b.email)]),
      sperren: new Set(sperren.map((s) => s.eintrag)),
    });
  }
}
