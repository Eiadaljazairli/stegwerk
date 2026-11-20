import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type Request } from 'express';

import { ZugangsWache } from '../api-keys/api-key.guard';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { BillingService } from '../billing/billing.service';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { LOGO_MAX_BYTES } from './firmenlogo';
import { LetterheadsService } from './letterheads.service';

const ZU_GROSS = 'Das Logo ist größer als 1 MB.';

@Controller('letterhead')
@UseGuards(ZugangsWache)
export class LetterheadLogoController {
  constructor(
    private readonly letterheads: LetterheadsService,
    private readonly permissions: PermissionsService,
    private readonly billing: BillingService,
  ) {}

  private async rumpf(request: Request): Promise<Buffer> {
    const angekuendigt = Number(request.headers['content-length'] ?? 0);

    if (Number.isFinite(angekuendigt) && angekuendigt > LOGO_MAX_BYTES) {
      throw new BadRequestException(ZU_GROSS);
    }

    return new Promise<Buffer>((resolve, reject) => {
      const stuecke: Buffer[] = [];
      let gelesen = 0;

      request.on('data', (stueck: Buffer) => {
        gelesen += stueck.length;

        if (gelesen > LOGO_MAX_BYTES) {
          request.destroy();
          reject(new BadRequestException(ZU_GROSS));

          return;
        }

        stuecke.push(stueck);
      });

      request.on('end', () => resolve(Buffer.concat(stuecke)));
      request.on('error', reject);
    });
  }

  @Post('logo')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async upload(@Req() request: Request): Promise<{ ok: true }> {
    const user = request.user as RequestUser;

    await this.permissions.assert(
      user,
      Permission.LETTERHEAD_MANAGE,
      'den Briefkopf zu ändern',
    );
    await this.billing.assertCanWrite(user.workspaceId);

    await this.letterheads.setLogo(user.workspaceId, await this.rumpf(request));

    return { ok: true };
  }
}
