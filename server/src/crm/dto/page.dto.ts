import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

import { CompanyEntity } from '../entities/company.entity';
import { ContactEntity } from '../entities/contact.entity';
import { DealEntity } from '../entities/deal.entity';
import { TaskEntity } from '../entities/task.entity';

@ObjectType()
export class ListenSumme {
  @Field(() => String, { nullable: true })
  gruppe: string | null;

  @Field(() => Float)
  summe: number;
}

@ObjectType()
export class ListenGruppe {
  @Field(() => String, { nullable: true })
  wert: string | null;

  @Field(() => String, { nullable: true })
  label: string | null;

  @Field()
  nichtSichtbar: boolean;

  @Field(() => Int)
  anzahl: number;

  @Field(() => [ListenSumme])
  summen: ListenSumme[];
}

@ObjectType()
export class CompanyPage {
  @Field(() => [CompanyEntity])
  items: CompanyEntity[];

  @Field(() => Int)
  totalCount: number;

  @Field()
  hasMore: boolean;

  @Field(() => [ListenSumme])
  summen: ListenSumme[];

  @Field(() => [ListenGruppe])
  gruppen: ListenGruppe[];
}

@ObjectType()
export class ContactPage {
  @Field(() => [ContactEntity])
  items: ContactEntity[];

  @Field(() => Int)
  totalCount: number;

  @Field()
  hasMore: boolean;

  @Field(() => [ListenGruppe])
  gruppen: ListenGruppe[];
}

@ObjectType()
export class DealPage {
  @Field(() => [DealEntity])
  items: DealEntity[];

  @Field(() => Int)
  totalCount: number;

  @Field()
  hasMore: boolean;

  @Field(() => [ListenSumme])
  summen: ListenSumme[];

  @Field(() => [ListenGruppe])
  gruppen: ListenGruppe[];
}

@ObjectType()
export class TaskPage {
  @Field(() => [TaskEntity])
  items: TaskEntity[];

  @Field(() => Int)
  totalCount: number;

  @Field()
  hasMore: boolean;
}
