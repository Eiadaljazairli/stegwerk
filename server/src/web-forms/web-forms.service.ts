import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { BillingService } from '../billing/billing.service';
import { berlinDate } from '../calendar/berlin-time';
import { CompanyEntity } from '../crm/entities/company.entity';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity, DealStage } from '../crm/entities/deal.entity';
import { NoteEntity } from '../crm/entities/note.entity';
import { TaskEntity } from '../crm/entities/task.entity';
import { alsReinerText } from '../crm/formatierter-text';
import { phasenFuer, standardPipeline } from '../crm/pipelines';
import { CustomFieldEntity } from '../custom-fields/custom-field.types';
import { standardwerteLesen } from '../custom-fields/custom-fields.service';
import { huelle, sicher } from '../mail/layout';
import { MailService } from '../mail/mail.service';
import { LetterheadEntity } from '../quotes/letterhead.entity';
import { UserEntity } from '../users/user.entity';
import { melde } from '../webhooks/ereignisse';
import { WebFormEntity } from './web-form.entity';

export type Anfrage = {
  name: string;
  email: string;
  company?: string | null;
  phone?: string | null;
  message?: string | null;
  consent: boolean;
  website?: string | null;
};

export type OeffentlichesFormular = {
  title: string;
  intro: string | null;
  thankYou: string;
  privacyUrl: string | null;
  company: string | null;
};

export const teileName = (
  name: string,
): { firstName: string; lastName: string } => {
  const teile = name.trim().split(/\s+/u);

  if (teile.length === 1) {
    return { firstName: teile[0], lastName: '' };
  }

  return {
    firstName: teile.slice(0, -1).join(' '),
    lastName: teile[teile.length - 1],
  };
};

export const ANFRAGEN_JE_TAG = 200;

const EMAIL = /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/u;

const einzeilig = (wert: string): string =>
  wert.replace(/[\u0000-\u001f\u007f]+/gu, ' ').trim();

@Injectable()
export class WebFormsService {
  private readonly logger = new Logger(WebFormsService.name);

  constructor(
    @InjectRepository(WebFormEntity)
    private readonly forms: Repository<WebFormEntity>,
    @InjectRepository(LetterheadEntity)
    private readonly letterheads: Repository<LetterheadEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly billing: BillingService,
  ) {}

  get(workspaceId: string): Promise<WebFormEntity | null> {
    return this.forms.findOne({ where: { workspaceId } });
  }

  async save(
    workspaceId: string,
    userId: string,
    input: Partial<
      Pick<
        WebFormEntity,
        'title' | 'intro' | 'thankYou' | 'privacyUrl' | 'createDeal' | 'active'
      >
    >,
  ): Promise<WebFormEntity> {
    const vorhanden = await this.get(workspaceId);

    if (
      input.privacyUrl !== undefined &&
      input.privacyUrl !== null &&
      input.privacyUrl.trim() !== '' &&
      !/^https?:\/\//u.test(input.privacyUrl.trim())
    ) {
      throw new BadRequestException(
        'Die Datenschutzerklärung braucht eine vollständige Adresse mit https://.',
      );
    }

    const leer = (wert: string | null | undefined) =>
      wert === undefined
        ? undefined
        : (wert ?? '').trim() === ''
          ? null
          : (wert ?? '').trim();

    return this.forms.save({
      ...(vorhanden ?? { workspaceId, ownerId: userId }),
      ...(input.title === undefined
        ? {}
        : { title: input.title.trim() || 'Kontakt aufnehmen' }),
      ...(input.intro === undefined ? {} : { intro: leer(input.intro) }),
      ...(input.thankYou === undefined
        ? {}
        : {
            thankYou:
              input.thankYou.trim() ||
              'Danke für Ihre Nachricht. Wir melden uns bald.',
          }),
      ...(input.privacyUrl === undefined
        ? {}
        : { privacyUrl: leer(input.privacyUrl) }),
      ...(input.createDeal === undefined
        ? {}
        : { createDeal: input.createDeal }),
      ...(input.active === undefined ? {} : { active: input.active }),
    });
  }

