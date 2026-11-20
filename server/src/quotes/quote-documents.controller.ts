import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { type Request, type Response } from 'express';

import { ZugangsWache } from '../api-keys/api-key.guard';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { QuoteDocumentsService } from './quote-documents.service';

@Controller('quotes')
@UseGuards(ZugangsWache)
export class QuoteDocumentsController {
  constructor(
    private readonly documents: QuoteDocumentsService,
    private readonly permissions: PermissionsService,
  ) {}

  @Get(':id/pdf')
  async pdf(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const user = request.user as RequestUser;

    await this.permissions.assert(
      user,
      Permission.QUOTE_VIEW,
      'ein Angebot zu sehen',
    );

    const { fileName, content } = await this.documents.pdf(
      user.workspaceId,
      id,
    );

    response
      .status(200)
      .setHeader('Content-Type', 'application/pdf')
      .setHeader('Content-Length', String(content.length))
      .setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
      .setHeader('Access-Control-Expose-Headers', 'Content-Disposition')
      .end(content);
  }
}
