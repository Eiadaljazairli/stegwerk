import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { DealStage } from './deal.entity';

@Entity({ name: 'deal_stage_settings' })
@Index('UQ_deal_stage_settings_bereich', ['workspaceId', 'stage'], {
  unique: true,
  where: '"pipelineId" IS NULL',
})
@Index('UQ_deal_stage_settings_pipeline', ['pipelineId', 'stage'], {
  unique: true,
  where: '"pipelineId" IS NOT NULL',
})
export class DealStageSettingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'uuid', nullable: true })
  pipelineId: string | null;

  @Column({ type: 'varchar', length: 20 })
  stage: DealStage;

  @Column({ type: 'varchar', length: 40, nullable: true })
  label: string | null;

  @Column({ type: 'smallint', nullable: true })
  probability: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  farbe: string | null;

  @Column({ type: 'boolean', nullable: true })
  ausgeblendet: boolean | null;
}
