import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Request, type Response } from 'express';

import { ZugangsWache } from '../api-keys/api-key.guard';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { AvvService } from './avv.service';

import { privacyFacts } from '../privacy/privacy-facts';
import { dpaDocument } from './dpa-document';
import { renderDpaPdf } from './dpa-pdf';

@Controller('legal')
export class LegalController {
  constructor(
    private readonly configService: ConfigService,
    private readonly avv: AvvService,
  ) {}

  @Get('auftragsverarbeitung/bereich.pdf')
  @UseGuards(ZugangsWache)
  async dpaBereich(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const user = request.user as RequestUser;
    const dokument = this.avv.vertrag();
    const [annahme, auftraggeber] = await Promise.all([
      this.avv.letzte(user.workspaceId),
      this.avv.auftraggeber(user.workspaceId),
    ]);
    const passt =
      annahme !== null && annahme.fassung === this.avv.fassung(dokument);

    const content = await renderDpaPdf(dokument, {
      auftraggeber,
      ...(passt
        ? {
            annahme: `Elektronisch angenommen am ${new Intl.DateTimeFormat(
              'de-DE',
              {
                dateStyle: 'long',
                timeStyle: 'short',
                timeZone: 'Europe/Berlin',
              },
            ).format(annahme.angenommenAm)} von ${annahme.angenommenVon} für ${
              annahme.auftraggeber
            }. Fassung ${annahme.fassung.slice(0, 16)}.`,
          }
        : {}),
    });

    response
      .status(200)
      .setHeader('Content-Type', 'application/pdf')
      .setHeader('Content-Length', String(content.length))
      .setHeader(
        'Content-Disposition',
        'attachment; filename="Auftragsverarbeitungsvertrag-Stegwerk.pdf"',
      )
      .setHeader('Access-Control-Expose-Headers', 'Content-Disposition')
      .end(content);
  }

  @Get('auftragsverarbeitung.pdf')
  async dpa(@Res() response: Response): Promise<void> {
    const legal = this.configService.get<Record<string, string>>('legal') ?? {};
    const name =
      legal.companyName === undefined || legal.companyName === ''
        ? null
        : `${legal.companyName}${
            legal.legalForm === undefined || legal.legalForm === ''
              ? ''
              : ` ${legal.legalForm}`
          }`;

    const content = await renderDpaPdf(
      dpaDocument(privacyFacts(process.env), name),
    );

    response
      .status(200)
      .setHeader('Content-Type', 'application/pdf')
      .setHeader('Content-Length', String(content.length))
      .setHeader(
        'Content-Disposition',
        'attachment; filename="Auftragsverarbeitungsvertrag.pdf"',
      )
      .setHeader('Access-Control-Expose-Headers', 'Content-Disposition')
      .end(content);
  }
}
