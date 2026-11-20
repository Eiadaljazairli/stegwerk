import {
  BadRequestException,
  Controller,
  Get,
  Optional,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { type Request, type Response } from 'express';

import { ZugangsWache } from '../api-keys/api-key.guard';
import {
  CompanyListArgs,
  ContactListArgs,
  DealListArgs,
} from '../crm/dto/list-args.dto';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { ExportService } from './export.service';
import { ObjektArt } from '../objekt-bezeichnungen/objekt-bezeichnungen';
import { ObjektBezeichnungenService } from '../objekt-bezeichnungen/objekt-bezeichnungen.service';
import { meldeSicherheit } from '../sicherheit/melden';

const MAX_AUSWAHL = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const MAX_LISTE = 8_000;

const LISTEN_ARGS = {
  COMPANY: CompanyListArgs,
  CONTACT: ContactListArgs,
  DEAL: DealListArgs,
} as const;

const listeLesen = async (
  upper: string,
  roh: string | undefined,
): Promise<Record<string, unknown>> => {
  const klasse = LISTEN_ARGS[upper as keyof typeof LISTEN_ARGS];

  if (roh === undefined || roh === '' || klasse === undefined) {
    return {};
  }

  let wert: unknown;

  try {
    wert = roh.length > MAX_LISTE ? null : JSON.parse(roh);
  } catch {
    wert = null;
  }

  if (wert === null || typeof wert !== 'object' || Array.isArray(wert)) {
    throw new BadRequestException('Die Filter des Exports sind ungültig.');
  }

  const args = plainToInstance(klasse, wert);
  const fehler = await validate(args, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  if (fehler.length > 0) {
    throw new BadRequestException('Die Filter des Exports sind ungültig.');
  }

  return args as unknown as Record<string, unknown>;
};

const FILTER_FELDER: Record<string, string[]> = {
  COMPANY: ['industry', 'country', 'ownerId'],
  CONTACT: ['companyId', 'ownerId'],
  DEAL: [
    'stage',
    'companyId',
    'openOnly',
    'ruhendTage',
    'minAmount',
    'closeBefore',
    'ownerId',
    'pipelineId',
  ],
};

@Controller('export')
@UseGuards(ZugangsWache)
export class ExportController {
  constructor(
    private readonly exportService: ExportService,
    private readonly permissions: PermissionsService,
    @Optional()
    private readonly bezeichnungen?: ObjektBezeichnungenService,
  ) {}

  private async dateiname(workspaceId: string, upper: string) {
    const art: Partial<Record<string, ObjektArt>> = {
      COMPANY: ObjektArt.FIRMA,
      CONTACT: ObjektArt.KONTAKT,
      DEAL: ObjektArt.GESCHAEFT,
    };
    const gesucht = art[upper];
    const mehrzahl =
      gesucht === undefined || this.bezeichnungen === undefined
        ? undefined
        : (await this.bezeichnungen.bezeichnung(workspaceId, gesucht)).mehrzahl;

    return this.exportService.fileName(upper, mehrzahl);
  }

  @Get(':entity')
  async csv(
    @Req() request: Request,
    @Param('entity') entity: string,
    @Query('search') search: string | undefined,
    @Query('sortField') sortField: string | undefined,
    @Query('sortDirection') sortDirection: string | undefined,
    @Query('ids') ids: string | undefined,
    @Query('liste') liste: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const user = request.user as RequestUser;

    await this.permissions.assert(
      user,
      Permission.DATA_EXPORT,
      'Daten zu exportieren',
    );

    const upper = entity.toUpperCase();

    const leserecht: Partial<Record<string, Permission>> = {
      COMPANY: Permission.COMPANY_VIEW,
      CONTACT: Permission.CONTACT_VIEW,
      DEAL: Permission.DEAL_VIEW,
    };
    const recht = leserecht[upper];

    if (recht !== undefined) {
      await this.permissions.assert(user, recht, 'diese Liste zu sehen');
    }

    const auswahl =
      ids === undefined || ids === '' ? undefined : ids.split(',');

    if (
      auswahl !== undefined &&
      (auswahl.length > MAX_AUSWAHL || !auswahl.every((id) => UUID.test(id)))
    ) {
      throw new BadRequestException('Die Auswahl ist ungültig.');
    }

    const listenArgs = await listeLesen(upper, liste);
    const filter: Record<string, unknown> = {};

    for (const feld of FILTER_FELDER[upper] ?? []) {
      if (listenArgs[feld] !== undefined) {
        filter[feld] = listenArgs[feld];
      }
    }

    const csv = await this.exportService.csv(
      user.workspaceId,
      upper,
      {
        search: search === '' ? undefined : search,
        sortField,
        sortDirection: sortDirection === 'DESC' ? 'DESC' : 'ASC',
        customFilters: listenArgs.customFilters,
        filterVerknuepfung: listenArgs.filterVerknuepfung,
      } as never,
      auswahl === undefined ? filter : { ...filter, ids: auswahl },
      (art) => {
        const darf = leserecht[art.toUpperCase()];

        return darf === undefined
          ? Promise.resolve(false)
          : this.permissions.can(user, darf);
      },
    );

    meldeSicherheit({
      art: 'export',
      workspaceId: user.workspaceId,
      actorId: user.apiKey === undefined ? user.userId : null,
      details: {
        liste: upper,
        auswahl: auswahl?.length ?? null,
        schluessel: user.apiKey?.name ?? null,
      },
    });

    response
      .status(200)
      .setHeader('Content-Type', 'text/csv; charset=utf-8')
      .setHeader(
        'Content-Disposition',
        `attachment; filename="${await this.dateiname(user.workspaceId, upper)}"`,
      )
      .setHeader('Access-Control-Expose-Headers', 'Content-Disposition')
      .end(csv);
  }
}
