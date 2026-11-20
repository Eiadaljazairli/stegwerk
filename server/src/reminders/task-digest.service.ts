import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { TaskEntity } from '../crm/entities/task.entity';
import { MailService } from '../mail/mail.service';
import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { MembershipEntity } from '../workspaces/membership.entity';
import { PermissionsService } from '../workspaces/permissions.service';
import {
  istSichtbarFuer,
  type SichtbarkeitsArt,
} from '../workspaces/sichtbarkeit';
import {
  type DigestTask,
  digestSubject,
  digestText,
  groupTasks,
  worthSending,
} from './task-digest';

export type DigestReport = {
  considered: number;
  sent: number;
  skipped: number;
};

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

@Injectable()
export class TaskDigestService {
  constructor(
    @InjectRepository(MembershipEntity)
    private readonly memberships: Repository<MembershipEntity>,
    @InjectRepository(TaskEntity)
    private readonly tasks: Repository<TaskEntity>,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly permissions: PermissionsService,
  ) {}

  async run(today = isoDate(new Date())): Promise<DigestReport> {
    const memberships = await this.memberships.find({
      where: { taskDigest: true },
      relations: { user: true, workspace: true },
    });

    const report: DigestReport = {
      considered: memberships.length,
      sent: 0,
      skipped: 0,
    };

    for (const membership of memberships) {
      if (membership.lastDigestOn === today) {
        report.skipped += 1;
        continue;
      }

      const wentOut = await this.sendFor(membership, today);

      if (wentOut) {
        report.sent += 1;
      } else {
        report.skipped += 1;
      }

      await this.memberships.update(membership.id, { lastDigestOn: today });
    }

    return report;
  }

  async preview(
    workspaceId: string,
    userId: string,
    today = isoDate(new Date()),
  ): Promise<{ subject: string; body: string } | null> {
    const membership = await this.memberships.findOne({
      where: { workspaceId, userId },
      relations: { user: true, workspace: true },
    });

    if (membership === null) {
      return null;
    }

    const groups = groupTasks(await this.tasksFor(membership), today);

    if (!worthSending(groups)) {
      return null;
    }

    return {
      subject: digestSubject(groups),
      body: digestText(
        groups,
        membership.user.firstName,
        `${this.webOrigin()}/aufgaben`,
      ),
    };
  }

  private async sendFor(
    membership: MembershipEntity,
    today: string,
  ): Promise<boolean> {
    const groups = groupTasks(await this.tasksFor(membership), today);

    if (!worthSending(groups)) {
      return false;
    }

    return this.mail.send({
      to: membership.user.email,
      subject: digestSubject(groups),
      text: digestText(
        groups,
        membership.user.firstName,
        `${this.webOrigin()}/aufgaben`,
      ),
    });
  }

  private async tasksFor(membership: MembershipEntity): Promise<DigestTask[]> {
    const rows = await this.tasks.find({
      where: {
        workspaceId: membership.workspaceId,
        assigneeId: membership.userId,
        completedAt: IsNull(),
      },
      relations: { company: true, contact: true, deal: true },
    });

    const feld = await this.permissions.sichtfeldFuer({
      userId: membership.userId,
      workspaceId: membership.workspaceId,
      email: membership.user.email,
    } as RequestUser);
    const sichtbar = <T extends { id: string; ownerId: string | null }>(
      art: SichtbarkeitsArt,
      akte: T | null,
    ): akte is T =>
      akte !== null && istSichtbarFuer(feld, art, akte.ownerId, akte.id);

    return rows.map((task) => ({
      id: task.id,
      title: task.title,
      dueOn: task.dueDate,
      dueTime: task.dueTime,
      inArbeit: task.inArbeitSeit !== null,
      done: task.completedAt !== null,
      context: sichtbar('deal', task.deal)
        ? task.deal.name
        : sichtbar('company', task.company)
          ? task.company.name
          : sichtbar('contact', task.contact)
            ? `${task.contact.firstName} ${task.contact.lastName}`.trim()
            : null,
    }));
  }

  private webOrigin(): string {
    return (
      this.config.get<string>('webOrigin') ?? 'http://localhost:5273'
    ).replace(/\/$/u, '');
  }
}
