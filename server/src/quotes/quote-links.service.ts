import { randomBytes } from 'node:crypto';
import { befreiungsHinweise } from './steuerbefreiung';

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { berlinDate } from '../calendar/berlin-time';
import { huelle, sicher } from '../mail/layout';
import { MailService } from '../mail/mail.service';
import { UserEntity } from '../users/user.entity';
import { melde } from '../webhooks/ereignisse';
import { linkToken, signaturStimmt, zerlegeToken } from './angebots-link';
import { LetterheadsService } from './letterheads.service';
import { QuoteEntity } from './quote.entity';
import { lineNetCents, quoteTotals, type QuoteTotals } from './quote-totals';
import { QuoteStatus } from './quote.types';
import { QuotesService } from './quotes.service';

export type OeffentlichesAngebot = {
  number: string;
  status: 'offen' | 'angenommen' | 'abgelehnt';
  issuedOn: string;
  validUntil: string;
  abgelaufen: boolean;
  absender: {
    name: string | null;
    street: string | null;
    postalCode: string | null;
    city: string | null;
    email: string | null;
    phone: string | null;
  };
  empfaenger: string | null;
  introText: string | null;
  closingText: string | null;
  smallBusiness: boolean;
  steuerHinweise: string[];
  positionen: {
    name: string;
    description: string | null;
    quantity: number;
    unit: string;
    unitPriceCents: number;
    discountPercent: number;
    taxRatePercent: number;
    netCents: number;
  }[];
  summen: QuoteTotals;
  entschieden: { am: string; name: string | null } | null;
};

@Injectable()
export class QuoteLinksService {
  private readonly logger = new Logger(QuoteLinksService.name);

