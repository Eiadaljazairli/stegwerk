import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class DpaBlockInfo {
  @Field()
  kind: string;

  @Field(() => String, { nullable: true })
  text?: string;

  @Field(() => [String], { nullable: true })
  items?: string[];

  @Field(() => String, { nullable: true })
  variable?: string;
}

@ObjectType()
export class DpaSectionInfo {
  @Field()
  label: string;

  @Field()
  title: string;

  @Field(() => [DpaBlockInfo])
  blocks: DpaBlockInfo[];
}

@ObjectType()
export class DpaDocumentInfo {
  @Field()
  title: string;

  @Field()
  reviewed: boolean;

  @Field(() => String, { nullable: true })
  processorName: string | null;

  @Field(() => [DpaSectionInfo])
  sections: DpaSectionInfo[];

  @Field(() => [DpaSectionInfo])
  annexes: DpaSectionInfo[];
}
