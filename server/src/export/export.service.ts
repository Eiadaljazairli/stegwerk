import { BadRequestException, Injectable } from '@nestjs/common';

import { CompaniesService } from '../crm/companies.service';
import { ContactsService } from '../crm/contacts.service';
import { DealsService } from '../crm/deals.service';
import { type ListArgs } from '../crm/dto/pagination.dto';
import {
  type Adresse,
  CustomFieldEntity,
  CustomFieldType,
  type Link,
} from '../custom-fields/custom-field.types';
import { adresseText, linksText } from '../custom-fields/zusammengesetzt';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { dateiTeil } from '../objekt-bezeichnungen/objekt-bezeichnungen';
import {
  type VerweisInfo,
  verweisIds,
  verweiseLaden,
} from '../custom-fields/verknuepfung';
import { istSichtbar } from '../workspaces/sichtbarkeit';
import { csvHeader, csvRow } from './csv';
import {
  eigenesSchluessel,
  type FeldArt,
  feldrechteJetzt,
  standardSchluessel,
} from '../workspaces/feldrechte';

type Column = {
  header: string;
  read: (row: Record<string, unknown>) => unknown;
  feld?: string;
};

const plain = (key: string, header: string): Column => ({
  header,
  read: (row) => row[key],
  feld: key,
});

const ART: Record<string, FeldArt> = {
  COMPANY: 'company',
  CONTACT: 'contact',
  DEAL: 'deal',
};

const via = (key: string, field: string, header: string): Column => ({
  header,
  read: (row) => {
    const related = row[key] as Record<string, unknown> | null | undefined;

    return related?.[field] ?? null;
  },
});

const liste = (key: string, header: string, feld: string): Column => ({
  header,
  read: (row) =>
    ((row[key] as { art: string; wert: string }[] | null | undefined) ?? [])
      .map((eintrag) => `${eintrag.art}: ${eintrag.wert}`)
      .join('; '),
  feld,
});

const unter = (key: string, header: string, feld: string): Column => ({
  header,
  read: (row) => row[key],
  feld,
});

const COLUMNS: Record<string, Column[]> = {
  COMPANY: [
    plain('name', 'Name'),
    plain('domain', 'Domain'),
    {
      header: 'Weitere Domains',
      read: (row) => ((row.zweitdomains as string[] | null) ?? []).join('; '),
      feld: 'zweitdomains',
    },
    plain('website', 'Website'),
    plain('linkedin', 'LinkedIn'),
    plain('industry', 'Branche'),
    plain('employeeCount', 'Mitarbeiter'),
    plain('annualRevenue', 'Jahresumsatz'),
    plain('street', 'Straße'),
    plain('postalCode', 'PLZ'),
    plain('city', 'Stadt'),
    plain('country', 'Land'),
    plain('phone', 'Telefon'),
    plain('email', 'E-Mail'),
    plain('vertretung', 'Vertreten durch'),
    plain('registergericht', 'Registergericht'),
    plain('registernummer', 'Registernummer'),
    plain('ustIdNr', 'USt-IdNr.'),
    plain('createdAt', 'Angelegt'),
  ],
  CONTACT: [
    plain('firstName', 'Vorname'),
    plain('lastName', 'Nachname'),
    plain('email', 'E-Mail'),
    plain('phone', 'Telefon'),
    liste('weitereEmails', 'Weitere E-Mails', 'email'),
    liste('weitereTelefone', 'Weitere Telefonnummern', 'phone'),
    plain('jobTitle', 'Position'),
    via('company', 'name', 'Firma'),
    unter('street', 'Straße', 'street'),
    unter('postalCode', 'PLZ', 'street'),
    unter('city', 'Stadt', 'street'),
    unter('country', 'Land', 'street'),
    plain('linkedin', 'LinkedIn'),
    plain('createdAt', 'Angelegt'),
  ],
  DEAL: [
    plain('name', 'Bezeichnung'),
    via('company', 'name', 'Firma'),
    {
      header: 'Hauptkontakt',
      read: (row) => {
        const kontakt = row.primaryContact as
          | { firstName: string; lastName: string }
          | null
          | undefined;

        return kontakt == null
          ? null
          : `${kontakt.firstName} ${kontakt.lastName}`.trim();
      },
    },
    { header: 'Weitere Kontakte', read: (row) => row.beteiligteText ?? null },
    plain('amount', 'Betrag'),
    plain('currency', 'Währung'),
    plain('stage', 'Phase'),
    plain('closeDate', 'Abschluss'),
    plain('createdAt', 'Angelegt'),
  ],
};

const FILE_NAMES: Record<string, string> = {
  COMPANY: 'Firmen',
  CONTACT: 'Kontakte',
  DEAL: 'Geschaefte',
};

@Injectable()
export class ExportService {
  constructor(
    private readonly companies: CompaniesService,
    private readonly contacts: ContactsService,
    private readonly deals: DealsService,
    private readonly customFields: CustomFieldsService,
  ) {}

