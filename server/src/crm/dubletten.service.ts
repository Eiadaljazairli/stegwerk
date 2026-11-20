import { bereinigeZweitdomains } from './domains';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource, type EntityManager } from 'typeorm';
import {
  CustomFieldEntity,
  type CustomFieldValues,
} from '../custom-fields/custom-field.types';
import { verweiseUmhaengen } from '../custom-fields/verknuepfung';

import { CompanyEntity } from './entities/company.entity';
import { ContactEntity } from './entities/contact.entity';
import { emailTrifftSql, kontaktwegeVereinen } from './kontaktwege';
import {
  istSchreibbar,
  istSichtbar,
  sichtbarkeitsBedingung,
} from '../workspaces/sichtbarkeit';

export type Dublette = { id: string; name: string; detail: string | null };

export const MAX_ZUSAMMENFUEHREN = 9;

export type ZusammenfuehrenErgebnis = {
  felder: { feld: string; vonId: string }[];
  eigeneFelder: number;
  umgehaengt: { was: string; anzahl: number }[];
};

class NurProbe extends Error {
  constructor(readonly ergebnis: ZusammenfuehrenErgebnis) {
    super('nur Probe');
  }
}

const leer = (wert: unknown): boolean =>
  wert === null || wert === undefined || wert === '';

const ohneLeere = (werte: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(werte).filter(
      ([, wert]) => !leer(wert) && !(Array.isArray(wert) && wert.length === 0),
    ),
  );

const BEZEICHNUNG: Record<string, string> = {
  contacts: 'Kontakte',
  deals: 'Geschäfte',
  tasks: 'Aufgaben',
  notes: 'Notizen',
  appointments: 'Termine',
  appointment_attendees: 'Teilnahmen an Terminen',
  deal_kontakte: 'Beteiligungen an Geschäften',
  attachments: 'Dateien',
  quotes: 'Angebote',
  invoices: 'Rechnungen',
  mail_messages: 'Mails',
  verteiler_mitglieder: 'Verteiler',
};

const RECHTSFORM =
  /\b(gmbh|mbh|ag|kg|ohg|ug|gbr|e\.?\s?k\.?|e\.?\s?v\.?|se|co\.?|haftungsbeschränkt|&)\b/giu;

