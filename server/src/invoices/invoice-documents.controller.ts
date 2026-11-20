import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { type Request, type Response } from 'express';

import { ZugangsWache } from '../api-keys/api-key.guard';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { InvoiceDocumentsService } from './invoice-documents.service';

@Controller('invoices')
@UseGuards(ZugangsWache)
export class InvoiceDocumentsController {
  constructor(
    private readonly documents: InvoiceDocumentsService,
    private readonly permissions: PermissionsService,
  ) {}

  @Get('datev')
  async datev(
    @Req() request: Request,
    @Query('from') von: string,
    @Query('to') bis: string,
    @Res() response: Response,
  ): Promise<void> {
    const user = request.user as RequestUser;

    await this.permissions.assert(
      user,
      Permission.INVOICE_VIEW,
      'Rechnungen zu sehen',
    );

    const { fileName, content } = await this.documents.datev(
      user.workspaceId,
      String(von ?? ''),
      String(bis ?? ''),
    );

    response
      .status(200)
      .setHeader('Content-Type', 'text/csv; charset=windows-1252')
      .setHeader('Content-Length', String(content.length))
      .setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
      .setHeader('Access-Control-Expose-Headers', 'Content-Disposition')
      .end(content);
  }

  @Get(':id/pdf')
  async pdf(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const user = request.user as RequestUser;

    await this.permissions.assert(
      user,
      Permission.INVOICE_VIEW,
      'eine Rechnung zu sehen',
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

  @Get(':id/xrechnung')
  async xrechnung(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const user = request.user as RequestUser;

    await this.permissions.assert(
      user,
      Permission.INVOICE_VIEW,
      'eine Rechnung zu sehen',
    );

    const { fileName, content } = await this.documents.xrechnung(
      user.workspaceId,
      id,
    );

    response
      .status(200)
      .setHeader('Content-Type', 'application/xml; charset=utf-8')
      .setHeader('Content-Length', String(content.length))
      .setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
      .setHeader('Access-Control-Expose-Headers', 'Content-Disposition')
      .end(content);
  }
}