  private async zaehleHeute(id: string): Promise<void> {
    const heute = berlinDate(new Date());
    const gezaehlt: unknown = await this.dataSource.query(
      `UPDATE "web_forms"
       SET "heuteAnzahl" = CASE WHEN "heuteDatum" = $2 THEN "heuteAnzahl" + 1 ELSE 1 END,
           "heuteDatum" = $2
       WHERE "id" = $1 AND ("heuteDatum" IS DISTINCT FROM $2 OR "heuteAnzahl" < $3)
       RETURNING "heuteAnzahl"`,
      [id, heute, ANFRAGEN_JE_TAG],
    );
    const zeilen = Array.isArray(gezaehlt) ? (gezaehlt[0] as unknown[]) : [];

    if (!Array.isArray(zeilen) || zeilen.length === 0) {
      throw new HttpException(
        'Heute sind schon sehr viele Anfragen eingegangen. Bitte versuchen Sie es morgen noch einmal oder schreiben Sie direkt.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async aktiv(id: string): Promise<WebFormEntity> {
    const form = await this.gefunden(id);

    try {
      await this.billing.assertCanWrite(form.workspaceId);
    } catch {
      throw new NotFoundException(
        'Dieses Formular nimmt gerade keine Anfragen an.',
      );
    }

    return form;
  }

  private async gefunden(id: string): Promise<WebFormEntity> {
    const form = /^[0-9a-f-]{36}$/u.test(id)
      ? await this.forms.findOne({ where: { id } })
      : null;

    if (form === null || !form.active) {
      throw new NotFoundException('Dieses Formular gibt es nicht.');
    }

    return form;
  }

  async publicView(id: string): Promise<OeffentlichesFormular> {
    const form = await this.aktiv(id);
    const letterhead = await this.letterheads.findOne({
      where: { workspaceId: form.workspaceId },
    });

    return {
      title: form.title,
      intro: form.intro,
      thankYou: form.thankYou,
      privacyUrl: form.privacyUrl,
      company: letterhead?.companyName ?? null,
    };
  }

  async submit(id: string, anfrage: Anfrage): Promise<{ ok: true }> {
    const form = await this.aktiv(id);

    if ((anfrage.website ?? '').trim() !== '') {
      return { ok: true };
    }

    const name = einzeilig(anfrage.name ?? '').slice(0, 200);
    const email = (anfrage.email ?? '').trim().toLowerCase().slice(0, 320);
    const firma = einzeilig(anfrage.company ?? '').slice(0, 200);
    const telefon = einzeilig(anfrage.phone ?? '').slice(0, 40);
    const nachricht = (anfrage.message ?? '').trim().slice(0, 5000);

    if (name.length < 2) {
      throw new BadRequestException('Bitte geben Sie Ihren Namen an.');
    }

    if (!EMAIL.test(email)) {
      throw new BadRequestException(
        'Bitte geben Sie eine gültige E-Mail-Adresse an.',
      );
    }

    if (anfrage.consent !== true) {
      throw new BadRequestException(
        'Bitte bestätigen Sie, dass wir Ihre Angaben zur Bearbeitung speichern dürfen.',
      );
    }

    await this.zaehleHeute(form.id);

    const { workspaceId } = form;
    const ownerId = await this.zustaendig(form);
    const neu: {
      event: 'company.created' | 'contact.created' | 'deal.created';
      data: Record<string, unknown>;
    }[] = [];

    const ergebnis = await this.dataSource.transaction(async (manager) => {
      let companyId: string | null = null;

      if (firma !== '') {
        const vorhanden = await manager
          .getRepository(CompanyEntity)
          .createQueryBuilder('c')
          .where('c.workspaceId = :workspaceId', { workspaceId })
          .andWhere('LOWER(c.name) = LOWER(:firma)', { firma })
          .getOne();

        if (vorhanden === null) {
          const angelegt = await manager.save(
            manager.create(CompanyEntity, {
              workspaceId,
              name: firma,
              herkunft: 'webformular',
              customFields: await standardwerteLesen(
                manager,
                workspaceId,
                CustomFieldEntity.COMPANY,
              ),
            }),
          );

          neu.push({
            event: 'company.created',
            data: { id: angelegt.id, name: angelegt.name },
          });
          companyId = angelegt.id;
        } else {
          companyId = vorhanden.id;
        }
      }

      let contact = await manager
        .getRepository(ContactEntity)
        .createQueryBuilder('k')
        .where('k.workspaceId = :workspaceId', { workspaceId })
        .andWhere('LOWER(k.email) = :email', { email })
        .getOne();

      if (contact === null) {
        contact = await manager.save(
          manager.create(ContactEntity, {
            workspaceId,
            ...teileName(name),
            email,
            phone: telefon === '' ? null : telefon,
            companyId,
            herkunft: 'webformular',
            customFields: await standardwerteLesen(
              manager,
              workspaceId,
              CustomFieldEntity.CONTACT,
            ),
          }),
        );
        neu.push({
          event: 'contact.created',
          data: {
            id: contact.id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email,
            source: 'webform',
          },
        });
      } else if (contact.companyId === null && companyId !== null) {
        contact.companyId = companyId;
        await manager.save(contact);
      }

      const heute = berlinDate(new Date());

      await manager.save(
        manager.create(NoteEntity, {
          workspaceId,
          contactId: contact.id,
          companyId,
          authorId: ownerId,
          body: [
            `Anfrage über das Webformular am ${heute.slice(8, 10)}.${heute.slice(5, 7)}.${heute.slice(0, 4)}.`,
            telefon === '' ? null : `Telefon: ${alsReinerText(telefon)}`,
            nachricht === '' ? null : `\n${alsReinerText(nachricht)}`,
          ]
            .filter((zeile) => zeile !== null)
            .join('\n'),
        }),
      );

      let dealId: string | null = null;

      if (form.createDeal) {
        const pipeline = await standardPipeline(manager, workspaceId);
        const erste =
          (await phasenFuer(manager, workspaceId, pipeline.id)).find(
            (phase) => !phase.ausgeblendet,
          )?.stage ?? DealStage.LEAD;
        const deal = await manager.save(
          manager.create(DealEntity, {
            workspaceId,
            name: `Anfrage ${firma === '' ? name : firma}`.slice(0, 200),
            stage: erste,
            pipelineId: pipeline.id,
            companyId,
            primaryContactId: contact.id,
            herkunft: 'webformular',
            customFields: await standardwerteLesen(
              manager,
              workspaceId,
              CustomFieldEntity.DEAL,
            ),
          }),
        );

        dealId = deal.id;
        neu.push({
          event: 'deal.created',
          data: {
            id: deal.id,
            name: deal.name,
            stage: deal.stage,
            source: 'webform',
          },
        });
      }

      await manager.save(
        manager.create(TaskEntity, {
          workspaceId,
          title: `Anfrage beantworten: ${name}`.slice(0, 200),
          description:
            nachricht === '' ? null : alsReinerText(nachricht.slice(0, 2000)),
          dueDate: heute,
          assigneeId: ownerId,
          createdById: ownerId,
          contactId: contact.id,
          companyId,
          dealId,
          customFields: await standardwerteLesen(
            manager,
            workspaceId,
            CustomFieldEntity.TASK,
          ),
        }),
      );

      return { contactId: contact.id };
    });

    for (const eintrag of neu) {
      melde({ workspaceId, event: eintrag.event, data: eintrag.data });
    }

    await this.benachrichtigen(
      form,
      name,
      email,
      nachricht,
      ergebnis.contactId,
    );

    return { ok: true };
  }

  private async zustaendig(form: WebFormEntity): Promise<string> {
    const [zeile] = (await this.dataSource.query(
      `SELECT "userId" FROM "memberships"
        WHERE "workspaceId" = $1
          AND ("userId" = $2 OR "role" = 'owner')
        ORDER BY ("userId" = $2) DESC, "createdAt" ASC
        LIMIT 1`,
      [form.workspaceId, form.ownerId],
    )) as { userId: string }[];

    return zeile?.userId ?? form.ownerId;
  }

  private async benachrichtigen(
    form: WebFormEntity,
    name: string,
    email: string,
    nachricht: string,
    contactId: string,
  ): Promise<void> {
    const owner = await this.users.findOne({
      where: { id: await this.zustaendig(form) },
    });

    if (owner === null) {
      return;
    }

    const url = `${this.config.get<string>('webOrigin') ?? 'http://localhost:5273'}/kontakte/${contactId}`;
    const satz = `${name} (${email}) hat über das Webformular geschrieben.`;

    await this.mail
      .send({
        to: owner.email,
        subject: `Neue Anfrage von ${name}`,
        text: [satz, '', nachricht, '', url].join('\n'),
        html: huelle({
          vorschau: satz,
          ueberschrift: 'Neue Anfrage',
          absaetze: [
            sicher(satz),
            ...(nachricht === ''
              ? []
              : [sicher(nachricht).replace(/\n/gu, '<br>')]),
          ],
          knopf: { text: 'Zum Kontakt', url },
        }),
      })
      .catch((error: unknown) => this.logger.error(String(error)));
  }
}
