import { Field, ID, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { CustomFieldValuesScalar } from '../custom-fields/custom-field-values.scalar';
import { CustomFieldEntity } from '../custom-fields/custom-field.types';
import { UserEntity } from '../users/user.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import {
  SavedViewColumnsScalar,
  SavedViewFiltersScalar,
} from './saved-view-filters.scalar';

@ObjectType('SavedView')
@Entity({ name: 'saved_views' })
@Index('IDX_saved_views_team_name', ['workspaceId', 'entity', 'name'], {
  unique: true,
  where: '"privat" = false',
})
@Index(
  'IDX_saved_views_privat_name',
  ['workspaceId', 'entity', 'createdById', 'name'],
  { unique: true, where: '"privat" = true' },
)
export class SavedViewEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Index()
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: WorkspaceEntity;

  @Field(() => CustomFieldEntity)
  @Column({ type: 'varchar', length: 20 })
  entity: CustomFieldEntity;

  @Field()
  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  createdById: string;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'createdById' })
  createdBy: UserEntity | null;

  @Field()
  @Column({ type: 'boolean', default: false })
  privat: boolean;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 200, nullable: true })
  search: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 70, nullable: true })
  sortField: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 4, nullable: true })
  sortDirection: string | null;

  @Field(() => SavedViewFiltersScalar)
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  customFilters: unknown[];

  @Field(() => CustomFieldValuesScalar)
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  filters: Record<string, string | number | boolean | null>;

  @Field(() => SavedViewColumnsScalar)
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  columns: string[];

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 80, nullable: true })
  gruppierung: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 4, nullable: true })
  filterVerknuepfung: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 10, nullable: true })
  darstellung: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 80, nullable: true })
  gruppenFeld: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 80, nullable: true })
  datumFeld: string | null;

  @Field()
  isDefault: boolean;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
