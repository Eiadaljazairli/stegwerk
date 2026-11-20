import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'geplante_laeufe' })
export class GeplanterLaufEntity {
  @PrimaryColumn({ type: 'varchar', length: 60 })
  name: string;

  @Column({ type: 'integer' })
  intervallSek: number;

  @Column({ type: 'boolean', default: true })
  aktiv: boolean;

  @Column({ type: 'timestamptz' })
  angemeldetAm: Date;

  @Column({ type: 'timestamptz', nullable: true })
  letzterStart: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  letztesEnde: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  letzterErfolg: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  letzterFehlerAm: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  letzterFehler: string | null;

  @Column({ type: 'integer', nullable: true })
  letzteDauerMs: number | null;

  @Column({ type: 'integer', default: 0 })
  laeufe: number;

  @Column({ type: 'integer', default: 0 })
  fehlerInFolge: number;
}
