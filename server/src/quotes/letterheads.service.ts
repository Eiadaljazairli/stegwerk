import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { logoArt, logoFehler } from './firmenlogo';
import { LetterheadEntity } from './letterhead.entity';
import {
  isValidIban,
  isValidVatId,
  type LetterheadGap,
  letterheadGaps,
} from './letterhead-checks';

export type LetterheadInput = Partial<{
  companyName: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  representative: string | null;
  registerEntry: string | null;
  taxNumber: string | null;
  vatId: string | null;
  bankName: string | null;
  iban: string | null;
  bic: string | null;
  smallBusiness: boolean;
  defaultValidityDays: number;
  defaultIntroText: string | null;
  defaultClosingText: string | null;
}>;

const MAX_VALIDITY_DAYS = 365;

@Injectable()
export class LetterheadsService {
  constructor(
    @InjectRepository(LetterheadEntity)
    private readonly repository: Repository<LetterheadEntity>,
  ) {}

  async get(workspaceId: string): Promise<LetterheadEntity> {
    const existing = await this.repository.findOne({ where: { workspaceId } });

    if (existing !== null) {
      return existing;
    }

    try {
      return await this.repository.save(
        this.repository.create({ workspaceId }),
      );
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      ) {
        return this.repository.findOneOrFail({ where: { workspaceId } });
      }

      throw error;
    }
  }

  private check(input: LetterheadInput): void {
    if (
      input.iban !== undefined &&
      input.iban !== null &&
      input.iban.trim() !== '' &&
      !isValidIban(input.iban)
    ) {
      throw new BadRequestException(
        'Diese IBAN stimmt nicht. Bitte prüfen Sie die Ziffern.',
      );
    }

    if (
      input.vatId !== undefined &&
      input.vatId !== null &&
      input.vatId.trim() !== '' &&
      !isValidVatId(input.vatId)
    ) {
      throw new BadRequestException(
        'Diese USt-IdNr. hat nicht die erwartete Form.',
      );
    }

    if (input.defaultValidityDays !== undefined) {
      if (
        !Number.isInteger(input.defaultValidityDays) ||
        input.defaultValidityDays < 1 ||
        input.defaultValidityDays > MAX_VALIDITY_DAYS
      ) {
        throw new BadRequestException(
          'Die Gültigkeit muss zwischen 1 und 365 Tagen liegen.',
        );
      }
    }
  }

  async update(
    workspaceId: string,
    input: LetterheadInput,
  ): Promise<LetterheadEntity> {
    this.check(input);

    const letterhead = await this.get(workspaceId);

    const cleaned: LetterheadInput = Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        typeof value === 'string'
          ? value.trim() === ''
            ? null
            : value.trim()
          : value,
      ]),
    );

    this.repository.merge(letterhead, cleaned);

    return this.repository.save(letterhead);
  }

  async setLogo(workspaceId: string, bytes: Buffer): Promise<LetterheadEntity> {
    const fehler = logoFehler(bytes);

    if (fehler !== null) {
      throw new BadRequestException(fehler);
    }

    const letterhead = await this.get(workspaceId);

    letterhead.logo = bytes;
    letterhead.logoMime = logoArt(bytes);

    return this.repository.save(letterhead);
  }

  async removeLogo(workspaceId: string): Promise<LetterheadEntity> {
    const letterhead = await this.get(workspaceId);

    letterhead.logo = null;
    letterhead.logoMime = null;

    return this.repository.save(letterhead);
  }

  async gaps(workspaceId: string): Promise<LetterheadGap[]> {
    return letterheadGaps(await this.get(workspaceId));
  }
}
