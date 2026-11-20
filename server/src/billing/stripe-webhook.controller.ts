import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import { type Request } from 'express';

import { StripeService } from './stripe.service';

@Controller('billing')
export class StripeWebhookController {
  constructor(private readonly stripeService: StripeService) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: boolean }> {
    if (signature === undefined) {
      throw new BadRequestException('Missing Stripe signature');
    }

    if (request.rawBody === undefined) {
      throw new BadRequestException('Raw body unavailable');
    }

    let event: ReturnType<StripeService['constructEvent']>;

    try {
      event = this.stripeService.constructEvent(request.rawBody, signature);
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }

    await this.stripeService.handleEvent(event);

    return { received: true };
  }
}
