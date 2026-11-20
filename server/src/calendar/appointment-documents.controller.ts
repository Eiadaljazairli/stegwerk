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
import { AppointmentsService } from './appointments.service';
import { berlinDate } from './berlin-time';
import { buildIcs } from './ics';
import { asEvent, IcsExportService } from './ics-export.service';

const fileNameFor = (title: string, date: string): string => {
  const kurz = title
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .trim()
    .slice(0, 60)
    .replace(/\s+/g, '-');

  return `${date}-${kurz === '' ? 'Termin' : kurz}.ics`;
};

@Controller('appointments')
@UseGuards(ZugangsWache)
export class AppointmentDocumentsController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly permissions: PermissionsService,
    private readonly ics: IcsExportService,
  ) {}

  @Get(':id/ics')
  async one(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const user = request.user as RequestUser;

    await this.permissions.assert(
      user,
      Permission.APPOINTMENT_VIEW,
      'einen Termin zu sehen',
    );

    const [appointment] = await this.appointments.fuerBetrachter(
      user.workspaceId,
      user.userId,
      [await this.appointments.byId(user.workspaceId, id)],
    );
    const attendees =
      appointment.geschwaerzt === true
        ? []
        : await this.appointments.attendeesOf(user.workspaceId, appointment.id);

    this.send(
      response,
      fileNameFor(appointment.title, berlinDate(appointment.startsAt)),
      buildIcs([asEvent(appointment, request.hostname, attendees)]),
    );
  }

  @Get('ics')
  async range(
    @Req() request: Request,
    @Res() response: Response,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('ownerId') ownerId?: string,
  ): Promise<void> {
    const user = request.user as RequestUser;

    await this.permissions.assert(
      user,
      Permission.APPOINTMENT_VIEW,
      'den Kalender zu sehen',
    );

    const body = await this.ics.zeitraum(
      user.workspaceId,
      from,
      to,
      ownerId ?? null,
      request.hostname,
      undefined,
      [],
      user.userId,
    );

    this.send(response, `Stegwerk-${from}-bis-${to}.ics`, body);
  }

  private send(response: Response, fileName: string, body: string): void {
    const content = Buffer.from(body, 'utf8');

    response
      .status(200)
      .setHeader('Content-Type', 'text/calendar; charset=utf-8')
      .setHeader('Content-Length', String(content.length))
      .setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
      .setHeader('Access-Control-Expose-Headers', 'Content-Disposition')
      .end(content);
  }
}