  constructor(
    @InjectRepository(QuoteEntity)
    private readonly quotes: Repository<QuoteEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly quotesService: QuotesService,
    private readonly letterheads: LetterheadsService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private get geheimnis(): string {
    return this.config.getOrThrow<string>('jwtSecret');
  }

  private get herkunft(): string {
    return this.config.get<string>('webOrigin') ?? 'http://localhost:5273';
  }

  publicLink(quote: QuoteEntity): string | null {
    if (quote.publicLinkNonce === null) {
      return null;
    }

    return `${this.herkunft}/angebot/${linkToken(this.geheimnis, quote.id, quote.publicLinkNonce)}`;
  }

  async createLink(
    workspaceId: string,
    id: string,
    userId: string,
  ): Promise<QuoteEntity> {
    const quote = await this.quotesService.findOne(workspaceId, id);

    if (quote.status === QuoteStatus.DRAFT) {
      throw new BadRequestException(
        'Erst versenden, dann den Link teilen: ein Entwurf kann sich noch ändern.',
      );
    }

    if (quote.publicLinkNonce === null) {
      await this.quotes.update(quote.id, {
        publicLinkNonce: randomBytes(16).toString('hex'),
        linkCreatedById: userId,
      });
    }

    return this.quotesService.findOne(workspaceId, id);
  }

  async revokeLink(workspaceId: string, id: string): Promise<QuoteEntity> {
    const quote = await this.quotesService.findOne(workspaceId, id);

    await this.quotes.update(quote.id, { publicLinkNonce: null });

    return this.quotesService.findOne(workspaceId, id);
  }

  async findByToken(token: string): Promise<QuoteEntity> {
    const teile = zerlegeToken(token);
    const nichtGefunden = new NotFoundException(
      'Dieses Angebot gibt es nicht, oder der Link wurde zurückgezogen.',
    );

    if (teile === null) {
      throw nichtGefunden;
    }

    const quote = await this.quotes.findOne({
      where: { id: teile.quoteId },
      relations: { lines: true },
    });

    if (
      quote === null ||
      !signaturStimmt(
        this.geheimnis,
        quote.id,
        quote.publicLinkNonce,
        teile.signatur,
      )
    ) {
      throw nichtGefunden;
    }

    return quote;
  }

  async view(quote: QuoteEntity): Promise<OeffentlichesAngebot> {
    const letterhead = await this.letterheads.get(quote.workspaceId);
    const zeilen = [...quote.lines].sort(
      (left, right) => left.position - right.position,
    );
    const positionen = zeilen.map((line) => {
      const zeile = {
        quantity: Number(line.quantity),
        unitPriceCents: line.unitPriceCents,
        discountPercent: Number(line.discountPercent),
        taxRatePercent: line.taxRatePercent,
      };

      return {
        name: line.name,
        description: line.description,
        unit: line.unit,
        ...zeile,
        netCents: lineNetCents(zeile),
      };
    });

    const status =
      quote.status === QuoteStatus.ACCEPTED
        ? 'angenommen'
        : quote.status === QuoteStatus.DECLINED
          ? 'abgelehnt'
          : 'offen';

    return {
      number: quote.number,
      status,
      issuedOn: quote.issuedOn,
      validUntil: quote.validUntil,
      abgelaufen: quote.validUntil < berlinDate(new Date()),
      absender: {
        name: letterhead.companyName,
        street: letterhead.street,
        postalCode: letterhead.postalCode,
        city: letterhead.city,
        email: letterhead.email,
        phone: letterhead.phone,
      },
      empfaenger: quote.recipientAddress,
      introText: quote.introText,
      closingText: quote.closingText,
      smallBusiness: quote.smallBusiness,
      steuerHinweise: befreiungsHinweise(quote),
      positionen,
      summen: quoteTotals(positionen, quote.smallBusiness),
      entschieden:
        quote.decidedAt === null
          ? null
          : { am: quote.decidedAt.toISOString(), name: quote.decidedByName },
    };
  }

  async decide(
    token: string,
    annehmen: boolean,
    name: string,
  ): Promise<OeffentlichesAngebot> {
    const quote = await this.findByToken(token);
    const unterschrift = name.replace(/[\u0000-\u001f\u007f]+/gu, ' ').trim();

    if (unterschrift.length < 2 || unterschrift.length > 200) {
      throw new BadRequestException(
        'Bitte geben Sie Ihren vollständigen Namen an.',
      );
    }

    if (quote.status !== QuoteStatus.SENT) {
      throw new BadRequestException(
        'Über dieses Angebot wurde bereits entschieden.',
      );
    }

    if (annehmen && quote.validUntil < berlinDate(new Date())) {
      throw new BadRequestException(
        'Dieses Angebot ist abgelaufen. Bitte fragen Sie ein neues an.',
      );
    }

    quote.status = annehmen ? QuoteStatus.ACCEPTED : QuoteStatus.DECLINED;
    quote.decidedAt = new Date();
    quote.decidedByName = unterschrift;
    quote.decidedOnline = true;

    const entschieden = await this.quotes.update(
      { id: quote.id, status: QuoteStatus.SENT },
      {
        status: quote.status,
        decidedAt: quote.decidedAt,
        decidedByName: quote.decidedByName,
        decidedOnline: true,
      },
    );

    if ((entschieden.affected ?? 0) === 0) {
      throw new BadRequestException(
        'Über dieses Angebot wurde bereits entschieden.',
      );
    }

    await this.benachrichtigen(quote, annehmen, unterschrift);

    melde({
      workspaceId: quote.workspaceId,
      event: annehmen ? 'quote.accepted' : 'quote.declined',
      data: {
        id: quote.id,
        number: quote.number,
        online: true,
        decidedByName: unterschrift,
      },
    });

    return this.view(quote);
  }

  private async benachrichtigen(
    quote: QuoteEntity,
    annehmen: boolean,
    name: string,
  ): Promise<void> {
    if (quote.linkCreatedById === null) {
      return;
    }

    const user = await this.users.findOne({
      where: { id: quote.linkCreatedById },
    });

    if (user === null) {
      return;
    }

    const wort = annehmen ? 'angenommen' : 'abgelehnt';
    const url = `${this.herkunft}/angebote/${quote.id}`;
    const satz = `${name} hat das Angebot ${quote.number} online ${wort}.`;

    await this.mail
      .send({
        to: user.email,
        subject: `Angebot ${quote.number} ${wort}`,
        text: [satz, '', 'Zum Angebot:', url].join('\n'),
        html: huelle({
          vorschau: satz,
          ueberschrift: `Angebot ${wort}`,
          absaetze: [sicher(satz)],
          knopf: { text: 'Zum Angebot', url },
        }),
      })
      .catch((error: unknown) => {
        this.logger.error(String(error));
      });
  }
}
