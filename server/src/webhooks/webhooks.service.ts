import { createHmac, randomBytes, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import {
  mailSchluessel,
  open,
  type Schluesselbund,
  seal,
} from '../mailboxes/secret-box';
import { MembershipEntity } from '../workspaces/membership.entity';
import { Permission } from '../workspaces/permissions';
import {
  GANZ_VERBORGEN,
  PermissionsService,
} from '../workspaces/permissions.service';
import { type Sichtfeld } from '../workspaces/sichtbarkeit';
import {
  hoereAuf,
  type Meldung,
  WEBHOOK_EREIGNISSE,
  type WebhookEreignis,
} from './ereignisse';
import {
  sichtregelLaden,
  terminDatenFuer,
} from '../calendar/termin-sichtbarkeit';
import { WebhookEntity } from './webhook.entity';
import {
  darfAbonnieren,
  objektLesbar,
  ohneVerborgeneFelder,
  zeileSichtbar,
} from './webhook-sicht';
import { pruefeZielForm, sichererPost, UngueltigesZiel } from './webhook-ziel';

const ZEITLIMIT_MS = 5000;
const ABSCHALTEN_NACH = 20;
const WARTEN_MS = [0, 2_000, 15_000];

const OHNE_ANLEGER = {
  everything: false,
  permissions: [
    Permission.COMPANY_VIEW,
    Permission.CONTACT_VIEW,
    Permission.DEAL_VIEW,
  ],
};

export const webhookSignatur = (
  geheimnis: string,
  zeitstempel: string,
  rumpf: string,
): string =>
  `sha256=${createHmac('sha256', geheimnis).update(`${zeitstempel}.${rumpf}`).digest('hex')}`;

@Injectable()
export class WebhooksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhooksService.name);
  private abmelden: (() => void) | undefined;

  constructor(
    @InjectRepository(WebhookEntity)
    private readonly webhooks: Repository<WebhookEntity>,
    private readonly config: ConfigService,
    private readonly permissions: PermissionsService,
  ) {}

  onModuleInit(): void {
    this.abmelden = hoereAuf((meldung) => {
      void this.verteilen(meldung);
    });
  }

  onModuleDestroy(): void {
    this.abmelden?.();
  }

  private get schluessel(): Schluesselbund {
    return mailSchluessel(this.config);
  }

  private get entwicklung(): boolean {
    const umgebung = this.config.get<string>('nodeEnv');

    return umgebung === 'development' || umgebung === 'test';
  }

  list(workspaceId: string): Promise<WebhookEntity[]> {
    return this.webhooks.find({
      where: { workspaceId },
      order: { createdAt: 'ASC' },
    });
  }

  async abonnierbar(
    workspaceId: string,
    userId: string,
  ): Promise<WebhookEreignis[]> {
    const rolle = await this.permissions.permissionsOf({
      userId,
      workspaceId,
    } as RequestUser);

    return WEBHOOK_EREIGNISSE.filter((event) => darfAbonnieren(event, rolle));
  }

  async create(
    workspaceId: string,
    url: string,
    events: string[],
    createdById: string | null = null,
  ): Promise<{ webhook: WebhookEntity; secret: string }> {
    const ziel = this.pruefe(url);
    const ereignisse = this.pruefeEreignisse(events);

    if (createdById !== null) {
      const rolle = await this.permissions.permissionsOf({
        userId: createdById,
        workspaceId,
      } as RequestUser);
      const verwehrt = ereignisse.filter(
        (event) => !darfAbonnieren(event, rolle),
      );

      if (verwehrt.length > 0) {
        throw new BadRequestException(
          `Ihnen fehlt das Leserecht für: ${verwehrt.join(', ')}.`,
        );
      }
    }

    const secret = `whsec_${randomBytes(24).toString('base64url')}`;

    const webhook = await this.webhooks.save(
      this.webhooks.create({
        workspaceId,
        url: ziel.toString(),
        events: ereignisse,
        secretSealed: seal(secret, this.schluessel),
        active: true,
        createdById,
      }),
    );

    return { webhook, secret };
  }

  async setActive(
    workspaceId: string,
    id: string,
    active: boolean,
  ): Promise<WebhookEntity> {
    const webhook = await this.finde(workspaceId, id);

    webhook.active = active;

    if (active) {
      webhook.failureCount = 0;
    }

    return this.webhooks.save(webhook);
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    const ergebnis = await this.webhooks.delete({ id, workspaceId });

    return (ergebnis.affected ?? 0) > 0;
  }

  async test(workspaceId: string, id: string): Promise<WebhookEntity> {
    const webhook = await this.finde(workspaceId, id);

    await this.zustellen(webhook, {
      workspaceId,
      event: 'deal.created',
      data: { test: true, name: 'Probe aus Stegwerk' },
    });

    return this.finde(workspaceId, id);
  }

  private async finde(workspaceId: string, id: string): Promise<WebhookEntity> {
    const webhook = await this.webhooks.findOne({ where: { id, workspaceId } });

    if (webhook === null) {
      throw new NotFoundException('Diesen Webhook gibt es nicht.');
    }

    return webhook;
  }

  private pruefe(url: string): URL {
    try {
      return pruefeZielForm(url, this.entwicklung, this.entwicklung);
    } catch (problem) {
      throw new BadRequestException(
        problem instanceof UngueltigesZiel
          ? problem.message
          : 'Ungültige Adresse.',
      );
    }
  }

  private pruefeEreignisse(events: string[]): WebhookEreignis[] {
    const bekannt = events.filter((event): event is WebhookEreignis =>
      (WEBHOOK_EREIGNISSE as readonly string[]).includes(event),
    );

    if (bekannt.length === 0) {
      throw new BadRequestException('Bitte mindestens ein Ereignis wählen.');
    }

    return [...new Set(bekannt)];
  }

  async sichtFuer(webhook: WebhookEntity): Promise<Sichtfeld> {
    const eng: Sichtfeld = {
      ich: null,
      arten: { company: 'eigene', contact: 'eigene', deal: 'eigene' },
      felder: GANZ_VERBORGEN,
    };

    if (webhook.createdById === null) {
      return eng;
    }

    const mitglied = await this.webhooks.manager.count(MembershipEntity, {
      where: { userId: webhook.createdById, workspaceId: webhook.workspaceId },
    });

    if (mitglied === 0) {
      return eng;
    }

    return this.permissions.sichtfeldFuer({
      userId: webhook.createdById,
      workspaceId: webhook.workspaceId,
    } as RequestUser);
  }

  async rechteFuer(
    webhook: WebhookEntity,
  ): Promise<{ everything: boolean; permissions: string[] }> {
    if (webhook.createdById === null) {
      return OHNE_ANLEGER;
    }

    const mitglied = await this.webhooks.manager.count(MembershipEntity, {
      where: { userId: webhook.createdById, workspaceId: webhook.workspaceId },
    });

    if (mitglied === 0) {
      return OHNE_ANLEGER;
    }

    return this.permissions.permissionsOf({
      userId: webhook.createdById,
      workspaceId: webhook.workspaceId,
    } as RequestUser);
  }

  async fuerWebhook(
    webhook: WebhookEntity,
    meldung: Meldung,
  ): Promise<Meldung | null> {
    if (!objektLesbar(meldung, await this.rechteFuer(webhook))) {
      return null;
    }

    const sicht = await this.sichtFuer(webhook);

    if (
      !(await zeileSichtbar(
        this.webhooks.manager,
        meldung.workspaceId,
        meldung,
        sicht,
      ))
    ) {
      return null;
    }

    const sichtbar = ohneVerborgeneFelder(meldung, sicht.felder);

    if (!meldung.event.startsWith('appointment.')) {
      return { ...meldung, ...sichtbar };
    }

    return {
      ...meldung,
      ...terminDatenFuer(
        sichtbar.data,
        sichtbar.changes,
        await sichtregelLaden(
          this.webhooks.manager,
          meldung.workspaceId,
          sicht.ich,
        ),
      ),
    };
  }

  private async verteilen(meldung: Meldung): Promise<void> {
    try {
      const ziele = await this.webhooks.find({
        where: { workspaceId: meldung.workspaceId, active: true },
      });

      await Promise.all(
        ziele
          .filter((ziel) => (ziel.events as string[]).includes(meldung.event))
          .map(async (ziel) => {
            const gefiltert = await this.fuerWebhook(ziel, meldung);

            if (gefiltert !== null) {
              await this.zustellen(ziel, gefiltert);
            }
          }),
      );
    } catch (error) {
      this.logger.error(
        'Webhooks nicht verteilt',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async zustellen(
    webhook: WebhookEntity,
    meldung: Meldung,
  ): Promise<void> {
    const rumpf = JSON.stringify({
      id: randomUUID(),
      event: meldung.event,
      createdAt: new Date().toISOString(),
      data: meldung.data,
      ...(meldung.changes === undefined ? {} : { changes: meldung.changes }),
    });

    let status: number | null = null;
    let fehler: string | null = null;

    for (const warten of WARTEN_MS) {
      if (warten > 0) {
        await new Promise((fertig) => setTimeout(fertig, warten));
      }

      try {
        const url = pruefeZielForm(
          webhook.url,
          this.entwicklung,
          this.entwicklung,
        );

        const zeitstempel = String(Math.floor(Date.now() / 1000));

        status = await sichererPost(
          url,
          {
            'content-type': 'application/json',
            'user-agent': 'Stegwerk-Webhooks/1',
            'x-stegwerk-event': meldung.event,
            'x-stegwerk-timestamp': zeitstempel,
            'x-stegwerk-signature': webhookSignatur(
              open(webhook.secretSealed, this.schluessel),
              zeitstempel,
              rumpf,
            ),
          },
          rumpf,
          ZEITLIMIT_MS,
          this.entwicklung,
        );

        const ok = status >= 200 && status < 300;

        fehler = ok ? null : `Antwort ${String(status)}`;

        if (ok) {
          break;
        }
      } catch (problem) {
        status = null;
        fehler = (
          problem instanceof Error ? problem.message : String(problem)
        ).slice(0, 300);

        if (problem instanceof UngueltigesZiel) {
          break;
        }
      }
    }

    const fehlschlaege = fehler === null ? 0 : webhook.failureCount + 1;

    await this.webhooks.update(webhook.id, {
      lastStatus: status,
      lastError: fehler,
      lastDeliveredAt: new Date(),
      failureCount: fehlschlaege,
      ...(fehlschlaege >= ABSCHALTEN_NACH ? { active: false } : {}),
    });

    webhook.failureCount = fehlschlaege;
  }
}
