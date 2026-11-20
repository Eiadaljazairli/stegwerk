import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  type EntitySubscriberInterface,
  type InsertEvent,
  type RemoveEvent,
  type UpdateEvent,
  type RecoverEvent,
  type SoftRemoveEvent,
} from 'typeorm';

import { getRequestContext } from '../observability/request-context';
import { AuditAction, AuditLogEntity } from './audit-log.entity';

const AUDITED_ENTITIES = new Set([
  'CompanyEntity',
  'ContactEntity',
  'DealEntity',
  'NoteEntity',
  'TaskEntity',
]);

const IGNORED_FIELDS = new Set(['id', 'workspaceId', 'createdAt', 'updatedAt']);

type AuditedRecord = {
  id?: string;
  workspaceId?: string;
  name?: string;
  title?: string;
  firstName?: string;
  lastName?: string;
  body?: string;
};

@Injectable()
export class AuditSubscriber implements EntitySubscriberInterface {
  constructor(@InjectDataSource() dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  private label(record: AuditedRecord): string | null {
    if (typeof record.name === 'string') {
      return record.name.slice(0, 300);
    }

    if (typeof record.title === 'string') {
      return record.title.slice(0, 300);
    }

    if (typeof record.firstName === 'string') {
      return `${record.firstName} ${record.lastName ?? ''}`
        .trim()
        .slice(0, 300);
    }

    if (typeof record.body === 'string') {
      return record.body.slice(0, 300);
    }

    return null;
  }

  private async write(
    event: { manager: { save: Function }; metadata: { name: string } },
    action: AuditAction,
    record: AuditedRecord,
    changes: Record<string, [unknown, unknown]> | null,
  ): Promise<void> {
    if (!AUDITED_ENTITIES.has(event.metadata.name)) {
      return;
    }

    if (record.workspaceId === undefined || record.id === undefined) {
      return;
    }

    const context = getRequestContext();

    await event.manager.save(AuditLogEntity, {
      workspaceId: record.workspaceId,
      actorId: context?.userId ?? null,
      action,
      entityType: event.metadata.name.replace(/Entity$/, ''),
      entityId: record.id,
      summary: this.label(record),
      changes,
      requestId: context?.requestId ?? null,
      herkunft: context?.aenderungsHerkunft ?? null,
    });
  }

  async afterInsert(event: InsertEvent<AuditedRecord>): Promise<void> {
    await this.write(event, AuditAction.CREATED, event.entity, null);
  }

  async afterUpdate(event: UpdateEvent<AuditedRecord>): Promise<void> {
    if (event.entity === undefined) {
      return;
    }

    const changes: Record<string, [unknown, unknown]> = {};

    for (const column of event.updatedColumns) {
      const field = column.propertyName;

      if (IGNORED_FIELDS.has(field)) {
        continue;
      }

      changes[field] = [
        (event.databaseEntity as Record<string, unknown> | undefined)?.[field],
        (event.entity as Record<string, unknown>)[field],
      ];
    }

    if (Object.keys(changes).length === 0) {
      return;
    }

    await this.write(
      event,
      AuditAction.UPDATED,
      event.entity as AuditedRecord,
      changes,
    );
  }

  async afterSoftRemove(event: SoftRemoveEvent<AuditedRecord>): Promise<void> {
    if (event.entity === undefined) {
      return;
    }

    await this.write(event, AuditAction.DELETED, event.entity, null);
  }

  async afterRecover(event: RecoverEvent<AuditedRecord>): Promise<void> {
    if (event.entity === undefined) {
      return;
    }

    await this.write(event, AuditAction.RESTORED, event.entity, null);
  }

  async beforeRemove(event: RemoveEvent<AuditedRecord>): Promise<void> {
    if (event.databaseEntity === undefined) {
      return;
    }

    await this.write(event, AuditAction.DELETED, event.databaseEntity, null);
  }
}
