import { HttpException, UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Resolver,
} from '@nestjs/graphql';
import { InjectDataSource } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { IsOptional, IsUUID, validate } from 'class-validator';
import { type DataSource, type EntityManager } from 'typeorm';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { BillingWriteGuard } from '../billing/guards/billing-write.guard';
import {
  datenbankMeldung,
  deutscherSatz,
} from '../observability/deutsche-meldung';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { istSchreibbar } from '../workspaces/sichtbarkeit';
import { CompaniesService } from './companies.service';
import { ContactsService } from './contacts.service';
import { DealsService } from './deals.service';
import { domainVon } from './domains';
import { CreateCompanyInput, UpdateCompanyInput } from './dto/company.dto';
import { CreateContactInput, UpdateContactInput } from './dto/contact.dto';
import { CreateDealInput, UpdateDealInput } from './dto/deal.dto';
import { herkunftFuer } from './herkunft';
import { mitVerantwortlichem } from './verantwortlich';
import { inSchreibTransaktion } from './workspace-scoped.service';

export const MAX_MASSEN = 100;

@ObjectType()
export class MassenZeile {
  @Field(() => Int)
  index: number;

  @Field(() => ID, { nullable: true })
  id: string | null;

  @Field(() => String, { nullable: true })
  action: 'created' | 'updated' | null;

  @Field(() => String, { nullable: true })
  error: string | null;
}

@ObjectType()
export class MassenErgebnis {
  @Field(() => Int)
  created: number;

  @Field(() => Int)
  updated: number;

  @Field(() => Int)
  rejected: number;

  @Field(() => [MassenZeile])
  rows: MassenZeile[];
}

@InputType()
export class UpsertCompanyInput extends CreateCompanyInput {
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  id?: string;
}

@InputType()
export class UpsertContactInput extends CreateContactInput {
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  id?: string;
}

@InputType()
export class UpsertDealInput extends CreateDealInput {
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  id?: string;
}

const fehlerText = (fehler: unknown): string => {
  if (fehler instanceof HttpException) {
    const antwort = fehler.getResponse() as string | { message?: unknown };
    const text =
      typeof antwort === 'string'
        ? antwort
        : Array.isArray(antwort.message)
          ? antwort.message.join(' ')
          : String(antwort.message ?? fehler.message);

    return text;
  }

  return datenbankMeldung(fehler) ?? 'Die Zeile ließ sich nicht speichern.';
};

type Art = 'company' | 'contact' | 'deal';

const RECHT: Record<Art, Permission> = {
  company: Permission.COMPANY_WRITE,
  contact: Permission.CONTACT_WRITE,
  deal: Permission.DEAL_WRITE,
};

