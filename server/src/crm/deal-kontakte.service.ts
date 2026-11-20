import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';

import { AuditAction, AuditLogEntity } from '../audit/audit-log.entity';
import { getRequestContext } from '../observability/request-context';
import { melde } from '../webhooks/ereignisse';
import {
  istSichtbar,
  sichtbarkeitsBedingung,
} from '../workspaces/sichtbarkeit';
import { ContactsService } from './contacts.service';
import { DealsService } from './deals.service';
import { DealKontaktEntity } from './entities/deal-kontakt.entity';
import { type ContactEntity } from './entities/contact.entity';
import { DealEntity } from './entities/deal.entity';

export const MAX_DEAL_KONTAKTE = 50;

export const DEAL_ROLLEN = [
  'Entscheider',
  'Ansprechpartner',
  'Einkauf',
  'Technik',
  'Fachabteilung',
  'Beeinflusser',
  'Geschäftsführung',
];

const name = (kontakt: Pick<ContactEntity, 'firstName' | 'lastName'>) =>
  `${kontakt.firstName} ${kontakt.lastName}`.trim();

const mitRolle = (text: string, rolle: string | null) =>
  rolle === null ? text : `${text} (${rolle})`;

const saubereRolle = (rolle: string | null | undefined): string | null => {
  const text = (rolle ?? '').trim();

  if (text.length > 60) {
    throw new BadRequestException(
      'Die Rolle darf höchstens 60 Zeichen lang sein.',
    );
  }

  return text === '' ? null : text;
};

@Injectable()
export class DealKontakteService {
  constructor(
    @InjectRepository(DealKontaktEntity)
    private readonly repository: Repository<DealKontaktEntity>,
    private readonly deals: DealsService,
    private readonly contacts: ContactsService,
  ) {}

  fuerGeschaeft(
    workspaceId: string,
    dealId: string,
  ): Promise<DealKontaktEntity[]> {
    return this.repository
      .createQueryBuilder('beteiligt')
      .innerJoinAndSelect('beteiligt.contact', 'kontakt')
      .innerJoin('beteiligt.deal', 'geschaeft')
      .where('beteiligt.workspaceId = :workspaceId', { workspaceId })
      .andWhere('beteiligt.dealId = :dealId', { dealId })
      .andWhere(
        'beteiligt.contactId IS DISTINCT FROM geschaeft.primaryContactId',
      )
      .orderBy('beteiligt.createdAt', 'ASC')
      .getMany();
  }

  async fuerKontakt(
    workspaceId: string,
    contactId: string,
  ): Promise<DealKontaktEntity[]> {
    const abfrage = this.repository
      .createQueryBuilder('beteiligt')
      .innerJoin('beteiligt.deal', 'geschaeft')
      .where('beteiligt.workspaceId = :workspaceId', { workspaceId })
      .andWhere('beteiligt.contactId = :contactId', { contactId })
      .orderBy('beteiligt.createdAt', 'ASC');
    const bedingung = await sichtbarkeitsBedingung('deal', 'geschaeft');

    if (bedingung !== null) {
      abfrage.andWhere(bedingung.where, bedingung.parameters);
    }

    return abfrage.getMany();
  }

  async hinzufuegen(
    workspaceId: string,
    dealId: string,
    contactId: string,
    rolle: string | null | undefined,
  ): Promise<DealKontaktEntity> {
    const deal = await this.deals.findZumAendern(workspaceId, dealId);
    const kontakt = await this.contacts.findOne(workspaceId, contactId);
    const saubere = saubereRolle(rolle);

    if (deal.primaryContactId === contactId) {
      throw new BadRequestException(
        `${name(kontakt)} ist schon Hauptkontakt dieses Geschäfts.`,
      );
    }

    return this.repository.manager
      .transaction(async (manager) => {
        await manager.query(
          `SELECT 1 FROM "deals" WHERE "id" = $1 AND "workspaceId" = $2 FOR UPDATE`,
          [dealId, workspaceId],
        );

        const anzahl = await manager.count(DealKontaktEntity, {
          where: { workspaceId, dealId },
        });

        if (anzahl >= MAX_DEAL_KONTAKTE) {
          throw new BadRequestException(
            `An einem Geschäft stehen höchstens ${String(MAX_DEAL_KONTAKTE)} weitere Kontakte.`,
          );
        }

        const vorhanden = await manager.findOne(DealKontaktEntity, {
          where: { workspaceId, dealId, contactId },
        });

        if (vorhanden !== null) {
          throw new ConflictException(
            `${name(kontakt)} steht schon an diesem Geschäft.`,
          );
        }

        const zeile = await manager.save(
          manager.create(DealKontaktEntity, {
            workspaceId,
            dealId,
            contactId,
            rolle: saubere,
          }),
        );

        await this.protokolliere(
          manager,
          deal,
          contactId,
          null,
          mitRolle(name(kontakt), saubere),
        );
        zeile.contact = kontakt;

        return zeile;
      })
      .then((zeile) => {
        melde({
          workspaceId,
          event: 'deal.contact_added',
          data: { dealId, contactId, rolle: zeile.rolle },
        });

        return zeile;
      });
  }

