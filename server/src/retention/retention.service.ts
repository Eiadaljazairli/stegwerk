import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { daysSinceAccessEnded } from '../billing/access-window';
import { kasseEingerichtet } from '../billing/plans';
import { SubscriptionEntity } from '../billing/subscription.entity';
import { MailService } from '../mail/mail.service';
import {
  retentionDeletedMail,
  retentionWarningMail,
} from '../mail/retention-templates';
import { PrivacyService } from '../privacy/privacy.service';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';

const DAY_MS = 24 * 60 * 60 * 1000;

const WARN_AT_DAYS_LEFT = [30, 7];

export type RetentionCandidate = {
  workspaceId: string;
  workspaceName: string;
  ownerEmail: string | null;
  daysSinceAccessEnded: number;
  daysLeft: number;
  deleteOn: Date;
};

export type SweepReport = {
  dryRun: boolean;
  retentionDays: number;
  warned: number;
  deleted: number;
  candidates: RetentionCandidate[];
};

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptions: Repository<SubscriptionEntity>,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(MembershipEntity)
    private readonly memberships: Repository<MembershipEntity>,
    private readonly privacyService: PrivacyService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  get retentionDays(): number {
    return this.configService.get<number>('retention.days') ?? 90;
  }

  get enabled(): boolean {
    return this.configService.get<boolean>('retention.enabled') ?? false;
  }

  async candidates(now = new Date()): Promise<RetentionCandidate[]> {
    const subscriptions = await this.subscriptions.find();
    const found: RetentionCandidate[] = [];
    const verkauftPlaetze = kasseEingerichtet(
      this.configService.get<string>('stripeSecretKey'),
    );

    for (const subscription of subscriptions) {
      const since = daysSinceAccessEnded(subscription, verkauftPlaetze, now);

      if (since === null) {
        continue;
      }

      const workspace = await this.workspaces.findOne({
        where: { id: subscription.workspaceId },
      });

      if (workspace === null) {
        continue;
      }

      found.push({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        ownerEmail: await this.ownerEmail(workspace.id),
        daysSinceAccessEnded: since,
        daysLeft: this.retentionDays - since,
        deleteOn: new Date(
          now.getTime() + (this.retentionDays - since) * DAY_MS,
        ),
      });
    }

    return found;
  }

  async sweep(
    { dryRun }: { dryRun: boolean } = { dryRun: true },
    now = new Date(),
  ): Promise<SweepReport> {
    const candidates = await this.candidates(now);
    const report: SweepReport = {
      dryRun,
      retentionDays: this.retentionDays,
      warned: 0,
      deleted: 0,
      candidates,
    };

    for (const candidate of candidates) {
      if (candidate.daysLeft <= 0) {
        report.deleted += 1;

        if (!dryRun) {
          await this.delete(candidate);
        }

        continue;
      }

      if (await this.shouldWarn(candidate, now)) {
        report.warned += 1;

        if (!dryRun) {
          await this.warn(candidate, now);
        }
      }
    }

    return report;
  }

  async shouldWarn(candidate: RetentionCandidate, now: Date): Promise<boolean> {
    if (candidate.ownerEmail === null) {
      return false;
    }

    const subscription = await this.subscriptions.findOne({
      where: { workspaceId: candidate.workspaceId },
    });

    const warnedAt = subscription?.retentionWarnedAt ?? null;

    if (warnedAt === null) {
      return WARN_AT_DAYS_LEFT.some((days) => candidate.daysLeft <= days);
    }

    const daysSinceWarning = Math.floor(
      (now.getTime() - warnedAt.getTime()) / DAY_MS,
    );
    const daysLeftWhenWarned = candidate.daysLeft + daysSinceWarning;

    return WARN_AT_DAYS_LEFT.some(
      (days) => candidate.daysLeft <= days && days < daysLeftWhenWarned,
    );
  }

  private async warn(candidate: RetentionCandidate, now: Date): Promise<void> {
    const webOrigin = this.configService.getOrThrow<string>('webOrigin');

    await this.mailService.send(
      retentionWarningMail(
        candidate.ownerEmail as string,
        candidate.workspaceName,
        candidate.deleteOn,
        candidate.daysLeft,
        `${webOrigin}/abrechnung`,
      ),
    );

    await this.subscriptions.update(
      { workspaceId: candidate.workspaceId },
      { retentionWarnedAt: now },
    );

    this.logger.log(
      `Retention warning sent for workspace ${candidate.workspaceId} (${candidate.daysLeft} days left)`,
    );
  }

  private async delete(candidate: RetentionCandidate): Promise<void> {
    if (candidate.ownerEmail !== null) {
      await this.mailService.send(
        retentionDeletedMail(candidate.ownerEmail, candidate.workspaceName),
      );
    }

    await this.privacyService.erase(candidate.workspaceId);

    this.logger.warn(
      `Retention: erased workspace ${candidate.workspaceId} ("${candidate.workspaceName}") — access ended ${candidate.daysSinceAccessEnded} days ago`,
    );
  }

  private async ownerEmail(workspaceId: string): Promise<string | null> {
    const owner = await this.memberships.findOne({
      where: { workspaceId, role: MembershipRole.OWNER },
      relations: { user: true },
    });

    return owner?.user?.email ?? null;
  }
}
