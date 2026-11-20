import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type DeepPartial, type FindOptionsOrder, Repository } from 'typeorm';

import { NoteEntity } from './entities/note.entity';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { WorkspaceScopedService } from './workspace-scoped.service';
import { type Verweise } from '../workspaces/verweise';
import {
  assertMehrfachZielSchreibbar,
  assertNeueZieleSchreibbar,
  assertUnsichtbareZieleUnveraendert,
  mehrfachZielSichtbar,
  notizBedingung,
} from '../workspaces/ziel-sichtbarkeit';

type NoteTarget = {
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
};

const KEINE_AKTE =
  'Eine Notiz gehört zu mindestens einer Firma, einem Kontakt oder einem Geschäft.';

const anzahlZiele = (ziel: NoteTarget): number =>
  [ziel.companyId, ziel.contactId, ziel.dealId].filter(
    (wert) => wert !== undefined && wert !== null,
  ).length;

@Injectable()
export class NotesService extends WorkspaceScopedService<NoteEntity> {
  constructor(
    @InjectRepository(NoteEntity) repository: Repository<NoteEntity>,
    customFieldsService: CustomFieldsService,
  ) {
    super(repository, 'Notiz', customFieldsService, null);
  }

  protected override verweise(input: DeepPartial<NoteEntity>): Verweise {
    return {
      companyId: input.companyId,
      contactId: input.contactId,
      dealId: input.dealId,
    };
  }

  protected override sichtbarkeitsFilter(alias: string) {
    return notizBedingung(alias);
  }

  protected override sichtbar(record: NoteEntity): Promise<boolean> {
    return mehrfachZielSichtbar(this.repository.manager, record);
  }

  protected override assertSchreibbar(record: NoteEntity): Promise<void> {
    return assertMehrfachZielSchreibbar(this.repository.manager, record);
  }

  protected defaultOrder(): FindOptionsOrder<NoteEntity> {
    return { createdAt: 'DESC' };
  }

  protected searchableColumns(): string[] {
    return ['body'];
  }

  protected sortableColumns(): string[] {
    return ['createdAt'];
  }

  findForCompany(
    workspaceId: string,
    companyId: string,
  ): Promise<NoteEntity[]> {
    return this.repository.find({
      where: { workspaceId, companyId },
      order: { createdAt: 'DESC' },
    });
  }

  findForContact(
    workspaceId: string,
    contactId: string,
  ): Promise<NoteEntity[]> {
    return this.repository.find({
      where: { workspaceId, contactId },
      order: { createdAt: 'DESC' },
    });
  }

  findForDeal(workspaceId: string, dealId: string): Promise<NoteEntity[]> {
    return this.repository.find({
      where: { workspaceId, dealId },
      order: { createdAt: 'DESC' },
    });
  }

  async fuerKontakteDerFirma(
    workspaceId: string,
    companyId: string,
  ): Promise<NoteEntity[]> {
    const abfrage = this.repository
      .createQueryBuilder('notiz')
      .where('notiz.workspaceId = :workspaceId', { workspaceId })
      .andWhere(
        `notiz."contactId" IN (SELECT kontakt."id" FROM "contacts" kontakt
            WHERE kontakt."workspaceId" = :workspaceId
              AND kontakt."companyId" = :companyId
              AND kontakt."deletedAt" IS NULL)`,
        { companyId },
      )
      .andWhere('notiz."companyId" IS DISTINCT FROM :companyId', { companyId })
      .orderBy('notiz.createdAt', 'DESC')
      .take(100);

    return (await this.nurSichtbare(abfrage, 'notiz')).getMany();
  }

  async createForTarget(
    workspaceId: string,
    authorId: string,
    body: string,
    target: NoteTarget,
  ): Promise<NoteEntity> {
    if (anzahlZiele(target) === 0) {
      throw new BadRequestException(KEINE_AKTE);
    }

    await assertNeueZieleSchreibbar(this.repository.manager, target);

    return this.create(workspaceId, {
      body,
      authorId,
      companyId: target.companyId ?? null,
      contactId: target.contactId ?? null,
      dealId: target.dealId ?? null,
    });
  }

  async zieleSetzen(
    workspaceId: string,
    id: string,
    ziele: NoteTarget,
  ): Promise<NoteEntity> {
    const note = await this.findOne(workspaceId, id);
    const manager = this.repository.manager;

    await assertUnsichtbareZieleUnveraendert(manager, note, ziele);

    const neu: NoteTarget = {
      companyId:
        ziele.companyId === undefined ? note.companyId : ziele.companyId,
      contactId:
        ziele.contactId === undefined ? note.contactId : ziele.contactId,
      dealId: ziele.dealId === undefined ? note.dealId : ziele.dealId,
    };

    if (anzahlZiele(neu) === 0) {
      throw new BadRequestException(KEINE_AKTE);
    }

    await assertNeueZieleSchreibbar(manager, {
      companyId: neu.companyId === note.companyId ? null : neu.companyId,
      contactId: neu.contactId === note.contactId ? null : neu.contactId,
      dealId: neu.dealId === note.dealId ? null : neu.dealId,
    });

    return this.update(workspaceId, id, {
      companyId: neu.companyId ?? null,
      contactId: neu.contactId ?? null,
      dealId: neu.dealId ?? null,
    });
  }

  async bearbeiten(
    workspaceId: string,
    id: string,
    body: string,
    vonUserId: string,
  ): Promise<NoteEntity> {
    return this.update(workspaceId, id, {
      body,
      bearbeitetAm: new Date(),
      bearbeitetVonId: vonUserId,
    });
  }
}
