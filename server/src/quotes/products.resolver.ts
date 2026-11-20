import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { CreateProductInput, UpdateProductInput } from './dto/product.dto';
import { ProductEntity } from './product.entity';
import { ProductsService } from './products.service';

const SEHEN = [Permission.QUOTE_VIEW, Permission.INVOICE_VIEW] as const;
const AENDERN = [Permission.QUOTE_WRITE, Permission.INVOICE_WRITE] as const;

@Resolver(() => ProductEntity)
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class ProductsResolver {
  constructor(
    private readonly productsService: ProductsService,
    private readonly permissions: PermissionsService,
  ) {}

  @Query(() => [ProductEntity])
  async products(
    @CurrentUser() user: RequestUser,
    @Args('includeInactive', { nullable: true, defaultValue: false })
    includeInactive: boolean,
  ): Promise<ProductEntity[]> {
    await this.permissions.assertAny(user, SEHEN, 'den Artikelstamm zu sehen');

    return this.productsService.list(user.workspaceId, includeInactive);
  }

  @Mutation(() => ProductEntity)
  async createProduct(
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateProductInput,
  ): Promise<ProductEntity> {
    await this.permissions.assertAny(
      user,
      AENDERN,
      'den Artikelstamm zu ändern',
    );

    return this.productsService.create(user.workspaceId, input);
  }

  @Mutation(() => ProductEntity)
  async updateProduct(
    @CurrentUser() user: RequestUser,
    @Args('input') input: UpdateProductInput,
  ): Promise<ProductEntity> {
    await this.permissions.assertAny(
      user,
      AENDERN,
      'den Artikelstamm zu ändern',
    );

    return this.productsService.update(user.workspaceId, input.id, input);
  }
}
