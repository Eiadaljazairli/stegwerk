import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { DataSource, IsNull, LessThan, Repository } from 'typeorm';

import { BillingService } from '../billing/billing.service';
import { belegtFesthalten } from '../calendar/termin-sichtbarkeit';
import { MailService } from '../mail/mail.service';
import { invitationMail } from '../mail/templates';
import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { TaskEntity } from '../crm/entities/task.entity';
import { UserEntity } from '../users/user.entity';
import { sperreInhaberschaft } from './inhaber-sperre';
import { InvitationEntity } from './invitation.entity';
import { MembershipEntity, MembershipRole } from './membership.entity';
import { RoleEntity } from './role.entity';
import { WorkspaceEntity } from './workspace.entity';
import { meldeSicherheit } from '../sicherheit/melden';
import { pruefeEinladungsDomain } from './einladungs-domains';
import { gemeinsamePostfaecherUebergeben } from '../mailboxes/postfach-uebergabe';

const INVITATION_LIFETIME_DAYS = 7;

export const INVITATION_FOR_OTHER_ADDRESS = 'INVITATION_FOR_OTHER_ADDRESS';

export const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

const ROLES_THAT_MANAGE_MEMBERS: readonly MembershipRole[] = [
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
];

export type CreatedInvitation = {
  invitation: InvitationEntity;
  token: string;
  delivered: boolean;
};

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(InvitationEntity)
    private readonly invitationRepository: Repository<InvitationEntity>,
    @InjectRepository(MembershipEntity)
    private readonly membershipRepository: Repository<MembershipEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly billingService: BillingService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async einladungsDomains(workspaceId: string): Promise<string[]> {
    const bereich = await this.dataSource.manager.findOne(WorkspaceEntity, {
      where: { id: workspaceId },
      select: ['id', 'einladungsDomains'],
    });

    return bereich?.einladungsDomains ?? [];
  }

  private async assertCanManageMembers(
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    const membership = await this.membershipRepository.findOne({
      where: { userId, workspaceId },
    });

    if (
      membership === null ||
      !ROLES_THAT_MANAGE_MEMBERS.includes(membership.role)
    ) {
      throw new ForbiddenException(
        'Nur Inhaber und Administratoren dürfen die Mitglieder eines Arbeitsbereichs verwalten.',
      );
    }
  }

  async invite(
    inviterId: string,
    workspaceId: string,
    email: string,
    role: MembershipRole,
  ): Promise<CreatedInvitation> {
    await this.assertCanManageMembers(inviterId, workspaceId);

    await this.billingService.assertCanWrite(workspaceId);

    const einladender = await this.dataSource.manager.findOne(UserEntity, {
      where: { id: inviterId },
      select: ['id', 'emailVerifiedAt'],
    });

    if (einladender?.emailVerifiedAt === null) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message:
          'Bestätigen Sie zuerst Ihre eigene E-Mail-Adresse, dann können Sie andere einladen.',
        reason: EMAIL_NOT_VERIFIED,
      });
    }

    const normalisedEmail = email.trim().toLowerCase();

    pruefeEinladungsDomain(
      normalisedEmail,
      await this.einladungsDomains(workspaceId),
    );

    const existingUser = await this.dataSource.manager.findOne(UserEntity, {
      where: { email: normalisedEmail },
    });

    if (existingUser !== null) {
      const alreadyMember = await this.membershipRepository.findOne({
        where: { userId: existingUser.id, workspaceId },
      });

      if (alreadyMember !== null) {
        throw new BadRequestException(
          'Diese Person gehört bereits zu diesem Arbeitsbereich.',
        );
      }
    }

    const superseded = await this.invitationRepository.findOne({
      where: {
        workspaceId,
        email: normalisedEmail,
        acceptedAt: IsNull(),
      },
    });

    if (superseded === null) {
      await this.billingService.assertSeatAvailable(workspaceId);
    }

    await this.invitationRepository.delete({
      workspaceId,
      email: normalisedEmail,
      acceptedAt: IsNull(),
    });

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITATION_LIFETIME_DAYS);

    const invitation = await this.invitationRepository.save(
      this.invitationRepository.create({
        workspaceId,
        email: normalisedEmail,
        role,
        tokenHash: this.hashToken(token),
        expiresAt,
        invitedById: inviterId,
      }),
    );

    const [inviter, workspace] = await Promise.all([
      this.dataSource.manager.findOne(UserEntity, { where: { id: inviterId } }),
      this.dataSource.manager.findOne(WorkspaceEntity, {
        where: { id: workspaceId },
      }),
    ]);

    const webOrigin = this.configService.getOrThrow<string>('webOrigin');

    const delivered = await this.mailService.send(
      invitationMail(
        normalisedEmail,
        inviter === null
          ? 'Ein Kollege'
          : `${inviter.firstName} ${inviter.lastName}`,
        workspace === null ? 'Stegwerk' : workspace.name,
        `${webOrigin}/einladung/${token}`,
      ),
    );

    meldeSicherheit({
      art: 'einladung',
      workspaceId,
      actorId: inviterId,
      details: { an: email, rolle: role },
    });

    return { invitation, token, delivered };
  }

  findPending(workspaceId: string): Promise<InvitationEntity[]> {
    return this.invitationRepository.find({
      where: { workspaceId, acceptedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async revoke(
    userId: string,
    workspaceId: string,
    invitationId: string,
  ): Promise<boolean> {
    await this.assertCanManageMembers(userId, workspaceId);

    const result = await this.invitationRepository.delete({
      id: invitationId,
      workspaceId,
    });

    return (result.affected ?? 0) > 0;
  }

  async accept(token: string, userId: string): Promise<MembershipEntity> {
    const invitation = await this.invitationRepository.findOne({
      where: { tokenHash: this.hashToken(token), acceptedAt: IsNull() },
    });

    if (invitation === null) {
      throw new NotFoundException('Diese Einladung ist ungültig.');
    }

    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Diese Einladung ist abgelaufen.');
    }

    const annehmender = await this.dataSource.manager.findOne(UserEntity, {
      where: { id: userId },
    });

    if (
      annehmender === null ||
      annehmender.email.trim().toLowerCase() !==
        invitation.email.trim().toLowerCase()
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message:
          'Diese Einladung ging an eine andere E-Mail-Adresse. Melden Sie sich mit der Adresse an, an die sie geschickt wurde.',
        reason: INVITATION_FOR_OTHER_ADDRESS,
      });
    }

    if (annehmender.emailVerifiedAt === null) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message:
          'Bestätigen Sie zuerst Ihre E-Mail-Adresse. Wir haben Ihnen dazu eine Mail geschickt.',
        reason: EMAIL_NOT_VERIFIED,
      });
    }

    pruefeEinladungsDomain(
      invitation.email,
      await this.einladungsDomains(invitation.workspaceId),
    );

    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(MembershipEntity, {
        where: { userId, workspaceId: invitation.workspaceId },
      });

      invitation.acceptedAt = new Date();
      await manager.save(invitation);

      if (existing !== null) {
        return existing;
      }

      const rolle = await manager.findOne(RoleEntity, {
        where: {
          workspaceId: invitation.workspaceId,
          templateKey: invitation.role,
        },
      });

      return manager.save(
        manager.create(MembershipEntity, {
          userId,
          workspaceId: invitation.workspaceId,
          role: invitation.role,
          roleId: rolle?.id ?? null,
        }),
      );
    });
  }

  async removeMember(
    actingUserId: string,
    workspaceId: string,
    memberUserId: string,
    nachfolgerId: string = actingUserId,
  ): Promise<{ removed: boolean; reassignedTasks: number }> {
    await this.assertCanManageMembers(actingUserId, workspaceId);

    if (
      nachfolgerId === memberUserId ||
      !(await this.membershipRepository.exist({
        where: { userId: nachfolgerId, workspaceId },
      }))
    ) {
      throw new BadRequestException(
        'Übernehmen kann nur, wer im Arbeitsbereich bleibt.',
      );
    }

    const reassigned = await this.dataSource.transaction(async (manager) => {
      await sperreInhaberschaft(manager, [workspaceId]);

      const membership = await manager.findOne(MembershipEntity, {
        where: { userId: memberUserId, workspaceId },
      });

      if (membership === null) {
        throw new NotFoundException(
          'Diese Person gehört nicht zu diesem Arbeitsbereich.',
        );
      }

      if (membership.role === MembershipRole.OWNER) {
        const owners = await manager.count(MembershipEntity, {
          where: { workspaceId, role: MembershipRole.OWNER },
        });

        if (owners <= 1) {
          throw new BadRequestException(
            'Ein Arbeitsbereich braucht mindestens einen Inhaber.',
          );
        }
      }

      const erledigt = await manager.update(
        TaskEntity,
        { workspaceId, assigneeId: memberUserId, completedAt: IsNull() },
        { assigneeId: nachfolgerId },
      );

      for (const ziel of [CompanyEntity, ContactEntity, DealEntity]) {
        await manager.update(
          ziel,
          { workspaceId, ownerId: memberUserId },
          { ownerId: nachfolgerId },
        );
      }

      await manager.query(
        `UPDATE "appointments" SET "ownerId" = $1
          WHERE "workspaceId" = $2 AND "ownerId" = $3 AND "endsAt" >= now()
            AND "privat" = false AND "nurBelegt" = false
            AND ("quelle" <> 'kalender'
                 OR "companyId" IS NOT NULL OR "contactId" IS NOT NULL
                 OR "dealId" IS NOT NULL)`,
        [nachfolgerId, workspaceId, memberUserId],
      );
      await manager.query(
        `UPDATE "quotes" q SET "bearbeiterId" = $1
          WHERE q."workspaceId" = $2 AND q."bearbeiterId" = $3
            AND (q."status" IN ('draft', 'sent')
                 OR EXISTS (SELECT 1 FROM "begleitbelege" b
                             WHERE b."angebotId" = q."id"))`,
        [nachfolgerId, workspaceId, memberUserId],
      );
      await manager.query(
        `UPDATE "begleitbelege" SET "bearbeiterId" = $1
          WHERE "workspaceId" = $2 AND "bearbeiterId" = $3`,
        [nachfolgerId, workspaceId, memberUserId],
      );
      await manager.query(
        `UPDATE "web_forms" SET "ownerId" = $1
          WHERE "workspaceId" = $2 AND "ownerId" = $3`,
        [nachfolgerId, workspaceId, memberUserId],
      );
      await manager.query(
        `UPDATE "webhooks" SET "createdById" = $1
          WHERE "workspaceId" = $2 AND "createdById" = $3`,
        [nachfolgerId, workspaceId, memberUserId],
      );

      await gemeinsamePostfaecherUebergeben(
        manager,
        workspaceId,
        memberUserId,
        nachfolgerId,
      );

      await manager.query(
        `UPDATE "mailboxes" SET "active" = false, "passwordSealed" = '',
                "oauthZugangId" = NULL, "smtpHost" = NULL, "smtpPort" = NULL,
                "lastError" = NULL, "getrenntAm" = now()
          WHERE "workspaceId" = $1 AND "userId" = $2 AND "art" = 'persoenlich'`,
        [workspaceId, memberUserId],
      );
      await belegtFesthalten(manager, memberUserId, workspaceId);
      await manager.query(
        `DELETE FROM "kalender_verbindungen" WHERE "workspaceId" = $1 AND "userId" = $2`,
        [workspaceId, memberUserId],
      );
      await manager.query(
        `DELETE FROM "dashboards" WHERE "workspaceId" = $1 AND "createdById" = $2 AND "privat" = true`,
        [workspaceId, memberUserId],
      );
      await manager.query(
        `DELETE FROM "oauth_zugaenge" WHERE "workspaceId" = $1 AND "userId" = $2`,
        [workspaceId, memberUserId],
      );
      await manager.query(
        `DELETE FROM "benachrichtigungen" WHERE "workspaceId" = $1 AND "empfaengerId" = $2`,
        [workspaceId, memberUserId],
      );
      await manager.query(
        `DELETE FROM "freigaben" WHERE "workspaceId" = $1 AND "userId" = $2`,
        [workspaceId, memberUserId],
      );

      await manager.remove(membership);

      return erledigt;
    });

    meldeSicherheit({
      art: 'mitglied_entfernt',
      workspaceId,
      userId: memberUserId,
      actorId: actingUserId,
    });

    return {
      removed: true,
      reassignedTasks: reassigned.affected ?? 0,
    };
  }

  purgeExpired(): Promise<unknown> {
    return this.invitationRepository.delete({
      acceptedAt: IsNull(),
      expiresAt: LessThan(new Date()),
    });
  }
}
