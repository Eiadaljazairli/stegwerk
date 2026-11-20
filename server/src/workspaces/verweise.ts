import { NotFoundException } from '@nestjs/common';
import { type EntityManager, type EntityTarget } from 'typeorm';

import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { InvoiceEntity } from '../invoices/invoice.entity';
import { QuoteEntity } from '../quotes/quote.entity';
import { MembershipEntity } from './membership.entity';

export type Verweise = {
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  quoteId?: string | null;
  invoiceId?: string | null;
  userIds?: readonly (string | null | undefined)[];
};

type ImBereich = { id: string; workspaceId: string };

const DATENSAETZE: readonly [
  Exclude<keyof Verweise, 'userIds'>,
  EntityTarget<ImBereich>,
  string,
][] = [
  [
    'companyId',
    CompanyEntity,
    'Diese Firma gibt es in diesem Arbeitsbereich nicht.',
  ],
  [
    'contactId',
    ContactEntity,
    'Diesen Kontakt gibt es in diesem Arbeitsbereich nicht.',
  ],
  [
    'dealId',
    DealEntity,
    'Dieses Geschäft gibt es in diesem Arbeitsbereich nicht.',
  ],
  [
    'quoteId',
    QuoteEntity,
    'Dieses Angebot gibt es in diesem Arbeitsbereich nicht.',
  ],
  [
    'invoiceId',
    InvoiceEntity,
    'Diese Rechnung gibt es in diesem Arbeitsbereich nicht.',
  ],
];

export const assertVerweiseImBereich = async (
  manager: EntityManager,
  workspaceId: string,
  verweise: Verweise,
): Promise<void> => {
  for (const [feld, ziel, meldung] of DATENSAETZE) {
    const id = verweise[feld];

    if (id === undefined || id === null) {
      continue;
    }

    const treffer = await manager.count(ziel, { where: { id, workspaceId } });

    if (treffer === 0) {
      throw new NotFoundException(meldung);
    }
  }

  const personen = new Set(
    (verweise.userIds ?? []).filter(
      (id): id is string => typeof id === 'string',
    ),
  );

  for (const userId of personen) {
    const mitglied = await manager.count(MembershipEntity, {
      where: { userId, workspaceId },
    });

    if (mitglied === 0) {
      throw new NotFoundException(
        'Diese Person gehört nicht zu diesem Arbeitsbereich.',
      );
    }
  }
};