  async rolleAendern(
    workspaceId: string,
    id: string,
    rolle: string | null | undefined,
  ): Promise<DealKontaktEntity> {
    const zeile = await this.eigene(workspaceId, id);
    const deal = await this.deals.findZumAendern(workspaceId, zeile.dealId);
    const saubere = saubereRolle(rolle);

    if (saubere === zeile.rolle) {
      return zeile;
    }

    const vorher = mitRolle(this.anzeige(zeile), zeile.rolle);

    zeile.rolle = saubere;

    return this.repository.manager.transaction(async (manager) => {
      await manager.update(DealKontaktEntity, { id }, { rolle: saubere });
      await this.protokolliere(
        manager,
        deal,
        zeile.contactId,
        vorher,
        mitRolle(this.anzeige(zeile), saubere),
      );

      return zeile;
    });
  }

  async entfernen(workspaceId: string, id: string): Promise<boolean> {
    const zeile = await this.eigene(workspaceId, id);
    const deal = await this.deals.findZumAendern(workspaceId, zeile.dealId);

    await this.repository.manager.transaction(async (manager) => {
      await manager.delete(DealKontaktEntity, { id });
      await this.protokolliere(
        manager,
        deal,
        zeile.contactId,
        mitRolle(this.anzeige(zeile), zeile.rolle),
        null,
      );
    });

    melde({
      workspaceId,
      event: 'deal.contact_removed',
      data: { dealId: zeile.dealId, contactId: zeile.contactId },
    });

    return true;
  }

  async zumHauptkontakt(workspaceId: string, id: string): Promise<DealEntity> {
    const zeile = await this.eigene(workspaceId, id);
    const deal = await this.deals.findZumAendern(workspaceId, zeile.dealId);
    const bisher = deal.primaryContactId;

    await this.repository.manager.transaction(async (manager) => {
      await manager.delete(DealKontaktEntity, { id });

      if (bisher !== null) {
        await manager.query(
          `INSERT INTO "deal_kontakte" ("workspaceId", "dealId", "contactId")
           VALUES ($1, $2, $3) ON CONFLICT ("dealId", "contactId") DO NOTHING`,
          [workspaceId, deal.id, bisher],
        );
      }
    });

    return this.deals.update(workspaceId, deal.id, {
      primaryContactId: zeile.contactId,
    });
  }

  private async eigene(
    workspaceId: string,
    id: string,
  ): Promise<DealKontaktEntity> {
    const zeile = await this.repository.findOne({
      where: { id, workspaceId },
      relations: { contact: true },
      withDeleted: true,
    });

    if (zeile === null) {
      throw new NotFoundException('Diese Beteiligung gibt es nicht.');
    }

    await this.deals.findOne(workspaceId, zeile.dealId);

    if (
      zeile.contact !== null &&
      !(await istSichtbar('contact', zeile.contact.ownerId, zeile.contact.id))
    ) {
      throw new NotFoundException('Diese Beteiligung gibt es nicht.');
    }

    return zeile;
  }

  private anzeige(zeile: DealKontaktEntity): string {
    return zeile.contact === null ? 'Kontakt' : name(zeile.contact);
  }

  private async protokolliere(
    manager: EntityManager,
    deal: DealEntity,
    contactId: string,
    vorher: string | null,
    nachher: string | null,
  ): Promise<void> {
    const kontext = getRequestContext();

    await manager.save(AuditLogEntity, {
      workspaceId: deal.workspaceId,
      actorId: kontext?.userId ?? null,
      action: AuditAction.UPDATED,
      entityType: 'Deal',
      entityId: deal.id,
      summary: deal.name.slice(0, 300),
      changes: {
        beteiligte: [vorher, nachher],
        beteiligteKontaktId: [contactId, contactId],
      },
      requestId: kontext?.requestId ?? null,
    });
  }
}
