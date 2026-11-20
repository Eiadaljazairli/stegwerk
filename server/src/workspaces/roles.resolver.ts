import { ForbiddenException, UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  InputType,
  Mutation,
  ObjectType,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { MembershipEntity } from './membership.entity';
import { cleanPermissions, Permission, withImpliedViews } from './permissions';
import { PermissionsService } from './permissions.service';
import { RoleEntity } from './role.entity';
import { RolesService } from './roles.service';
import { type Sichtweite } from './sichtbarkeit';
import { type Feldrechte, normalisiereFeldrechte } from './feldrechte';

@ObjectType('Feldrecht')
export class FeldrechtView {
  @Field()
  feld: string;

  @Field()
  recht: string;
}

@InputType()
export class FeldrechtInput {
  @Field()
  @MaxLength(130)
  feld: string;

  @Field()
  @IsIn(['verborgen', 'lesen'])
  recht: string;
}

const alsListe = (rechte: Feldrechte): FeldrechtView[] =>
  Object.entries(rechte).map(([feld, recht]) => ({ feld, recht }));

const alsZuordnung = (liste: FeldrechtInput[]): Feldrechte =>
  normalisiereFeldrechte(
    Object.fromEntries(liste.map((eintrag) => [eintrag.feld, eintrag.recht])),
  );

@ObjectType('MyPermissions')
export class MyPermissionsView {
  @Field()
  everything: boolean;

  @Field(() => [String])
  permissions: string[];

  @Field(() => [FeldrechtView])
  feldrechte: FeldrechtView[];
}

@InputType()
export class SichtbarkeitInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(['alle', 'eigene'])
  company?: Sichtweite;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(['alle', 'eigene'])
  contact?: Sichtweite;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(['alle', 'eigene'])
  deal?: Sichtweite;
}

@InputType()
export class CreateRoleInput {
  @Field()
  @MaxLength(60)
  name: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(300)
  description?: string;

  @Field(() => [String])
  @IsArray()
  permissions: string[];

  @Field(() => SichtbarkeitInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => SichtbarkeitInput)
  sichtbarkeit?: SichtbarkeitInput;

  @Field(() => [FeldrechtInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => FeldrechtInput)
  feldrechte?: FeldrechtInput[];
}

@InputType()
export class UpdateRoleInput {
  @Field(() => ID)
  @IsUUID()
  id: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(60)
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(300)
  description?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  permissions?: string[];

  @Field(() => SichtbarkeitInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => SichtbarkeitInput)
  sichtbarkeit?: SichtbarkeitInput;

  @Field(() => [FeldrechtInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => FeldrechtInput)
  feldrechte?: FeldrechtInput[];
}

@Resolver(() => RoleEntity)
@UseGuards(GqlAuthGuard)
export class RolesResolver {
  constructor(
    private readonly rolesService: RolesService,
    private readonly permissions: PermissionsService,
  ) {}

  @Query(() => [RoleEntity])
  roles(@CurrentUser() user: RequestUser): Promise<RoleEntity[]> {
    return this.rolesService.list(user.workspaceId);
  }

  @ResolveField(() => [FeldrechtView])
  feldrechte(@Parent() role: RoleEntity): FeldrechtView[] {
    return alsListe(role.feldrechte ?? {});
  }

  @Query(() => MyPermissionsView)
  async myPermissions(
    @CurrentUser() user: RequestUser,
  ): Promise<MyPermissionsView> {
    const [rechte, sicht] = await Promise.all([
      this.permissions.permissionsOf(user),
      this.permissions.sichtfeldFuer(user),
    ]);

    return { ...rechte, feldrechte: alsListe(sicht.felder) };
  }

  @Mutation(() => RoleEntity)
  async createRole(
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateRoleInput,
  ): Promise<RoleEntity> {
    await this.permissions.assert(
      user,
      Permission.ROLE_MANAGE,
      'Rollen anzulegen',
    );
    await this.permissions.assertGrantable(
      user,
      {
        everything: false,
        permissions: withImpliedViews(cleanPermissions(input.permissions)),
      },
      'eine Rolle anlegen',
    );

    if (input.sichtbarkeit !== undefined) {
      await this.permissions.assertSichtbarkeitVergebbar(
        user,
        input.sichtbarkeit,
      );
    }

    const feldrechte = alsZuordnung(input.feldrechte ?? []);

    await this.permissions.assertFeldrechteVergebbar(user, feldrechte);

    return this.rolesService.create(user.workspaceId, {
      ...input,
      feldrechte,
    });
  }

  @Mutation(() => RoleEntity)
  async updateRole(
    @CurrentUser() user: RequestUser,
    @Args('input') input: UpdateRoleInput,
  ): Promise<RoleEntity> {
    await this.permissions.assert(
      user,
      Permission.ROLE_MANAGE,
      'Rollen zu ändern',
    );

    if (input.permissions !== undefined) {
      await this.permissions.assertGrantable(
        user,
        {
          everything: false,
          permissions: withImpliedViews(cleanPermissions(input.permissions)),
        },
        'eine Rolle ausstatten',
      );
    }

    if (input.sichtbarkeit !== undefined) {
      await this.permissions.assertSichtbarkeitVergebbar(
        user,
        input.sichtbarkeit,
      );
    }

    const feldrechte =
      input.feldrechte === undefined
        ? undefined
        : alsZuordnung(input.feldrechte);

    if (feldrechte !== undefined) {
      await this.permissions.assertFeldrechteVergebbar(user, feldrechte);
    }

    return this.rolesService.update(user.workspaceId, input.id, {
      ...input,
      feldrechte,
    });
  }

  @Mutation(() => Boolean)
  async deleteRole(
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.permissions.assert(
      user,
      Permission.ROLE_MANAGE,
      'Rollen zu löschen',
    );

    return this.rolesService.remove(user.workspaceId, id);
  }

  @Mutation(() => MembershipEntity)
  async assignRole(
    @CurrentUser() user: RequestUser,
    @Args('userId', { type: () => ID }) userId: string,
    @Args('roleId', { type: () => ID }) roleId: string,
  ): Promise<MembershipEntity> {
    await this.permissions.assert(
      user,
      Permission.MEMBER_MANAGE,
      'Rollen zuzuweisen',
    );

    const role = await this.rolesService.get(user.workspaceId, roleId);

    await this.permissions.assertGrantable(user, role, 'eine Rolle vergeben');

    if (
      (await this.permissions.holdsEverything(userId, user.workspaceId)) &&
      !(await this.permissions.holdsEverything(user.userId, user.workspaceId))
    ) {
      throw new ForbiddenException(
        'Die Rolle eines Inhabers ändert nur ein Inhaber.',
      );
    }

    return this.rolesService.assign(user.workspaceId, userId, roleId);
  }
}
