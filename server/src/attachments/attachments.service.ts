import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { assertVerweiseImBereich } from '../workspaces/verweise';
import {
  assertAnhangSchreibbar,
  type ZielMitAkte,
  zielMitAkte,
} from './attachment-rechte';
import { AttachmentBlobEntity } from './attachment-blob.entity';
import { AttachmentAbgelehnt, pruefeAnhang } from './attachment-rules';
import { AttachmentEntity } from './attachment.entity';

export type AttachmentZiel = {
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  quoteId?: string | null;
  invoiceId?: string | null;
  taskId?: string | null;
  noteId?: string | null;
};

const ZIELSPALTEN = [
  'companyId',
  'contactId',
  'dealId',
  'quoteId',
  'invoiceId',
  'taskId',
  'noteId',
] as const;

export const SPEICHER_JE_BEREICH = 2 * 1024 ** 3;

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectRepository(AttachmentEntity)
    private readonly attachments: Repository<AttachmentEntity>,
    private readonly dataSource: DataSource,
  ) {}

  private einZiel(ziel: AttachmentZiel): Record<string, string | null> {
    const gesetzt = ZIELSPALTEN.filter(
      (spalte) => ziel[spalte] !== undefined && ziel[spalte] !== null,
    );

    if (gesetzt.length !== 1) {
      throw new BadRequestException(
        'Ein Anhang gehört zu genau einem Datensatz.',
      );
    }

    return Object.fromEntries(
      ZIELSPALTEN.map((spalte) => [spalte, ziel[spalte] ?? null]),
    );
  }

  async list(
    workspaceId: string,
    ziel: AttachmentZiel,
  ): Promise<AttachmentEntity[]> {
    const spalten = this.einZiel(ziel);

    return this.attachments.find({
      where: { workspaceId, ...spalten },
      order: { createdAt: 'DESC' },
      relations: { uploadedBy: true },
    });
  }

  async hochladender(user: {
    userId: string;
    workspaceId: string;
    apiKey?: { id: string };
  }): Promise<string | null> {
    if (user.apiKey === undefined) {
      return user.userId;
    }

    const [schluessel] = (await this.dataSource.query(
      `SELECT "createdById" FROM "api_keys" WHERE "id" = $1 AND "workspaceId" = $2`,
      [user.apiKey.id, user.workspaceId],
    )) as { createdById: string | null }[];

    return schluessel?.createdById ?? null;
  }

  async create(input: {
    workspaceId: string;
    userId: string | null;
    name: string;
    mimeType: string;
    bytes: Buffer;
    ziel: AttachmentZiel;
  }): Promise<AttachmentEntity> {
    const spalten = this.einZiel(input.ziel);

    await assertVerweiseImBereich(
      this.dataSource.manager,
      input.workspaceId,
      input.ziel,
    );
    await this.mitAkte(input.workspaceId, input.ziel);

    let name: string;

    try {
      name = pruefeAnhang({ name: input.name, sizeBytes: input.bytes.length });
    } catch (fehler) {
      if (fehler instanceof AttachmentAbgelehnt) {
        throw new BadRequestException(fehler.message);
      }

      throw fehler;
    }

    const belegt = await this.dataSource.manager
      .createQueryBuilder(AttachmentEntity, 'a')
      .select('COALESCE(SUM(a."sizeBytes"), 0)', 'summe')
      .where('a."workspaceId" = :workspaceId', {
        workspaceId: input.workspaceId,
      })
      .getRawOne<{ summe: string }>();

    if (Number(belegt?.summe ?? 0) + input.bytes.length > SPEICHER_JE_BEREICH) {
      throw new BadRequestException(
        `Der Speicher für Anhänge ist voll (${String(SPEICHER_JE_BEREICH / 1024 ** 3)} GB). Löschen Sie alte Anhänge oder sprechen Sie uns an.`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const anhang = manager.create(AttachmentEntity, {
        workspaceId: input.workspaceId,
        uploadedById: input.userId,
        name,
        mimeType: input.mimeType.slice(0, 180),
        sizeBytes: input.bytes.length,
        ...spalten,
      });

      const gespeichert = await manager.save(anhang);

      await manager.save(
        manager.create(AttachmentBlobEntity, {
          attachmentId: gespeichert.id,
          bytes: input.bytes,
        }),
      );

      return gespeichert;
    });
  }

  mitAkte(workspaceId: string, ziel: AttachmentZiel): Promise<ZielMitAkte> {
    return zielMitAkte(this.dataSource.manager, workspaceId, ziel);
  }

  assertSchreibbar(ziel: ZielMitAkte): Promise<void> {
    return assertAnhangSchreibbar(this.dataSource.manager, ziel);
  }

  async zielVon(workspaceId: string, id: string): Promise<ZielMitAkte> {
    const anhang = await this.attachments.findOne({
      where: { id, workspaceId },
    });

    if (anhang === null) {
      throw new NotFoundException('Anhang nicht gefunden.');
    }

    return this.mitAkte(workspaceId, {
      companyId: anhang.companyId,
      contactId: anhang.contactId,
      dealId: anhang.dealId,
      quoteId: anhang.quoteId,
      invoiceId: anhang.invoiceId,
      taskId: anhang.taskId,
      noteId: anhang.noteId,
    });
  }

  async download(
    workspaceId: string,
    id: string,
  ): Promise<{ name: string; mimeType: string; bytes: Buffer }> {
    const anhang = await this.attachments.findOne({
      where: { id, workspaceId },
    });

    if (anhang === null) {
      throw new NotFoundException('Anhang nicht gefunden.');
    }

    const blob = await this.dataSource
      .getRepository(AttachmentBlobEntity)
      .findOne({ where: { attachmentId: id } });

    if (blob === null) {
      throw new NotFoundException('Der Inhalt dieses Anhangs fehlt.');
    }

    return { name: anhang.name, mimeType: anhang.mimeType, bytes: blob.bytes };
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    const ergebnis = await this.attachments.delete({ id, workspaceId });

    if (ergebnis.affected === 0) {
      throw new NotFoundException('Anhang nicht gefunden.');
    }

    return true;
  }
}
