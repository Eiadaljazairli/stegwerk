import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Not, Repository } from 'typeorm';

import { sperreInhaberschaft } from './inhaber-sperre';

import { MembershipEntity, MembershipRole } from './membership.entity';
import {
  cleanPermissions,
  ROLE_TEMPLATES,
  withImpliedViews,
} from './permissions';
import { RoleEntity } from './role.entity';
import { normalisiereSichtbarkeit, type Sichtbarkeit } from './sichtbarkeit';
import { type Feldrechte, normalisiereFeldrechte } from './feldrechte';
import { meldeSicherheit } from '../sicherheit/melden';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly roles: Repository<RoleEntity>,
    @InjectRepository(MembershipEntity)
    private readonly memberships: Repository<MembershipEntity>,
  ) {}

  private order(): { isSystem: 'DESC'; createdAt: 'ASC' } {
    return { isSystem: 'DESC', createdAt: 'ASC' };
  }

  async list(workspaceId: string): Promise<RoleEntity[]> {
    const existing = await this.roles.find({
      where: { workspaceId },
      order: this.order(),
    });

    if (existing.length > 0) {
      return this.withCounts(workspaceId, existing);
    }

    await this.roles.save(
      ROLE_TEMPLATES.map((template) =>
        this.roles.create({
          workspaceId,
          name: template.name,
          description: template.description,
          templateKey: template.key,
          everything: template.everything,
          permissions: [...template.permissions],
          isSystem: true,
        }),
      ),
    );

    return this.withCounts(
      workspaceId,
      await this.roles.find({ where: { workspaceId }, order: this.order() }),
    );
  }

  private async withCounts(
    workspaceId: string,
    roles: RoleEntity[],
  ): Promise<RoleEntity[]> {
    const counts = await this.memberships
      .createQueryBuilder('m')
      .select('m.roleId', 'roleId')
      .addSelect('COUNT(*)::int', 'count')
      .where('m.workspaceId = :workspaceId', { workspaceId })
      .groupBy('m.roleId')
      .getRawMany<{ roleId: string | null; count: number }>();

    const byRole = new Map(counts.map((row) => [row.roleId, row.count]));

    for (const role of roles) {
      role.memberCount = byRole.get(role.id) ?? 0;
    }

    return roles;
  }

  static altrolle(role: Pick<RoleEntity, 'everything' | 'templateKey'>) {
    if (role.everything) {
      return MembershipRole.OWNER;
    }

    return role.templateKey === 'admin'
      ? MembershipRole.ADMIN
      : MembershipRole.MEMBER;
  }

  get(workspaceId: string, id: string): Promise<RoleEntity> {
    return this.find(workspaceId, id);
  }

  private async find(workspaceId: string, id: string): Promise<RoleEntity> {
    const role = await this.roles.findOne({ where: { id, workspaceId } });

    if (role === null) {
      throw new NotFoundException('Diese Rolle gibt es nicht.');
    }

    return role;
  }

  private clean(name: string): string {
    const trimmed = name.trim();

    if (trimmed === '') {
      throw new BadRequestException('Eine Rolle braucht einen Namen');
    }

    return trimmed;
  }

  async create(
    workspaceId: string,
    input: {
      name: string;
      description?: string;
      permissions: string[];
      sichtbarkeit?: Partial<Sichtbarkeit>;
      feldrechte?: Feldrechte;
    },
  ): Promise<RoleEntity> {
    const name = this.clean(input.name);

    if ((await this.roles.countBy({ workspaceId, name })) > 0) {
      throw new BadRequestException(`Es gibt bereits eine Rolle "${name}"`);
    }

    const neu = await this.roles.save(
      this.roles.create({
        workspaceId,
        name,
        description: input.description?.trim() ?? null,
        templateKey: null,
        everything: false,
        permissions: withImpliedViews(cleanPermissions(input.permissions)),
        sichtbarkeit: normalisiereSichtbarkeit(input.sichtbarkeit),
        feldrechte: normalisiereFeldrechte(input.feldrechte),
        isSystem: false,
      }),
    );

    return (await this.withCounts(workspaceId, [neu]))[0];
  }

  async update(
    workspaceId: string,
    id: string,
    input: {
      name?: string;
      description?: string | null;
      permissions?: string[];
      sichtbarkeit?: Partial<Sichtbarkeit>;
      feldrechte?: Feldrechte;
    },
  ): Promise<RoleEntity> {
    const role = await this.find(workspaceId, id);

    if (role.everything && input.permissions !== undefined) {
      throw new ForbiddenException(
        'Die Rechte der Inhaber-Rolle lassen sich nicht einschränken.',
      );
    }

    if (input.name !== undefined) {
      const name = this.clean(input.name);

      if ((await this.roles.countBy({ workspaceId, name, id: Not(id) })) > 0) {
        throw new BadRequestException(`Es gibt bereits eine Rolle "${name}"`);
      }

      role.name = name;
    }

    if (input.description !== undefined) {
      const description = input.description?.trim() ?? '';

      role.description = description === '' ? null : description;
    }

    if (input.permissions !== undefined) {
      role.permissions = withImpliedViews(cleanPermissions(input.permissions));
    }

    if (input.sichtbarkeit !== undefined) {
      role.sichtbarkeit = normalisiereSichtbarkeit({
        ...role.sichtbarkeit,
        ...Object.fromEntries(
          Object.entries(input.sichtbarkeit).filter(
            ([, wert]) => wert !== undefined && wert !== null,
          ),
        ),
      });
    }

    if (input.feldrechte !== undefined) {
      if (role.everything) {
        throw new ForbiddenException(
          'Die Inhaber-Rolle sieht und ändert immer alle Felder.',
        );
      }

      role.feldrechte = normalisiereFeldrechte(input.feldrechte);
    }

    return (
      await this.withCounts(workspaceId, [await this.roles.save(role)])
    )[0];
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    const role = await this.find(workspaceId, id);

    if (role.isSystem) {
      throw new BadRequestException(
        'Die mitgelieferten Rollen lassen sich nicht löschen.',
      );
    }

    const held = await this.memberships.countBy({ workspaceId, roleId: id });

    if (held > 0) {
      throw new BadRequestException(
        `Diese Rolle hat noch ${String(held)} ${
          held === 1 ? 'Mitglied' : 'Mitglieder'
        }. Weisen Sie ihnen zuerst eine andere Rolle zu.`,
      );
    }

    await this.roles.remove(role);

    return true;
  }

  private ownerCount(
    manager: EntityManager,
    workspaceId: string,
  ): Promise<number> {
    return manager
      .getRepository(MembershipEntity)
      .createQueryBuilder('m')
      .innerJoin(RoleEntity, 'r', 'r.id = m."roleId"')
      .where('m.workspaceId = :workspaceId', { workspaceId })
      .andWhere('r.everything = true')
      .getCount();
  }

  async assign(
    workspaceId: string,
    userId: string,
    roleId: string,
  ): Promise<MembershipEntity> {
    const role = await this.find(workspaceId, roleId);

    const gespeichert = await this.memberships.manager.transaction(
      async (manager) => {
        await sperreInhaberschaft(manager, [workspaceId]);

        const membership = await manager.findOne(MembershipEntity, {
          where: { userId, workspaceId },
        });

        if (membership === null) {
          throw new NotFoundException('Dieses Mitglied gibt es nicht.');
        }

        if (!role.everything && membership.roleId !== null) {
          const current = await manager.findOne(RoleEntity, {
            where: { id: membership.roleId },
          });

          if (
            current?.everything === true &&
            (await this.ownerCount(manager, workspaceId)) <= 1
          ) {
            throw new BadRequestException(
              'Der letzte Inhaber kann die Rolle nicht abgeben. Ernennen Sie zuerst eine weitere Person zum Inhaber.',
            );
          }
        }

        membership.roleId = role.id;
        membership.role = RolesService.altrolle(role);

        return manager.save(membership);
      },
    );

    meldeSicherheit({
      art: 'rolle_geaendert',
      workspaceId,
      userId,
      details: { rolle: role.name },
    });

    return gespeichert;
  }
}
