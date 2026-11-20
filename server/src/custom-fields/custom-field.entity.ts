import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
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

import { WorkspaceEntity } from '../workspaces/workspace.entity';

import { CustomFieldGroupEntity } from './custom-field-group.entity';
import {
  CustomFieldEntity,
  CustomFieldType,
  type CustomFieldValue,
  type FeldEinstellungen,
  type OptionFarbe,
} from './custom-field.types';

@ObjectType()
export class CustomFieldOptionFarbe {
  @Field()
  option: string;

  @Field()
  farbe: string;
}

@ObjectType('CustomField')
@Entity({ name: 'custom_fields' })
@Index(['workspaceId', 'entity', 'key'], { unique: true })
export class CustomFieldDefinition {
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
  @Column({ type: 'varchar', length: 60 })
  key: string;

  @Field()
  @Column({ type: 'varchar', length: 100 })
  label: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 300, nullable: true })
  beschreibung: string | null;

  @Column({ name: 'standardwert', type: 'jsonb', nullable: true })
  standardwertWert: CustomFieldValue | null;

  @Field(() => String, { nullable: true })
  get standardwert(): string | null {
    const wert = this.standardwertWert;

    if (wert === null || wert === undefined) {
      return null;
    }

    if (Array.isArray(wert)) {
      return wert.map(String).join(';');
    }

    return typeof wert === 'object' ? JSON.stringify(wert) : String(wert);
  }

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  gruppeId: string | null;

  @ManyToOne(() => CustomFieldGroupEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'gruppeId' })
  gruppe: CustomFieldGroupEntity | null;

  @Field(() => CustomFieldType)
  @Column({ type: 'varchar', length: 20 })
  type: CustomFieldType;

  @Field(() => [String])
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  options: string[];

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  optionFarben: Record<string, OptionFarbe>;

  @Field(() => [CustomFieldOptionFarbe])
  get farben(): CustomFieldOptionFarbe[] {
    return Object.entries(this.optionFarben ?? {}).map(([option, farbe]) => ({
      option,
      farbe,
    }));
  }

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 3, nullable: true })
  waehrung: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  einstellungen: FeldEinstellungen;

  @Field(() => Int, { nullable: true })
  get nachkommastellen(): number | null {
    return this.einstellungen?.nachkommastellen ?? null;
  }

  @Field(() => String, { nullable: true })
  get zahlformat(): string | null {
    return this.einstellungen?.zahlformat ?? null;
  }

  @Field(() => String, { nullable: true })
  get datumsformat(): string | null {
    return this.einstellungen?.datumsformat ?? null;
  }

  @Field()
  @Column({ type: 'boolean', default: false })
  eindeutig: boolean;

  @Field()
  @Column({ type: 'boolean', default: false })
  required: boolean;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 20, nullable: true })
  pflichtAbPhase: string | null;

  @Field(() => CustomFieldEntity, { nullable: true })
  @Column({ type: 'varchar', length: 20, nullable: true })
  zielEntity: CustomFieldEntity | null;

  @Field()
  @Column({ type: 'boolean', default: false })
  mehrere: boolean;

  @Field(() => ID, { nullable: true })
  @Column({ type: 'uuid', nullable: true })
  gegenfeldId: string | null;

  @ManyToOne(() => CustomFieldDefinition, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'gegenfeldId' })
  gegenfeld: CustomFieldDefinition | null;

  @Field()
  @Column({ type: 'boolean', default: false })
  gegenseite: boolean;

  @Field(() => Int)
  @Column({ type: 'integer', default: 0 })
  position: number;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
