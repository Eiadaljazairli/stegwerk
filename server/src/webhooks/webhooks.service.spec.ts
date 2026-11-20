import { createServer, type IncomingMessage, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import { type DataSource } from 'typeorm';

import { createTestDatabase, dropTestDatabase } from '../testing/test-database';
import { UserEntity } from '../users/user.entity';
import {
  MembershipEntity,
  MembershipRole,
} from '../workspaces/membership.entity';
import { Permission } from '../workspaces/permissions';
import { PermissionsService } from '../workspaces/permissions.service';
import { RoleEntity } from '../workspaces/role.entity';
import { WorkspaceEntity } from '../workspaces/workspace.entity';
import { aenderungen, melde, WEBHOOK_EREIGNISSE } from './ereignisse';
import { WebhookEntity } from './webhook.entity';
import { webhookSignatur, WebhooksService } from './webhooks.service';

const SUITE = 'webhooks';

jest.setTimeout(60_000);

const SCHLUESSEL = Buffer.alloc(32, 7).toString('base64');

type Empfang = { headers: IncomingMessage['headers']; body: string };

let dataSource: DataSource;
let service: WebhooksService;
let server: Server;
let adresse: string;
let empfangen: Empfang[];
let antwortStatus = 200;
let workspaceId: string;

const warteAuf = async (anzahl: number): Promise<void> => {
  for (let i = 0; i < 100 && empfangen.length < anzahl; i += 1) {
    await new Promise((fertig) => setTimeout(fertig, 30));
  }
};

beforeAll(async () => {
  dataSource = await createTestDatabase(SUITE);
  service = new WebhooksService(
    dataSource.getRepository(WebhookEntity),
    {
      get: (key: string) =>
        key === 'nodeEnv'
          ? 'test'
          : key === 'mailEncryptionKey'
            ? SCHLUESSEL
            : undefined,
    } as never,
    new PermissionsService(
      dataSource.getRepository(MembershipEntity),
      dataSource.getRepository(RoleEntity),
    ),
  );
  service.onModuleInit();

  empfangen = [];
  server = createServer((anfrage, antwort) => {
    let body = '';

    anfrage.on('data', (teil: Buffer) => {
      body += teil.toString();
    });
    anfrage.on('end', () => {
      empfangen.push({ headers: anfrage.headers, body });
      antwort.statusCode = antwortStatus;
      antwort.end('ok');
    });
  });
  await new Promise<void>((fertig) => server.listen(0, '127.0.0.1', fertig));
  adresse = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/haken`;

  const m = dataSource.manager;

  workspaceId = (
    await m.save(m.create(WorkspaceEntity, { name: 'Haken', slug: 'haken' }))
  ).id;
});

afterAll(async () => {
  service.onModuleDestroy();
  await new Promise((fertig) => server.close(fertig));
  await dropTestDatabase(dataSource, SUITE);
});

beforeEach(() => {
  empfangen.length = 0;
  antwortStatus = 200;
});

describe('WebhooksService', () => {
  it('stellt ein gewähltes Ereignis zu, signiert, und merkt sich den Erfolg', async () => {
    const { webhook, secret } = await service.create(workspaceId, adresse, [
      'deal.won',
    ]);

    expect(secret).toMatch(/^whsec_/u);

    melde({
      workspaceId,
      event: 'deal.won',
      data: { id: 'd1', name: 'Auftrag' },
    });
    await warteAuf(1);

    expect(empfangen).toHaveLength(1);

    const [zustellung] = empfangen;
    const rumpf = JSON.parse(zustellung.body) as {
      event: string;
      data: { name: string };
    };

    expect(rumpf.event).toBe('deal.won');
    expect(rumpf.data.name).toBe('Auftrag');
    expect(zustellung.headers['x-stegwerk-event']).toBe('deal.won');
    expect(zustellung.headers['x-stegwerk-signature']).toBe(
      webhookSignatur(
        secret,
        String(zustellung.headers['x-stegwerk-timestamp']),
        zustellung.body,
      ),
    );

    await new Promise((fertig) => setTimeout(fertig, 100));

    const danach = await dataSource
      .getRepository(WebhookEntity)
      .findOneByOrFail({ id: webhook.id });

    expect(danach).toMatchObject({ lastStatus: 200, failureCount: 0 });
    expect(danach.secretSealed).not.toContain(secret);
  });

  it('schickt nichts für Ereignisse, die nicht gewählt sind, oder fremde Bereiche', async () => {
    melde({ workspaceId, event: 'invoice.paid', data: {} });
    melde({
      workspaceId: '00000000-0000-4000-8000-000000000000',
      event: 'deal.won',
      data: {},
    });

    await new Promise((fertig) => setTimeout(fertig, 300));

    expect(empfangen).toHaveLength(0);
  });

  it('versucht es bei einem Fehler noch einmal und zählt den Fehlschlag', async () => {
    const { webhook } = await service.create(workspaceId, adresse, [
      'invoice.paid',
    ]);

    antwortStatus = 500;

    await service.test(workspaceId, webhook.id).catch(() => undefined);

    expect(empfangen.length).toBe(3);

    const danach = await dataSource
      .getRepository(WebhookEntity)
      .findOneByOrFail({ id: webhook.id });

    expect(danach).toMatchObject({ lastStatus: 500, failureCount: 1 });
  });

  it('kennt angelegt, geändert, gelöscht und wiederhergestellt für alle Objekte', () => {
    for (const objekt of [
      'company',
      'contact',
      'deal',
      'note',
      'task',
      'appointment',
      'quote',
      'invoice',
    ]) {
      for (const aktion of ['created', 'updated', 'deleted', 'restored']) {
        expect(WEBHOOK_EREIGNISSE).toContain(`${objekt}.${aktion}`);
      }
    }

    expect(WEBHOOK_EREIGNISSE).toEqual(
      expect.arrayContaining(['deal.won', 'quote.accepted', 'invoice.paid']),
    );
  });

  it('liefert bei einer Änderung, was sich geändert hat', async () => {
    await service.create(workspaceId, adresse, ['company.updated']);

    const vorher = { id: 'c1', name: 'Alt GmbH', city: 'Köln' };
    const nachher = { id: 'c1', name: 'Neu GmbH', city: 'Köln' };

    melde({
      workspaceId,
      event: 'company.updated',
      data: nachher,
      changes: aenderungen(vorher, nachher),
    });
    await warteAuf(1);

    const rumpf = JSON.parse(empfangen[0].body) as {
      changes: Record<string, { before: unknown; after: unknown }>;
    };

    expect(rumpf.changes).toEqual({
      name: { before: 'Alt GmbH', after: 'Neu GmbH' },
    });
  });

  describe('mit den Rechten des Anlegers', () => {
    let aushilfe: string;
    let chefin: string;

    beforeAll(async () => {
      const m = dataSource.manager;
      const rolle = await m.save(
        m.create(RoleEntity, {
          workspaceId,
          name: 'Aushilfe',
          permissions: [
            Permission.COMPANY_VIEW,
            Permission.CONTACT_VIEW,
            Permission.DEAL_VIEW,
          ],
          sichtbarkeit: { company: 'alle', contact: 'alle', deal: 'eigene' },
          feldrechte: {
            'deal.amount': 'verborgen',
            'custom:deal:marge': 'verborgen',
          },
        }),
      );

      aushilfe = (
        await m.save(
          m.create(UserEntity, {
            email: 'aushilfe@haken.test',
            passwordHash: 'x',
            firstName: 'A',
            lastName: 'H',
          }),
        )
      ).id;
      chefin = (
        await m.save(
          m.create(UserEntity, {
            email: 'chefin@haken.test',
            passwordHash: 'x',
            firstName: 'C',
            lastName: 'H',
          }),
        )
      ).id;
      await m.save(
        m.create(MembershipEntity, {
          workspaceId,
          userId: aushilfe,
          role: MembershipRole.MEMBER,
          roleId: rolle.id,
        }),
      );
    });

    it('lässt verborgene Felder weg, auch in den Änderungen', async () => {
      await service.create(workspaceId, adresse, ['deal.updated'], aushilfe);

      melde({
        workspaceId,
        event: 'deal.updated',
        data: {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Auftrag',
          amount: 5000,
          ownerId: aushilfe,
          customFields: { marge: 30, quelle: 'Messe' },
        },
        changes: {
          amount: { before: 4000, after: 5000 },
          name: { before: 'Alt', after: 'Auftrag' },
          'customFields.marge': { before: 20, after: 30 },
        },
      });
      await warteAuf(1);

      const rumpf = JSON.parse(empfangen[0].body) as {
        data: Record<string, unknown>;
        changes: Record<string, unknown>;
      };

      expect(rumpf.data).not.toHaveProperty('amount');
      expect(rumpf.data.customFields).toEqual({ quelle: 'Messe' });
      expect(Object.keys(rumpf.changes)).toEqual(['name']);
    });

    it('meldet ein fremdes Geschäft nicht, wenn der Anleger nur eigene sieht', async () => {
      await service.create(workspaceId, adresse, ['deal.created'], aushilfe);

      melde({
        workspaceId,
        event: 'deal.created',
        data: {
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Fremd',
          ownerId: chefin,
        },
      });
      melde({
        workspaceId,
        event: 'deal.created',
        data: {
          id: '33333333-3333-4333-8333-333333333333',
          name: 'Eigen',
          ownerId: aushilfe,
        },
      });
      await warteAuf(1);
      await new Promise((fertig) => setTimeout(fertig, 300));

      expect(empfangen).toHaveLength(1);
      expect(empfangen[0].body).toContain('Eigen');
    });

    it('liefert ohne Anleger nur, was keine Rolle verbergen kann', async () => {
      await service.create(workspaceId, adresse, ['contact.created']);

      melde({
        workspaceId,
        event: 'contact.created',
        data: {
          id: '44444444-4444-4444-8444-444444444444',
          firstName: 'Eva',
          email: 'eva@kunde.de',
          phone: '+4930123',
          ownerId: null,
        },
      });
      await warteAuf(1);

      const rumpf = JSON.parse(empfangen[0].body) as {
        data: Record<string, unknown>;
      };

      expect(rumpf.data.firstName).toBe('Eva');
      expect(rumpf.data).not.toHaveProperty('email');
      expect(rumpf.data).not.toHaveProperty('phone');
    });

    describe('und seinem Objektrecht', () => {
      let integration: string;
      let rolleId: string;

      const rechnung = {
        id: '55555555-5555-4555-8555-555555555555',
        number: 'RE-2026-0001',
        grossAmount: 1190,
        companyId: null,
      };

      beforeAll(async () => {
        const m = dataSource.manager;

        rolleId = (
          await m.save(
            m.create(RoleEntity, {
              workspaceId,
              name: 'Integration',
              permissions: [
                Permission.API_MANAGE,
                Permission.COMPANY_VIEW,
                Permission.CONTACT_VIEW,
                Permission.INVOICE_VIEW,
              ],
            }),
          )
        ).id;
        integration = (
          await m.save(
            m.create(UserEntity, {
              email: 'integration@haken.test',
              passwordHash: 'x',
              firstName: 'I',
              lastName: 'N',
            }),
          )
        ).id;
        await m.save(
          m.create(MembershipEntity, {
            workspaceId,
            userId: integration,
            role: MembershipRole.MEMBER,
            roleId: rolleId,
          }),
        );
      });

      it('lehnt Ereignisse ab, deren Objekt der Anleger nicht lesen darf', async () => {
        await expect(
          service.create(
            workspaceId,
            adresse,
            ['company.created', 'deal.updated'],
            integration,
          ),
        ).rejects.toThrow('deal.updated');
        await expect(
          service.create(workspaceId, adresse, ['quote.accepted'], integration),
        ).rejects.toThrow('Leserecht');
      });

      it('bietet zur Auswahl nur Ereignisse an, die create auch annimmt', async () => {
        const angeboten = await service.abonnierbar(workspaceId, integration);

        expect(angeboten).toEqual(
          expect.arrayContaining([
            'company.created',
            'contact.updated',
            'invoice.paid',
            'note.created',
          ]),
        );
        expect(angeboten).not.toContain('deal.updated');
        expect(angeboten).not.toContain('quote.accepted');
        expect(angeboten).not.toContain('delivery_note.issued');
        expect(angeboten).not.toContain('task.created');

        const angelegt = await service.create(
          workspaceId,
          adresse,
          angeboten,
          integration,
        );

        expect(angelegt.webhook.events).toEqual(angeboten);
        await service.remove(workspaceId, angelegt.webhook.id);
      });

      it('stellt ohne das Leserecht nicht mehr zu, auch nach einer Herabstufung', async () => {
        await service.create(
          workspaceId,
          adresse,
          ['invoice.paid'],
          integration,
        );

        melde({ workspaceId, event: 'invoice.paid', data: rechnung });
        await warteAuf(1);
        await new Promise((fertig) => setTimeout(fertig, 200));

        expect(empfangen).toHaveLength(1);
        expect(empfangen[0].body).toContain('RE-2026-0001');

        await dataSource.getRepository(RoleEntity).update(rolleId, {
          permissions: [Permission.API_MANAGE, Permission.COMPANY_VIEW],
        });
        empfangen.length = 0;

        melde({ workspaceId, event: 'invoice.paid', data: rechnung });
        await new Promise((fertig) => setTimeout(fertig, 300));

        expect(empfangen).toHaveLength(0);
      });

      it('gibt einem Webhook ohne Anleger keine Rechnungen', async () => {
        const ohne = await service.create(workspaceId, adresse, [
          'invoice.paid',
        ]);

        await expect(
          service.fuerWebhook(ohne.webhook, {
            workspaceId,
            event: 'invoice.paid',
            data: rechnung,
          }),
        ).resolves.toBeNull();
      });
    });
  });

  it('lehnt ein unbekanntes Ereignis ab', async () => {
    await expect(
      service.create(workspaceId, adresse, ['firma.geloescht']),
    ).rejects.toThrow('mindestens ein Ereignis');
  });
});
