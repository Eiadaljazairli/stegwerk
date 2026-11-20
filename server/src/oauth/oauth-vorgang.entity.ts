import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

import {
  type OAuthAnbieter,
  type OAuthZweck,
  type PostfachVorgangArt,
} from './oauth-anbieter';

@Entity({ name: 'oauth_vorgaenge' })
export class OAuthVorgangEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  stateHash: string;

  @Column({ type: 'varchar', length: 64 })
  bindungHash: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 20 })
  anbieter: OAuthAnbieter;

  @Column({ type: 'varchar', length: 20 })
  zweck: OAuthZweck;

  @Column({ type: 'varchar', length: 12, nullable: true })
  postfachArt: PostfachVorgangArt | null;

  @Column({ type: 'text' })
  verifierVersiegelt: string;

  @Column({ type: 'timestamptz' })
  gueltigBis: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
