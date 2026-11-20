import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { UserEntity } from '../users/user.entity';

@Entity({ name: 'nutzung' })
export class NutzungEntity {
  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @PrimaryColumn({ type: 'date' })
  tag: string;

  @PrimaryColumn({ type: 'varchar', length: 40 })
  bereich: string;

  @PrimaryColumn({ type: 'varchar', length: 10 })
  art: string;

  @Column({ type: 'integer', default: 0 })
  anzahl: number;
}
