import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { numericTransformer } from '../crm/numeric.transformer';
import { ProductEntity } from './product.entity';
import { QuoteEntity } from './quote.entity';

@ObjectType('QuoteLine')
@Entity({ name: 'quote_lines' })
@Index(['quoteId', 'position'])
export class QuoteLineEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Index()
  @Column({ type: 'uuid' })
  quoteId: string;

  @ManyToOne(() => QuoteEntity, (quote) => quote.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'quoteId' })
  quote: QuoteEntity;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  productId: string | null;

  @ManyToOne(() => ProductEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'productId' })
  product: ProductEntity | null;

  @Field(() => Int)
  @Column({ type: 'integer', default: 0 })
  position: number;

  @Field()
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 60, nullable: true })
  articleNumber: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Field(() => Float)
  @Column({
    type: 'numeric',
    precision: 12,
    scale: 3,
    default: 1,
    transformer: numericTransformer,
  })
  quantity: number;

  @Field()
  @Column({ type: 'varchar', length: 20 })
  unit: string;

  @Field(() => Int)
  @Column({ type: 'integer', default: 0 })
  unitPriceCents: number;

  @Field(() => Float)
  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  discountPercent: number;

  @Field(() => Int)
  @Column({ type: 'integer', default: 19 })
  taxRatePercent: number;
}
