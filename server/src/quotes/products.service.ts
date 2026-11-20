import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ProductEntity } from './product.entity';
import { DEFAULT_UNIT, TAX_RATES } from './quote.types';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly repository: Repository<ProductEntity>,
  ) {}

  list(workspaceId: string, includeInactive = false): Promise<ProductEntity[]> {
    return this.repository.find({
      where: includeInactive ? { workspaceId } : { workspaceId, active: true },
      order: { name: 'ASC' },
    });
  }

  private check(input: {
    name?: string;
    unitPriceCents?: number;
    taxRatePercent?: number;
  }): void {
    if (input.name !== undefined && input.name.trim() === '') {
      throw new BadRequestException('Ein Artikel braucht einen Namen.');
    }

    if (input.unitPriceCents !== undefined && input.unitPriceCents < 0) {
      throw new BadRequestException('Ein Preis kann nicht negativ sein.');
    }

    if (
      input.taxRatePercent !== undefined &&
      !TAX_RATES.includes(input.taxRatePercent as (typeof TAX_RATES)[number])
    ) {
      throw new BadRequestException(
        `${input.taxRatePercent}% ist kein Steuersatz, den dieser Katalog kennt.`,
      );
    }
  }

  async create(
    workspaceId: string,
    input: {
      name: string;
      articleNumber?: string | null;
      description?: string | null;
      unitPriceCents: number;
      unit?: string;
      taxRatePercent: number;
    },
  ): Promise<ProductEntity> {
    this.check(input);

    return this.repository.save(
      this.repository.create({
        workspaceId,
        name: input.name.trim(),
        articleNumber: input.articleNumber ?? null,
        description: input.description ?? null,
        unitPriceCents: input.unitPriceCents,
        unit: input.unit ?? DEFAULT_UNIT,
        taxRatePercent: input.taxRatePercent,
      }),
    );
  }

  async update(
    workspaceId: string,
    id: string,
    input: Partial<{
      name: string;
      articleNumber: string | null;
      description: string | null;
      unitPriceCents: number;
      unit: string;
      taxRatePercent: number;
      active: boolean;
    }>,
  ): Promise<ProductEntity> {
    this.check(input);

    const product = await this.repository.findOne({
      where: { id, workspaceId },
    });

    if (product === null) {
      throw new NotFoundException('Diesen Artikel gibt es nicht.');
    }

    this.repository.merge(product, input);

    return this.repository.save(product);
  }
}
