import { NotFoundException } from '@nestjs/common';
import { type EntityManager } from 'typeorm';

import { NoteEntity } from '../crm/entities/note.entity';
import { TaskEntity } from '../crm/entities/task.entity';
import { InvoiceEntity } from '../invoices/invoice.entity';
import { QuoteEntity } from '../quotes/quote.entity';
import { Permission } from '../workspaces/permissions';
import {
  assertMehrfachZielSchreibbar,
  assertNeueZieleSchreibbar,
  mehrfachZielSichtbar,
  zielSichtbar,
} from '../workspaces/ziel-sichtbarkeit';
import { type AttachmentZiel } from './attachments.service';

const RECHTE = {
  companyId: {
    sehen: Permission.COMPANY_VIEW,
    aendern: Permission.COMPANY_WRITE,
  },
  contactId: {
    sehen: Permission.CONTACT_VIEW,
    aendern: Permission.CONTACT_WRITE,
  },
  dealId: {
    sehen: Permission.DEAL_VIEW,
    aendern: Permission.DEAL_WRITE,
  },
  quoteId: {
    sehen: Permission.QUOTE_VIEW,
    aendern: Permission.QUOTE_WRITE,
  },
  invoiceId: {
    sehen: Permission.INVOICE_VIEW,
    aendern: Permission.INVOICE_WRITE,
  },
  taskId: {
    sehen: Permission.TASK_VIEW,
    aendern: Permission.TASK_WRITE,
  },
} as const;

export type ZielMitAkte = AttachmentZiel & {
  akte?: Pick<AttachmentZiel, 'companyId' | 'contactId' | 'dealId'>;
};

export const rechteFuerZiel = (
  ziel: ZielMitAkte,
  art: 'sehen' | 'aendern',
): Permission[] => {
  const eigene = (Object.keys(RECHTE) as (keyof typeof RECHTE)[])
    .filter((spalte) => ziel[spalte] !== undefined && ziel[spalte] !== null)
    .map((spalte) => RECHTE[spalte][art]);

  if (ziel.akte === undefined) {
    return eigene;
  }

  const akteArt =
    ziel.noteId !== undefined && ziel.noteId !== null ? art : 'sehen';
  const akte = rechteFuerZiel(ziel.akte, akteArt);

  return [...new Set([...eigene, ...akte])];
};

export const assertAnhangSchreibbar = async (
  manager: EntityManager,
  ziel: ZielMitAkte,
): Promise<void> => {
  await assertNeueZieleSchreibbar(manager, {
    companyId: ziel.companyId,
    contactId: ziel.contactId,
    dealId: ziel.dealId,
  });

  if (ziel.noteId !== undefined && ziel.noteId !== null && ziel.akte) {
    await assertMehrfachZielSchreibbar(manager, ziel.akte);
  }
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export const zielMitAkte = async (
  manager: EntityManager,
  workspaceId: string,
  ziel: AttachmentZiel,
): Promise<ZielMitAkte> => {
  for (const id of [ziel.taskId, ziel.noteId]) {
    if (id !== undefined && id !== null && !UUID.test(id)) {
      throw new NotFoundException('Diesen Datensatz gibt es nicht.');
    }
  }

  const quelle =
    ziel.taskId !== undefined && ziel.taskId !== null
      ? await manager.findOne(TaskEntity, {
          where: { id: ziel.taskId, workspaceId },
        })
      : ziel.noteId !== undefined && ziel.noteId !== null
        ? await manager.findOne(NoteEntity, {
            where: { id: ziel.noteId, workspaceId },
          })
        : undefined;

  if (quelle === null) {
    throw new NotFoundException(
      ziel.taskId !== undefined && ziel.taskId !== null
        ? 'Diese Aufgabe gibt es in diesem Arbeitsbereich nicht.'
        : 'Diese Notiz gibt es in diesem Arbeitsbereich nicht.',
    );
  }

  if (!(await zielSichtbarFuerAnhang(manager, workspaceId, ziel, quelle))) {
    throw new NotFoundException('Diesen Datensatz gibt es nicht.');
  }

  if (quelle === undefined) {
    return ziel;
  }

  return {
    ...ziel,
    akte: {
      companyId: quelle.companyId,
      contactId: quelle.contactId,
      dealId: quelle.dealId,
    },
  };
};

const zielSichtbarFuerAnhang = async (
  manager: EntityManager,
  workspaceId: string,
  ziel: AttachmentZiel,
  quelle: TaskEntity | NoteEntity | undefined,
): Promise<boolean> => {
  if (!(await zielSichtbar(manager, ziel))) {
    return false;
  }

  if (quelle !== undefined) {
    const eigentuemer = quelle instanceof TaskEntity ? quelle.assigneeId : null;

    if (!(await mehrfachZielSichtbar(manager, quelle, eigentuemer))) {
      return false;
    }
  }

  if (ziel.quoteId !== undefined && ziel.quoteId !== null) {
    const angebot = await manager.findOne(QuoteEntity, {
      where: { id: ziel.quoteId, workspaceId },
    });

    if (
      angebot !== null &&
      !(await zielSichtbar(manager, angebot, angebot.bearbeiterId))
    ) {
      return false;
    }
  }

  if (ziel.invoiceId !== undefined && ziel.invoiceId !== null) {
    const rechnung = await manager.findOne(InvoiceEntity, {
      where: { id: ziel.invoiceId, workspaceId },
    });

    if (rechnung !== null && !(await zielSichtbar(manager, rechnung))) {
      return false;
    }
  }

  return true;
};
