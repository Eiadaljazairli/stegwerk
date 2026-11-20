import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { KalenderVerbindungEntity } from './kalender-verbindung.entity';

@Entity({ name: 'kalender_eintraege' })
@Index(['verbindungId', 'href'], { unique: true })
@Index(['appointmentId'])
export class KalenderEintragEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  verbindungId: string;

  @ManyToOne(() => KalenderVerbindungEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'verbindungId' })
  verbindung: KalenderVerbindungEntity;

  @Column({ type: 'uuid', nullable: true })
  appointmentId: string | null;

  @Column({ type: 'varchar', length: 1000 })
  href: string;

  @Column({ type: 'varchar', length: 500 })
  uid: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  etag: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lokalStand: Date | null;
}
