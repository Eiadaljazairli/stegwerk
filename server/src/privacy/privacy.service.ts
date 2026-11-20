import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';

import { AttachmentEntity } from '../attachments/attachment.entity';
import { AuditLogEntity } from '../audit/audit-log.entity';
import { CustomFieldGroupEntity } from '../custom-fields/custom-field-group.entity';
import { CustomFieldDefinition } from '../custom-fields/custom-field.entity';
import { SavedViewDefaultEntity } from '../saved-views/saved-view-default.entity';
import { SavedViewEntity } from '../saved-views/saved-view.entity';
import { SubscriptionEntity } from '../billing/subscription.entity';
import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { NoteEntity } from '../crm/entities/note.entity';
import { TaskEntity } from '../crm/entities/task.entity';
import { UserEntity } from '../users/user.entity';
import { InvitationEntity } from '../workspaces/invitation.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { meldeSicherheit } from '../sicherheit/melden';

@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private async assertOwner(
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    const membership = await this.dataSource.manager.findOne(MembershipEntity, {
      where: { userId, workspaceId },
    });

    if (membership === null || membership.role !== MembershipRole.OWNER) {
      throw new ForbiddenException(
        'Nur wer Inhaber des Arbeitsbereichs ist, darf ihn exportieren oder löschen.',
      );
    }
  }

  async exportWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<Record<string, unknown>> {
    await this.assertOwner(userId, workspaceId);
    meldeSicherheit({ art: 'datenexport', workspaceId, actorId: userId });

    const manager = this.dataSource.manager;

    const [
      workspace,
      memberships,
      invitations,
      subscription,
      companies,
      contacts,
      deals,
      notes,
      tasks,
      auditLog,
      customFieldDefinitions,
      customFieldGroups,
      savedViews,
      savedViewDefaults,
      attachments,
    ] = await Promise.all([
      manager.findOne(WorkspaceEntity, { where: { id: workspaceId } }),
      manager.find(MembershipEntity, {
        where: { workspaceId },
        relations: { user: true },
      }),
      manager.find(InvitationEntity, { where: { workspaceId } }),
      manager.findOne(SubscriptionEntity, { where: { workspaceId } }),
      manager.find(CompanyEntity, { where: { workspaceId } }),
      manager.find(ContactEntity, { where: { workspaceId } }),
      manager.find(DealEntity, { where: { workspaceId } }),
      manager.find(NoteEntity, { where: { workspaceId } }),
      manager.find(TaskEntity, { where: { workspaceId } }),
      manager.find(AuditLogEntity, { where: { workspaceId } }),
      manager.find(CustomFieldDefinition, { where: { workspaceId } }),
      manager.find(CustomFieldGroupEntity, {
        where: { workspaceId },
        order: { entity: 'ASC', position: 'ASC' },
      }),
      manager.find(SavedViewEntity, { where: { workspaceId } }),
      manager.find(SavedViewDefaultEntity, { where: { workspaceId } }),
      manager.find(AttachmentEntity, { where: { workspaceId } }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      format: 'stegwerk-workspace-export/1',
      workspace,
      members: memberships.map((membership) => ({
        role: membership.role,
        joinedAt: membership.createdAt,
        user: {
          id: membership.user.id,
          email: membership.user.email,
          firstName: membership.user.firstName,
          lastName: membership.user.lastName,
          createdAt: membership.user.createdAt,
        },
      })),
      invitations: invitations.map(({ tokenHash: _hash, ...rest }) => rest),
      attachments: attachments.map(
        ({ blob: _blob, workspace: _workspace, ...rest }) => rest,
      ),
      customFieldDefinitions: customFieldDefinitions.map(
        ({
          entity,
          key,
          label,
          type,
          options,
          archivedAt,
          beschreibung,
          standardwertWert,
          gruppeId,
        }) => ({
          entity,
          key,
          label,
          type,
          options,
          archivedAt,
          beschreibung,
          standardwert: standardwertWert,
          gruppeId,
        }),
      ),
      customFieldGroups: customFieldGroups.map(
        ({ id, entity, name, position, eingeklappt }) => ({
          id,
          entity,
          name,
          position,
          eingeklappt,
        }),
      ),
      subscription:
        subscription === null
          ? null
          : {
              plan: subscription.plan,
              status: subscription.status,
              seats: subscription.seats,
              trialEndsAt: subscription.trialEndsAt,
              currentPeriodEnd: subscription.currentPeriodEnd,
            },
      companies,
      contacts,
      deals,
      notes,
      tasks,
      auditLog,
      savedViews,
      savedViewDefaults,
    };
  }

  async deleteWorkspace(
    userId: string,
    workspaceId: string,
    confirmationName: string,
    password: string,
  ): Promise<boolean> {
    await this.assertOwner(userId, workspaceId);

    const person = await this.dataSource.manager.findOne(UserEntity, {
      where: { id: userId },
      select: ['id', 'passwordHash'],
    });

    if (
      person === null ||
      !(await bcrypt.compare(password, person.passwordHash))
    ) {
      throw new ForbiddenException('Das Passwort stimmt nicht.');
    }

    const workspace = await this.dataSource.manager.findOne(WorkspaceEntity, {
      where: { id: workspaceId },
    });

    if (workspace === null) {
      throw new BadRequestException('Diesen Arbeitsbereich gibt es nicht.');
    }

    if (confirmationName.trim() !== workspace.name) {
      throw new BadRequestException(
        'Der eingetippte Name stimmt nicht mit dem des Arbeitsbereichs überein.',
      );
    }

    await this.erase(workspaceId);

    this.logger.warn(
      `Workspace ${workspaceId} ("${workspace.name}") erased by user ${userId}`,
    );

    return true;
  }

  async erase(workspaceId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const members = await manager.find(MembershipEntity, {
        where: { workspaceId },
      });

      await manager.delete(WorkspaceEntity, { id: workspaceId });

      for (const member of members) {
        const remaining = await manager.count(MembershipEntity, {
          where: { userId: member.userId },
        });

        if (remaining === 0) {
          await manager.delete(UserEntity, { id: member.userId });
        }
      }
    });
  }
}
