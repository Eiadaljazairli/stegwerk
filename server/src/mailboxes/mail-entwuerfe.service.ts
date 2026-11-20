import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, In, Repository } from 'typeorm';

import { type RequestUser } from '../auth/decorators/current-user.decorator';
import { ContactEntity } from '../crm/entities/contact.entity';
import { DealEntity } from '../crm/entities/deal.entity';
import { CompanyEntity } from '../crm/entities/company.entity';
import { istVerborgen } from '../workspaces/feldrechte';
import { type Ziel, zielSichtbar } from '../workspaces/ziel-sichtbarkeit';
import { type EntwurfQuelle, MailEntwurfEntity } from './mail-entwurf.entity';
import { MailboxesService } from './mailboxes.service';
import {
  MAX_BETREFF,
  MAX_RUMPF,
  pruefeBetreff,
  pruefeEmpfaengerliste,
} from './outbound-mail';

const SENDET_HOECHSTENS_MS = 10 * 60 * 1000;

export type EntwurfZiel = {
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
};

export type EntwurfDaten = {
  workspaceId: string;
  ownerId: string;
  an: string[];
  cc?: string[];
  betreff: string;
  rumpf: string;
  ziel: EntwurfZiel;
  quelle: EntwurfQuelle;
  automationId?: string | null;
  kiVorschlagId?: string | null;
  vonId?: string | null;
};

export const pruefeEntwurf = (eingabe: {
  an: string[];
  cc?: string[];
  betreff: string;
  rumpf: string;
}): { an: string[]; cc: string[]; betreff: string; rumpf: string } => {
  const an = pruefeEmpfaengerliste(eingabe.an);

  if (!an.ok) {
    throw new BadRequestException(an.grund);
  }

  const kopie = eingabe.cc ?? [];
  const cc = kopie.length === 0 ? null : pruefeEmpfaengerliste(kopie);

  if (cc !== null && !cc.ok) {
    throw new BadRequestException(`Kopie: ${cc.grund}`);
  }

  const betreff = pruefeBetreff(eingabe.betreff);

  if (betreff === null || betreff === '') {
    throw new BadRequestException(
      `Bitte einen Betreff mit höchstens ${String(MAX_BETREFF)} Zeichen, ohne Zeilenumbruch.`,
    );
  }

  if (eingabe.rumpf.trim() === '' || eingabe.rumpf.length > MAX_RUMPF) {
    throw new BadRequestException('Der Text ist leer oder zu lang.');
  }

  return {
    an: an.adressen,
    cc: cc?.adressen ?? [],
    betreff,
    rumpf: eingabe.rumpf,
  };
};

export const entwurfAnlegen = async (
  manager: EntityManager,
  daten: EntwurfDaten,
): Promise<MailEntwurfEntity> => {
  const geprueft = pruefeEntwurf(daten);
  const entwurf = await manager.save(
    manager.create(MailEntwurfEntity, {
      workspaceId: daten.workspaceId,
      ownerId: daten.ownerId,
      ...geprueft,
      companyId: daten.ziel.companyId ?? null,
      contactId: daten.ziel.contactId ?? null,
      dealId: daten.ziel.dealId ?? null,
      quelle: daten.quelle,
      automationId: daten.automationId ?? null,
      kiVorschlagId: daten.kiVorschlagId ?? null,
      status: 'entwurf',
    }),
  );

  if (daten.vonId !== daten.ownerId) {
    await manager.query(
      `INSERT INTO "benachrichtigungen" ("workspaceId", "empfaengerId", "vonId", "art", "mailEntwurfId")
       VALUES ($1, $2, $3, 'mail_entwurf', $4)
       ON CONFLICT DO NOTHING`,
      [daten.workspaceId, daten.ownerId, daten.vonId ?? null, entwurf.id],
    );
  }

  return entwurf;
};

const ART_SPALTE = {
  company: 'companyId',
  contact: 'contactId',
  deal: 'dealId',
} as const;

@Injectable()
export class MailEntwuerfeService {
  private readonly logger = new Logger(MailEntwuerfeService.name);

  constructor(
    @InjectRepository(MailEntwurfEntity)
    private readonly entwuerfe: Repository<MailEntwurfEntity>,
    private readonly postfach: MailboxesService,
  ) {}

