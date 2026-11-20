import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type Request, type Response } from 'express';

import { ZugangsWache } from '../api-keys/api-key.guard';
import { BillingService } from '../billing/billing.service';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { PermissionsService } from '../workspaces/permissions.service';

import { rechteFuerZiel } from './attachment-rechte';
import { contentDisposition, MAX_BYTES } from './attachment-rules';
import { AttachmentsService, type AttachmentZiel } from './attachments.service';

@Controller('attachments')
@UseGuards(ZugangsWache)
export class AttachmentsController {
  constructor(
    private readonly attachments: AttachmentsService,
    private readonly permissions: PermissionsService,
    private readonly billing: BillingService,
  ) {}

  private async rumpf(request: Request): Promise<Buffer> {
    const angekuendigt = Number(request.headers['content-length'] ?? 0);

    if (Number.isFinite(angekuendigt) && angekuendigt > MAX_BYTES) {
      throw new BadRequestException(
        `Die Datei ist größer als ${String(MAX_BYTES / 1024 / 1024)} MB.`,
      );
    }

    return new Promise<Buffer>((resolve, reject) => {
      const stuecke: Buffer[] = [];
      let gelesen = 0;

      request.on('data', (stueck: Buffer) => {
        gelesen += stueck.length;

        if (gelesen > MAX_BYTES) {
          request.destroy();
          reject(
            new BadRequestException(
              `Die Datei ist größer als ${String(MAX_BYTES / 1024 / 1024)} MB.`,
            ),
          );

          return;
        }

        stuecke.push(stueck);
      });

      request.on('end', () => resolve(Buffer.concat(stuecke)));
      request.on('error', reject);
    });
  }

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async upload(
    @Req() request: Request,
    @Query('name') name: string | undefined,
    @Query('companyId') companyId: string | undefined,
    @Query('contactId') contactId: string | undefined,
    @Query('dealId') dealId: string | undefined,
    @Query('quoteId') quoteId: string | undefined,
    @Query('invoiceId') invoiceId: string | undefined,
    @Query('taskId') taskId: string | undefined,
    @Query('noteId') noteId: string | undefined,
  ): Promise<{ id: string; name: string; sizeBytes: number }> {
    const user = request.user as RequestUser;

    if (name === undefined || name.trim() === '') {
      throw new BadRequestException('Ohne Dateinamen.');
    }

    const ziel: AttachmentZiel = {
      companyId,
      contactId,
      dealId,
      quoteId,
      invoiceId,
      taskId,
      noteId,
    };

    const mitAkte = await this.attachments.mitAkte(user.workspaceId, ziel);

    for (const recht of rechteFuerZiel(mitAkte, 'aendern')) {
      await this.permissions.assert(user, recht, 'Anhänge hochzuladen');
    }

    await this.attachments.assertSchreibbar(mitAkte);

    await this.billing.assertCanWrite(user.workspaceId);

    const bytes = await this.rumpf(request);

    const anhang = await this.attachments.create({
      workspaceId: user.workspaceId,
      userId: await this.attachments.hochladender(user),
      name,
      mimeType: request.headers['content-type'] ?? 'application/octet-stream',
      bytes,
      ziel,
    });

    return {
      id: anhang.id,
      name: anhang.name,
      sizeBytes: anhang.sizeBytes,
    };
  }

  @Get(':id')
  async download(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const user = request.user as RequestUser;
    const ziel = await this.attachments.zielVon(user.workspaceId, id);

    for (const recht of rechteFuerZiel(ziel, 'sehen')) {
      await this.permissions.assert(user, recht, 'Anhänge zu sehen');
    }

    const datei = await this.attachments.download(user.workspaceId, id);

    response
      .status(200)
      .setHeader('Content-Type', 'application/octet-stream')
      .setHeader('X-Content-Type-Options', 'nosniff')
      .setHeader('Content-Length', String(datei.bytes.length))
      .setHeader('Content-Disposition', contentDisposition(datei.name))
      .setHeader('Access-Control-Expose-Headers', 'Content-Disposition')
      .end(datei.bytes);
  }
}
