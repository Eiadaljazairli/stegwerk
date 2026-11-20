import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  type DeepPartial,
  type FindOptionsOrder,
  type FindOptionsRelations,
  Repository,
  type SelectQueryBuilder,
} from 'typeorm';

import { ContactEntity } from './entities/contact.entity';
import {
  bereinigeEmails,
  bereinigeTelefone,
  normalisiereTelefonOderNull,
} from './kontaktwege';
import { CustomFieldEntity } from '../custom-fields/custom-field.types';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { WorkspaceScopedService } from './workspace-scoped.service';
import { type Verweise } from '../workspaces/verweise';
import { httpsOderNull } from './links';

@Injectable()
export class ContactsService extends WorkspaceScopedService<ContactEntity> {
  constructor(
    @InjectRepository(ContactEntity) repository: Repository<ContactEntity>,
    customFieldsService: CustomFieldsService,
  ) {
    super(
      repository,
      'Kontakt',
      customFieldsService,
      CustomFieldEntity.CONTACT,
    );
  }

  protected override relations(): FindOptionsRelations<ContactEntity> {
    return { company: true, owner: true };
  }

  protected override verweise(input: DeepPartial<ContactEntity>): Verweise {
    return { companyId: input.companyId, userIds: [input.ownerId] };
  }

  protected override async vorDemSpeichern(
    workspaceId: string,
    record: ContactEntity,
  ): Promise<void> {
    if (record.phone !== undefined) {
      record.phone = normalisiereTelefonOderNull(record.phone);
    }

    if (typeof record.email === 'string') {
      record.email = record.email.trim() === '' ? null : record.email.trim();
    }

    if (record.linkedin !== undefined) {
      record.linkedin = httpsOderNull(record.linkedin, 'Das LinkedIn-Profil');
    }

    const vorher =
      record.id === undefined
        ? null
        : await this.repo.findOne({
            where: { id: record.id, workspaceId },
            select: { id: true, weitereEmails: true },
            withDeleted: true,
          });

    record.weitereEmails = bereinigeEmails(
      record.weitereEmails ?? [],
      record.email,
      vorher?.weitereEmails ?? [],
    );
    record.weitereTelefone = bereinigeTelefone(
      record.weitereTelefone ?? [],
      record.phone,
    );
  }

  protected defaultOrder(): FindOptionsOrder<ContactEntity> {
    return { lastName: 'ASC' };
  }

  protected override titelSpalten(): string[] {
    return ['firstName', 'lastName'];
  }

  protected searchableColumns(): string[] {
    return [
      'firstName',
      'lastName',
      'email',
      'phone',
      'jobTitle',
      'weitereEmails',
      'weitereTelefone',
    ];
  }

  protected override gruppierbareSpalten(): string[] {
    return ['companyId', 'ownerId', 'jobTitle'];
  }

  protected sortableColumns(): string[] {
    return ['firstName', 'lastName', 'email', 'jobTitle', 'createdAt'];
  }

  protected override applyFilters(
    queryBuilder: SelectQueryBuilder<ContactEntity>,
    filters: Record<string, unknown>,
  ): void {
    if (typeof filters.companyId === 'string') {
      queryBuilder.andWhere('record.companyId = :companyId', {
        companyId: filters.companyId,
      });
    }
  }

  async findByCompany(
    workspaceId: string,
    companyId: string,
  ): Promise<ContactEntity[]> {
    const abfrage = this.repository
      .createQueryBuilder('contact')
      .where('contact.workspaceId = :workspaceId', { workspaceId })
      .andWhere('contact.companyId = :companyId', { companyId })
      .orderBy('contact.lastName', 'ASC')
      .addOrderBy('contact.firstName', 'ASC');

    return (await this.nurSichtbare(abfrage, 'contact')).getMany();
  }
}