  liste(
    user: RequestUser,
    status: string[] = ['entwurf', 'sendet'],
  ): Promise<MailEntwurfEntity[]> {
    return this.entwuerfe.find({
      where: {
        workspaceId: user.workspaceId,
        ownerId: user.userId,
        status: In(status),
      },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  anzahlOffen(user: RequestUser): Promise<number> {
    return this.entwuerfe.count({
      where: {
        workspaceId: user.workspaceId,
        ownerId: user.userId,
        status: 'entwurf',
      },
    });
  }

  async eigener(user: RequestUser, id: string): Promise<MailEntwurfEntity> {
    const entwurf = await this.entwuerfe.findOne({
      where: { id, workspaceId: user.workspaceId, ownerId: user.userId },
    });

    if (entwurf === null) {
      throw new NotFoundException('Diesen Entwurf gibt es nicht.');
    }

    return entwurf;
  }

  async anlegen(
    user: RequestUser,
    eingabe: {
      art: 'company' | 'contact' | 'deal';
      id: string;
      an?: string[] | null;
      cc?: string[] | null;
      betreff: string;
      rumpf: string;
    },
    kiVorschlagId: string | null,
    kontakteSichtbar = true,
  ): Promise<MailEntwurfEntity> {
    if (user.apiKey?.schreibmodus === 'vorschlag') {
      throw new ForbiddenException(
        'Dieser Schlüssel schlägt nur vor. Einen Entwurf legt er über das MCP-Werkzeug create_mail_draft als Vorschlag an.',
      );
    }

    const manager = this.entwuerfe.manager;
    const ownerId =
      user.apiKey === undefined
        ? user.userId
        : ((
            (await manager.query(
              `SELECT "createdById" FROM "api_keys" WHERE "id" = $1 AND "workspaceId" = $2`,
              [user.apiKey.id, user.workspaceId],
            )) as { createdById: string | null }[]
          )[0]?.createdById ?? null);

    if (ownerId === null) {
      throw new BadRequestException(
        'Wer diesen Schlüssel angelegt hat, ist nicht mehr im Team; ein Entwurf hätte niemanden, der ihn abschickt.',
      );
    }

    const ziel: Ziel = { [ART_SPALTE[eingabe.art]]: eingabe.id };
    const vorschlag = await this.vorgabeAn(
      user.workspaceId,
      eingabe.art,
      eingabe.id,
      kontakteSichtbar,
    );

    if (vorschlag === undefined || !(await zielSichtbar(manager, ziel))) {
      throw new NotFoundException('Diese Akte gibt es nicht.');
    }

    const an =
      eingabe.an !== undefined && eingabe.an !== null && eingabe.an.length > 0
        ? eingabe.an
        : vorschlag === null
          ? []
          : [vorschlag];

    if (an.length === 0) {
      throw new BadRequestException(
        'Ohne Empfänger: an der Akte steht keine E-Mail-Adresse, die Sie sehen dürfen; bitte „an“ angeben.',
      );
    }

    return entwurfAnlegen(manager, {
      workspaceId: user.workspaceId,
      ownerId,
      an,
      cc: eingabe.cc ?? [],
      betreff: eingabe.betreff,
      rumpf: eingabe.rumpf,
      ziel,
      quelle:
        kiVorschlagId !== null || user.apiKey !== undefined ? 'ki' : 'hand',
      kiVorschlagId,
      vonId: user.apiKey === undefined ? user.userId : null,
    });
  }

  private async vorgabeAn(
    workspaceId: string,
    art: 'company' | 'contact' | 'deal',
    id: string,
    kontakteSichtbar: boolean,
  ): Promise<string | null | undefined> {
    const manager = this.entwuerfe.manager;
    const adresseSichtbar =
      kontakteSichtbar && !(await istVerborgen('contact.email'));

    if (art === 'company') {
      const firma = await manager.findOne(CompanyEntity, {
        where: { id, workspaceId },
      });

      return firma === null ? undefined : null;
    }

    if (art === 'deal') {
      const deal = await manager.findOne(DealEntity, {
        where: { id, workspaceId },
      });

      if (deal === null) {
        return undefined;
      }

      if (
        deal.primaryContactId === null ||
        !adresseSichtbar ||
        !(await zielSichtbar(manager, { contactId: deal.primaryContactId }))
      ) {
        return null;
      }

      const kontakt = await manager.findOne(ContactEntity, {
        where: { id: deal.primaryContactId, workspaceId },
      });

      return kontakt?.email ?? null;
    }

    const kontakt = await manager.findOne(ContactEntity, {
      where: { id, workspaceId },
    });

    if (kontakt === null) {
      return undefined;
    }

    return adresseSichtbar ? (kontakt.email ?? null) : null;
  }

  async aendern(
    user: RequestUser,
    id: string,
    felder: { an: string[]; cc?: string[]; betreff: string; rumpf: string },
  ): Promise<MailEntwurfEntity> {
    const geprueft = pruefeEntwurf(felder);
    const ergebnis = await this.entwuerfe.update(
      {
        id,
        workspaceId: user.workspaceId,
        ownerId: user.userId,
        status: 'entwurf',
      },
      geprueft,
    );

    if ((ergebnis.affected ?? 0) === 0) {
      throw new BadRequestException(
        'Dieser Entwurf ist schon gesendet oder verworfen.',
      );
    }

    return this.eigener(user, id);
  }

  async verwerfen(user: RequestUser, id: string): Promise<MailEntwurfEntity> {
    const ergebnis = await this.entwuerfe.update(
      {
        id,
        workspaceId: user.workspaceId,
        ownerId: user.userId,
        status: 'entwurf',
      },
      { status: 'verworfen' },
    );

    if ((ergebnis.affected ?? 0) === 0) {
      throw new BadRequestException(
        'Dieser Entwurf ist schon gesendet oder verworfen.',
      );
    }

    await this.glockeGelesen(user, id);

    return this.eigener(user, id);
  }

  async senden(
    user: RequestUser,
    id: string,
    felder: { an: string[]; cc?: string[]; betreff: string; rumpf: string },
  ): Promise<MailEntwurfEntity> {
    const geprueft = pruefeEntwurf(felder);
    const grenze = new Date(Date.now() - SENDET_HOECHSTENS_MS);
    const beansprucht = (await this.entwuerfe.query(
      `UPDATE "mail_entwuerfe"
          SET "status" = 'sendet', "an" = $4, "cc" = $5, "betreff" = $6, "rumpf" = $7, "updatedAt" = now()
        WHERE "id" = $1 AND "workspaceId" = $2 AND "ownerId" = $3
          AND ("status" = 'entwurf' OR ("status" = 'sendet' AND "updatedAt" < $8))
        RETURNING "id"`,
      [
        id,
        user.workspaceId,
        user.userId,
        geprueft.an,
        geprueft.cc,
        geprueft.betreff,
        geprueft.rumpf,
        grenze,
      ],
    )) as [{ id: string }[], number] | { id: string }[];
    const zeilen = Array.isArray(beansprucht[0])
      ? (beansprucht[0] as { id: string }[])
      : (beansprucht as { id: string }[]);

    if (zeilen.length === 0) {
      await this.eigener(user, id);

      throw new BadRequestException(
        'Dieser Entwurf ist schon gesendet, wird gerade gesendet oder wurde verworfen.',
      );
    }

    let draussen = false as boolean;
    let nachrichtId: string | null = null;

    try {
      const nachricht = await this.postfach.senden(
        user.workspaceId,
        user.userId,
        {
          an: geprueft.an,
          cc: geprueft.cc,
          betreff: geprueft.betreff,
          rumpf: geprueft.rumpf,
        },
        {
          abgeschickt: () => {
            draussen = true;
          },
        },
      );

      nachrichtId = nachricht.id;
    } catch (fehler) {
      if (!draussen) {
        await this.entwuerfe.update(
          { id, workspaceId: user.workspaceId, status: 'sendet' },
          { status: 'entwurf' },
        );

        throw fehler;
      }

      this.logger.warn(
        `Entwurf ${id} verschickt, aber nicht verbucht: ${
          fehler instanceof Error ? fehler.message : String(fehler)
        }`,
      );
    }

    await this.entwuerfe.update(
      { id, workspaceId: user.workspaceId },
      { status: 'gesendet', gesendetAm: new Date(), nachrichtId },
    );
    await this.glockeGelesen(user, id);

    return this.eigener(user, id);
  }

  private async glockeGelesen(user: RequestUser, id: string): Promise<void> {
    await this.entwuerfe.query(
      `UPDATE "benachrichtigungen" SET "gelesenAm" = now()
        WHERE "mailEntwurfId" = $1 AND "empfaengerId" = $2 AND "gelesenAm" IS NULL`,
      [id, user.userId],
    );
  }
}
