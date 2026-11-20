import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'invoice_counters' })
@Index(['workspaceId', 'year'], { unique: true })
export class InvoiceCounterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'integer' })
  year: number;

  @Column({ type: 'integer', default: 0 })
  lastSequence: number;
}