export const firmenSchluessel = (name: string): string =>
  name
    .toLowerCase()
    .replace(RECHTSFORM, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const domainVon = (wert: string | null | undefined): string | null => {
  const roh = (wert ?? '').trim().toLowerCase();

  if (roh === '') {
    return null;
  }

  return roh
    .replace(/^https?:\/\//u, '')
    .replace(/^www\./u, '')
    .replace(/\/.*$/u, '');
};

const FIRMA_FELDER = [
  'domain',
  'website',
  'linkedin',
  'industry',
  'employeeCount',
  'annualRevenue',
  'street',
  'postalCode',
  'city',
  'country',
  'invoiceEmail',
  'phone',
  'email',
  'vertretung',
  'registergericht',
  'registernummer',
  'ustIdNr',
  'ownerId',
] as const;

const KONTAKT_FELDER = [
  'email',
  'phone',
  'jobTitle',
  'street',
  'postalCode',
  'city',
  'country',
  'linkedin',
  'companyId',
  'ownerId',
] as const;

@Injectable()
export class DublettenService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async firmen(
    workspaceId: string,
    name: string,
    domain?: string | null,
    ausser?: string | null,
  ): Promise<Dublette[]> {
    const schluessel = firmenSchluessel(name);
    const erstesWort = schluessel.split(' ')[0] ?? '';
    const dom = domainVon(domain);

    if (erstesWort.length < 2 && dom === null) {
      return [];
    }

    const sichtFirma = await sichtbarkeitsBedingung('company', 'c');
    const kandidaten = await this.dataSource
      .getRepository(CompanyEntity)
      .createQueryBuilder('c')
      .where(sichtFirma?.where ?? 'TRUE', sichtFirma?.parameters ?? {})
      .andWhere('c.workspaceId = :workspaceId', { workspaceId })
      .andWhere(
        '(c.name ILIKE :anfang OR (:dom::text IS NOT NULL AND (lower(c.domain) LIKE :domLike OR c.zweitdomains ? :dom::text)))',
        {
          anfang: `%${erstesWort.replace(/[%_]/gu, '')}%`,
          dom,
          domLike: `%${(dom ?? '').replace(/[%_]/gu, '')}%`,
        },
      )
      .take(50)
      .getMany();

    return kandidaten
      .filter((c) => c.id !== ausser)
      .filter(
        (c) =>
          (schluessel !== '' && firmenSchluessel(c.name) === schluessel) ||
          (dom !== null &&
            (domainVon(c.domain) === dom ||
              (c.zweitdomains ?? []).includes(dom))),
      )
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        name: c.name,
        detail: [c.domain, c.city].filter(Boolean).join(' · ') || null,
      }));
  }

  async kontakte(
    workspaceId: string,
    vorname: string,
    nachname: string,
    email?: string | null,
    ausser?: string | null,
  ): Promise<Dublette[]> {
    const mail = (email ?? '').trim().toLowerCase();
    const vn = vorname.trim().toLowerCase();
    const nn = nachname.trim().toLowerCase();

    if (mail === '' && (vn === '' || nn === '')) {
      return [];
    }

    const sichtKontakt = await sichtbarkeitsBedingung('contact', 'k');
    const treffer = await this.dataSource
      .getRepository(ContactEntity)
      .createQueryBuilder('k')
      .leftJoinAndSelect('k.company', 'company')
      .where(sichtKontakt?.where ?? 'TRUE', sichtKontakt?.parameters ?? {})
      .andWhere('k.workspaceId = :workspaceId', { workspaceId })
      .andWhere(
        `((:mail <> '' AND ${emailTrifftSql('k', 'mail')}) OR (:vn <> '' AND :nn <> '' AND lower(k.firstName) = :vn AND lower(k.lastName) = :nn))`,
        { mail, vn, nn },
      )
      .take(6)
      .getMany();

    const ergebnis: Dublette[] = [];

    for (const k of treffer.filter((k) => k.id !== ausser).slice(0, 5)) {
      const firma =
        k.company !== null &&
        (await istSichtbar('company', k.company.ownerId, k.company.id))
          ? k.company.name
          : null;

      ergebnis.push({
        id: k.id,
        name: `${k.firstName} ${k.lastName}`.trim(),
        detail: [k.email, firma].filter(Boolean).join(' · ') || null,
      });
    }

    return ergebnis;
  }

  async zusammenfuehren(
    workspaceId: string,
    art: 'firma' | 'kontakt',
    behaltenId: string,
    wegId: string,
    vonUserId: string | null,
  ): Promise<void> {
    await this.zusammenfuehrenMehrere(
      workspaceId,
      art,
      behaltenId,
      [wegId],
      vonUserId,
    );
  }

  async vorschau(
    workspaceId: string,
    art: 'firma' | 'kontakt',
    behaltenId: string,
    wegIds: string[],
  ): Promise<ZusammenfuehrenErgebnis> {
    try {
      await this.zusammenfuehrenMehrere(
        workspaceId,
        art,
        behaltenId,
        wegIds,
        null,
        true,
      );
    } catch (fehler) {
      if (fehler instanceof NurProbe) {
        return fehler.ergebnis;
      }

      throw fehler;
    }

    throw new Error('Die Vorschau hätte zurückgerollt werden müssen.');
  }

  async zusammenfuehrenMehrere(
    workspaceId: string,
    art: 'firma' | 'kontakt',
    behaltenId: string,
    wegIdsRoh: string[],
    vonUserId: string | null,
    nurProbe = false,
  ): Promise<ZusammenfuehrenErgebnis> {
    const wegIds = [...new Set(wegIdsRoh)];

    if (wegIds.includes(behaltenId)) {
      throw new BadRequestException(
        'Ein Datensatz lässt sich nicht mit sich selbst zusammenführen.',
      );
    }

    if (wegIds.length === 0) {
      throw new BadRequestException(
        'Wählen Sie mindestens einen weiteren Datensatz.',
      );
    }

    if (wegIds.length + 1 > MAX_ZUSAMMENFUEHREN) {
      throw new BadRequestException(
        `Es lassen sich höchstens ${String(MAX_ZUSAMMENFUEHREN)} Datensätze auf einmal zusammenführen.`,
      );
    }

    const ziel = art === 'firma' ? CompanyEntity : ContactEntity;
    const felder: readonly string[] =
      art === 'firma' ? FIRMA_FELDER : KONTAKT_FELDER;
    const sichtArt = art === 'firma' ? 'company' : 'contact';

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository<CompanyEntity | ContactEntity>(ziel);
      const alleIds = [behaltenId, ...wegIds];

      const gesperrt = await repo
        .createQueryBuilder('zeile')
        .setLock('pessimistic_write')
        .where('zeile.workspaceId = :workspaceId', { workspaceId })
        .andWhere('zeile.id IN (:...alleIds)', { alleIds })
        .orderBy('zeile.id')
        .getMany();
      const nachId = new Map(gesperrt.map((zeile) => [zeile.id, zeile]));
      const behalten = nachId.get(behaltenId);
      const andere = wegIds
        .map((id) => nachId.get(id))
        .filter(
          (zeile): zeile is CompanyEntity | ContactEntity =>
            zeile !== undefined,
        );

      if (
        behalten === undefined ||
        andere.length !== wegIds.length ||
        !(await istSchreibbar(sichtArt, behalten.ownerId, behalten.id)) ||
        !(
          await Promise.all(
            andere.map((zeile) =>
              istSchreibbar(sichtArt, zeile.ownerId, zeile.id),
            ),
          )
        ).every(Boolean)
      ) {
        throw new BadRequestException(
          'Alle Datensätze müssen in diesem Bereich existieren und für Sie sichtbar sein.',
        );
      }

      const umgehaengt = await this.verweiseUmhaengen(
        manager,
        ziel,
        art,
        workspaceId,
        behaltenId,
        wegIds,
      );

      const ergaenzt: Record<string, unknown> = {};
      const herkunft: { feld: string; vonId: string }[] = [];

      for (const feld of felder) {
        if (!leer((behalten as unknown as Record<string, unknown>)[feld])) {
          continue;
        }

        const quelle = andere.find(
          (zeile) => !leer((zeile as unknown as Record<string, unknown>)[feld]),
        );

        if (quelle !== undefined) {
          ergaenzt[feld] = (quelle as unknown as Record<string, unknown>)[feld];
          herkunft.push({ feld, vonId: quelle.id });
        }
      }

      const vorher = ohneLeere(behalten.customFields ?? {});
      let dazu: Record<string, unknown> = {};

      for (const zeile of [...andere].reverse()) {
        dazu = { ...dazu, ...ohneLeere(zeile.customFields ?? {}) };
      }

      const eigeneFelder = Object.keys(dazu).filter(
        (schluessel) => !(schluessel in vorher),
      ).length;
      const eigene = {
        ...(behalten.customFields ?? {}),
        ...dazu,
        ...vorher,
      };

      if (art === 'kontakt') {
        let stand = { ...behalten, ...ergaenzt } as ContactEntity;

        for (const zeile of andere) {
          stand = {
            ...stand,
            ...kontaktwegeVereinen(stand, zeile as ContactEntity),
          };
        }

        Object.assign(ergaenzt, {
          email: stand.email,
          phone: stand.phone,
          weitereEmails: stand.weitereEmails,
          weitereTelefone: stand.weitereTelefone,
        });
      }

      if (art === 'firma') {
        const firma = { ...behalten, ...ergaenzt } as CompanyEntity;
        const alle = [
          ...(firma.zweitdomains ?? []),
          ...andere.flatMap((zeile) => {
            const andereFirma = zeile as CompanyEntity;

            return [
              andereFirma.domain ?? '',
              ...(andereFirma.zweitdomains ?? []),
            ];
          }),
        ];
        const zweitdomains = bereinigeZweitdomains(alle, firma.domain, {
          still: true,
        });

        if (
          zweitdomains.length !==
          (behalten as CompanyEntity).zweitdomains?.length
        ) {
          ergaenzt.zweitdomains = zweitdomains;
        }
      }

      await repo.save({
        ...behalten,
        ...ergaenzt,
        customFields: eigene as CustomFieldValues,
      });

      for (const zeile of andere) {
        await repo.update(
          { id: zeile.id, workspaceId },
          { deletedById: vonUserId },
        );
        await repo.softRemove(zeile);
      }

      const ergebnis: ZusammenfuehrenErgebnis = {
        felder: herkunft,
        eigeneFelder,
        umgehaengt,
      };

      if (nurProbe) {
        throw new NurProbe(ergebnis);
      }

      return ergebnis;
    });
  }

  private async verweiseUmhaengen(
    manager: EntityManager,
    ziel: typeof CompanyEntity | typeof ContactEntity,
    art: 'firma' | 'kontakt',
    workspaceId: string,
    behaltenId: string,
    wegIds: string[],
  ): Promise<{ was: string; anzahl: number }[]> {
    const anzahl = new Map<string, number>();
    const zaehle = (was: string, n: number) => {
      if (n > 0) {
        anzahl.set(was, (anzahl.get(was) ?? 0) + n);
      }
    };

    if (art === 'kontakt') {
      await manager.query(
        `DELETE FROM "deal_kontakte" d
          WHERE d."workspaceId" = $1 AND d."contactId" = ANY($2::uuid[])
            AND EXISTS (
              SELECT 1 FROM "deal_kontakte" e
               WHERE e."dealId" = d."dealId"
                 AND (e."contactId" = $3
                      OR (e."contactId" = ANY($2::uuid[]) AND e."id" < d."id"))
            )`,
        [workspaceId, wegIds, behaltenId],
      );
      await manager.query(
        `DELETE FROM "verteiler_mitglieder" m
          WHERE m."workspaceId" = $1 AND m."contactId" = ANY($2::uuid[])
            AND EXISTS (
              SELECT 1 FROM "verteiler_mitglieder" e
               WHERE e."verteilerId" = m."verteilerId"
                 AND (e."contactId" = $3
                      OR (e."contactId" = ANY($2::uuid[])
                          AND e."contactId" < m."contactId"))
            )`,
        [workspaceId, wegIds, behaltenId],
      );
    }

    for (const metadata of this.dataSource.entityMetadatas) {
      for (const relation of metadata.manyToOneRelations) {
        if (relation.inverseEntityMetadata.target !== ziel) {
          continue;
        }

        const spalte = relation.joinColumns[0]?.databaseName;
        const hatBereich = metadata.findColumnWithPropertyName('workspaceId');

        if (spalte === undefined) {
          continue;
        }

        const [, n] = (await manager.query(
          `UPDATE "${metadata.tableName}" SET "${spalte}" = $1 WHERE "${spalte}" = ANY($2::uuid[])${
            hatBereich === undefined ? '' : ' AND "workspaceId" = $3'
          }`,
          hatBereich === undefined
            ? [behaltenId, wegIds]
            : [behaltenId, wegIds, workspaceId],
        )) as [unknown, number];

        zaehle(BEZEICHNUNG[metadata.tableName] ?? metadata.tableName, n);
      }
    }

    if (art === 'kontakt') {
      await manager.query(
        `DELETE FROM "deal_kontakte" d
          USING "deals" g
          WHERE g."id" = d."dealId" AND d."workspaceId" = $1
            AND d."contactId" = $2 AND g."primaryContactId" = $2`,
        [workspaceId, behaltenId],
      );
    }

    await manager.query(
      `DELETE FROM "favoriten" f
        WHERE f."workspaceId" = $1 AND f."art" = $2
          AND f."datensatzId" = ANY($3::uuid[])
          AND EXISTS (
            SELECT 1 FROM "favoriten" g
             WHERE g."workspaceId" = f."workspaceId" AND g."art" = f."art"
               AND g."userId" = f."userId"
               AND (g."datensatzId" = $4
                    OR (g."datensatzId" = ANY($3::uuid[]) AND g."id" < f."id"))
          )`,
      [workspaceId, art, wegIds, behaltenId],
    );

    const [, favoriten] = (await manager.query(
      `UPDATE "favoriten" SET "datensatzId" = $4
        WHERE "workspaceId" = $1 AND "art" = $2 AND "datensatzId" = ANY($3::uuid[])`,
      [workspaceId, art, wegIds, behaltenId],
    )) as [unknown, number];

    zaehle('Favoriten', favoriten);

    zaehle(
      'Verknüpfungsfelder',
      await verweiseUmhaengen(
        manager,
        workspaceId,
        art === 'firma' ? CustomFieldEntity.COMPANY : CustomFieldEntity.CONTACT,
        wegIds,
        behaltenId,
      ),
    );

    if (art === 'firma') {
      const [, ansichten] = (await manager.query(
        `UPDATE "saved_views"
            SET "filters" = jsonb_set("filters", '{companyId}', to_jsonb($3::text))
          WHERE "workspaceId" = $1 AND "filters"->>'companyId' = ANY($2::text[])`,
        [workspaceId, wegIds, behaltenId],
      )) as [unknown, number];

      zaehle('Ansichten', ansichten);
    } else {
      const [, empfaenger] = (await manager.query(
        `UPDATE "kampagnen_empfaenger" SET "contactId" = $3
          WHERE "workspaceId" = $1 AND "contactId" = ANY($2::uuid[])`,
        [workspaceId, wegIds, behaltenId],
      )) as [unknown, number];

      zaehle('Serienmail-Empfänge', empfaenger);
    }

    return [...anzahl.entries()].map(([was, n]) => ({ was, anzahl: n }));
  }
}
