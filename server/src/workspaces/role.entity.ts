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

import { Permission } from './permissions';
import { normalisiereSichtbarkeit, type Sichtbarkeit } from './sichtbarkeit';
import { type Feldrechte, normalisiereFeldrechte } from './feldrechte';
import { WorkspaceEntity } from './workspace.entity';

@ObjectType()
export class RollenSichtbarkeit {
  @Field()
  company: string;

  @Field()
  contact: string;

  @Field()
  deal: string;
}

@ObjectType('Role')
@Entity({ name: 'roles' })
@Index(['workspaceId', 'name'], { unique: true })
export class RoleEntity {
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

  @Field()
  @Column({ type: 'varchar', length: 60 })
  name: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 300, nullable: true })
  description: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 20, nullable: true })
  templateKey: string | null;

  @Field()
  @Column({ type: 'boolean', default: false })
  everything: boolean;

  @Field(() => [String])
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  permissions: Permission[];

  @Field()
  @Column({ type: 'boolean', default: false })
  isSystem: boolean;

  @Field(() => RollenSichtbarkeit)
  @Column({
    type: 'jsonb',
    default: () => "'{}'::jsonb",
    transformer: {
      to: (wert: unknown) => normalisiereSichtbarkeit(wert),
      from: (wert: unknown) => normalisiereSichtbarkeit(wert),
    },
  })
  sichtbarkeit: Sichtbarkeit;

  @Column({
    type: 'jsonb',
    default: () => "'{}'::jsonb",
    transformer: {
      to: (wert: unknown) => normalisiereFeldrechte(wert),
      from: (wert: unknown) => normalisiereFeldrechte(wert),
    },
  })
  feldrechte: Feldrechte;

  @Field(() => Number)
  memberCount: number;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
