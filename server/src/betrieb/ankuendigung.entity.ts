import { Field, ID, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@ObjectType('Ankuendigung')
@Entity({ name: 'ankuendigungen' })
@Index(['von', 'bis'])
export class AnkuendigungEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ type: 'varchar', length: 500 })
  text: string;

  @Field()
  @Column({ type: 'timestamptz' })
  von: Date;

  @Field()
  @Column({ type: 'timestamptz' })
  bis: Date;

  @Field()
  @Column({ type: 'boolean', default: false })
  wartung: boolean;

  @Column({ type: 'uuid', nullable: true })
  erstelltVon: string | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
