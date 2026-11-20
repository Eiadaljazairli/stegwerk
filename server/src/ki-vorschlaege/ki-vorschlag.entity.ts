import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ApiKeyEntity } from '../api-keys/api-key.entity';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';

export const VORSCHLAG_STATUS = ['offen', 'angenommen', 'verworfen'] as const;
export type VorschlagStatus = (typeof VORSCHLAG_STATUS)[number];

export type VorschlagZielArt = 'company' | 'contact' | 'deal' | 'quote';

@Entity({ name: 'ki_vorschlaege' })
@Index('IDX_ki_vorschlaege_offen', ['workspaceId', 'status', 'createdAt'])
export class KiVorschlagEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Column({ type: 'uuid', nullable: true })
  apiKeyId: string | null;

  @ManyToOne(() => ApiKeyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'apiKeyId' })
  apiKey: ApiKeyEntity | null;

  @Column({ type: 'varchar', length: 120 })
  schluesselName: string;

  @Column({ type: 'varchar', length: 60 })
  werkzeug: string;

  @Column({ type: 'varchar', length: 300 })
  zusammenfassung: string;

  @Column({ type: 'jsonb', default: {} })
  eingabe: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  vorher: Record<string, unknown> | null;

  @Column({ type: 'jsonb', default: {} })
  nachher: Record<string, unknown>;

  @Column({ type: 'varchar', length: 10, nullable: true })
  zielArt: VorschlagZielArt | null;

  @Column({ type: 'uuid', nullable: true })
  zielId: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  zielName: string | null;

  @Column({ type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ type: 'uuid', nullable: true })
  contactId: string | null;

  @Column({ type: 'uuid', nullable: true })
  dealId: string | null;

  @Column({ type: 'varchar', length: 12, default: 'offen' })
  status: VorschlagStatus;

  @Column({ type: 'uuid', nullable: true })
  entschiedenVonId: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'entschiedenVonId' })
  entschiedenVon: UserEntity | null;

  @Column({ type: 'timestamptz', nullable: true })
  entschiedenAm: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  grund: string | null;

  @Column({ type: 'jsonb', nullable: true })
  ergebnis: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  fehler: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