  private serviceFor(entity: string) {
    if (entity === 'COMPANY') {
      return this.companies;
    }

    if (entity === 'CONTACT') {
      return this.contacts;
    }

    if (entity === 'DEAL') {
      return this.deals;
    }

    throw new BadRequestException(`"${entity}" lässt sich nicht exportieren.`);
  }

  fileName(entity: string, mehrzahl?: string): string {
    const today = new Date().toISOString().slice(0, 10);
    const standard = FILE_NAMES[entity] ?? entity;
    const name =
      mehrzahl === undefined ? standard : dateiTeil(mehrzahl, standard);

    return `${name}-${today}.csv`;
  }

  async csv(
    workspaceId: string,
    entity: string,
    args: ListArgs = {},
    filters: Record<string, unknown> = {},
    darfSehen: (art: CustomFieldEntity) => Promise<boolean> = () =>
      Promise.resolve(true),
  ): Promise<string> {
    const columns = COLUMNS[entity];

    if (columns === undefined) {
      throw new BadRequestException(
        `"${entity}" lässt sich nicht exportieren.`,
      );
    }

    const definitions = (
      await this.customFields.list(
        workspaceId,
        entity.toLowerCase() as CustomFieldEntity,
      )
    ).filter((definition) => !definition.gegenseite);

    const verweise = new Map<CustomFieldEntity, Map<string, VerweisInfo>>();
    const verweisText = (art: CustomFieldEntity, wert: unknown): string =>
      verweisIds(wert)
        .map((id) => verweise.get(art)?.get(id))
        .filter((info): info is VerweisInfo => info !== undefined)
        .map((info) => (info.sichtbar ? info.titel : 'Nicht sichtbar'))
        .join('; ');

    const rechte = await feldrechteJetzt();
    const art = ART[entity];
    const sichtbar = (schluessel: string) => rechte[schluessel] !== 'verborgen';

    const all: Column[] = [
      ...columns.filter(
        (column) =>
          column.feld === undefined ||
          sichtbar(standardSchluessel(art, column.feld)),
      ),
      ...definitions
        .filter((definition) =>
          sichtbar(eigenesSchluessel(art, definition.key)),
        )
        .map((definition) => ({
          header: definition.label,
          read: (row: Record<string, unknown>) => {
            const value =
              (row.customFields as Record<string, unknown> | null)?.[
                definition.key
              ] ?? null;

            if (definition.type === CustomFieldType.ADDRESS) {
              return value === null ? null : adresseText(value as Adresse);
            }

            if (definition.type === CustomFieldType.LINKS) {
              return Array.isArray(value) ? linksText(value as Link[]) : null;
            }

            if (
              definition.type === CustomFieldType.RELATION &&
              definition.zielEntity !== null
            ) {
              return value === null
                ? null
                : verweisText(definition.zielEntity, value);
            }

            return Array.isArray(value) ? value.join('; ') : value;
          },
        })),
    ];

    const geladen = await this.serviceFor(entity).listAll(
      workspaceId,
      args,
      filters,
    );

    for (const definition of definitions) {
      const art = definition.zielEntity;

      if (definition.type !== CustomFieldType.RELATION || art === null) {
        continue;
      }

      const ids = geladen.flatMap((row) =>
        verweisIds(
          (row as { customFields?: Record<string, unknown> | null })
            .customFields?.[definition.key],
        ),
      );
      const info = await verweiseLaden(
        this.customFields.manager,
        workspaceId,
        art,
        ids,
      );
      const darf = await darfSehen(art);
      const bisher = verweise.get(art) ?? new Map<string, VerweisInfo>();

      for (const [id, eintrag] of info) {
        bisher.set(id, darf ? eintrag : { titel: '', sichtbar: false });
      }

      verweise.set(art, bisher);
    }

    const rows: unknown[] = [];

    const beteiligte =
      entity === 'DEAL'
        ? await this.deals.beteiligteAlsText(
            workspaceId,
            geladen.map((row) => (row as { id: string }).id),
          )
        : new Map<string, string>();

    for (const row of geladen) {
      const firma = (
        row as { company?: { id: string; ownerId: string | null } | null }
      ).company;
      const kontakt = (
        row as {
          primaryContact?: { id: string; ownerId: string | null } | null;
        }
      ).primaryContact;
      const zeile: Record<string, unknown> = {
        ...(row as object),
        beteiligteText: beteiligte.get((row as { id: string }).id) ?? null,
      };

      if (
        firma !== null &&
        firma !== undefined &&
        !(await istSichtbar('company', firma.ownerId, firma.id))
      ) {
        zeile.company = null;
      }

      if (
        kontakt !== null &&
        kontakt !== undefined &&
        !(await istSichtbar('contact', kontakt.ownerId, kontakt.id))
      ) {
        zeile.primaryContact = null;
      }

      rows.push(zeile);
    }

    return (
      csvHeader(all.map((column) => column.header)) +
      rows
        .map((row) =>
          csvRow(
            all.map((column) =>
              column.read(row as unknown as Record<string, unknown>),
            ),
          ),
        )
        .join('')
    );
  }
}
