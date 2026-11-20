import { Field, Float, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

@ObjectType('Kachel')
export class KachelView {
  @Field()
  id: string;

  @Field()
  typ: string;

  @Field(() => String, { nullable: true })
  titel: string | null;

  @Field(() => String, { nullable: true })
  objekt: string | null;

  @Field(() => String, { nullable: true })
  mass: string | null;

  @Field(() => String, { nullable: true })
  gruppe: string | null;

  @Field(() => String, { nullable: true })
  status: string | null;

  @Field(() => ID, { nullable: true })
  pipelineId: string | null;

  @Field()
  nurMeine: boolean;

  @Field(() => String, { nullable: true })
  zeitraum: string | null;

  @Field(() => String, { nullable: true })
  liste: string | null;
}

@InputType()
export class KachelInput {
  @Field()
  @IsString()
  @MaxLength(40)
  id: string;

  @Field()
  @IsString()
  @MaxLength(20)
  typ: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  titel?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  objekt?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  mass?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(110)
  gruppe?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string | null;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  pipelineId?: string | null;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  nurMeine?: boolean | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  zeitraum?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  liste?: string | null;
}

@ObjectType()
export class KachelBalken {
  @Field()
  schluessel: string;

  @Field()
  label: string;

  @Field(() => String, { nullable: true })
  farbe: string | null;

  @Field(() => Int)
  anzahl: number;

  @Field(() => Float, { nullable: true })
  wert: number | null;
}

@ObjectType()
export class KachelEintrag {
  @Field(() => ID)
  id: string;

  @Field()
  titel: string;

  @Field(() => String, { nullable: true })
  zusatz: string | null;

  @Field()
  link: string;
}

@ObjectType()
export class KachelErgebnis {
  @Field()
  gesperrt: boolean;

  @Field(() => String, { nullable: true })
  hinweis: string | null;

  @Field()
  betraegeVerborgen: boolean;

  @Field(() => Int, { nullable: true })
  anzahl: number | null;

  @Field(() => Float, { nullable: true })
  wert: number | null;

  @Field(() => [KachelBalken])
  balken: KachelBalken[];

  @Field(() => [KachelEintrag])
  eintraege: KachelEintrag[];
}

@ObjectType('Dashboard')
export class DashboardView {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field()
  privat: boolean;

  @Field(() => ID, { nullable: true })
  createdById: string | null;

  @Field()
  darfAendern: boolean;

  @Field(() => [KachelView])
  kacheln: KachelView[];
}

@InputType()
export class DashboardAnlegenInput {
  @Field()
  @IsString()
  @MaxLength(60)
  name: string;

  @Field({ defaultValue: false })
  @IsBoolean()
  privat: boolean;

  @Field({ defaultValue: false })
  @IsBoolean()
  vonUebersicht: boolean;
}

@InputType()
export class DashboardAendernInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string | null;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  privat?: boolean | null;
}