@Resolver()
@UseGuards(GqlAuthGuard, BillingWriteGuard)
export class MassenResolver {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly permissions: PermissionsService,
    private readonly firmen: CompaniesService,
    private readonly kontakte: ContactsService,
    private readonly geschaefte: DealsService,
  ) {}

  @Mutation(() => MassenErgebnis)
  async createCompanies(
    @CurrentUser() user: RequestUser,
    @Args('inputs', { type: () => [CreateCompanyInput] })
    inputs: CreateCompanyInput[],
  ): Promise<MassenErgebnis> {
    await this.pruefe(user, 'company', inputs.length);

    return this.anlegen(user, 'company', CreateCompanyInput, inputs);
  }

  @Mutation(() => MassenErgebnis)
  async createContacts(
    @CurrentUser() user: RequestUser,
    @Args('inputs', { type: () => [CreateContactInput] })
    inputs: CreateContactInput[],
  ): Promise<MassenErgebnis> {
    await this.pruefe(user, 'contact', inputs.length);

    return this.anlegen(user, 'contact', CreateContactInput, inputs);
  }

  @Mutation(() => MassenErgebnis)
  async createDeals(
    @CurrentUser() user: RequestUser,
    @Args('inputs', { type: () => [CreateDealInput] })
    inputs: CreateDealInput[],
  ): Promise<MassenErgebnis> {
    await this.pruefe(user, 'deal', inputs.length);

    return this.anlegen(user, 'deal', CreateDealInput, inputs);
  }

  @Mutation(() => MassenErgebnis)
  async updateCompanies(
    @CurrentUser() user: RequestUser,
    @Args('inputs', { type: () => [UpdateCompanyInput] })
    inputs: UpdateCompanyInput[],
  ): Promise<MassenErgebnis> {
    await this.pruefe(user, 'company', inputs.length);

    return this.aendern(user, 'company', UpdateCompanyInput, inputs);
  }

  @Mutation(() => MassenErgebnis)
  async updateContacts(
    @CurrentUser() user: RequestUser,
    @Args('inputs', { type: () => [UpdateContactInput] })
    inputs: UpdateContactInput[],
  ): Promise<MassenErgebnis> {
    await this.pruefe(user, 'contact', inputs.length);

    return this.aendern(user, 'contact', UpdateContactInput, inputs);
  }

  @Mutation(() => MassenErgebnis)
  async updateDeals(
    @CurrentUser() user: RequestUser,
    @Args('inputs', { type: () => [UpdateDealInput] })
    inputs: UpdateDealInput[],
  ): Promise<MassenErgebnis> {
    await this.pruefe(user, 'deal', inputs.length);

    return this.aendern(user, 'deal', UpdateDealInput, inputs);
  }

  @Mutation(() => MassenErgebnis)
  async upsertCompanies(
    @CurrentUser() user: RequestUser,
    @Args('inputs', { type: () => [UpsertCompanyInput] })
    inputs: UpsertCompanyInput[],
  ): Promise<MassenErgebnis> {
    await this.pruefe(user, 'company', inputs.length);

    return this.abgleichen(user, 'company', UpsertCompanyInput, inputs);
  }

  @Mutation(() => MassenErgebnis)
  async upsertContacts(
    @CurrentUser() user: RequestUser,
    @Args('inputs', { type: () => [UpsertContactInput] })
    inputs: UpsertContactInput[],
  ): Promise<MassenErgebnis> {
    await this.pruefe(user, 'contact', inputs.length);

    return this.abgleichen(user, 'contact', UpsertContactInput, inputs);
  }

  @Mutation(() => MassenErgebnis)
  async upsertDeals(
    @CurrentUser() user: RequestUser,
    @Args('inputs', { type: () => [UpsertDealInput] })
    inputs: UpsertDealInput[],
  ): Promise<MassenErgebnis> {
    await this.pruefe(user, 'deal', inputs.length);

    return this.abgleichen(user, 'deal', UpsertDealInput, inputs);
  }

  private dienst(art: Art) {
    return art === 'company'
      ? this.firmen
      : art === 'contact'
        ? this.kontakte
        : this.geschaefte;
  }

  private async pruefe(
    user: RequestUser,
    art: Art,
    anzahl: number,
  ): Promise<void> {
    await this.permissions.assert(
      user,
      RECHT[art],
      'diese Datensätze anzulegen oder zu ändern',
    );

    if (anzahl === 0 || anzahl > MAX_MASSEN) {
      throw new HttpException(
        `Bitte zwischen 1 und ${String(MAX_MASSEN)} Zeilen je Aufruf schicken.`,
        400,
      );
    }
  }

  private neu(user: RequestUser, input: { herkunft?: string }) {
    return {
      ...mitVerantwortlichem(user, input as { ownerId?: string | null }),
      herkunft: herkunftFuer(user, input.herkunft),
    };
  }

  private anlegen<T extends { herkunft?: string }>(
    user: RequestUser,
    art: Art,
    klasse: new () => T,
    inputs: T[],
  ): Promise<MassenErgebnis> {
    return this.zeilen(klasse, inputs, async (input) => {
      const angelegt = await this.dienst(art).create(
        user.workspaceId,
        this.neu(user, input) as never,
      );

      return { id: angelegt.id, action: 'created' };
    });
  }

  private aendern<T extends { id: string }>(
    user: RequestUser,
    art: Art,
    klasse: new () => T,
    inputs: T[],
  ): Promise<MassenErgebnis> {
    return this.zeilen(klasse, inputs, async (input) => {
      const { id, ...rest } = input;
      const geaendert = await this.dienst(art).update(
        user.workspaceId,
        id,
        rest as never,
      );

      return { id: geaendert.id, action: 'updated' };
    });
  }

  private abgleichen<T extends { id?: string; herkunft?: string }>(
    user: RequestUser,
    art: Art,
    klasse: new () => T,
    inputs: T[],
  ): Promise<MassenErgebnis> {
    return this.zeilen(klasse, inputs, async (input, manager) => {
      const { id: angegeben, herkunft: _herkunft, ...rest } = input;
      const id =
        angegeben ?? (await this.treffer(manager, user.workspaceId, art, rest));

      if (id === null) {
        const angelegt = await this.dienst(art).create(
          user.workspaceId,
          this.neu(user, input) as never,
        );

        return { id: angelegt.id, action: 'created' };
      }

      const geaendert = await this.dienst(art).update(
        user.workspaceId,
        id,
        rest as never,
      );

      return { id: geaendert.id, action: 'updated' };
    });
  }

  private async treffer(
    manager: EntityManager,
    workspaceId: string,
    art: Art,
    werte: Record<string, unknown>,
  ): Promise<string | null> {
    const spalte =
      art === 'company' ? 'domain' : art === 'contact' ? 'email' : null;
    const roh = spalte === null ? null : werte[spalte];

    if (spalte === null || typeof roh !== 'string' || roh.trim() === '') {
      return null;
    }

    const wert = art === 'company' ? domainVon(roh) : roh.trim().toLowerCase();

    if (wert === null) {
      return null;
    }

    const tabelle = art === 'company' ? 'companies' : 'contacts';
    const [gefunden] = (await manager.query(
      `SELECT "id", "ownerId" FROM "${tabelle}"
        WHERE "workspaceId" = $1 AND lower("${spalte}") = $2
          AND "deletedAt" IS NULL
        ORDER BY "createdAt" ASC
        LIMIT 1`,
      [workspaceId, wert],
    )) as { id: string; ownerId: string | null }[];

    if (gefunden === undefined) {
      return null;
    }

    if (!(await istSchreibbar(art, gefunden.ownerId, gefunden.id))) {
      throw new HttpException(
        'Diese Zeile trifft auf einen Datensatz, den Ihre Rolle nicht ändern darf.',
        403,
      );
    }

    return gefunden.id;
  }

  private async zeilen<T extends object>(
    klasse: new () => T,
    inputs: T[],
    arbeit: (
      input: T,
      manager: EntityManager,
    ) => Promise<{ id: string; action: 'created' | 'updated' }>,
  ): Promise<MassenErgebnis> {
    const ergebnis: MassenErgebnis = {
      created: 0,
      updated: 0,
      rejected: 0,
      rows: [],
    };

    const meldungen: (() => void)[] = [];

    await this.dataSource.transaction(async (manager) => {
      for (const [index, input] of inputs.entries()) {
        const geprueft = plainToInstance(klasse, input);
        const verstoesse = await validate(geprueft, {
          whitelist: true,
          forbidNonWhitelisted: true,
        });

        if (verstoesse.length > 0) {
          ergebnis.rejected += 1;
          ergebnis.rows.push({
            index,
            id: null,
            action: null,
            error: verstoesse
              .flatMap((verstoss) => Object.values(verstoss.constraints ?? {}))
              .map(deutscherSatz)
              .join(' '),
          });
          continue;
        }

        await manager.query('SAVEPOINT massen_zeile');

        const vonDieserZeile: (() => void)[] = [];

        try {
          const zeile = await inSchreibTransaktion(
            manager,
            vonDieserZeile,
            () => arbeit(geprueft, manager),
          );

          await manager.query('RELEASE SAVEPOINT massen_zeile');
          meldungen.push(...vonDieserZeile);
          ergebnis[zeile.action] += 1;
          ergebnis.rows.push({ index, ...zeile, error: null });
        } catch (fehler) {
          await manager.query('ROLLBACK TO SAVEPOINT massen_zeile');
          ergebnis.rejected += 1;
          ergebnis.rows.push({
            index,
            id: null,
            action: null,
            error: fehlerText(fehler),
          });
        }
      }
    });

    for (const ausgeben of meldungen) {
      ausgeben();
    }

    return ergebnis;
  }
}
