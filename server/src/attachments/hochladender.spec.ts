import { type DataSource, type Repository } from 'typeorm';

import { type AttachmentEntity } from './attachment.entity';
import { AttachmentsService } from './attachments.service';

const dienst = (zeilen: { createdById: string | null }[]) => {
  const abfragen: unknown[][] = [];
  const dataSource = {
    query: (sql: string, werte: unknown[]) => {
      abfragen.push([sql, werte]);

      return Promise.resolve(zeilen);
    },
  } as unknown as DataSource;

  return {
    abfragen,
    service: new AttachmentsService(
      {} as Repository<AttachmentEntity>,
      dataSource,
    ),
  };
};

describe('hochladender', () => {
  it('nimmt bei einem Menschen dessen Kennung', async () => {
    const { service, abfragen } = dienst([]);

    await expect(
      service.hochladender({ userId: 'u1', workspaceId: 'w1' }),
    ).resolves.toBe('u1');
    expect(abfragen).toHaveLength(0);
  });

  it('nimmt bei einem Schlüssel die Person, die ihn angelegt hat', async () => {
    const { service, abfragen } = dienst([{ createdById: 'anleger' }]);

    await expect(
      service.hochladender({
        userId: 'schluessel-id',
        workspaceId: 'w1',
        apiKey: { id: 'schluessel-id' },
      }),
    ).resolves.toBe('anleger');
    expect(abfragen[0][1]).toEqual(['schluessel-id', 'w1']);
  });

  it('trägt niemanden ein, wenn der Anleger nicht mehr da ist', async () => {
    const { service } = dienst([{ createdById: null }]);

    await expect(
      service.hochladender({
        userId: 'schluessel-id',
        workspaceId: 'w1',
        apiKey: { id: 'schluessel-id' },
      }),
    ).resolves.toBeNull();
  });
});
