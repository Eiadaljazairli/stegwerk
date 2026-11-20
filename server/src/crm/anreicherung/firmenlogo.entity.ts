import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';

import { CompanyEntity } from '../entities/company.entity';

@Entity({ name: 'firmenlogos' })
export class FirmenlogoEntity {
  @PrimaryColumn({ type: 'uuid' })
  companyId: string;

  @OneToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: CompanyEntity;

  @Index('IDX_firmenlogos_workspace')
  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'bytea' })
  bild: Buffer;

  @Column({ type: 'varchar', length: 20 })
  mime: string;

  @Column({ type: 'varchar', length: 500 })
  quelle: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  geholtAm: Date;
}
