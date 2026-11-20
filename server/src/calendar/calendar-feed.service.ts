import { randomBytes } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, Repository } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { TaskEntity } from '../crm/entities/task.entity';
import { MembershipEntity } from '../workspaces/membership.entity';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { aufgabeAlsEvent } from './aufgaben-im-kalender';
import { berlinDate } from './berlin-time';
import { type IcsEvent } from './ics';
import { IcsExportService } from './ics-export.service';
import { aboSignaturStimmt, aboToken, zerlegeAboToken } from './kalender-abo';

const TAGE_ZURUECK = 90;
const TAGE_VORAUS = 400;

const plusTage = (datum: string, tage: number): string => {
  const tag = new Date(`${datum}T12:00:00Z`);

  tag.setUTCDate(tag.getUTCDate() + tage);

  return tag.toISOString().slice(0, 10);
};

@Injectable()
export class CalendarFeedService {
  constructor(
    @InjectRepository(MembershipEntity)
    private readonly memberships: Repository<MembershipEntity>,
    @InjectRepository(TaskEntity)
    private readonly tasks: Repository<TaskEntity>,
    private readonly permissions: PermissionsService,
    private readonly ics: IcsExportService,
    private readonly config: ConfigService,
  ) {}

  private get geheimnis(): string {
    return this.config.getOrThrow<string>('jwtSecret');
  }

  private async mitgliedschaft(user: RequestUser): Promise<MembershipEntity> {
    const membership = await this.memberships.findOne({
      where: { userId: user.userId, workspaceId: user.workspaceId },
    });

    if (membership === null) {
      throw new NotFoundException('Keine Mitgliedschaft in diesem Bereich.');
    }

    return membership;
  }

  private link(membership: MembershipEntity): string | null {
    if (membership.calendarFeedNonce === null) {
      return null;
    }

    const herkunft =
      this.config.get<string>('webOrigin') ?? 'http://localhost:5273';

    return `${herkunft}/appointments/feed/${aboToken(this.geheimnis, membership.id, membership.calendarFeedNonce)}.ics`;
  }

  async url(user: RequestUser): Promise<string | null> {
    return this.link(await this.mitgliedschaft(user));
  }

  async enable(user: RequestUser, neu: boolean): Promise<string> {
    const membership = await this.mitgliedschaft(user);

    if (membership.calendarFeedNonce === null || neu) {
      membership.calendarFeedNonce = randomBytes(16).toString('hex');
      await this.memberships.update(membership.id, {
        calendarFeedNonce: membership.calendarFeedNonce,
      });
    }

    return this.link(membership) ?? '';
  }

  async disable(user: RequestUser): Promise<boolean> {
    const membership = await this.mitgliedschaft(user);

    await this.memberships.update(membership.id, { calendarFeedNonce: null });

    return true;
  }

  async feed(token: string, host: string): Promise<string> {
    const teile = zerlegeAboToken(token);
    const nichtGefunden = new NotFoundException('Dieses Abo gibt es nicht.');

    if (teile === null) {
      throw nichtGefunden;
    }

    const membership = await this.memberships.findOne({
      where: { id: teile.membershipId },
      relations: { user: true },
    });

    if (
      membership === null ||
      !aboSignaturStimmt(
        this.geheimnis,
        membership.id,
        membership.calendarFeedNonce,
        teile.signatur,
      )
    ) {
      throw nichtGefunden;
    }

    const user: RequestUser = {
      userId: membership.userId,
      workspaceId: membership.workspaceId,
      email: membership.user?.email ?? '',
    };

    await this.permissions
      .assert(user, Permission.APPOINTMENT_VIEW, 'den Kalender zu sehen')
      .catch(() => {
        throw nichtGefunden;
      });

    const heute = berlinDate(new Date());
    const von = plusTage(heute, -TAGE_ZURUECK);
    const bis = plusTage(heute, TAGE_VORAUS);

    return this.ics.zeitraum(
      membership.workspaceId,
      von,
      bis,
      membership.userId,
      host,
      'Stegwerk',
      await this.aufgaben(user, von, bis, host),
      membership.userId,
    );
  }

  private async aufgaben(
    user: RequestUser,
    von: string,
    bis: string,
    host: string,
  ): Promise<IcsEvent[]> {
    if (!(await this.permissions.can(user, Permission.TASK_VIEW))) {
      return [];
    }

    const offen = await this.tasks.find({
      where: {
        workspaceId: user.workspaceId,
        assigneeId: user.userId,
        completedAt: IsNull(),
        dueDate: Between(von, bis),
      },
      take: 500,
    });

    return offen.map((aufgabe) =>
      aufgabeAlsEvent({ ...aufgabe, dueDate: aufgabe.dueDate ?? von }, host),
    );
  }
}
